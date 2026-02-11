import React, { useState, useCallback } from 'react';
import { render } from 'ink';
import { loadConfig } from '../../core/config.js';
import { loadRegistry } from '../../core/registry.js';
import { listCentralSkills, getCentralSkillPath } from '../../core/skill-store.js';
import { getAdapters } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { gatherTargetSkills } from './manage-utils.js';
import { SkillBrowser, type SkillEntry } from '../../ui/SkillBrowser.js';
import { FileBrowser } from '../../ui/FileBrowser.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

// ─── Entry point ────────────────────────────────────────────────────────

export async function cmdSkillsShow(_positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('show requires an interactive terminal (TTY).\n');
    return 1;
  }

  const hasTargetFlag = Boolean(flags.target);

  // 构建 skill 列表
  let skillEntries: SkillEntry[];

  if (hasTargetFlag) {
    // 目标模式：浏览指定目标的 skill
    const adapters = getAdapters();
    const config = await loadConfig();
    const selectedAdapters = await selectTargetAdapters({
      adapters,
      flags,
      interactive: true,
      mode: 'single',
      promptMessage: 'Select target to browse:',
    });
    if (selectedAdapters.length === 0) return 1;

    const targetSkills = await gatherTargetSkills({
      adapters: selectedAdapters,
      config,
      scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
      cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
      currentCwd: ctx.cwd,
    });

    skillEntries = targetSkills.map((s) => ({
      name: s.name,
      path: s.path,
      // 目标 skill 没有 registry record
    }));
  } else {
    // 中央模式：浏览中央仓库
    const skills = await listCentralSkills();
    const registry = await loadRegistry();

    skillEntries = skills.map((name) => ({
      name,
      path: getCentralSkillPath(name),
      record: registry.skills[name],
    }));
  }

  if (skillEntries.length === 0) {
    process.stdout.write('(no skills found)\n');
    return 0;
  }

  // 渲染交互式浏览器
  return new Promise<number>((resolve) => {
    const instance = render(
      <ShowApp
        skills={skillEntries}
        currentCwd={ctx.cwd}
        onExit={() => {
          instance.unmount();
          resolve(0);
        }}
      />,
    );
  });
}

// ─── 顶层 App：管理 skill browser ↔ file browser 切换 ──────────────────

type ShowAppProps = {
  skills: SkillEntry[];
  currentCwd: string;
  onExit: () => void;
};

function ShowApp(props: ShowAppProps) {
  const { skills, currentCwd, onExit } = props;
  const [view, setView] = useState<'browser' | 'files'>('browser');
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);

  const handleSelect = useCallback((skill: SkillEntry) => {
    setSelectedSkill(skill);
    setView('files');
  }, []);

  // 返回时保留上次选中的 skill 名称，便于恢复光标位置
  const handleBack = useCallback(() => {
    setView('browser');
  }, []);

  if (view === 'files' && selectedSkill) {
    return (
      <FileBrowser
        rootPath={selectedSkill.path}
        skillName={selectedSkill.name}
        onBack={handleBack}
      />
    );
  }

  return (
    <SkillBrowser
      skills={skills}
      currentCwd={currentCwd}
      initialSkillName={selectedSkill?.name}
      onSelect={handleSelect}
      onExit={onExit}
    />
  );
}
