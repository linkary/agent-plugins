import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { ensureCentralStore, getCentralSkillPath } from '../../core/skill-store.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { type Scope, getAdapters } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { getCentralSkillsDir, getHomeDir } from '../../util/apg-paths.js';
import { copyDir } from '../../util/copy-dir.js';
import { ensureDir, listDirNames, pathExists, removeDir } from '../../util/fs-utils.js';
import { computeDirHash } from '../../util/hash-dir.js';
import type { ParsedFlags } from '../../util/options.js';
import { promptChoice, promptConfirm, promptMultiSelect } from '../../util/prompt.js';
import { findProjectRoot } from '../../util/project-root.js';
import type { CliRunContext } from '../../runner/cli.js';

type SkillEntry = {
  name: string;
  srcDir: string;
  destDir: string;
  adapter: { id: string; label: string };
  scope: Scope;
  projectRoot: string;
};

export async function cmdSkillsCollect(_positionals: string[], _flags: ParsedFlags, _ctx: CliRunContext) {
  const positionals = _positionals;
  const flags = _flags;
  const ctx = _ctx;

  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;

  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;
  const startCwd = cwdFlag ? path.resolve(cwdFlag) : ctx.cwd;

  const adapters = getAdapters();
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select collect source(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();
  const homeDir = getHomeDir();

  // Phase 1: Gather all available skills from all selected targets
  const allSkills: SkillEntry[] = [];
  for (const adapter of selectedAdapters) {
    const targetConfig = config.targets[adapter.id];
    const scope = resolveScope(scopeFlag, targetConfig?.defaultScope);
    const projectRoot = scope === 'local' ? await findProjectRoot(startCwd) : startCwd;
    const sourceSkillsDir = adapter.resolveSkillsDir({ scope, projectRoot, homeDir });

    const available = await listDirNames(sourceSkillsDir);
    if (available.length === 0) {
      process.stdout.write(`(no skills found in ${adapter.label} ${scope})\n`);
      continue;
    }

    for (const name of available) {
      // Skip hidden skills (starting with .) unless explicitly specified
      if (name.startsWith('.') && !positionals.includes(name)) continue;
      // Filter by positionals if provided
      if (positionals.length > 0 && !positionals.includes(name)) continue;

      allSkills.push({
        name,
        srcDir: path.join(sourceSkillsDir, name),
        destDir: getCentralSkillPath(name),
        adapter: { id: adapter.id, label: adapter.label },
        scope,
        projectRoot,
      });
    }
  }

  if (allSkills.length === 0) {
    process.stdout.write('No skills available to collect.\n');
    return 0;
  }

  // Phase 2: Show unified selection list (all skills from all targets)
  let selectedSkills: SkillEntry[];
  if (positionals.length > 0) {
    // Positionals already filtered above
    selectedSkills = allSkills;
  } else if (interactive && !force) {
    const selectedKeys = await promptMultiSelect({
      message: 'Select skills to collect:',
      options: allSkills.map((s, i) => ({
        label: `${s.name} (${s.adapter.label})`,
        value: String(i),
      })),
      defaultSelected: 'all',
    });
    if (selectedKeys.length === 0) {
      process.stdout.write('No skills selected.\n');
      return 0;
    }
    selectedSkills = selectedKeys.map((i) => allSkills[Number(i)]!);
  } else {
    selectedSkills = allSkills;
  }

  // Phase 3: Detect status for each skill
  // Status definitions:
  // - isDuplicate: name appeared in previous source (deduplicated)
  // - status: 'new' (no dest), 'identical' (hashes match), 'conflict' (hashes differ), 'overwrite' (force mode)
  type CollectStatus = 'new' | 'identical' | 'conflict' | 'overwrite';
  type SkillWithStatus = SkillEntry & {
    status: CollectStatus;
    isDuplicate: boolean;
    srcHash: string;
    destHash?: string;
  };

  const seenSkillNames = new Set<string>();
  const skillsWithStatus: SkillWithStatus[] = [];

  process.stdout.write('Analyzing skills...\n');

  for (const s of selectedSkills) {
    const lowerName = s.name.toLowerCase();
    const isDuplicate = seenSkillNames.has(lowerName);
    seenSkillNames.add(lowerName);

    // Calculate hashes
    const srcHash = await computeDirHash(s.srcDir, { ignoreNames: ['.git'] });
    let destHash: string | undefined;
    let status: CollectStatus = 'new';

    if (await pathExists(s.destDir)) {
      destHash = await computeDirHash(s.destDir, { ignoreNames: ['.git'] });
      status = destHash === srcHash ? 'identical' : 'conflict';
    }

    skillsWithStatus.push({ ...s, status, isDuplicate, srcHash, destHash });
  }

  // ANSI color codes
  const yellow = '\x1b[33m';
  const green = '\x1b[32m';
  const red = '\x1b[31m';
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';
  const gray = '\x1b[90m'; // Bright black for identical

  const destBaseDir = getCentralSkillsDir();
  let finalSkills: SkillWithStatus[];

  // Count by status
  const newCount = skillsWithStatus.filter((s) => s.status === 'new' && !s.isDuplicate).length;
  const conflictCount = skillsWithStatus.filter((s) => s.status === 'conflict').length;
  const identicalCount = skillsWithStatus.filter((s) => s.status === 'identical').length;
  const dedupCount = skillsWithStatus.filter((s) => s.isDuplicate).length;

  if (interactive && !force) {
    process.stdout.write(
      `\nPreview: ${green}${newCount} new${reset}, ${red}${conflictCount} conflict${reset}, ${gray}${identicalCount} identical${reset}` +
        (dedupCount > 0 ? `, ${dim}${dedupCount} duplicatess${reset}` : '') +
        '\n',
    );

    // Default: select 'new' and 'conflict' (skip identical and duplicates)
    const defaultSelected = skillsWithStatus
      .map((s, i) =>
        !s.isDuplicate && (s.status === 'new' || s.status === 'conflict') ? String(i) : null,
      )
      .filter((v): v is string => v !== null);

    const selectedKeys = await promptMultiSelect({
      message: `Confirm skills to collect (target: ${destBaseDir}):`,
      options: skillsWithStatus.map((s, i) => {
        // Build status label
        const labels: string[] = [];
        if (s.isDuplicate) labels.push(`${dim}dup${reset}`);
        else if (s.status === 'new') labels.push(`${green}new${reset}`);
        else if (s.status === 'identical') labels.push(`${gray}identical${reset}`);
        else if (s.status === 'conflict') labels.push(`${red}conflict${reset}`);
        
        const statusLabel = labels.join(', ');
        return {
          label: `${s.name} (${s.adapter.label}) [${statusLabel}]`,
          value: String(i),
        };
      }),
      defaultSelected,
    });

    if (selectedKeys.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    finalSkills = selectedKeys.map((i) => skillsWithStatus[Number(i)]!);
  } else {
    // Non-interactive: exclude identical matches and duplicates
    // If strict processing is needed, maybe include identical? user usually wants updates or new stuff
    const toCollect = skillsWithStatus.filter((s) => !s.isDuplicate && s.status !== 'identical');

    process.stdout.write(`\nCollect ${toCollect.length} skill(s) to ${destBaseDir}:\n`);
    for (const s of toCollect) {
      const statusLabel = s.status === 'conflict' ? `${red}conflict${reset}` : `${green}new${reset}`;
      process.stdout.write(`  ${s.name} (${s.adapter.label}) [${statusLabel}]\n`);
    }
    const skipped = skillsWithStatus.length - toCollect.length;
    if (skipped > 0) {
      process.stdout.write(`  ${dim}(${skipped} skipped: identical or duplicates)${reset}\n`);
    }
    finalSkills = toCollect;
  }
  // Reassign for execution phase
  const skillsToExecute = finalSkills;

  // Phase 5: Execution with Batch Conflict Resolution
  if (!dryRun) await ensureCentralStore();

  const registry = await loadRegistry();
  const syncState = await loadSyncState();
  const centralSkills = await listDirNames(getCentralSkillsDir());

  // Detect which of the *selected* skills (finalSkills) have conflicts
  // We already calculated hashes in Phase 3, but let's re-verify or use that info.
  // Actually, we can just use the status we computed if we pass it through.
  // But wait, finalSkills was mapped from skillsWithStatus, so it HAS the status and hashes!
  const conflicts = skillsWithStatus.filter((s) => finalSkills.includes(s) && s.status === 'conflict');
  
  // Resolution strategy map (skill name -> action)
  const resolutions = new Map<string, 'overwrite' | 'backup' | 'keep' | 'skip'>();
  
  // Automatic resolution for non-conflicts
  for (const s of finalSkills) {
    if (s.status !== 'conflict') {
      resolutions.set(s.name, 'overwrite'); // New or identical, just overwrite/copy
    }
  }

  // Handle conflicts
  if (conflicts.length > 0 && interactive) { // conflictMode is not used here, interactive is key
    process.stdout.write(`\n${red}Conflicts detected for ${conflicts.length} skill(s).${reset}\n`);
    
    // Batch Prompt
    const batchAction = await promptChoice({
      message: 'How would you like to resolve these conflicts?',
      options: [
        { key: 'o', label: 'Overwrite local (use source version)' },
        { key: 's', label: 'Skip all conflicts (keep local)' },
        { key: 'b', label: 'Backup local & overwrite' },
        { key: 'i', label: 'Inspect/Select individually' },
        { key: 'c', label: 'Cancel operation' },
      ],
    });

    if (batchAction === 'c') {
      process.stdout.write('Operation cancelled.\n');
      return 0;
    }
    
    if (batchAction === 'o') {
      conflicts.forEach(c => resolutions.set(c.name, 'overwrite'));
    } else if (batchAction === 's') {
      conflicts.forEach(c => resolutions.set(c.name, 'skip'));
    } else if (batchAction === 'b') {
      conflicts.forEach(c => resolutions.set(c.name, 'backup'));
    } else if (batchAction === 'i') {
      // Individual selection
      for (const c of conflicts) {
        const action = await promptChoice({
          message: `Resolve conflict for ${c.name}:`,
          options: [
            { key: 'o', label: 'Overwrite' },
            { key: 'b', label: 'Backup & overwrite' },
            { key: 'k', label: 'Keep both (rename incoming)' },
            { key: 's', label: 'Skip' },
          ],
        });
        resolutions.set(c.name, action as any);
      }
    }
  } else if (force) {
    conflicts.forEach(c => resolutions.set(c.name, 'overwrite'));
  }

  // Execute based on resolutions
  for (const skill of finalSkills) {
    const { name, srcDir, destDir, adapter, scope, projectRoot, srcHash, destHash } = skill;
    
    // Safety check if source disappeared
    if (!(await pathExists(srcDir))) {
      process.stderr.write(`Missing source skill: ${name}\n`);
      continue;
    }

    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot: scope === 'local' ? projectRoot : undefined,
    });
    const context = syncState.contexts[contextId] ?? { skills: {} as Record<string, { hash: string; syncedAt: string }> };
    syncState.contexts[contextId] = context;

    // For 'keep both', we rename INCOMING (source) to a new name in dest?
    // "Keep both (rename incoming)"
    let targetDest = destDir;
    let targetName = name;
    
    const action = resolutions.get(name) ?? 'skip';

    if (action === 'skip') {
      process.stdout.write(`Skipped: ${name}\n`);
      continue;
    }
    
    if (dryRun) {
    }

    if (action === 'keep') {
       // Find unique name
       let counter = 1;
       while (await pathExists(targetDest)) {
         targetName = `${name}_new${counter}`;
         targetDest = path.join(destBaseDir, targetName);
         counter++;
       }
       process.stdout.write(`Renaming incoming to ${targetName}\n`);
    }

    if (action === 'backup') {
      const backupDir = `${destDir}.bak-${Date.now()}`;
      await ensureDir(path.dirname(backupDir));
      await fsRenameOrCopy(destDir, backupDir);
    } else if (action === 'overwrite' && await pathExists(destDir)) {
      await removeDir(destDir);
    }

    await copyDir(srcDir, targetDest, { ignoreNames: ['.git'] });
    
    // Update registry/state
    const now = new Date().toISOString();
    registry.skills[targetName] = registry.skills[targetName] ?? {
      name: targetName,
      addedAt: now,
      updatedAt: now,
      source: { type: 'collected', from: { target: adapter.id, scope, path: srcDir } },
    };
    registry.skills[targetName]!.updatedAt = now;
    context.skills[name] = { hash: srcHash, syncedAt: now };
    
    process.stdout.write(`Collected: ${targetName}\n`);
    if (!centralSkills.includes(targetName)) centralSkills.push(targetName);
  }

  if (!dryRun) {
    await saveRegistry(registry);
    await saveSyncState(syncState);
  }

  return 0;
}

function resolveScope(scopeFlag: string | undefined, defaultScope: Scope | undefined): Scope {
  if (scopeFlag === 'global') return 'global';
  if (scopeFlag === 'local') return 'local';
  return defaultScope === 'global' ? 'global' : 'local';
}

async function fsRenameOrCopy(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch {
    await copyDir(src, dest, { ignoreNames: ['.git'] });
    await removeDir(src);
  }
}

async function uniqueCentralName(base: string, existing: string[]): Promise<string> {
  const set = new Set(existing);
  if (!set.has(base)) return base;
  const suffix = Math.random().toString(16).slice(2, 8);
  const next = `${base}-${suffix}`;
  if (!set.has(next)) return next;
  return `${base}-${Date.now()}`;
}

function timestampId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds(),
  )}`;
}
