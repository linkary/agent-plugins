import readline from 'node:readline/promises';
import select from '@inquirer/select';
import checkbox from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';

export type SelectOption<T extends string> = {
  label: string;
  value: T;
};

function splitNumberTokens(input: string): string[] {
  return input
    .split(/[,，\s]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

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
  } catch {
    // Fallback to readline on error
  }

  process.stdout.write(`${message}\n`);
  options.forEach((opt, idx) => process.stdout.write(`  ${idx + 1}) ${opt.label}\n`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const answer = (await rl.question('Enter number: ')).trim();
      if (!answer && hasValidDefault) return defaultValue!;

      const first = splitNumberTokens(answer)[0] ?? '';
      const n = Number(first);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        return options[n - 1]!.value;
      }
      process.stdout.write('Invalid selection.\n');
    }
  } finally {
    rl.close();
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
      choices: options.map((o) => ({ name: `[${o.key}] ${o.label}`, value: o.key })),
      pageSize: Math.min(12, options.length),
    });
    return answer;
  } catch {
    // Fallback to readline on error
  }

  process.stdout.write(`${message}\n`);
  process.stdout.write(options.map((o) => `  [${o.key}] ${o.label}`).join('\n') + '\n');

  const allowed = new Set(options.map((o) => o.key));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const answer = (await rl.question('Choose: ')).trim();
      if (allowed.has(answer)) return answer;
      process.stdout.write('Invalid choice.\n');
    }
  } finally {
    rl.close();
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
  } catch {
    // Fallback to readline on error
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const suffix = defaultValue ? '[Y/n]' : '[y/N]';
      const raw = (await rl.question(`${message} ${suffix} `)).trim().toLowerCase();
      if (!raw) return defaultValue;
      if (raw === 'y' || raw === 'yes') return true;
      if (raw === 'n' || raw === 'no') return false;
      process.stdout.write('Invalid input.\n');
    }
  } finally {
    rl.close();
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
  } catch {
    // Fallback to readline on error
  }

  process.stdout.write(`${message}\n`);
  options.forEach((opt, idx) => process.stdout.write(`  ${idx + 1}) ${opt.label}\n`));
  process.stdout.write('Enter numbers (comma/space-separated), or empty to cancel.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const answer = (await rl.question('Select: ')).trim();
      if (!answer) return [];
      const nums = splitNumberTokens(answer).map((p) => Number(p));
      if (nums.some((n) => !Number.isInteger(n))) {
        process.stdout.write('Invalid input.\n');
        continue;
      }
      const unique = Array.from(new Set(nums));
      if (unique.some((n) => n < 1 || n > options.length)) {
        process.stdout.write('Out of range.\n');
        continue;
      }
      return unique.map((n) => options[n - 1]!.value);
    }
  } finally {
    rl.close();
  }
}
