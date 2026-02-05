# agent-plugins (apg)

一个用于 **LLM Agent Skills** 的集中管理与跨工具同步的 CLI。

## 核心约定

- Central skills 目录（默认）：`$HOME/.agent-plugins/skills/<skill-name>/`
- `add/rm/update/manage` 默认管理的是 central skills
- `sync`：central → 目标工具（单向复制，支持冲突处理）
- `collect`：目标工具 → central（用于把分散在各处的 skills 收集回来，支持冲突处理）

可通过环境变量覆盖默认目录：

- `APG_HOME` 或 `AGENT_PLUGINS_HOME`：覆盖 `~/.agent-plugins`

## 安装与构建

本项目使用 Bun 开发/构建，但产物可在 Node.js 下运行：

```bash
bun run build
node dist/cli.cjs --help
```

发布到 npm 后会提供两个命令入口：

- `apg`（简写）
- `agent-plugins`（全称）

## 命令概览

```bash
# 列出 central skills
apg skills list

# 添加 skill（git 或本地目录）
apg skills add <git-url|local-path> [--name <skill>] [--ref <ref>] [--force]

# 更新 skill（根据 add 时记录的来源）
apg skills update [<skill>...] [--all] [--dry-run] [--force]

# 同步 central -> 目标工具
apg skills sync [<skill>...] --target <cursor|gemini|codex|claude-code|antigravity> [--scope local|global] [--dry-run] [--force]

# 从目标工具收集 -> central
apg skills collect [<skill>...] --target <...> [--scope local|global] [--all] [--dry-run] [--force]

# 删除 central skill（默认）或删除目标端 skill（加 --target）
apg skills rm <skill>... [--target <...>] [--scope local|global] [--dry-run]

# 可视化管理（交互式）
apg skills manage
```

子命令支持简写（按位置解析）：

```bash
apg s ls
apg s a /path/to/skill --name my-skill
```

## 同步目标与默认路径（macOS）

`--scope local` 默认以 git root 为项目根目录（找不到 git root 则使用当前目录）。

- Cursor
  - local：`<project>/.cursor/skills/`
  - global：`~/.cursor/skills/`
- Gemini CLI
  - local：`<project>/.gemini/skills/`
  - global：`~/.gemini/skills/`
- Codex
  - local：`<project>/.agents/skills/`
  - global：`~/.agents/skills/`
- Claude Code
  - local：`<project>/.claude/skills/`
  - global：`~/.claude/skills/`
- Google Antigravity
  - local：`<project>/.agent/skills/`
  - global：`~/.gemini/antigravity/skills/`

## 配置与状态文件

- 配置：`$APG_HOME/config.json`
  - 每个 target 的 `defaultScope`（local/global）
  - 每个 target 的 `include`（要同步的 skills；支持 `["*"]` 表示全部）
- 状态：`$APG_HOME/sync-state.json`
  - 记录每个 target/scope（以及 local 的 projectRoot）上次对齐的 hash，用于判断“目标端是否被手动修改过”并优化冲突处理

## 冲突策略

- `sync` / `collect` 都会对比目录内容 hash
- 冲突时：
  - 非交互环境：需要 `--force`（否则会报错退出）
  - 交互环境：会提示选择 `overwrite / backup / skip / keep both ...`
