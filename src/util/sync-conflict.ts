/**
 * Shared conflict resolution for sync commands.
 *
 * Provides a stateful resolver that handles:
 *   - Managed-clean auto-overwrite (previously synced, user didn't modify)
 *   - Interactive prompt with single/batch options
 *   - Non-interactive error (exit 1)
 *   - Force mode (auto-overwrite all)
 *
 * Used by: skills/sync, commands/sync, agents/sync, mcp/sync
 */
import { promptChoice } from './prompt.js';
import { getColoredLabel, type TargetAdapter } from '../targets/adapters.js';

export type ConflictAction = 'overwrite' | 'backup' | 'skip';

export type ConflictResolverOptions = {
  /** Whether the terminal is interactive (stdin.isTTY) */
  interactive: boolean;
  /** Whether --force was passed */
  force: boolean;
  /** Whether backup option is available (false for MCP) */
  supportBackup?: boolean;
};

/**
 * Create a stateful conflict resolver.
 *
 * The resolver tracks batch decisions (e.g. "Overwrite all") across
 * multiple calls within a single sync operation. Returns either a
 * ConflictAction or 'quit' (caller should abort with exit code 1).
 */
export function createConflictResolver(opts: ConflictResolverOptions) {
  const { interactive, force, supportBackup = true } = opts;
  let batchMode: 'ask' | ConflictAction = force ? 'overwrite' : 'ask';

  /**
   * Resolve a conflict for a named item.
   *
   * @param name        - Name of the conflicting item
   * @param adapter     - Target adapter (for display label)
   * @param lastHash    - Hash from last sync state (undefined if never synced)
   * @param currentHash - Current hash at the target
   * @returns 'overwrite' | 'backup' | 'skip' | 'quit'
   */
  async function resolve(
    name: string,
    adapter: TargetAdapter,
    lastHash: string | undefined,
    currentHash: string,
  ): Promise<ConflictAction | 'quit'> {
    const isManagedClean = lastHash === currentHash;
    let mode = batchMode;

    // Auto-overwrite if we previously synced this and user hasn't modified it
    if (mode === 'ask' && isManagedClean) {
      mode = 'overwrite';
    }

    if (mode !== 'ask') return mode;

    // Non-interactive: can't prompt, fail
    if (!interactive) {
      process.stderr.write(
        `Conflict detected for ${name}. Re-run with --force or in an interactive terminal.\n`,
      );
      return 'quit';
    }

    // Interactive prompt
    const options = supportBackup
      ? [
          { key: 'o', label: 'Overwrite' },
          { key: 'b', label: 'Backup & overwrite' },
          { key: 's', label: 'Skip' },
          { key: 'O', label: 'Overwrite all' },
          { key: 'B', label: 'Backup all' },
          { key: 'S', label: 'Skip all' },
          { key: 'q', label: 'Quit' },
        ]
      : [
          { key: 'o', label: 'Overwrite' },
          { key: 's', label: 'Skip' },
          { key: 'O', label: 'Overwrite all' },
          { key: 'S', label: 'Skip all' },
          { key: 'q', label: 'Quit' },
        ];

    const choice = await promptChoice({
      message: `Conflict for ${name} in ${getColoredLabel(adapter)}.`,
      options,
    });

    if (choice === 'q') return 'quit';

    // Update batch mode for subsequent calls
    if (choice === 'O') batchMode = 'overwrite';
    if (choice === 'S') batchMode = 'skip';
    if (supportBackup && choice === 'B') batchMode = 'backup';

    // Determine action for this call
    if (choice === 'o' || choice === 'O') return 'overwrite';
    if (supportBackup && (choice === 'b' || choice === 'B')) return 'backup';
    return 'skip';
  }

  return { resolve };
}
