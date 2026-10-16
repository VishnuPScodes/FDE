import { Buffer } from 'buffer';
import git from 'isomorphic-git';
import LightningFS from '@isomorphic-git/lightning-fs';

// isomorphic-git reads Buffer as a browser global. Vite does not inject Node
// globals, so install the lightweight browser implementation before Git runs.
const browserGlobals = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
browserGlobals.Buffer ??= Buffer;

export interface GitFile { path: string; content: string }
export interface GitStatusRow { path: string; head: number; workdir: number; stage: number }
export interface GitCommit { oid: string; message: string; author: string; timestamp: number }
export interface GitSnapshot {
  initialized: boolean;
  branch: string;
  branches: string[];
  remoteBranches: string[];
  status: GitStatusRow[];
  commits: GitCommit[];
  files: GitFile[];
  conflicts: boolean;
}

const repoDb = new LightningFS('fde-git-workspaces-v1');
const fs = repoDb.promises;
const root = '/repositories';
const auth = { name: 'FDE Learner', email: 'learner@fde.local' };
const showConflictMarkers = ({ branches, contents }: { branches: string[]; contents: string[] }) => ({
  cleanMerge: false,
  mergedText: `<<<<<<< ${branches[0] ?? 'HEAD'}\n${contents[0] ?? ''}=======\n${contents[1] ?? ''}>>>>>>> ${branches[1] ?? 'branch'}\n`,
});

function safeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function repoDir(key: string): string {
  return `${root}/${safeKey(key)}`;
}

async function exists(path: string): Promise<boolean> {
  try { await fs.stat(path); return true; } catch { return false; }
}

async function ensureDirectory(path: string): Promise<void> {
  let current = '';
  for (const part of path.split('/').filter(Boolean)) {
    current += `/${part}`;
    if (!await exists(current)) await fs.mkdir(current);
  }
}

async function walkFiles(path: string, prefix = ''): Promise<GitFile[]> {
  const names = await fs.readdir(path);
  const output: GitFile[] = [];
  for (const name of names) {
    if (name === '.git') continue;
    const relative = prefix ? `${prefix}/${name}` : name;
    const absolute = `${path}/${name}`;
    const stat = await fs.stat(absolute);
    if (stat.isDirectory()) output.push(...await walkFiles(absolute, relative));
    else output.push({ path: relative, content: await fs.readFile(absolute, { encoding: 'utf8' }) });
  }
  return output.sort((a, b) => a.path.localeCompare(b.path));
}

export async function initializeGitWorkspace(key: string, starterFiles: Record<string, string>, initialCommit = false): Promise<GitSnapshot> {
  await ensureDirectory(root);
  const dir = repoDir(key);
  await ensureDirectory(dir);
  if (!await exists(`${dir}/.git`)) {
    await git.init({ fs, dir, defaultBranch: 'main' });
    for (const [path, content] of Object.entries(starterFiles)) await writeGitFile(key, path, content);
    if (initialCommit && Object.keys(starterFiles).length) {
      for (const path of Object.keys(starterFiles)) await git.add({ fs, dir, filepath: path });
      await git.commit({ fs, dir, message: 'Start practice repository', author: auth, committer: auth });
    }
  }
  return getGitSnapshot(key);
}

export async function writeGitFile(key: string, path: string, content: string): Promise<void> {
  const relative = path.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!relative || relative.split('/').some((part) => part === '..' || part === '.git')) throw new Error('Invalid workspace path.');
  const destination = `${repoDir(key)}/${relative}`;
  const parent = destination.slice(0, destination.lastIndexOf('/'));
  await ensureDirectory(parent);
  await fs.writeFile(destination, content, 'utf8');
}

export async function getGitSnapshot(key: string): Promise<GitSnapshot> {
  const dir = repoDir(key);
  const initialized = await exists(`${dir}/.git`);
  if (!initialized) return { initialized: false, branch: '', branches: [], remoteBranches: [], status: [], commits: [], files: [], conflicts: false };
  const [branch, branches, remoteBranches, matrix, files] = await Promise.all([
    git.currentBranch({ fs, dir, fullname: false }).then((value) => value ?? 'main'),
    git.listBranches({ fs, dir }),
    git.listBranches({ fs, dir, remote: 'origin' }),
    git.statusMatrix({ fs, dir }),
    walkFiles(dir),
  ]);
  const status = matrix.map(([path, head, workdir, stage]) => ({ path, head, workdir, stage }));
  let commits: GitCommit[] = [];
  try {
    commits = (await git.log({ fs, dir, depth: 30 })).map(({ oid, commit }) => ({
      oid,
      message: commit.message.trim(),
      author: commit.author.name,
      timestamp: commit.author.timestamp,
    }));
  } catch { /* A newly initialized repository has no commits yet. */ }
  const conflicts = files.some(({ content }) => /^<{7} |^={7}$|^>{7} /m.test(content));
  return { initialized, branch, branches, remoteBranches, status, commits, files, conflicts };
}

export async function runGitCommand(key: string, input: string): Promise<string> {
  const dir = repoDir(key);
  const args = input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? [];
  const [program, subcommand, ...rest] = args;
  if (program !== 'git') throw new Error('This workspace supports Git commands. Try `git help`.');
  const branches = await git.listBranches({ fs, dir });
  const branch = await git.currentBranch({ fs, dir, fullname: false }).then((value) => value ?? 'main');

  if (subcommand === 'help' || !subcommand) {
    return 'Supported: init, status, diff, add, commit, log, branch, switch, checkout, merge, rebase, push, tag, stash';
  }
  if (subcommand === 'init') {
    if (!await exists(`${dir}/.git`)) await git.init({ fs, dir, defaultBranch: 'main' });
    return `Initialized empty Git repository in ${dir}/.git/`;
  }
  if (!await exists(`${dir}/.git`)) throw new Error('fatal: not a git repository. Run `git init` first.');

  if (subcommand === 'status') {
    const rows = await git.statusMatrix({ fs, dir });
    const dirty = rows.filter(([, head, workdir, stage]) => head !== workdir || workdir !== stage);
    if (!dirty.length) return `On branch ${branch}\nnothing to commit, working tree clean`;
    const lines = [`On branch ${branch}`, 'Changes:'];
    for (const [path, head, workdir, stage] of dirty) {
      const state = head === 0 && workdir === 2 ? 'untracked' : workdir === 0 ? 'deleted' : stage !== workdir ? 'staged' : 'modified';
      lines.push(`  ${state}: ${path}`);
    }
    return lines.join('\n');
  }
  if (subcommand === 'diff') {
    const rows = await git.statusMatrix({ fs, dir });
    const changed = rows.filter(([, head, workdir]) => head !== workdir);
    if (!changed.length) return 'No differences found.';
    if (rest.includes('--name-only')) return changed.map(([path]) => path).join('\n');

    let headOid: string | undefined;
    try { headOid = await git.resolveRef({ fs, dir, ref: 'HEAD' }); } catch { /* No commits yet. */ }
    const patches: string[] = [];
    for (const [path, head, workdir] of changed) {
      const before = head && headOid
        ? new TextDecoder().decode((await git.readBlob({ fs, dir, oid: headOid, filepath: path })).blob)
        : '';
      const after = workdir ? await fs.readFile(`${dir}/${path}`, { encoding: 'utf8' }) : '';
      if (before === after) continue;
      const oldLines = before ? before.replace(/\n$/, '').split('\n') : [];
      const newLines = after ? after.replace(/\n$/, '').split('\n') : [];
      patches.push([
        `diff --git a/${path} b/${path}`,
        `--- ${head ? `a/${path}` : '/dev/null'}`,
        `+++ ${workdir ? `b/${path}` : '/dev/null'}`,
        `@@ -${oldLines.length ? `1,${oldLines.length}` : '0,0'} +${newLines.length ? `1,${newLines.length}` : '0,0'} @@`,
        ...oldLines.map((line) => `-${line}`),
        ...newLines.map((line) => `+${line}`),
      ].join('\n'));
    }
    return patches.join('\n') || 'No differences found.';
  }
  if (subcommand === 'add') {
    const rows = await git.statusMatrix({ fs, dir });
    const selected = rest.includes('.') || !rest.length ? rows : rows.filter(([path]) => rest.includes(path));
    if (!selected.length) throw new Error('pathspec did not match any files');
    for (const [path, , workdir] of selected) {
      if (workdir === 0) await git.remove({ fs, dir, filepath: path });
      else await git.add({ fs, dir, filepath: path });
    }
    return `Staged ${selected.length} file${selected.length === 1 ? '' : 's'}.`;
  }
  if (subcommand === 'commit') {
    const messageIndex = rest.indexOf('-m');
    const message = messageIndex >= 0 ? rest.slice(messageIndex + 1).join(' ') : '';
    if (!message) throw new Error('Please provide a commit message with `git commit -m "message"`.');
    const oid = await git.commit({ fs, dir, message, author: auth, committer: auth });
    return `[${branch} ${oid.slice(0, 7)}] ${message}`;
  }
  if (subcommand === 'log') {
    const entries = await git.log({ fs, dir, depth: 20 });
    return entries.map(({ oid, commit }) => `${oid.slice(0, 7)} ${commit.message.trim().split('\n')[0]}`).join('\n') || 'No commits yet.';
  }
  if (subcommand === 'branch') {
    if (!rest.length || rest[0] === '-a') return branches.map((name) => `${name === branch ? '* ' : '  '}${name}`).join('\n') || '* main';
    if (rest[0] === '-d' && rest[1]) {
      await git.deleteBranch({ fs, dir, ref: rest[1] });
      return `Deleted branch ${rest[1]}.`;
    }
    await git.branch({ fs, dir, ref: rest[0] });
    return `Created branch ${rest[0]}.`;
  }
  if (subcommand === 'switch' || subcommand === 'checkout') {
    const create = rest[0] === '-c' || rest[0] === '-b';
    const target = create ? rest[1] : rest[0];
    if (!target) throw new Error('Specify a branch name.');
    if (create) await git.branch({ fs, dir, ref: target, checkout: true });
    else await git.checkout({ fs, dir, ref: target });
    return `${create ? 'Switched to a new branch' : 'Switched to branch'} '${target}'.`;
  }
  if (subcommand === 'merge') {
    const target = rest[0];
    if (!target) throw new Error('Specify a branch to merge.');
    let result;
    try {
      result = await git.merge({ fs, dir, ours: branch, theirs: target, abortOnConflict: false, mergeDriver: showConflictMarkers, author: auth, committer: auth, message: `Merge branch '${target}'` });
    } catch (error) {
      if (!(await getGitSnapshot(key)).conflicts) throw error;
      return 'CONFLICT: merge conflict in one or more files. Resolve the markers in the editor, then stage and commit.';
    }
    const snapshot = await getGitSnapshot(key);
    if (snapshot.conflicts) return `CONFLICT: merge conflict in one or more files. Resolve the markers in the editor, then stage and commit.`;
    return result.fastForward ? `Fast-forward merged '${target}' into ${branch}.` : `Merged '${target}' into ${branch}.`;
  }
  if (subcommand === 'rebase') return await rebaseBranch(dir, branch, rest[0]);
  if (subcommand === 'push') {
    const oid = await git.resolveRef({ fs, dir, ref: `refs/heads/${branch}` });
    await git.writeRef({ fs, dir, ref: `refs/remotes/origin/${branch}`, value: oid, force: true });
    return `Simulated push: origin/${branch} now points to ${oid.slice(0, 7)}. No network request was made.`;
  }
  if (subcommand === 'tag') {
    const name = rest[0];
    if (!name) throw new Error('Specify a tag name.');
    await git.tag({ fs, dir, ref: name });
    return `Created tag '${name}'.`;
  }
  if (subcommand === 'stash') {
    const op = rest[0] === 'pop' ? 'pop' : rest[0] === 'list' ? 'list' : 'push';
    const result = await git.stash({ fs, dir, op, message: rest.slice(1).join(' ') });
    return op === 'list' ? (typeof result === 'string' ? result : 'No stash entries.') : `Stash ${op} complete.`;
  }
  throw new Error(`git: '${subcommand}' is not supported in this practice workspace.`);
}

async function rebaseBranch(dir: string, current: string, target?: string): Promise<string> {
  if (!target) throw new Error('Specify a base branch, for example `git rebase main`.');
  const [currentOid, targetOid] = await Promise.all([
    git.resolveRef({ fs, dir, ref: `refs/heads/${current}` }),
    git.resolveRef({ fs, dir, ref: `refs/heads/${target}` }),
  ]);
  const base = await git.findMergeBase({ fs, dir, oids: [currentOid, targetOid] });
  if (!base.length) throw new Error('Cannot rebase branches without a shared commit.');
  const baseOid = base[0]!;
  const commits = await git.log({ fs, dir, ref: current, depth: 30 });
  const replay: typeof commits = [];
  for (const commit of commits) {
    if (commit.oid === baseOid) break;
    replay.push(commit);
  }
  replay.reverse();
  const temporaryBranch = `fde-rebase-${Date.now()}`;
  await git.branch({ fs, dir, ref: temporaryBranch, object: targetOid });
  await git.checkout({ fs, dir, ref: temporaryBranch });
  for (const commit of replay) {
    await git.cherryPick({ fs, dir, oid: commit.oid, abortOnConflict: false, committer: auth });
  }
  const newHead = await git.resolveRef({ fs, dir, ref: `refs/heads/${temporaryBranch}` });
  await git.writeRef({ fs, dir, ref: `refs/heads/${current}`, value: newHead, force: true });
  await git.checkout({ fs, dir, ref: current });
  await git.deleteBranch({ fs, dir, ref: temporaryBranch });
  return `Successfully rebased ${current} onto ${target}.`;
}

export async function mergeGitBranches(key: string, target: string, source: string): Promise<string> {
  const dir = repoDir(key);
  await git.checkout({ fs, dir, ref: target });
  const result = await git.merge({ fs, dir, ours: target, theirs: source, abortOnConflict: false, mergeDriver: showConflictMarkers, author: auth, committer: auth, message: `Merge branch '${source}'` });
  if ((await getGitSnapshot(key)).conflicts) throw new Error('Cannot merge this pull request until conflicts are resolved.');
  return result.oid ?? await git.resolveRef({ fs, dir, ref: `refs/heads/${target}` });
}
