import path from 'node:path';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import { loadConfig } from '../../core/config.js';
import { getAdapters, getColoredLabel, type TargetAdapter, type Scope } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { resolveTargetContext } from '../../util/scope.js';
import { listDirNames, ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { computeDirHash } from '../../util/hash-dir.js';
import { copyDir } from '../../util/copy-dir.js';
import { getSharedSkillDestinations } from '../../util/organize-compat.js';
import { runOrganizePlan, type OrganizePlanEntry } from '../../util/organize.js';

type SkillContext = {
  adapter: TargetAdapter;
  scope: Scope;
  projectRoot: string;
  skillsDir: string;
};

type TargetSkill = {
  name: string;
  path: string;
  hash: string;
  adapter: TargetAdapter;
  scope: Scope;
};

async function copyAndVerifySkill(srcDir: string, destDir: string, expectedHash: string): Promise<void> {
  await ensureDir(path.dirname(destDir));
  await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });
  const copiedHash = await computeDirHash(destDir, { ignoreNames: ['.git'] });
  if (copiedHash !== expectedHash) {
    throw new Error(`Skill hash mismatch after copy: ${srcDir} -> ${destDir}`);
  }
}

export async function cmdSkillsOrganize(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;
  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;

  const adapters = getAdapters();
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select organize target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();
  const contexts: SkillContext[] = [];
  const skills: TargetSkill[] = [];
  for (const adapter of selectedAdapters) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd: ctx.cwd,
    });
    const skillsDir = adapter.resolveSkillsDir({ scope, projectRoot, homeDir });
    contexts.push({ adapter, scope, projectRoot, skillsDir });

    const names = await listDirNames(skillsDir);
    for (const name of names) {
      if (name.startsWith('.') && !positionals.includes(name)) continue;
      if (positionals.length > 0 && !positionals.includes(name)) continue;
      const skillPath = path.join(skillsDir, name);
      skills.push({
        name,
        path: skillPath,
        hash: await computeDirHash(skillPath, { ignoreNames: ['.git'] }),
        adapter,
        scope,
      });
    }
  }

  const entries: OrganizePlanEntry[] = [];
  const entryKeys = new Set<string>();
  const addEntry = (entry: OrganizePlanEntry) => {
    const key = `${entry.name}:${entry.targetLabel}:${entry.action}:${entry.path ?? ''}:${entry.detail ?? ''}`;
    if (entryKeys.has(key)) return;
    entryKeys.add(key);
    entries.push(entry);
  };

  const byName = new Map<string, TargetSkill[]>();
  for (const skill of skills) {
    const current = byName.get(skill.name);
    if (current) current.push(skill);
    else byName.set(skill.name, [skill]);
  }

  const sharedDestination = getSharedSkillDestinations().find((entry) => entry.key === 'agents-skills');
  const agentsContext = contexts.find((context) => context.adapter.id === sharedDestination?.ownerTarget);

  for (const [name, items] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const byHash = new Map<string, TargetSkill[]>();
    for (const item of items) {
      const current = byHash.get(item.hash);
      if (current) current.push(item);
      else byHash.set(item.hash, [item]);
    }

    if (byHash.size > 1) {
      for (const item of items) {
        addEntry({
          name,
          targetLabel: getColoredLabel(item.adapter),
          action: 'report-only',
          path: item.path,
          detail: 'same skill name exists with different content',
          mutates: false,
        });
      }
      continue;
    }

    const cluster = items;
    if (cluster.length < 2) continue;

    const sharedItems = cluster.filter((item) => sharedDestination?.memberTargets.includes(item.adapter.id));
    const nonSharedItems = cluster.filter((item) => !sharedDestination?.memberTargets.includes(item.adapter.id));

    if (sharedItems.length > 0 && sharedDestination && agentsContext) {
      const sharedTargetPath = path.join(agentsContext.skillsDir, name);
      const agentsItem = sharedItems.find((item) => item.adapter.id === sharedDestination.ownerTarget);
      const sharedHash = sharedItems[0]!.hash;

      if (!agentsItem) {
        const source = sharedItems[0]!;
        addEntry({
          name,
          targetLabel: getColoredLabel(source.adapter),
          action: 'promote',
          path: source.path,
          detail: `-> ${sharedTargetPath}`,
          mutates: true,
          execute: async () => {
            const existing = await pathExists(sharedTargetPath);
            if (!existing) await copyAndVerifySkill(source.path, sharedTargetPath, sharedHash);
            else {
              const existingHash = await computeDirHash(sharedTargetPath, { ignoreNames: ['.git'] });
              if (existingHash !== sharedHash) {
                throw new Error(`Shared destination already exists with different content: ${sharedTargetPath}`);
              }
            }
            if (source.path !== sharedTargetPath) await removeDir(source.path);
          },
        });
      } else {
        addEntry({
          name,
          targetLabel: getColoredLabel(agentsItem.adapter),
          action: 'keep',
          path: agentsItem.path,
          detail: 'shared destination',
          mutates: false,
        });
      }

      for (const item of sharedItems) {
        if (item.adapter.id === sharedDestination.ownerTarget && agentsItem) continue;
        if (!agentsItem && item === sharedItems[0]) continue;
        addEntry({
          name,
          targetLabel: getColoredLabel(item.adapter),
          action: 'remove-redundant-copy',
          path: item.path,
          detail: `shared via ${sharedTargetPath}`,
          mutates: true,
          execute: async () => {
            const existingHash = await computeDirHash(sharedTargetPath, { ignoreNames: ['.git'] });
            if (existingHash !== item.hash) {
              throw new Error(`Shared destination verification failed for ${name}`);
            }
            await removeDir(item.path);
          },
        });
      }
    } else {
      for (const item of cluster) {
        addEntry({
          name,
          targetLabel: getColoredLabel(item.adapter),
          action: 'report-only',
          path: item.path,
          detail:
            sharedItems.length > 0
              ? 'shared destination not selected for compatibility-aware promotion'
              : 'exact duplicate exists outside the shared skills compatibility set',
          mutates: false,
        });
      }
      continue;
    }

    for (const item of nonSharedItems) {
      addEntry({
        name,
        targetLabel: getColoredLabel(item.adapter),
        action: 'report-only',
        path: item.path,
        detail: 'duplicate exists, but this target is not in the shared skills compatibility set',
        mutates: false,
      });
    }
  }

  return await runOrganizePlan({
    groupLabel: 'Skills',
    entries,
    interactive,
    dryRun,
    force,
  });
}
