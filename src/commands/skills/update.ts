import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { loadRegistry, saveRegistry, normalizeRepoUrl } from '../../core/registry.js';
import { getCentralSkillPath } from '../../core/skill-store.js';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import { detectSkillStatus } from '../../util/skill-compare.js';
import { promptMultiSelect } from '../../util/prompt.js';
import { runGit, runGitCapture, isSkillDir } from '../../util/git-utils.js';
import { ANSI } from '../../util/ansi.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdSkillsUpdate(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const all = flags.all === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const registry = await loadRegistry();

  // If specific skills provided, update just those
  if (positionals.length > 0) {
    return await updateSpecificSkills(positionals, registry, dryRun, force);
  }

  // Otherwise, update from all tracked repos
  const repos = registry.repos ?? {};
  const repoKeys = Object.keys(repos);

  if (repoKeys.length === 0) {
    process.stdout.write('(no repos tracked - use "ap skills add <repo>" to add skills from GitHub)\n');
    return 0;
  }

  let totalUpdated = 0;
  const tempDirs: string[] = [];
  const askpassScripts: string[] = [];

  type PendingUpdate = {
    skillName: string;
    srcDir: string;
    repoKey: string;
    status: 'update' | 'identical' | 'missing';
    repoUrl: string;
  };

  const allUpdates: PendingUpdate[] = [];
  let failedUpdates = 0;
  let missingDuringUpdate = 0;

  try {
    const preflight = await checkRepoCredentials(
      repoKeys.map((repoKey) => ({ repoKey, url: repos[repoKey]!.url })),
    );
    const concurrency = Math.min(4, repoKeys.length);
    if (!process.stdout.isTTY) {
      process.stdout.write(`Checking ${repoKeys.length} repo(s)...\n`);
    }

    const progress = createProgress({ total: repoKeys.length, label: 'repos', action: 'Checking', concurrency });
    const repoResults = await mapLimit(repoKeys, concurrency, async (repoKey, _index, slot) => {
      const repo = repos[repoKey]!;
      progress.start(slot, repo.url);
      try {
        const preflightError = preflight.failures.get(repoKey);
        if (preflightError) {
          progress.finishSlot(slot, 'failed', repo.url);
          return {
            updates: [] as PendingUpdate[],
            error: preflightError,
          };
        }

        const tmpDir = path.join(os.tmpdir(), `apd-update-${Math.random().toString(36).slice(2, 8)}`);
        tempDirs.push(tmpDir); // Track for cleanup
        await ensureDir(tmpDir);
        const cloneDest = path.join(tmpDir, 'repo');

        const credential = preflight.credentials.get(repoKey);
        const gitEnv = credential ? await createCredentialGitEnv(credential, askpassScripts) : nonInteractiveGitEnv();
        const code = await runGit(['clone', '--depth', '1', repo.url, cloneDest], { stdio: 'ignore', env: gitEnv });
        if (code !== 0) {
          progress.finishSlot(slot, 'failed', repo.url);
          return {
            updates: [] as PendingUpdate[],
            error: `${ANSI.red}Failed to clone ${repo.url}${ANSI.reset}`,
          };
        }

        if (repo.ref) {
          const fetchCode = await runGit(['-C', cloneDest, 'fetch', '--depth', '1', 'origin', repo.ref], {
            stdio: 'ignore',
            env: gitEnv,
          });
          const checkoutCode =
            fetchCode === 0
              ? await runGit(['-C', cloneDest, 'checkout', repo.ref], { stdio: 'ignore', env: gitEnv })
              : 1;
          if (fetchCode !== 0 || checkoutCode !== 0) {
            progress.finishSlot(slot, 'failed', repo.url);
            return {
              updates: [] as PendingUpdate[],
              error: `${ANSI.red}Failed to checkout ${repo.ref} from ${repo.url}${ANSI.reset}`,
            };
          }
        }

        let searchDir = cloneDest;
        const skillsSubdir = path.join(cloneDest, 'skills');
        if (await pathExists(skillsSubdir)) {
          const stat = await fs.stat(skillsSubdir);
          if (stat.isDirectory()) {
            searchDir = skillsSubdir;
          }
        }

        const updates: PendingUpdate[] = [];
        for (const skillName of repo.skills) {
          const srcDir = path.join(searchDir, skillName);
          if (!(await pathExists(srcDir)) || !(await isSkillDir(srcDir))) {
            updates.push({ skillName, srcDir, repoKey, status: 'missing', repoUrl: repo.url });
            continue;
          }

          const destDir = getCentralSkillPath(skillName);
          const { status } = await detectSkillStatus(srcDir, destDir);
          updates.push({
            skillName,
            srcDir,
            repoKey,
            status: status === 'new' ? 'update' : status as 'update' | 'identical',
            repoUrl: repo.url,
          });
        }
        progress.finishSlot(slot, 'checked', repo.url);
        return { updates };
      } catch (err) {
        progress.finishSlot(slot, 'failed', repo.url);
        return {
          updates: [] as PendingUpdate[],
          error: `${ANSI.red}Failed to check ${repo.url}: ${String(err)}${ANSI.reset}`,
        };
      }
    });
    progress.finish();

    let failedRepoCount = 0;
    for (const result of repoResults) {
      allUpdates.push(...result.updates);
      if (result.error) {
        failedRepoCount++;
        process.stderr.write(`${result.error}\n`);
      }
    }

    // Filter updates
    const updatesAvailable = allUpdates.filter((u) => u.status === 'update');
    const identicalCount = allUpdates.filter((u) => u.status === 'identical').length;
    const missingCount = allUpdates.filter((u) => u.status === 'missing').length;

    process.stdout.write(
      `Found ${allUpdates.length} scanned: ${ANSI.yellow}${updatesAvailable.length} update${ANSI.reset}, ${ANSI.dim}${identicalCount} identical${ANSI.reset}` +
        (missingCount > 0 ? `, ${ANSI.red}${missingCount} missing${ANSI.reset}` : '') +
        (failedRepoCount > 0 ? `, ${ANSI.red}${failedRepoCount} repo failed${ANSI.reset}` : '') +
        '\n',
    );

    if (updatesAvailable.length === 0) {
      process.stdout.write(
        failedRepoCount > 0 ? 'No updates found in repos checked successfully.\n' : 'All skills up-to-date.\n',
      );
      return allUpdates.length > 0 || failedRepoCount === 0 ? 0 : 1;
    }

    let toUpdate: PendingUpdate[] = [];
    if (interactive && !all) {
      const selectedIndices = await promptMultiSelect({
        message: 'Select skills to update:',
        options: updatesAvailable.map((u, i) => ({
          label: `${u.skillName} (${ANSI.dim}${u.repoUrl}${ANSI.reset})`,
          value: String(i),
        })),
        defaultSelected: 'all',
      });

      if (selectedIndices.length === 0) {
        process.stdout.write('Skipped.\n');
        return 0;
      }
      toUpdate = selectedIndices.map(i => updatesAvailable[Number(i)]!);
    } else {
      toUpdate = updatesAvailable;
    }

    // Execute updates
    const affectedRepos = new Set<string>();
    for (const update of toUpdate) {
      const { skillName, srcDir, repoKey } = update;
      const destDir = getCentralSkillPath(skillName);

      if (!(await pathExists(srcDir)) || !(await isSkillDir(srcDir))) {
        process.stderr.write(
          `${ANSI.red}Missing in repo (skipped): ${skillName}${ANSI.reset}\n`,
        );
        missingDuringUpdate++;
        continue;
      }

      if (dryRun) {
        process.stdout.write(`[dry-run] update ${skillName}\n`);
        totalUpdated++;
        continue;
      }

      try {
        await removeDir(destDir);
        await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });
      } catch (err) {
        process.stderr.write(
          `${ANSI.red}Failed to update ${skillName}: ${String(err)}${ANSI.reset}\n`,
        );
        failedUpdates++;
        continue;
      }

      if (registry.skills[skillName]) {
        registry.skills[skillName]!.updatedAt = new Date().toISOString();
      }

      affectedRepos.add(repoKey);
      process.stdout.write(`${ANSI.green}Updated: ${skillName}${ANSI.reset}\n`);
      totalUpdated++;
    }

    // Update timestamps for repos that had updates (or maybe all scanned repos?)
    // Traditionally we update timestamp if we successfully checked it.
    // But logic before was: if we updated a skill, we update repo timestamp.
    // Let's stick to updating timestamp if we successfully synced.
    
    // Actually, if we CHECKED and it was identical, we should also probably update the repo timestamp to show we checked.
    // But let's follow the previous logic roughly: update if we changed something.
    for (const key of affectedRepos) {
      if (registry.repos?.[key]) {
        registry.repos[key]!.updatedAt = new Date().toISOString();
      }
    }

  } finally {
    // Cleanup all temp dirs
    for (const dir of tempDirs) {
      await removeDir(dir);
    }
    for (const file of askpassScripts) {
      await fs.rm(file, { force: true });
    }
  }

  if (!dryRun && totalUpdated > 0) await saveRegistry(registry);
  process.stdout.write(`\n${totalUpdated} skill(s) updated.\n`);
  if (missingDuringUpdate > 0) {
    process.stdout.write(`${missingDuringUpdate} skill(s) missing in repo and skipped.\n`);
  }
  if (failedUpdates > 0) {
    process.stderr.write(`${failedUpdates} skill(s) failed to update.\n`);
  }
  return totalUpdated > 0 ? 0 : failedUpdates > 0 ? 1 : 0;
}

type GitCredential = {
  username: string;
  password: string;
};

function nonInteractiveGitEnv(): NodeJS.ProcessEnv {
  return {
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
  };
}

type CredentialPreflight = {
  credentials: Map<string, GitCredential>;
  failures: Map<string, string>;
};

async function checkRepoCredentials(
  repos: { repoKey: string; url: string }[],
): Promise<CredentialPreflight> {
  const credentials = new Map<string, GitCredential>();
  const failures = new Map<string, string>();
  const httpsRepos = repos.filter((repo) => /^https?:\/\//.test(repo.url));

  if (httpsRepos.length === 0) {
    return { credentials, failures };
  }

  const preflight = await mapLimit(httpsRepos, Math.min(4, httpsRepos.length), async (repo) => {
    const result = await runGitCapture(['ls-remote', '--heads', repo.url], { env: nonInteractiveGitEnv() });
    return {
      repo,
      code: result.code,
      stderr: result.stderr,
      needsCredential: result.code !== 0 && looksLikeCredentialFailure(result.stderr),
    };
  });

  for (const item of preflight) {
    if (item.code !== 0 && !item.needsCredential) {
      failures.set(item.repo.repoKey, `${ANSI.red}Failed to access ${item.repo.url}: ${formatGitError(item.stderr)}${ANSI.reset}`);
      continue;
    }
    if (!item.needsCredential) continue;

    process.stderr.write(`${ANSI.yellow}Credentials required for repo: ${item.repo.url}${ANSI.reset}\n`);
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stderr.write(
        `${ANSI.red}Cannot prompt for credentials in non-interactive mode: ${item.repo.url}${ANSI.reset}\n`,
      );
      failures.set(item.repo.repoKey, `${ANSI.red}Failed to access ${item.repo.url}: credentials required${ANSI.reset}`);
      continue;
    }

    const username = await promptLine(`Username for '${item.repo.url}': `);
    const password = await promptHidden(`Token/password for '${item.repo.url}': `);
    if (username.length === 0 || password.length === 0) {
      process.stderr.write(`${ANSI.red}Incomplete credentials for repo: ${item.repo.url}${ANSI.reset}\n`);
      failures.set(item.repo.repoKey, `${ANSI.red}Failed to access ${item.repo.url}: incomplete credentials${ANSI.reset}`);
      continue;
    }

    credentials.set(item.repo.repoKey, { username, password });
  }

  return { credentials, failures };
}

function looksLikeCredentialFailure(stderr: string): boolean {
  const text = stderr.toLowerCase();
  return (
    text.includes('could not read username') ||
    text.includes('authentication failed') ||
    text.includes('terminal prompts disabled') ||
    text.includes('authentication required')
  );
}

function formatGitError(stderr: string): string {
  const firstLine = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? 'unknown git error';
}

async function createCredentialGitEnv(
  credential: GitCredential,
  askpassScripts: string[],
): Promise<NodeJS.ProcessEnv> {
  const askpassPath = path.join(os.tmpdir(), `apd-askpass-${Math.random().toString(36).slice(2, 8)}.sh`);
  await fs.writeFile(
    askpassPath,
    [
      '#!/bin/sh',
      'case "$1" in',
      '*Username*|*username*) printf "%s\\n" "$APG_GIT_USERNAME" ;;',
      '*) printf "%s\\n" "$APG_GIT_PASSWORD" ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o700 },
  );
  askpassScripts.push(askpassPath);

  return {
    ...nonInteractiveGitEnv(),
    GIT_ASKPASS: askpassPath,
    APG_GIT_USERNAME: credential.username,
    APG_GIT_PASSWORD: credential.password,
  };
}

async function promptLine(question: string): Promise<string> {
  return await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptHidden(question: string): Promise<string> {
  return await new Promise((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk);
        }
        callback();
      },
    });
    const rl = readline.createInterface({ input: process.stdin, output, terminal: true });

    process.stdout.write(question);
    muted = true;
    rl.question('', (answer) => {
      muted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

type ProgressStatus = 'checked' | 'failed';

function createProgress(params: { total: number; label: string; action: string; concurrency: number }) {
  type SlotState = {
    status: 'idle' | 'running' | ProgressStatus;
    message: string;
  };

  let done = 0;
  let failed = 0;
  let frame = 0;
  let rendered = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const startedAt = Date.now();
  const enabled = Boolean(process.stdout.isTTY);
  const frames = ['-', '\\', '|', '/'];
  const slots: SlotState[] = Array.from({ length: params.concurrency }, () => ({ status: 'idle', message: '' }));
  const lineCount = params.concurrency + 2;

  const render = (final = false) => {
    if (!enabled) return;
    if (rendered) {
      process.stdout.write(`\x1b[${lineCount}A`);
    }

    const elapsed = formatElapsed(Date.now() - startedAt);
    if (final) {
      const failedText = failed > 0 ? ` (${failed} failed)` : '';
      const color = failed > 0 ? ANSI.yellow : ANSI.green;
      process.stdout.write(`\r\x1b[K${color}Checked${ANSI.reset} ${params.total} ${params.label} in ${elapsed}${failedText}\n`);
      for (const slot of slots) {
        process.stdout.write(`\r\x1b[K  ${formatSlot(slot, frame)}\n`);
      }
      process.stdout.write(`\r\x1b[K${formatProgressBar(done, params.total)} ${done}/${params.total}\n`);
      rendered = false;
      return;
    }

    const failedText = failed > 0 ? ` ${ANSI.red}failed ${failed}${ANSI.reset}` : '';
    const spinner = frames[frame % frames.length]!;
    frame++;

    process.stdout.write(
      `\r\x1b[K${spinner} ${params.action} ${params.label} ${done}/${params.total}${failedText} ${ANSI.dim}${elapsed}${ANSI.reset}\n`,
    );
    for (const slot of slots) {
      process.stdout.write(`\r\x1b[K  ${formatSlot(slot, frame)}\n`);
    }
    process.stdout.write(`\r\x1b[K${formatProgressBar(done, params.total)} ${done}/${params.total}\n`);
    rendered = true;
  };

  render();
  if (enabled) {
    timer = setInterval(() => render(), 120);
  }

  return {
    start(slot: number, message: string) {
      slots[slot] = { status: 'running', message };
      render();
    },
    finishSlot(slot: number, status: ProgressStatus, message?: string) {
      done++;
      if (status === 'failed') {
        failed++;
      }
      slots[slot] = { status, message: message ?? slots[slot]?.message ?? '' };
      render();
    },
    finish() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      render(true);
    },
  };
}

function formatSlot(slot: { status: 'idle' | 'running' | ProgressStatus; message: string }, frame: number): string {
  const repo = slot.message ? truncateMiddle(slot.message, 72) : 'waiting';
  if (slot.status === 'running') {
    const frames = ['-', '\\', '|', '/'];
    return `${frames[frame % frames.length]!} ${formatIndeterminateBar(frame)} ${repo}`;
  }
  if (slot.status === 'checked') {
    return `${ANSI.green}done${ANSI.reset} ${formatProgressBar(1, 1, 18)} ${repo}`;
  }
  if (slot.status === 'failed') {
    return `${ANSI.red}fail${ANSI.reset} ${formatProgressBar(1, 1, 18)} ${repo}`;
  }
  return `${ANSI.dim}- ${formatProgressBar(0, 1, 18)} waiting${ANSI.reset}`;
}

function formatProgressBar(done: number, total: number, width = 28): string {
  const filled = total === 0 ? width : Math.floor((done / total) * width);
  const hasRemaining = done < total;
  return (
    '[' +
    `${'='.repeat(filled)}` +
    `${hasRemaining ? '>' : ''}` +
    `${'-'.repeat(Math.max(0, width - filled - (hasRemaining ? 1 : 0)))}` +
    ']'
  );
}

function formatIndeterminateBar(frame: number): string {
  const width = 18;
  const segment = 5;
  const start = frame % (width + segment);
  let bar = '';

  for (let i = 0; i < width; i++) {
    const active = i >= start - segment && i < start;
    bar += active ? '=' : '-';
  }

  return `[${bar}]`;
}

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${Math.round(seconds)}s`;
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const keep = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number, workerIndex: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async (_unused, workerIndex) => {
      while (true) {
        const index = next++;
        if (index >= items.length) break;
        results[index] = await fn(items[index]!, index, workerIndex);
      }
    }),
  );

  return results;
}

async function updateSpecificSkills(
  skillNames: string[],
  registry: Awaited<ReturnType<typeof loadRegistry>>,
  dryRun: boolean,
  force: boolean,
): Promise<number> {
  let updated = 0;

  for (const name of skillNames) {
    const record = registry.skills[name];
    const dest = getCentralSkillPath(name);

    if (!(await pathExists(dest))) {
      process.stderr.write(`Missing skill: ${name}\n`);
      continue;
    }

    if (!record) {
      process.stderr.write(`No registry entry for: ${name}\n`);
      continue;
    }

    if (record.source.type === 'local') {
      const srcPath = record.source.path;
      if (!(await pathExists(srcPath))) {
        process.stderr.write(`Local source missing: ${srcPath}\n`);
        continue;
      }
      if (!force) {
        process.stderr.write(`Use --force to overwrite local skill: ${name}\n`);
        continue;
      }
      if (dryRun) {
        process.stdout.write(`[dry-run] update ${name}\n`);
        updated++;
        continue;
      }
      await removeDir(dest);
      await copyDir(srcPath, dest, { ignoreNames: ['.git'] });
      record.updatedAt = new Date().toISOString();
      updated++;
      process.stdout.write(`Updated: ${name}\n`);
      continue;
    }

    if (record.source.type === 'git') {
      // Find which repo this skill belongs to
      const repoKey = normalizeRepoUrl(record.source.url);
      const repo = registry.repos?.[repoKey];
      if (!repo) {
        process.stderr.write(`Repo not tracked: ${record.source.url} (re-add with "ap skills add ${record.source.url}")\n`);
        continue;
      }
      process.stdout.write(`Run "ap skills update" without args to update from repos.\n`);
      continue;
    }

    process.stderr.write(`Cannot update collected skill: ${name}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  return updated > 0 ? 0 : 1;
}
