// Bundled by Bun at build time; avoids runtime dependency on package.json resolution.
import pkg from '../package.json';

export const PKG_NAME: string = (pkg as { name?: string }).name ?? 'agent-plugins';
export const PKG_VERSION: string = (pkg as { version?: string }).version ?? '0.0.0';
