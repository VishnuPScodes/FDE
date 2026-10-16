import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { loadLevel } from '../content-loader';
import { gradeGitLevel, type GitRemoteState } from '../git-grader';
import { getGitSnapshot, initializeGitWorkspace, mergeGitBranches, runGitCommand, writeGitFile } from '../git-runtime';

const workspaceKey = (id: string) => `git-level-${id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function start(id: string) {
  const level = await loadLevel(id);
  const files = Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? '']));
  const key = workspaceKey(id);
  await initializeGitWorkspace(key, files, level.order >= 3);
  return { level, key };
}

async function commit(key: string, message: string) {
  await runGitCommand(key, 'git add .');
  await runGitCommand(key, `git commit -m "${message}"`);
}

async function grade(id: string, key: string, remote?: GitRemoteState) {
  const level = await loadLevel(id);
  const results = gradeGitLevel(level.checks, await getGitSnapshot(key), remote ?? { pullRequests: [] });
  expect(results, `${id}: ${results.filter((item) => !item.passed).map((item) => `${item.label}: ${item.actual}`).join(', ')}`).toHaveLength(level.checks.length);
  expect(results.every((item) => item.passed), `${id}: ${JSON.stringify(results)}`).toBe(true);
}

describe('Week 1 Git levels', () => {
  it('grades the repository status and first commit levels', async () => {
    const first = await start('p0-w01-gt-001');
    await runGitCommand(first.key, 'git status');
    await grade(first.level.id, first.key);

    const second = await start('p0-w01-gt-002');
    await writeGitFile(second.key, 'README.md', '# FDE notes\n\nA small project for Git practice.\n\nMy first commit\n');
    await commit(second.key, 'Add first commit note');
    await grade(second.level.id, second.key);
  });

  it('grades feature branch and conflict resolution levels', async () => {
    const branch = await start('p0-w01-gt-003');
    await runGitCommand(branch.key, 'git switch -c feature/welcome');
    await writeGitFile(branch.key, 'README.md', '# FDE notes\n\nProject setup is complete.\n\nWelcome to the project\n');
    await commit(branch.key, 'Add welcome');
    await grade(branch.level.id, branch.key);

    const conflict = await start('p0-w01-gt-004');
    await runGitCommand(conflict.key, 'git switch -c feature/status');
    await writeGitFile(conflict.key, 'app.txt', 'service: tickets\nstatus: ready\n');
    await commit(conflict.key, 'Mark status ready');
    await runGitCommand(conflict.key, 'git switch main');
    await writeGitFile(conflict.key, 'app.txt', 'service: tickets\nstatus: reviewed\n');
    await commit(conflict.key, 'Review status');
    await runGitCommand(conflict.key, 'git merge feature/status');
    await writeGitFile(conflict.key, 'app.txt', 'service: tickets\nstatus: ready and reviewed\n');
    await commit(conflict.key, 'Resolve conflict');
    await grade(conflict.level.id, conflict.key);
  });

  it('grades rebase and simulated pull request levels', async () => {
    const rebase = await start('p0-w01-gt-005');
    await runGitCommand(rebase.key, 'git switch -c feature/metrics');
    await writeGitFile(rebase.key, 'metrics.txt', 'Metrics: enabled\n');
    await commit(rebase.key, 'Enable metrics');
    await runGitCommand(rebase.key, 'git switch main');
    await writeGitFile(rebase.key, 'service.txt', 'Owner: data-platform\n');
    await commit(rebase.key, 'Update service owner');
    await runGitCommand(rebase.key, 'git switch feature/metrics');
    await runGitCommand(rebase.key, 'git rebase main');
    await grade(rebase.level.id, rebase.key);

    const pullRequest = await start('p0-w01-gt-006');
    await runGitCommand(pullRequest.key, 'git switch -c feature/docs');
    await writeGitFile(pullRequest.key, 'README.md', '# Service guide\n\nRun the app locally with the dev command.\n\nSetup notes added.\n');
    await commit(pullRequest.key, 'Add setup notes');
    await runGitCommand(pullRequest.key, 'git push origin');
    await mergeGitBranches(pullRequest.key, 'main', 'feature/docs');
    await grade(pullRequest.level.id, pullRequest.key, { pullRequests: [{ id: 1, title: 'docs', head: 'feature/docs', base: 'main', approved: true, merged: true }] });
  });
});
