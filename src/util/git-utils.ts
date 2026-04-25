import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathExists } from './fs-utils.js';

/** 判断输入是否可能是 git URL */
export function isProbablyGitUrl(input: string): boolean {
  return (
    input.startsWith('git@') ||
    input.startsWith('ssh://') ||
    input.startsWith('https://') ||
    input.startsWith('http://') ||
    input.endsWith('.git')
  );
}

/** 判断输入是否为 GitHub shorthand（owner/repo 格式） */
export function isGitHubShorthand(input: string): boolean {
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(input) && !input.includes(':');
}

export function expandGitHubShorthand(input: string): string {
  return `https://github.com/${input}`;
}

export function guessNameFromGitUrl(url: string): string {
  const last = url.replace(/\/+$/, '').split(/[/:]/).pop() ?? 'skill';
  return last.endsWith('.git') ? last.slice(0, -4) : last;
}

type GitRunOptions = {
  cwd?: string;
  stdio?: 'inherit' | 'ignore';
  env?: NodeJS.ProcessEnv;
};

/** 执行 git 命令，返回退出码 */
export async function runGit(args: string[], opts: GitRunOptions = {}): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: opts.cwd,
      stdio: opts.stdio ?? 'inherit',
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export async function runGitCapture(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** 检查目录是否包含 SKILL.md（即是否为 skill 目录） */
export async function isSkillDir(dir: string): Promise<boolean> {
  return await pathExists(path.join(dir, 'SKILL.md'));
}

/** 检查目录是否包含 AGENT.md（即是否为 sub-agent 目录） */
export async function isAgentDir(dir: string): Promise<boolean> {
  return await pathExists(path.join(dir, 'AGENT.md'));
}
