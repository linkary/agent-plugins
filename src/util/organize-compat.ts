import type { TargetId } from '../targets/adapters.js';

export type OrganizeCapability = 'promote-to-shared' | 'prune-shadowed' | 'report-only';

export type SharedSkillDestination = {
  key: 'agents-skills';
  ownerTarget: TargetId;
  memberTargets: TargetId[];
};

const SHARED_SKILL_DESTINATIONS: SharedSkillDestination[] = [
  {
    key: 'agents-skills',
    ownerTarget: 'agents',
    memberTargets: ['agents', 'gemini'],
  },
];

export function getSharedSkillDestinations(): SharedSkillDestination[] {
  return SHARED_SKILL_DESTINATIONS.map((entry) => ({ ...entry, memberTargets: [...entry.memberTargets] }));
}

export function getSkillCapabilities(target: TargetId): OrganizeCapability[] {
  if (target === 'agents' || target === 'gemini') {
    return ['promote-to-shared', 'prune-shadowed'];
  }
  return ['report-only'];
}
