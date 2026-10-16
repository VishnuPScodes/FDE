import type { Check } from '@fde/content-schema';
import type { GitSnapshot } from './git-runtime';

export interface GitCheckResult {
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface GitRemoteState {
  pullRequests: { id: number; title: string; head: string; base: string; approved: boolean; merged: boolean }[];
}

export function gradeGitLevel(checks: Check[], snapshot: GitSnapshot, remote: GitRemoteState): GitCheckResult[] {
  return checks.map((check) => {
    const state = String(check.state ?? '');
    const label = String(check.label ?? state.replaceAll('_', ' '));
    const expectedValue = check.expected;
    let actualValue: unknown = '';
    switch (state) {
      case 'current_branch': actualValue = snapshot.branch; break;
      case 'branch_exists': actualValue = snapshot.branches.includes(String(check.branch)); break;
      case 'commit_count': actualValue = snapshot.commits.length; break;
      case 'working_tree_clean': actualValue = snapshot.status.every((row) => row.head === row.workdir && row.workdir === row.stage); break;
      case 'has_conflicts': actualValue = snapshot.conflicts; break;
      case 'file_contains': actualValue = snapshot.files.find((file) => file.path === String(check.path))?.content.includes(String(check.text)) ?? false; break;
      case 'pull_request_merged': actualValue = remote.pullRequests.some((pr) => pr.head === check.branch && pr.merged); break;
      case 'pull_request_approved': actualValue = remote.pullRequests.some((pr) => pr.head === check.branch && pr.approved); break;
      case 'pushed_branch': actualValue = snapshot.remoteBranches.includes(String(check.branch)); break;
      default: actualValue = `Unsupported git_state: ${state}`;
    }
    const numericMin = typeof check.at_least === 'number' ? check.at_least : undefined;
    const passed = numericMin !== undefined && typeof actualValue === 'number'
      ? actualValue >= numericMin
      : actualValue === expectedValue;
    return {
      label,
      passed,
      expected: numericMin === undefined ? String(expectedValue ?? '') : `at least ${numericMin}`,
      actual: String(actualValue),
    };
  });
}
