import path from 'node:path';
import { ANSI } from '../../util/ansi.js';
import type { TargetAdapter } from '../adapter-base.js';

export const agentsAdapter: TargetAdapter = {
  id: 'agents',
  label: 'Agentskills',
  color: ANSI.orange,
  aliases: ['agents'],
  // ~/.agents 是被多种工具识别的全局约定,并非独立应用;始终可用。
  alwaysAvailable: true,
  resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
    scope === 'global' ? path.join(homeDir, '.agents', 'skills') : path.join(projectRoot, '.agents', 'skills'),
  resolveAgentsDir: () => '',
  resolveCommandsDir: () => '',
  resolveRulesDir: () => '',
};
