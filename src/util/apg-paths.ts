import os from 'node:os';
import path from 'node:path';

export function getHomeDir(): string {
  return os.homedir();
}

export function getApgHomeDir(): string {
  const override = process.env.APG_HOME ?? process.env.AGENT_PLUGINS_HOME;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(getHomeDir(), '.agent-plugins');
}

export function getCentralSkillsDir(): string {
  return path.join(getApgHomeDir(), 'skills');
}

export function getRegistryPath(): string {
  return path.join(getApgHomeDir(), 'registry.json');
}

export function getConfigPath(): string {
  return path.join(getApgHomeDir(), 'config.json');
}

export function getSyncStatePath(): string {
  return path.join(getApgHomeDir(), 'sync-state.json');
}
