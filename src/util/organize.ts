import { ANSI } from './ansi.js';
import { promptMultiSelect, promptReviewConfirm } from './prompt.js';

export type OrganizeActionKind =
  | 'promote'
  | 'keep'
  | 'remove-redundant-copy'
  | 'report-only'
  | 'skip-unsupported';

export type OrganizePlanEntry = {
  name: string;
  targetLabel: string;
  action: OrganizeActionKind;
  path?: string;
  detail?: string;
  mutates: boolean;
  execute?: () => Promise<void>;
};

type OrganizeSelection = {
  name: string;
  entries: OrganizePlanEntry[];
};

const ACTION_ORDER: OrganizeActionKind[] = [
  'promote',
  'remove-redundant-copy',
  'keep',
  'report-only',
  'skip-unsupported',
];

const ACTION_LABELS: Record<OrganizeActionKind, string> = {
  promote: `${ANSI.green}promote${ANSI.reset}`,
  keep: `${ANSI.dim}keep${ANSI.reset}`,
  'remove-redundant-copy': `${ANSI.yellow}remove redundant copy${ANSI.reset}`,
  'report-only': `${ANSI.dim}report only${ANSI.reset}`,
  'skip-unsupported': `${ANSI.red}skip unsupported${ANSI.reset}`,
};

function renderActionSummary(entries: OrganizePlanEntry[]): string {
  const counts = new Map<OrganizeActionKind, number>();
  for (const entry of entries) {
    counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
  }

  return ACTION_ORDER.filter((action) => (counts.get(action) ?? 0) > 0)
    .map((action) => `${counts.get(action)} ${action.replace(/-/g, ' ')}`)
    .join(', ');
}

function groupByName(entries: OrganizePlanEntry[]): OrganizeSelection[] {
  const grouped = new Map<string, OrganizePlanEntry[]>();
  for (const entry of entries) {
    const current = grouped.get(entry.name);
    if (current) current.push(entry);
    else grouped.set(entry.name, [entry]);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, groupEntries]) => ({
      name,
      entries: groupEntries.sort((a, b) => {
        const aIndex = ACTION_ORDER.indexOf(a.action);
        const bIndex = ACTION_ORDER.indexOf(b.action);
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.targetLabel.localeCompare(b.targetLabel);
      }),
    }));
}

function renderDetailLine(entry: OrganizePlanEntry): string {
  const pathPart = entry.path ? ` ${ANSI.dim}${entry.path}${ANSI.reset}` : '';
  const detailPart = entry.detail ? ` ${ANSI.dim}${entry.detail}${ANSI.reset}` : '';
  return `${entry.targetLabel} [${ACTION_LABELS[entry.action]}]${pathPart}${detailPart}`;
}

function printPreview(groupLabel: string, grouped: OrganizeSelection[]): void {
  const allEntries = grouped.flatMap((group) => group.entries);
  process.stdout.write(`\n${ANSI.bold}${groupLabel} organize preview${ANSI.reset}\n`);
  process.stdout.write(`Summary: ${renderActionSummary(allEntries)}\n`);

  for (const group of grouped) {
    process.stdout.write(`\n${group.name}\n`);
    for (const entry of group.entries) {
      process.stdout.write(`  ${renderDetailLine(entry)}\n`);
    }
  }
  process.stdout.write('\n');
}

export async function runOrganizePlan(params: {
  groupLabel: string;
  entries: OrganizePlanEntry[];
  interactive: boolean;
  dryRun: boolean;
  force: boolean;
}): Promise<number> {
  const { groupLabel, entries, interactive, dryRun, force } = params;
  if (entries.length === 0) {
    process.stdout.write(`No ${groupLabel.toLowerCase()} found to organize.\n`);
    return 0;
  }

  const grouped = groupByName(entries);
  printPreview(groupLabel, grouped);

  const mutableGroups = grouped.filter((group) => group.entries.some((entry) => entry.mutates));
  if (mutableGroups.length === 0) {
    process.stdout.write(`No safe ${groupLabel.toLowerCase()} mutations are available. Preview only.\n`);
    return 0;
  }

  if (dryRun) {
    process.stdout.write('[dry-run] Preview only. No changes applied.\n');
    return 0;
  }

  let selectedGroups = mutableGroups;
  if (interactive && !force) {
    const selectedNames = await promptMultiSelect({
      message: `Confirm ${groupLabel.toLowerCase()} to organize:`,
      options: mutableGroups.map((group) => ({
        label: `${group.name} [${renderActionSummary(group.entries.filter((entry) => entry.mutates))}]`,
        detailLines: group.entries.map(renderDetailLine),
        value: group.name,
      })),
      defaultSelected: mutableGroups.map((group) => group.name),
      sortDefaultSelectedToTop: true,
      searchable: true,
    });

    if (selectedNames.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }

    const selectedNameSet = new Set(selectedNames);
    selectedGroups = mutableGroups.filter((group) => selectedNameSet.has(group.name));

    const selectedMutations = selectedGroups.flatMap((group) => group.entries.filter((entry) => entry.mutates));
    const confirm = await promptReviewConfirm({
      message: `Apply ${selectedMutations.length} ${groupLabel.toLowerCase()} organize action(s)?`,
      summaryLines: [renderActionSummary(selectedMutations)],
      detailLines: selectedGroups.flatMap((group) => [
        group.name,
        ...group.entries.filter((entry) => entry.mutates).map((entry) => `  ${renderDetailLine(entry)}`),
      ]),
      default: true,
    });
    if (!confirm) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
  } else if (!force) {
    process.stderr.write('Mutating organize actions require --force in non-interactive mode.\n');
    return 1;
  }

  const toExecute = selectedGroups.flatMap((group) => group.entries.filter((entry) => entry.mutates));
  for (const entry of toExecute) {
    if (!entry.execute) continue;
    await entry.execute();
    process.stdout.write(`Applied: ${entry.name} -> ${renderDetailLine(entry)}\n`);
  }

  return 0;
}
