import select from '@inquirer/select';
import checkbox from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';

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
      pageSize: Math.min(12, options.length),
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
      pageSize: Math.min(12, options.length),
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
      pageSize: Math.min(12, options.length),
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
