import readline from 'node:readline/promises';

export type SelectOption<T extends string> = {
  label: string;
  value: T;
};

export async function promptSelect<T extends string>(params: {
  message: string;
  options: SelectOption<T>[];
}): Promise<T> {
  const { message, options } = params;
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }
  if (options.length === 0) throw new Error('No options available');

  process.stdout.write(`${message}\n`);
  options.forEach((opt, idx) => process.stdout.write(`  ${idx + 1}) ${opt.label}\n`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const answer = (await rl.question('Enter number: ')).trim();
      const n = Number(answer);
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

export async function promptMultiSelect<T extends string>(params: {
  message: string;
  options: SelectOption<T>[];
}): Promise<T[]> {
  const { message, options } = params;
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }
  if (options.length === 0) return [];

  process.stdout.write(`${message}\n`);
  options.forEach((opt, idx) => process.stdout.write(`  ${idx + 1}) ${opt.label}\n`));
  process.stdout.write('Enter numbers (comma-separated), or empty to cancel.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const answer = (await rl.question('Select: ')).trim();
      if (!answer) return [];
      const parts = answer
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const nums = parts.map((p) => Number(p));
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
