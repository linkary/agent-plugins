# agent-plugins (ap)

一个用于 **LLM Agent Skills**、**Subagent** 与 **Commands** 的集中管理与跨工具同步 CLI。

<div align="center">
  <a href="assets/intro.mp4">
    <img src="assets/intro.gif" alt="agent-plugins demo" width="800" />
  </a>
  <br />
  <sub>点击查看完整视频</sub>
</div>

## 核心约定

- Central skills 目录（默认）：`$HOME/.agent-plugins/skills/<skill-name>/`
- Central agents 目录（默认）：`$HOME/.agent-plugins/agents/<agent-name>/`
- Central commands 目录（默认）：`$HOME/.agent-plugins/commands/<command-name>/`
- `add/rm/update` 默认管理的是 central 中的条目
- `sync`：central -> 目标工具（单向复制，支持冲突处理）
- `collect`：目标工具 -> central（用于把分散在各处的条目收集回来，支持冲突处理）
- Commands 支持两种形式：**file-form**（单个 `.md` 文件）和 **directory-form**（包含多个文件的目录）
- Rules 使用统一的 prompt-rule 模型；`sync/collect` 会在 Cursor（`.mdc`）与 Claude/Qoder（`.md`）之间自动转换
- MCP 的 `sync/collect` 也使用 target-aware 转换；不支持的传输/字段会在写入前标记为 `incompatible` 或 `lossy`

可通过环境变量覆盖默认目录：

- `APG_HOME` 或 `AGENT_PLUGINS_HOME`：覆盖 `~/.agent-plugins`
- `CODEX_HOME`：覆盖 Codex 的 `~/.codex`（影响 Codex global 路径）

## 安装与构建

本项目使用 Bun 开发/构建，但产物可在 Node.js（>= 20）下运行：

```bash
bun run build
node dist/cli.mjs --help
```

发布到 npm 后会提供两个命令入口：

- `ap`（简写）
- `agent-plugins`（全称）

## 交互体验

交互功能（选择、冲突处理、浏览）使用基于 ink 的 TUI：

- **SkillBrowser / CommandBrowser**：左右双面板视图，左侧为可导航列表，右侧为元信息面板。支持搜索（`/`）、vim 风格导航（`j/k/f/b/d/u/g/G`）以及回车打开。
- **FileBrowser**：目录级导航，用于 directory-form 条目。
- **FileViewer**：支持语法高亮和滚动的文件查看器。

## 命令概览

`skills`、`agents`、`commands` 与 `rules` 共用生命周期子命令（`add/rm/sync/collect/list/find`）。

### Skills

```bash
# 列出 central skills
ap skills list

# 查找 skills（本地 + 在线）
ap skills find [query]
ap skills find react --limit 10
ap skills find react --offline

# 浏览与查看 skills（交互式 TUI）
ap skills show

# 添加 skill（git 或本地路径）
ap skills add <git-url|local-path> [--name <skill>] [--ref <ref>] [--force]

# 更新 skill（根据 add 时记录的来源）
ap skills update [<skill>...] [--all] [--dry-run] [--force]

# 同步 central -> 目标工具
ap skills sync [<skill>...] --target <target> [--scope local|global] [--dry-run] [--force]

# 从目标工具收集 -> central
ap skills collect [<skill>...] --target <target> [--scope local|global] [--all] [--dry-run] [--force]

# 删除 skill（无参数时进入交互模式）
ap skills rm [<skill>...] [--target <...>] [--scope local|global] [--dry-run]
```

### Commands

```bash
# 列出 central commands
ap commands list

# 查找 commands（本地 + 在线）
ap commands find [query]

# 浏览与查看 commands（交互式 TUI）
ap commands show

# 添加 command（git 或本地路径）
ap commands add <git-url|local-path> [--name <cmd>] [--ref <ref>] [--force]

# 更新 command
ap commands update [<command>...] [--all] [--dry-run] [--force]

# 同步 central -> 目标工具
ap commands sync [<command>...] --target <target> [--scope local|global] [--dry-run] [--force]

# 从目标工具收集 -> central
ap commands collect [<command>...] --target <target> [--scope local|global] [--all] [--dry-run] [--force]

# 删除 command
ap commands rm [<command>...] [--target <...>] [--scope local|global] [--dry-run]
```

### Agents

```bash
# 列出 central agents
ap agents list

# 查找 agents（本地 + 在线）
ap agents find [query]

# 添加 agent（git 或本地路径）
ap agents add <git-url|local-path> [--name <agent>] [--ref <ref>] [--force]

# 更新 agent
ap agents update [<agent>...] [--all] [--dry-run] [--force]

# 同步 central -> 目标工具
ap agents sync [<agent>...] --target <target> [--scope local|global] [--dry-run] [--force]

# 从目标工具收集 -> central
ap agents collect [<agent>...] --target <target> [--scope local|global] [--all] [--dry-run] [--force]

# 删除 agent
ap agents rm [<agent>...] [--target <...>] [--scope local|global] [--dry-run]
```

### Rules

```bash
# 列出 central rules
ap rules list

# 查找 rules（本地 + 在线）
ap rules find [query]

# 浏览与查看 rules（交互式 TUI）
ap rules show [rule]
ap rules show --target cursor --scope local

# 添加 rule（git / 本地路径 / 单文件）
ap rules add <git-url|local-path|rule-file> [--name <rule>] [--ref <ref>] [--force]

# 同步 central -> 目标工具
ap rules sync [<rule>...] --target <target> [--scope local|global] [--dry-run] [--force]

# 从目标工具收集 -> central
ap rules collect [<rule>...] --target <target> [--scope local|global] [--dry-run] [--force]

# 删除 rule
ap rules rm [<rule>...] [--target <...>] [--scope local|global] [--dry-run]

# 校验规则（空文件/同名冲突）
ap rules validate
```

说明：`ap rules sync/collect/rm --target cursor --scope global` 现在会操作 Cursor **User Rules（Settings 文本）**，并使用受控标记块管理。  
默认存储后端：

- `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`（`ItemTable[aicontext.personalContext]`）
- 可选覆盖（自动化/测试）：`AP_CURSOR_USER_RULES_FILE=/path/to/text-file`

### 别名

根命令组支持简写：

| 全称       | 别名                  |
| ---------- | --------------------- |
| `skills`   | `skill`, `sk`, `s`    |
| `agents`   | `ag`                  |
| `commands` | `command`, `cmd`, `c` |
| `rules`    | `rule`, `rl`, `r`     |

子命令也支持简写（按位置解析）：

```bash
ap s ls           # skills list
ap s a /path      # skills add
ap c ls           # commands list
ap c show         # commands show
```

### 目标

`--target` 支持 `all`、逗号分隔（如 `--target cursor,codex`）或重复传入（如 `--target cursor --target codex`）。

支持的目标：`cursor`、`gemini`、`codex`、`claude-code`、`antigravity`、`openskills`、`agents`、`opencode`、`qoder`。

## 同步目标与默认路径（macOS）

`--scope global` 是默认值。`--scope local` 默认以 git root 为项目根目录（找不到 git root 则使用当前目录）。
Qoder 的 rules 是例外：`ap rules sync --target qoder` 会默认使用 `local`，因为 Qoder 官方文档只描述了项目级 rules。

### Skills 路径

| 目标                 | local                       | global                                 |
| -------------------- | --------------------------- | -------------------------------------- |
| Cursor               | `<project>/.cursor/skills/` | `~/.cursor/skills/`                    |
| Gemini CLI           | `<project>/.gemini/skills/` | `~/.gemini/skills/`                    |
| Codex                | `<project>/.codex/skills/`  | `$CODEX_HOME/skills/`                  |
| Claude Code          | `<project>/.claude/skills/` | `~/.claude/skills/`                    |
| Antigravity          | `<project>/.agent/skills/`  | `~/.gemini/antigravity/global_skills/` |
| Openskills           | `<project>/.agent/skills/`  | `~/.agent/skills/`                     |
| Agents (Vercel Labs) | `<project>/.agents/skills/` | `~/.agents/skills/`                    |
| OpenCode             | `<project>/.opencode/skills/` | `~/.opencode/skills/`                |
| Qoder                | `<project>/.qoder/skills/`    | `~/.qoder/skills/`                   |

### Commands 路径

| 目标                 | local                         | global                                   |
| -------------------- | ----------------------------- | ---------------------------------------- |
| Cursor               | `<project>/.cursor/commands/` | `~/.cursor/commands/`                    |
| Gemini CLI           | `<project>/.gemini/commands/` | `~/.gemini/commands/`                    |
| Codex                | `<project>/.codex/commands/`  | `$CODEX_HOME/commands/`                  |
| Claude Code          | `<project>/.claude/commands/` | `~/.claude/commands/`                    |
| Antigravity          | `<project>/.agent/commands/`  | `~/.gemini/antigravity/global_commands/` |
| Openskills           | `<project>/.agent/commands/`  | `~/.agent/commands/`                     |
| Agents (Vercel Labs) | `<project>/.agents/commands/` | `~/.agents/commands/`                    |
| OpenCode             | `<project>/.opencode/commands/` | `~/.opencode/commands/`               |
| Qoder                | `<project>/.qoder/commands/`    | `~/.qoder/commands/`                  |

### Rules 路径

| 目标                 | local                      | global                                |
| -------------------- | -------------------------- | ------------------------------------- |
| Cursor               | `<project>/.cursor/rules/` | `~/.cursor/rules/`                    |
| Gemini CLI           | `<project>/.gemini/rules/` | `~/.gemini/rules/`                    |
| Codex                | `<project>/.codex/rules/`  | `$CODEX_HOME/rules/`                  |
| Claude Code          | `<project>/.claude/rules/` | `~/.claude/rules/`                    |
| Antigravity          | `<project>/.agent/rules/`  | `~/.gemini/antigravity/global_rules/` |
| Openskills           | `<project>/.agent/rules/`  | `~/.agent/rules/`                     |
| Agents (Vercel Labs) | `<project>/.agents/rules/` | `~/.agents/rules/`                    |
| OpenCode             | `<project>/.opencode/rules/` | `~/.opencode/rules/`                |
| Qoder                | `<project>/.qoder/rules/`    | `-`                                |

Cursor 特殊说明（global）：

- 对 `cursor` + `global` 执行 `sync/collect/rm` 时，会使用 Cursor User Rules 文本存储，而不是仅依赖 `~/.cursor/rules/`。

Qoder 特殊说明（local）：

- `sync` 会写入受管的 always-apply 文件到 `<project>/.qoder/rules/agent-plugins-global.md`。
- Qoder rules 的 `global` scope 会被跳过，因为官方文档只描述了项目级 rules。

### Rules 兼容性

- 支持 prompt-rule 并带转换：`cursor`、`claude-code`、`qoder`
- 对 prompt-rule 判定为不兼容并跳过：
  - `codex`（使用执行策略 `.rules`）
  - `gemini`、`antigravity`、`openskills`、`agents`、`opencode`

## 配置与状态文件

- 配置：`$APG_HOME/config.json`
  - 每个 target 的 `defaultScope`（local/global）
  - 每个 target 的 `include`（要同步的 skills；支持 `["*"]` 表示全部）
  - 每个 target 的 `includeCommands`（要同步的 commands；支持 `["*"]` 表示全部）
  - 每个 target 的 `includeRules`（要同步的 rules；支持 `["*"]` 表示全部）
- 状态：`$APG_HOME/sync-state.json`
  - 记录每个 target/scope（以及 local 的 projectRoot）上次对齐的 hash，用于判断"目标端是否被手动修改过"并优化冲突处理

## 冲突策略

- `sync` / `collect` 都会对比目录内容 hash
- 冲突时：
  - 非交互环境：需要 `--force`（否则会报错退出）
  - 交互环境：会提示选择 `overwrite / backup / skip / keep both ...`
