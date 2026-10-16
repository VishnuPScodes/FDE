import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getGitSnapshot, initializeGitWorkspace, mergeGitBranches, runGitCommand, writeGitFile } from '../git-runtime';

const key = (name: string) => `git-test-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function commitAll(repoKey: string, message: string): Promise<void> {
  await runGitCommand(repoKey, 'git add .');
  await runGitCommand(repoKey, `git commit -m "${message}"`);
}

describe('browser Git runtime', () => {
  it('creates commits and switches branches in a persistent virtual repository', async () => {
    const repoKey = key('branches');
    await initializeGitWorkspace(repoKey, { 'README.md': '# Notes\n' });
    await commitAll(repoKey, 'Add notes');
    await runGitCommand(repoKey, 'git switch -c feature/welcome');
    await writeGitFile(repoKey, 'README.md', '# Notes\nWelcome to the project\n');
    await commitAll(repoKey, 'Add welcome');

    const snapshot = await getGitSnapshot(repoKey);
    expect(snapshot.branch).toBe('feature/welcome');
    expect(snapshot.branches).toContain('main');
    expect(snapshot.commits).toHaveLength(2);
    expect(snapshot.files[0]?.content).toContain('Welcome to the project');
  });

  it('leaves conflict markers for the learner to resolve and then merges cleanly', async () => {
    const repoKey = key('conflict');
    await initializeGitWorkspace(repoKey, { 'app.txt': 'status: draft\n' });
    await commitAll(repoKey, 'Add draft status');
    await runGitCommand(repoKey, 'git switch -c feature/status');
    await writeGitFile(repoKey, 'app.txt', 'status: ready\n');
    await commitAll(repoKey, 'Mark status ready');
    await runGitCommand(repoKey, 'git switch main');
    await writeGitFile(repoKey, 'app.txt', 'status: reviewed\n');
    await commitAll(repoKey, 'Review status');

    await runGitCommand(repoKey, 'git merge feature/status');
    let snapshot = await getGitSnapshot(repoKey);
    expect(snapshot.conflicts).toBe(true);

    await writeGitFile(repoKey, 'app.txt', 'status: ready and reviewed\n');
    await commitAll(repoKey, 'Resolve status conflict');
    snapshot = await getGitSnapshot(repoKey);
    expect(snapshot.conflicts).toBe(false);
    expect(snapshot.files[0]?.content).toContain('status: ready and reviewed');
  });

  it('rebases a feature commit on top of main without moving main', async () => {
    const repoKey = key('rebase');
    await initializeGitWorkspace(repoKey, { 'README.md': '# Notes\n', 'metrics.txt': 'Metrics: disabled\n', 'service.txt': 'Owner: platform\n' });
    await commitAll(repoKey, 'Base notes');
    await runGitCommand(repoKey, 'git switch -c feature/metrics');
    await writeGitFile(repoKey, 'metrics.txt', 'Metrics: enabled\n');
    await commitAll(repoKey, 'Add metrics note');
    await runGitCommand(repoKey, 'git switch main');
    await writeGitFile(repoKey, 'service.txt', 'Owner: data-platform\n');
    await commitAll(repoKey, 'Document service');
    const mainHead = (await getGitSnapshot(repoKey)).commits[0]?.oid;
    await runGitCommand(repoKey, 'git switch feature/metrics');

    const output = await runGitCommand(repoKey, 'git rebase main');
    const snapshot = await getGitSnapshot(repoKey);
    expect(output).toContain('Successfully rebased');
    expect(snapshot.branch).toBe('feature/metrics');
    expect(snapshot.files.find((file) => file.path === 'metrics.txt')?.content).toContain('Metrics: enabled');
    expect(snapshot.files.find((file) => file.path === 'service.txt')?.content).toContain('Owner: data-platform');
    await runGitCommand(repoKey, 'git switch main');
    expect((await getGitSnapshot(repoKey)).commits[0]?.oid).toBe(mainHead);
  });

  it('merges a simulated pull request into its base branch', async () => {
    const repoKey = key('remote');
    await initializeGitWorkspace(repoKey, { 'README.md': '# Guide\n' });
    await commitAll(repoKey, 'Add guide');
    await runGitCommand(repoKey, 'git switch -c feature/docs');
    await writeGitFile(repoKey, 'README.md', '# Guide\nRun the app locally.\n');
    await commitAll(repoKey, 'Document local setup');
    await runGitCommand(repoKey, 'git push origin');
    const snapshot = await getGitSnapshot(repoKey);
    expect(snapshot.remoteBranches).toContain('feature/docs');
    await mergeGitBranches(repoKey, 'main', 'feature/docs');
    expect((await getGitSnapshot(repoKey)).branch).toBe('main');
  });
});
