export type AgentStorageKind = 'canonical' | 'legacy-directory' | 'legacy-file' | 'codex-toml';

export type AgentToolValue = string;

export type AgentSpec = {
  name: string;
  description?: string;
  prompt: string;
  model?: string;
  color?: string;
  tools?: AgentToolValue[];
  metadata?: Record<string, string>;
  extensions?: Record<string, Record<string, unknown>>;
};

export type AgentEntry = {
  name: string;
  path: string;
  storage: AgentStorageKind;
  form: 'directory' | 'file';
};

export type AgentReadResult = {
  entry: AgentEntry;
  spec: AgentSpec;
  promptPath?: string;
};

export type AgentWarning = {
  code: 'missing-prompt' | 'invalid-frontmatter' | 'unsupported-format';
  message: string;
};
