import path from 'node:path';
import { loadConfig, saveConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { listCentralSkills, getCentralSkillPath } from '../../core/skill-store.js';
import { getHomeDir } from '../../util/apg-paths.js';
import { ensureDir, listDirNames, pathExists, removeDir } from '../../util/fs-utils.js';
import { findProjectRoot } from '../../util/project-root.js';
import { promptChoice, promptMultiSelect, promptSelect } from '../../util/prompt.js';
import type { CliRunContext } from '../../runner/cli.js';
import type { ParsedFlags } from '../../util/options.js';
import { getAdapters, type Scope, type TargetAdapter } from '../../targets/adapters.js';

export async function cmdSkillsManage(_positionals: string[], _flags: ParsedFlags, ctx: CliRunContext) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('manage requires an interactive terminal (TTY).\n');
    return 1;
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const action = await promptSelect({
      message: 'Manage skills:',
      options: [
        { label: 'Central skills (add/rm/update targets via other commands)', value: 'central' },
        { label: 'Target skills (delete from cursor/gemini/codex/claude/antigravity)', value: 'target' },
        { label: 'Sync config (default scope + which skills per target)', value: 'config' },
        { label: 'Exit', value: 'exit' },
      ],
    });

    if (action === 'exit') return 0;
    if (action === 'central') {
      await manageCentral();
      continue;
    }
    if (action === 'target') {
      await manageTarget(ctx);
      continue;
    }
    if (action === 'config') {
      await manageConfig();
      continue;
    }
  }
}

async function manageCentral() {
  const skills = await listCentralSkills();
  if (skills.length === 0) {
    process.stdout.write('(no central skills)\n');
    return;
  }

  const selected = await promptMultiSelect({
    message: 'Select central skills to delete:',
    options: skills.map((n) => ({ label: n, value: n })),
  });
  if (selected.length === 0) return;

  const confirm = await promptChoice({
    message: `Delete ${selected.length} central skill(s)?`,
    options: [
      { key: 'y', label: 'Yes' },
      { key: 'n', label: 'No' },
    ],
  });
  if (confirm !== 'y') return;

  const registry = await loadRegistry();
  for (const name of selected) {
    const skillPath = getCentralSkillPath(name);
    if (!(await pathExists(skillPath))) continue;
    await removeDir(skillPath);
    delete registry.skills[name];
    process.stdout.write(`Deleted: ${name}\n`);
  }
  await saveRegistry(registry);
}

async function manageTarget(ctx: CliRunContext) {
  const adapters = getAdapters();
  const targetId = await promptSelect({
    message: 'Select target:',
    options: adapters.map((a) => ({ label: a.label, value: a.id })),
  });
  const adapter = adapters.find((a) => a.id === targetId) as TargetAdapter | undefined;
  if (!adapter) return;

  const config = await loadConfig();
  const targetConfig = config.targets[adapter.id];
  const scopeDefault: Scope = targetConfig?.defaultScope === 'global' ? 'global' : 'local';

  const scope = await promptSelect({
    message: `Scope for ${adapter.label} (default: ${scopeDefault}):`,
    options: [
      { label: 'Local (project)', value: 'local' },
      { label: 'Global (home)', value: 'global' },
    ],
  });

  const homeDir = getHomeDir();
  const projectRoot = scope === 'local' ? await findProjectRoot(ctx.cwd) : ctx.cwd;
  const skillsDir = adapter.resolveSkillsDir({ scope, projectRoot, homeDir });

  const skills = await listDirNames(skillsDir);
  if (skills.length === 0) {
    process.stdout.write(`(no skills found in ${adapter.label} ${scope})\n`);
    return;
  }

  const selected = await promptMultiSelect({
    message: `Select ${adapter.label} (${scope}) skills to delete:`,
    options: skills.map((n) => ({ label: n, value: n })),
  });
  if (selected.length === 0) return;

  const confirm = await promptChoice({
    message: `Delete ${selected.length} skill(s) from ${adapter.label} (${scope})?`,
    options: [
      { key: 'y', label: 'Yes' },
      { key: 'n', label: 'No' },
    ],
  });
  if (confirm !== 'y') return;

  const syncState = await loadSyncState();
  const contextId = makeContextId({ target: adapter.id, scope, projectRoot: scope === 'local' ? projectRoot : undefined });
  const context = syncState.contexts[contextId];

  await ensureDir(skillsDir);
  for (const name of selected) {
    const skillPath = path.join(skillsDir, name);
    if (!(await pathExists(skillPath))) continue;
    await removeDir(skillPath);
    if (context?.skills) delete context.skills[name];
    process.stdout.write(`Deleted from ${adapter.label}: ${name}\n`);
  }
  await saveSyncState(syncState);
}

async function manageConfig() {
  const adapters = getAdapters();
  const targetId = await promptSelect({
    message: 'Select target to configure:',
    options: adapters.map((a) => ({ label: a.label, value: a.id })),
  });
  const adapter = adapters.find((a) => a.id === targetId);
  if (!adapter) return;

  const config = await loadConfig();
  const current = config.targets[adapter.id] ?? {};

  const edit = await promptSelect({
    message: `Edit config for ${adapter.label}:`,
    options: [
      { label: `Default scope (currently: ${current.defaultScope ?? 'local'})`, value: 'scope' },
      { label: 'Skills to sync (include list)', value: 'skills' },
      { label: 'Back', value: 'back' },
    ],
  });

  if (edit === 'back') return;

  if (edit === 'scope') {
    const scope = await promptSelect({
      message: 'Choose default scope:',
      options: [
        { label: 'Local', value: 'local' },
        { label: 'Global', value: 'global' },
      ],
    });
    config.targets[adapter.id] = { ...current, defaultScope: scope };
    await saveConfig(config);
    process.stdout.write(`Saved default scope for ${adapter.label}: ${scope}\n`);
    return;
  }

  const central = await listCentralSkills();
  if (central.length === 0) {
    process.stdout.write('(no central skills to select)\n');
    return;
  }

  const mode = await promptChoice({
    message: 'Which skills should sync by default?',
    options: [
      { key: 'a', label: 'All skills' },
      { key: 's', label: 'Select skills' },
      { key: 'c', label: 'Cancel' },
    ],
  });
  if (mode === 'c') return;
  if (mode === 'a') {
    config.targets[adapter.id] = { ...current, include: ['*'] };
    await saveConfig(config);
    process.stdout.write(`Saved ${adapter.label} include list: *\n`);
    return;
  }

  const selected = await promptMultiSelect({
    message: 'Select skills to include:',
    options: central.map((n) => ({ label: n, value: n })),
  });
  config.targets[adapter.id] = { ...current, include: selected };
  await saveConfig(config);
  process.stdout.write(`Saved ${adapter.label} include list: ${selected.length} skill(s)\n`);
}
