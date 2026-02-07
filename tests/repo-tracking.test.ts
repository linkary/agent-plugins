import { describe, it, expect, beforeEach } from 'bun:test';
import {
  normalizeRepoUrl,
  removeSkillFromRepo,
  type RegistryFileV1,
  type RepoRecord,
} from '../src/core/registry';

describe('registry repo tracking', () => {
  describe('normalizeRepoUrl', () => {
    it('should normalize https URLs', () => {
      expect(normalizeRepoUrl('https://github.com/anthropics/skills')).toBe('github.com/anthropics/skills');
    });

    it('should normalize http URLs', () => {
      expect(normalizeRepoUrl('http://github.com/anthropics/skills')).toBe('github.com/anthropics/skills');
    });

    it('should normalize git@ URLs', () => {
      expect(normalizeRepoUrl('git@github.com:anthropics/skills.git')).toBe('github.com:anthropics/skills');
    });

    it('should remove trailing .git', () => {
      expect(normalizeRepoUrl('https://github.com/user/repo.git')).toBe('github.com/user/repo');
    });

    it('should remove trailing slash', () => {
      expect(normalizeRepoUrl('https://github.com/user/repo/')).toBe('github.com/user/repo');
    });

    it('should lowercase the result', () => {
      expect(normalizeRepoUrl('https://GitHub.com/User/Repo')).toBe('github.com/user/repo');
    });
  });

  describe('removeSkillFromRepo', () => {
    let registry: RegistryFileV1;

    beforeEach(() => {
      registry = {
        version: 1,
        skills: {},
        repos: {
          'github.com/anthropics/skills': {
            url: 'https://github.com/anthropics/skills',
            skills: ['skill-a', 'skill-b', 'skill-c'],
            addedAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          'github.com/other/repo': {
            url: 'https://github.com/other/repo',
            skills: ['only-skill'],
            addedAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      };
    });

    it('should remove skill from repo and return false when skills remain', () => {
      const deleted = removeSkillFromRepo(registry, 'skill-a');
      expect(deleted).toBe(false);
      expect(registry.repos!['github.com/anthropics/skills']!.skills).toEqual(['skill-b', 'skill-c']);
    });

    it('should delete repo record and return true when last skill is removed', () => {
      const deleted = removeSkillFromRepo(registry, 'only-skill');
      expect(deleted).toBe(true);
      expect(registry.repos!['github.com/other/repo']).toBeUndefined();
    });

    it('should return false when skill is not found in any repo', () => {
      const deleted = removeSkillFromRepo(registry, 'nonexistent');
      expect(deleted).toBe(false);
    });

    it('should handle empty repos object', () => {
      registry.repos = {};
      const deleted = removeSkillFromRepo(registry, 'skill-a');
      expect(deleted).toBe(false);
    });

    it('should handle undefined repos', () => {
      delete registry.repos;
      const deleted = removeSkillFromRepo(registry, 'skill-a');
      expect(deleted).toBe(false);
    });
  });
});
