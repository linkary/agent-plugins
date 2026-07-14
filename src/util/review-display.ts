import type { Scope } from '../targets/adapters.js';

type TargetContext = {
  targetLabel: string;
  scope: Scope | string;
};

export function formatTargetScopeLabel(targetLabel: string, scope: Scope | string): string {
  return `${targetLabel} (${scope})`;
}

export function formatTargetReviewLine(name: string, targetLabel: string, scope: Scope | string): string {
  return `${name} → ${formatTargetScopeLabel(targetLabel, scope)}`;
}

export function formatCollectReviewLine(name: string, targetLabel: string, scope: Scope | string): string {
  return `${name} ← ${formatTargetScopeLabel(targetLabel, scope)}`;
}

export function uniqueTargetScopeLabels(targets: TargetContext[]): string[] {
  return [...new Set(targets.map((target) => formatTargetScopeLabel(target.targetLabel, target.scope)))];
}

export function formatTargetSummaryLines(targets: TargetContext[]): string[] {
  const labels = uniqueTargetScopeLabels(targets);
  if (labels.length === 0) return [];
  if (labels.length === 1) return [`Target: ${labels[0]}`];
  if (labels.length <= 3) return [`Targets: ${labels.join(', ')}`];
  return [`Targets: ${labels.length} contexts`];
}
