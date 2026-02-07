import select from '@inquirer/select';
import confirm from '@inquirer/confirm';
import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  usePagination,
  useEffect,
  useMemo,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  Separator,
  makeTheme,
  type Theme,
} from '@inquirer/core';
import figures from '@inquirer/figures';
import { ANSI } from './ansi.js';

export type SelectOption<T extends string> = {
  label: string;
  value: T;
};

type SearchCheckboxTheme = {
  icon: {
    checked: string;
    unchecked: string;
    cursor: string;
  };
  style: {
    disabled: (text: string) => string;
    searchTerm: (text: string) => string;
    description: (text: string) => string;
    highlight: (text: string) => string;
    keysHelpTip: (keys: [key: string, action: string][]) => string | undefined;
  };
};

const searchCheckboxTheme: SearchCheckboxTheme = {
  icon: {
    checked: `${ANSI.green}${figures.radioOn}${ANSI.reset}`,
    unchecked: figures.radioOff,
    cursor: figures.pointer,
  },
  style: {
    disabled: (text: string) => `${ANSI.dim}- ${text}${ANSI.reset}`,
    searchTerm: (text: string) => `${ANSI.cyan}${text}${ANSI.reset}`,
    description: (text: string) => `${ANSI.cyan}${text}${ANSI.reset}`,
    highlight: (text: string) => `${ANSI.cyan}${text}${ANSI.reset}`,
    keysHelpTip: (keys: [string, string][]) =>
      keys
        .map(([key, action]) => `${ANSI.bold}${key}${ANSI.reset} ${ANSI.dim}${action}${ANSI.reset}`)
        .join(`${ANSI.dim} • ${ANSI.reset}`),
  },
};

type Choice<Value> = {
  value: Value;
  name?: string;
  description?: string;
  short?: string;
  disabled?: boolean | string;
  checked?: boolean;
};

function isSelectable<Value>(item: Choice<Value> | Separator): item is Choice<Value> {
  return !Separator.isSeparator(item) && !item.disabled;
}

const searchCheckbox = createPrompt(
  <Value extends string>(
    config: {
      message: string;
      source: (term: string | undefined) => Promise<readonly (Choice<Value> | Separator)[]>;
      pageSize?: number;
      defaultSelected?: Value[];
      theme?: Theme<SearchCheckboxTheme>;
    },
    done: (value: Value[]) => void,
  ) => {
    const { pageSize = 15, defaultSelected = [] } = config;
    const theme = makeTheme(searchCheckboxTheme, config.theme);
    const [status, setStatus] = useState<'loading' | 'idle' | 'done'>('loading');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<readonly (Choice<Value> | Separator)[]>([]);
    const [selectedValues, setSelectedValues] = useState<Set<Value>>(new Set(defaultSelected));
    const [searchError, setSearchError] = useState<string>();

    const prefix = usePrefix({ status, theme });

    const fetchResults = async (term: string) => {
      try {
        setStatus('loading');
        const results = await config.source(term);
        setSearchResults(results);
        setStatus('idle');
      } catch (error) {
        setSearchError(error instanceof Error ? error.message : String(error));
        setStatus('idle');
      }
    };

    useEffect(() => {
      fetchResults(searchTerm);
    }, [searchTerm]);

    const filteredChoices = useMemo(
      () => searchResults.filter((item): item is Choice<Value> => !Separator.isSeparator(item)),
      [searchResults],
    );

    const bounds = useMemo(() => {
      const first = searchResults.findIndex(isSelectable);
      const last = searchResults.findLastIndex(isSelectable);
      return { first, last };
    }, [searchResults]);

    const [active = bounds.first, setActive] = useState<number>();

    useKeypress(async (key, rl) => {
      if (isEnterKey(key)) {
        setStatus('done');
        done(Array.from(selectedValues));
      } else if (isSpaceKey(key)) {
        const choice = searchResults[active];
        if (choice && !Separator.isSeparator(choice) && !choice.disabled) {
          const newValue = new Set(selectedValues);
          if (newValue.has(choice.value)) {
            newValue.delete(choice.value);
          } else {
            newValue.add(choice.value);
          }
          setSelectedValues(newValue);
        }
      } else if (key.ctrl && key.name === 'a') {
        const allSelectable = searchResults.filter(isSelectable);
        const allSelected = allSelectable.every((c) => selectedValues.has(c.value));
        const newValue = new Set(selectedValues);
        if (allSelected) {
          allSelectable.forEach((c) => newValue.delete(c.value));
        } else {
          allSelectable.forEach((c) => newValue.add(c.value));
        }
        setSelectedValues(newValue);
      } else if (key.ctrl && key.name === 'r') {
        const allSelectable = searchResults.filter(isSelectable);
        const newValue = new Set(selectedValues);
        allSelectable.forEach((c) => {
          if (newValue.has(c.value)) {
            newValue.delete(c.value);
          } else {
            newValue.add(c.value);
          }
        });
        setSelectedValues(newValue);
      } else if (status !== 'loading' && (isUpKey(key) || isDownKey(key))) {
        rl.clearLine(0);
        if (
          (isUpKey(key) && active !== bounds.first) ||
          (isDownKey(key) && active !== bounds.last)
        ) {
          const offset = isUpKey(key) ? -1 : 1;
          let next = active;
          do {
            next = (next + offset + searchResults.length) % searchResults.length;
          } while (Separator.isSeparator(searchResults[next]) || (searchResults[next] as Choice<Value>).disabled);
          setActive(next);
        }
      } else {
        // Only update search term if it's likely a character input (not a control key)
        if (!key.ctrl && !key.meta && key.name !== 'escape' && key.name !== 'tab') {
          setSearchTerm(rl.line);
        }
      }
    });

    const message = theme.style.message(config.message, status);
    const searchIndicator = searchTerm ? theme.style.searchTerm(` [searching: "${searchTerm}"]`) : '';

    const page = usePagination({
      items: searchResults,
      active,
      renderItem({ item, isActive }) {
        if (Separator.isSeparator(item)) {
          return ` ${item.separator}`;
        }

        const isSelected = selectedValues.has(item.value);
        const checkbox = isSelected ? theme.icon.checked : theme.icon.unchecked;
        const color = isActive ? theme.style.highlight : (x: string) => x;
        const cursor = isActive ? theme.icon.cursor : ' ';

        if (item.disabled) {
          const disabledLabel = typeof item.disabled === 'string' ? item.disabled : '(disabled)';
          return theme.style.disabled(`${item.name} ${disabledLabel}`);
        }

        return color(`${cursor}${checkbox} ${item.name ?? item.value}`);
      },
      pageSize,
      loop: false,
    });

    const helpLine = theme.style.keysHelpTip([
      ['↑↓', 'navigate'],
      ['space', 'toggle'],
      [`${selectedValues.size} selected`, ''],
      ['^a', 'all'],
      ['^r', 'invert'],
      ['⏎', 'submit'],
    ]);

    const header = [prefix, message, searchIndicator].filter(Boolean).join(' ').trimEnd();

    if (status === 'done') {
      const selectedNames = filteredChoices
        .filter((c) => selectedValues.has(c.value))
        .map((c) => c.short ?? c.name ?? c.value);
      return [prefix, message, theme.style.answer(selectedNames.join(', '))].join(' ');
    }

    return [
      header,
      searchError ? theme.style.error(searchError) : page,
      ' ',
      helpLine,
    ]
      .filter(Boolean)
      .join('\n')
      .trimEnd();
  },
);

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
  /** Enable real-time filter for large lists (>20 items) */
  searchable?: boolean;
}): Promise<T[]> {
  const { message, options, defaultSelected } = params;
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }
  if (options.length === 0) return [];

  const initialValues = defaultSelected === 'all' ? options.map((o) => o.value) : (defaultSelected ?? []);

  try {
    const answers = await searchCheckbox({
      message,
      defaultSelected: initialValues,
      source: async (input) => {
        const term = (input ?? '').toLowerCase().trim();
        if (!term) {
          return options.map((o) => ({ name: o.label, value: o.value }));
        }
        return options
          .filter((o) => o.label.toLowerCase().includes(term) || o.value.toLowerCase().includes(term))
          .map((o) => ({ name: o.label, value: o.value }));
      },
    });
    return answers as T[];
  } catch (err) {
    if (err && typeof err === 'object' && 'name' in err && err.name === 'ExitPromptError') {
      process.exit(0);
    }
    throw err;
  }
}

