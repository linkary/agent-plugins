import select from '@inquirer/select';
import checkbox from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import search from '@inquirer/search';

export type SelectOption<T extends string> = {
  label: string;
  value: T;
};

export async function promptSelect<T extends string>(params: {
  message: string;
  options: SelectOption<T>[];
  defaultValue?: T;
}): Promise<T> {
  const { message, options, defaultValue } = params;
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }
  if (options.length === 0) throw new Error('No options available');

  const hasValidDefault = defaultValue ? options.some((o) => o.value === defaultValue) : false;

  try {
    const answer = await select({
      message,
      choices: options.map((o) => ({ name: o.label, value: o.value })),
      pageSize: Math.min(15, options.length),
      ...(hasValidDefault ? { default: defaultValue } : {}),
    });
    return answer;
  } catch (err) {
    if (err && typeof err === 'object' && 'name' in err && err.name === 'ExitPromptError') {
      process.exit(0);
    }
    throw err;
  }
}

export async function promptChoice(params: {
  message: string;
  options: { key: string; label: string }[];
}): Promise<string> {
  const { message, options } = params;
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }
  if (options.length === 0) throw new Error('No options available');

  try {
    const answer = await select({
      message,
      choices: options.map((o) => ({ name: o.label, value: o.key })),
      pageSize: Math.min(15, options.length),
    });
    return answer;
  } catch (err) {
    if (err && typeof err === 'object' && 'name' in err && err.name === 'ExitPromptError') {
      process.exit(0);
    }
    throw err;
  }
}

export async function promptConfirm(params: { message: string; default?: boolean }): Promise<boolean> {
  const { message, default: defaultValue = false } = params;
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }

  try {
    const answer = await confirm({
      message,
      default: defaultValue,
    });
    return answer;
  } catch (err) {
    if (err && typeof err === 'object' && 'name' in err && err.name === 'ExitPromptError') {
      process.exit(0);
    }
    throw err;
  }
}

export async function promptMultiSelect<T extends string>(params: {
  message: string;
  options: SelectOption<T>[];
  /** Values to pre-select; if 'all', all options are selected */
  defaultSelected?: T[] | 'all';
}): Promise<T[]> {
  const { message, options, defaultSelected } = params;
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }
  if (options.length === 0) return [];

  const selectedSet =
    defaultSelected === 'all' ? new Set(options.map((o) => o.value)) : new Set(defaultSelected ?? []);

  try {
    const answers = await checkbox({
      message,
      choices: options.map((o) => ({ name: o.label, value: o.value, checked: selectedSet.has(o.value) })),
      pageSize: Math.min(20, options.length),
    });
    return answers;
  } catch (err) {
    // If user pressed Ctrl+C, exit immediately
    if (err && typeof err === 'object' && 'name' in err && err.name === 'ExitPromptError') {
      process.exit(0);
    }
    throw err;
  }
}

/**
 * Searchable multi-select: first filter by search, then select from filtered results.
 * Useful when there are many options.
 */
export async function promptSearchableMultiSelect<T extends string>(params: {
  message: string;
  searchMessage?: string;
  options: SelectOption<T>[];
  defaultSelected?: T[] | 'all';
}): Promise<T[]> {
  const { message, searchMessage, options, defaultSelected } = params;
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }
  if (options.length === 0) return [];

  // If few options, skip search and go straight to checkbox
  if (options.length <= 15) {
    return promptMultiSelect({ message, options, defaultSelected });
  }

  // Show search prompt first to filter options
  process.stdout.write(`\n${options.length} items available. Type to filter, Enter to proceed.\n`);

  const selectedSet =
    defaultSelected === 'all' ? new Set(options.map((o) => o.value)) : new Set(defaultSelected ?? []);

  try {
    // Allow user to search and filter
    const filtered = await search<T[]>({
      message: searchMessage ?? 'Filter (or press Enter for all):',
      source: async (input) => {
        const term = (input ?? '').toLowerCase().trim();
        if (!term) {
          // Show first page when no input
          return options.slice(0, 20).map((o) => ({
            name: o.label,
            value: [o.value],
            description: `${options.length} total`,
          }));
        }
        const matches = options.filter((o) =>
          o.label.toLowerCase().includes(term) || o.value.toLowerCase().includes(term)
        );
        if (matches.length === 0) {
          return [{ name: '(no matches)', value: [] as T[], disabled: true }];
        }
        // Return "Select all X matches" + individual matches
        return [
          { name: `Select all ${matches.length} matches`, value: matches.map((o) => o.value) },
          ...matches.slice(0, 30).map((o) => ({ name: o.label, value: [o.value] })),
        ];
      },
    });

    if (filtered.length === 0) {
      return [];
    }

    // If user selected a batch, return those
    if (filtered.length > 1) {
      return filtered;
    }

    // Single selection - show checkbox for that subset
    const singleValue = filtered[0]!;
    return [singleValue];
  } catch (err) {
    if (err && typeof err === 'object' && 'name' in err && err.name === 'ExitPromptError') {
      process.exit(0);
    }
    throw err;
  }
}

