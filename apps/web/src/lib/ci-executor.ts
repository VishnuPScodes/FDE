import { createDockerState, runDockerCommand, type DockerState } from './docker-runtime';
import { ExpressionError, evaluateExpression, interpolate, toText, truthy, usesStatusFunction, type ExprContext, type ExprValue } from './ci-expressions';
import { runFlake8, runPytest, runPythonScript, runRuff, type ToolResult } from './ci-python';
import { globToRegExp, type Workflow, type WorkflowJob, type WorkflowStep } from './ci-workflow';
import type { CiConclusion, CiJobRecord, CiRunRecord, CiState, CiStepRecord } from './ci-types';
import { plainString } from './plain-string';

/** Executes one job instance of a workflow run against the simulated runner. */

export interface NeedResult { result: CiConclusion; outputs: Record<string, string> }

interface PostStep { name: string; run: () => string[] }

interface JobRuntime {
  state: CiState;
  run: CiRunRecord;
  workflow: Workflow;
  job: WorkflowJob;
  record: CiJobRecord;
  tree: Record<string, string>;
  files: Record<string, string> | null;
  installed: Set<string>;
  python: string;
  node: string;
  docker: DockerState;
  env: Record<string, string>;
  masks: string[];
  post: PostStep[];
  steps: Record<string, { outputs: Record<string, string>; outcome: string; conclusion: string }>;
  pipCached: boolean;
  npmCached: boolean;
  failed: boolean;
  context: ExprContext;
  workspace: string;
}

const KNOWN_ACTIONS: Record<string, string[]> = {
  'actions/checkout': ['v3', 'v4'],
  'actions/setup-python': ['v4', 'v5'],
  'actions/setup-node': ['v3', 'v4'],
  'actions/cache': ['v3', 'v4'],
  'actions/upload-artifact': ['v3', 'v4'],
  'actions/download-artifact': ['v3', 'v4'],
  'docker/login-action': ['v2', 'v3'],
  'docker/setup-buildx-action': ['v2', 'v3'],
  'docker/setup-qemu-action': ['v2', 'v3'],
  'docker/build-push-action': ['v5', 'v6'],
};

const ACTION_INPUTS: Record<string, string[]> = {
  'actions/checkout': ['repository', 'ref', 'token', 'fetch-depth', 'path', 'clean', 'submodules', 'lfs', 'persist-credentials', 'sparse-checkout', 'fetch-tags'],
  'actions/setup-python': ['python-version', 'python-version-file', 'cache', 'architecture', 'check-latest', 'token', 'cache-dependency-path', 'update-environment', 'allow-prereleases'],
  'actions/setup-node': ['node-version', 'node-version-file', 'cache', 'cache-dependency-path', 'registry-url', 'always-auth', 'check-latest', 'architecture', 'token', 'scope'],
  'actions/cache': ['path', 'key', 'restore-keys', 'upload-chunk-size', 'enableCrossOsArchive', 'fail-on-cache-miss', 'lookup-only', 'save-always'],
  'docker/login-action': ['registry', 'username', 'password', 'ecr', 'logout'],
  'docker/build-push-action': ['context', 'file', 'tags', 'push', 'load', 'platforms', 'build-args', 'labels', 'cache-from', 'cache-to', 'target', 'provenance', 'secrets'],
};

const PYTHON_VERSIONS: Record<string, string> = { '3.9': '3.9.20', '3.10': '3.10.15', '3.11': '3.11.10', '3.12': '3.12.7', '3.13': '3.13.0', '3.x': '3.13.0' };
const NODE_VERSIONS: Record<string, string> = { '18': '18.20.5', '20': '20.18.1', '22': '22.11.0', 'lts/*': '22.11.0' };
const RUNNERS: Record<string, string> = { 'ubuntu-latest': 'ubuntu-24.04', 'ubuntu-24.04': 'ubuntu-24.04', 'ubuntu-22.04': 'ubuntu-22.04', 'windows-latest': 'windows-2022', 'macos-latest': 'macos-14' };

export function shortHash(text: string, length = 64): string {
  let out = '';
  let seed = 0x811c9dc5;
  while (out.length < length) {
    for (let i = 0; i < text.length; i++) { seed ^= text.charCodeAt(i); seed = Math.imul(seed, 0x01000193) >>> 0; }
    seed ^= out.length + 1;
    seed = Math.imul(seed, 0x01000193) >>> 0;
    out += seed.toString(16).padStart(8, '0');
  }
  return out.slice(0, length);
}

export function workspacePath(repo: string): string {
  const name = repo.split('/').at(-1) ?? 'repo';
  return `/home/runner/work/${name}/${name}`;
}

/** Builds the `github` context for a run. */
export function githubContext(state: CiState, run: CiRunRecord): Record<string, ExprValue> {
  const pr = run.prNumber ? state.pullRequests.find((item) => item.number === run.prNumber) : undefined;
  return {
    event_name: run.event,
    ref: run.ref,
    ref_name: pr ? `${pr.number}/merge` : run.branch,
    ref_type: run.ref.startsWith('refs/tags/') ? 'tag' : 'branch',
    sha: run.sha,
    repository: state.repo,
    repository_owner: state.repo.split('/')[0] ?? '',
    actor: state.actor,
    triggering_actor: state.actor,
    run_id: String(run.id),
    run_number: String(run.number),
    run_attempt: String(run.attempt),
    workflow: run.workflowName,
    head_ref: pr?.head ?? '',
    base_ref: pr?.base ?? '',
    server_url: 'https://github.com',
    workspace: workspacePath(state.repo),
    token: state.secrets.GITHUB_TOKEN ?? '',
    event: {
      inputs: run.inputs,
      ...(pr ? { pull_request: { number: pr.number, title: pr.title, head: { ref: pr.head, sha: pr.headSha }, base: { ref: pr.base } } } : {}),
    },
  };
}

function githubToken(run: CiRunRecord): string {
  return 'ghs_' + shortHash(`token${run.id}:${run.attempt}`, 36);
}

export function executeJob(
  state: CiState, run: CiRunRecord, workflow: Workflow, job: WorkflowJob, record: CiJobRecord,
  tree: Record<string, string>, needs: Record<string, NeedResult>,
): void {
  const environment = record.environment ? state.environments[record.environment] : undefined;
  const secrets: Record<string, ExprValue> = { ...state.secrets, ...(environment?.secrets ?? {}), GITHUB_TOKEN: githubToken(run) };
  const docker = createDockerState(tree);
  docker.registry = [...state.registry];
  const rt: JobRuntime = {
    state, run, workflow, job, record, tree,
    files: null,
    installed: new Set(),
    python: '3.12.3',
    node: '20.18.1',
    docker,
    env: {},
    masks: Object.values(secrets).map((value) => toText(value)).filter((value) => value.length > 0),
    post: [],
    steps: {},
    pipCached: false,
    npmCached: false,
    failed: false,
    workspace: workspacePath(state.repo),
    context: { contexts: {} },
  };
  const github = githubContext(state, run);
  rt.context = {
    contexts: {
      github, secrets, vars: { ...state.vars }, inputs: { ...run.inputs },
      matrix: record.matrix ?? {}, needs: needs as unknown as Record<string, ExprValue>,
      env: {}, steps: {}, job: { status: 'success' }, runner: { os: 'Linux', arch: 'X64', temp: '/home/runner/work/_temp', name: 'GitHub Actions 2' },
      strategy: { 'fail-fast': true, 'job-index': 0, 'job-total': 1 },
    },
    hashFiles: (patterns) => hashFiles(rt.files ?? {}, patterns),
  };
  const log: CiStepRecord[] = [];
  // Workflow and job env are evaluated before steps run.
  try {
    for (const [key, value] of Object.entries({ ...workflow.env, ...job.env })) {
      rt.env[key] = interpolate(value, contextWithEnv(rt));
    }
  } catch (error) {
    rt.failed = true;
    record.annotations.push(errorText(error));
  }

  const setup: string[] = [
    "Current runner version: '2.321.0'",
    'Operating System', '  Ubuntu', '  24.04.1', '  LTS',
    'Runner Image', `  Image: ${RUNNERS[job.runsOn] ?? job.runsOn}`, '  Version: 20241110.1.0',
    'GITHUB_TOKEN Permissions', '  Contents: read', '  Metadata: read', '  Packages: write',
    'Secret source: Actions', 'Prepare workflow directory', 'Prepare all required actions', 'Getting action download info',
  ];
  if (!RUNNERS[job.runsOn] && !job.runsOn.includes('self-hosted')) {
    setup.push(`##[error]No runner matching the specified labels was found: ${job.runsOn}`);
    rt.failed = true;
    record.annotations.push(`No runner matching the specified labels was found: ${job.runsOn}. Use a GitHub-hosted label such as ubuntu-latest.`);
  }
  for (const step of job.steps) {
    if (!step.uses || rt.failed) continue;
    const [action = '', version = ''] = step.uses.split('@');
    const versions = KNOWN_ACTIONS[action];
    if (!versions) {
      setup.push(`##[error]Unable to resolve action \`${step.uses}\`, repository not found`);
      record.annotations.push(`Unable to resolve action \`${step.uses}\`, repository not found`);
      rt.failed = true;
    } else if (!versions.includes(version)) {
      setup.push(`##[error]Unable to resolve action \`${step.uses}\`, unable to find version \`${version}\``);
      record.annotations.push(`Unable to resolve action \`${step.uses}\`, unable to find version \`${version}\``);
      rt.failed = true;
    } else setup.push(`Download action repository '${step.uses}' (SHA:${shortHash(step.uses, 40)})`);
  }
  setup.push(`Complete job name: ${record.name}`);
  log.push({ name: 'Set up job', conclusion: rt.failed ? 'failure' : 'success', log: setup, seconds: 2 });

  if (!rt.failed) {
    job.steps.forEach((step, index) => log.push(runStep(rt, step, index)));
    for (const post of [...rt.post].reverse()) {
      if (hasFailed(rt)) break;
      log.push({ name: post.name, conclusion: 'success', log: post.run(), seconds: 1 });
    }
  }
  log.push({ name: 'Complete job', conclusion: 'success', log: ['Cleaning up orphan processes'], seconds: 0 });

  // Job outputs are evaluated after the steps.
  try {
    for (const [key, value] of Object.entries(job.outputs)) record.outputs[key] = interpolate(value, contextWithEnv(rt));
  } catch { /* outputs are best-effort */ }

  for (const item of log) item.log = item.log.map((line) => mask(line, rt.masks));
  record.steps = log;
  record.seconds = log.reduce((sum, item) => sum + item.seconds, 0);
  record.status = 'completed';
  record.conclusion = rt.failed ? 'failure' : 'success';
  for (const tag of rt.docker.registry) if (!state.registry.includes(tag)) state.registry.push(tag);
}

function contextWithEnv(rt: JobRuntime, extraEnv: Record<string, string> = {}): ExprContext {
  return {
    ...rt.context,
    contexts: { ...rt.context.contexts, env: { ...rt.env, ...extraEnv }, steps: rt.steps, job: { status: rt.failed ? 'failure' : 'success' } },
    status: { success: !rt.failed, failure: rt.failed, cancelled: false },
  };
}

function errorText(error: unknown): string {
  if (error instanceof ExpressionError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export function mask(line: string, masks: string[]): string {
  let out = line;
  for (const value of masks) if (value.length >= 3) out = out.split(value).join('***');
  return out;
}

function hashFiles(files: Record<string, string>, patterns: string[]): string {
  const regexes = patterns.map((pattern) => globToRegExp(pattern.replace(/^\.\//, '')));
  const matched = Object.keys(files).sort().filter((path) => regexes.some((regex) => regex.test(path) || regex.test('/' + path)));
  if (!matched.length) return '';
  return shortHash(matched.map((path) => `${path}\n${files[path]}`).join('\n'));
}

function stepDisplayName(rt: JobRuntime, step: WorkflowStep): string {
  if (step.name) {
    try { return interpolate(step.name, contextWithEnv(rt)); } catch { return step.name; }
  }
  if (step.uses) return `Run ${step.uses}`;
  return `Run ${(step.run ?? '').split('\n').find((line) => line.trim())?.trim() ?? ''}`;
}

function runStep(rt: JobRuntime, step: WorkflowStep, index: number): CiStepRecord {
  const name = stepDisplayName(rt, step);
  const id = step.id ?? `__step${index}`;
  let shouldRun = !rt.failed;
  if (step.if !== undefined) {
    try {
      const condition = step.if.replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, '$1');
      const value = evaluateExpression(condition, contextWithEnv(rt));
      shouldRun = usesStatusFunction(condition) ? truthy(value) : !rt.failed && truthy(value);
    } catch (error) {
      rt.failed = true;
      rt.record.annotations.push(errorText(error));
      return { name, conclusion: 'failure', log: [`##[error]${errorText(error)}`], seconds: 0 };
    }
  }
  if (!shouldRun) {
    rt.steps[id] = { outputs: {}, outcome: 'skipped', conclusion: 'skipped' };
    return { name, conclusion: 'skipped', log: [], seconds: 0 };
  }
  let stepEnv: Record<string, string> = {};
  let withInputs: Record<string, string> = {};
  try {
    for (const [key, value] of Object.entries(step.env)) stepEnv[key] = interpolate(value, contextWithEnv(rt, stepEnv));
    withInputs = Object.fromEntries(Object.entries(step.with).map(([key, value]) => [key, interpolate(value, contextWithEnv(rt, stepEnv))]));
  } catch (error) {
    rt.failed = true;
    rt.record.annotations.push(errorText(error));
    return { name, conclusion: 'failure', log: [`##[error]${errorText(error)}`], seconds: 0 };
  }
  let result: { lines: string[]; code: number; seconds: number; outputs?: Record<string, string> };
  const header: string[] = [];
  if (step.uses) {
    header.push(`##[group]Run ${step.uses}`);
    if (Object.keys(withInputs).length) header.push('with:', ...Object.entries(withInputs).map(([key, value]) => `  ${key}: ${value}`));
    if (Object.keys(stepEnv).length) header.push('env:', ...Object.entries(stepEnv).map(([key, value]) => `  ${key}: ${value}`));
    header.push('##[endgroup]');
    result = runAction(rt, step.uses, withInputs);
  } else {
    detectLeaks(rt, step, name);
    let script = '';
    try { script = interpolate(step.run ?? '', contextWithEnv(rt, stepEnv)); } catch (error) {
      rt.failed = true;
      rt.record.annotations.push(errorText(error));
      return { name, conclusion: 'failure', log: [`##[error]${errorText(error)}`], seconds: 0 };
    }
    const scriptLines = script.replace(/\n$/, '').split('\n');
    header.push(`##[group]Run ${scriptLines[0] ?? ''}`, ...scriptLines.slice(1), 'shell: /usr/bin/bash -e {0}');
    const visibleEnv = { ...rt.env, ...stepEnv };
    if (Object.keys(visibleEnv).length) header.push('env:', ...Object.entries(visibleEnv).map(([key, value]) => `  ${key}: ${value}`));
    header.push('##[endgroup]');
    result = runScript(rt, script, { ...rt.env, ...stepEnv });
  }
  const failed = result.code !== 0;
  const lines = [...header, ...result.lines];
  if (failed) {
    const message = step.run ? `Process completed with exit code ${result.code}.` : (result.lines.find((line) => line.startsWith('##[error]'))?.slice(9) ?? 'Action failed.');
    if (step.run) lines.push(`##[error]${message}`);
    if (!step.continueOnError) {
      rt.failed = true;
      rt.record.annotations.push(message);
    }
  }
  rt.steps[id] = { outputs: result.outputs ?? {}, outcome: failed ? 'failure' : 'success', conclusion: failed && !step.continueOnError ? 'failure' : 'success' };
  return { name, conclusion: failed && !step.continueOnError ? 'failure' : 'success', log: lines, seconds: result.seconds };
}

/** Records steps that print secrets. GitHub masks them, but printing secrets is still a leak risk. */
function detectLeaks(rt: JobRuntime, step: WorkflowStep, stepName: string): void {
  const secretEnv = new Set<string>();
  for (const scope of [rt.workflow.env, rt.job.env, step.env]) {
    for (const [key, value] of Object.entries(scope)) if (/secrets\./i.test(value)) secretEnv.add(key);
  }
  for (const line of (step.run ?? '').split('\n')) {
    if (!/^\s*(echo|printf)\b/.test(line) || line.includes('|') || line.includes('>')) continue;
    const names = new Set<string>();
    for (const match of line.matchAll(/\$\{\{\s*secrets\.(\w+)\s*\}\}/gi)) names.add(match[1]!);
    for (const match of line.matchAll(/\$\{?(\w+)\}?/g)) if (secretEnv.has(match[1]!)) names.add(match[1]!);
    for (const secret of names) {
      const message = `${rt.workflow.file}: job '${rt.record.name}' step '${stepName}' prints secret ${secret}`;
      if (!rt.run.leaks.includes(message)) rt.run.leaks.push(message);
    }
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

/** Reads `failed` through a function so control-flow narrowing does not assume it is unchanged after steps run. */
function hasFailed(rt: JobRuntime): boolean {
  return rt.failed;
}

function runAction(rt: JobRuntime, uses: string, inputs: Record<string, string>): { lines: string[]; code: number; seconds: number } {
  const action = uses.split('@')[0]!;
  const lines: string[] = [];
  const valid = ACTION_INPUTS[action];
  if (valid) {
    const unexpected = Object.keys(inputs).filter((key) => !valid.includes(key));
    if (unexpected.length) lines.push(`##[warning]Unexpected input(s) '${unexpected.join("', '")}', valid inputs are ['${valid.join("', '")}']`);
  }
  const fail = (message: string, seconds = 1) => ({ lines: [...lines, `##[error]${message}`], code: 1, seconds });
  switch (action) {
    case 'actions/checkout': {
      rt.files = { ...rt.tree };
      lines.push(`Syncing repository: ${rt.state.repo}`, 'Getting Git version info', `Deleting the contents of '${rt.workspace}'`, 'Initializing the repository',
        'Fetching the repository', 'Determining the checkout info', 'Checking out the ref', `/usr/bin/git log -1 --format=%H`, rt.run.sha);
      return { lines, code: 0, seconds: 1 };
    }
    case 'actions/setup-python': {
      const requested = inputs['python-version'] ?? '';
      if (!requested) {
        lines.push("##[warning]Neither 'python-version' nor 'python-version-file' inputs were supplied. Attempting to find '.python-version' file.",
          "##[warning].python-version doesn't exist.", 'The `python-version` input is not set.  The version of Python currently in `PATH` will be used.');
        rt.python = '3.12.3';
      } else {
        const full = PYTHON_VERSIONS[requested] ?? Object.values(PYTHON_VERSIONS).find((version) => version === requested);
        if (!full) {
          return fail(`The version '${requested}' with architecture 'x64' was not found for Ubuntu 24.04.\nThe list of all available versions can be found here: https://raw.githubusercontent.com/actions/python-versions/main/versions-manifest.json`);
        }
        rt.python = full;
        lines.push('Installed versions', `Successfully set up CPython (${full})`);
      }
      if (inputs.cache === 'pip') {
        const files = rt.files ?? {};
        const deps = hashFiles(files, ['**/requirements*.txt', 'requirements*.txt', '**/pyproject.toml', 'pyproject.toml']);
        if (!deps) return fail(`No file in ${rt.workspace} matched to [**/requirements.txt or **/pyproject.toml], make sure you have checked out the target repository`);
        const key = `setup-python-Linux-x64-24.04-Ubuntu-python-${rt.python}-pip-${deps}`;
        if (rt.state.caches[key]) {
          rt.pipCached = true;
          lines.push(`Cache restored from key: ${key}`, 'pip cache is restored');
        } else {
          lines.push('pip cache is not found');
          rt.post.push({ name: `Post Run ${uses}`, run: () => { rt.state.caches[key] = '~/.cache/pip'; return ['Post job cleanup.', `Cache saved with key: ${key}`]; } });
        }
      }
      return { lines, code: 0, seconds: rt.pipCached ? 1 : 3 };
    }
    case 'actions/setup-node': {
      const requested = inputs['node-version'] ?? '';
      const full = requested ? NODE_VERSIONS[requested.replace(/\.x$/, '')] : '20.18.1';
      if (!full) return fail(`Unable to find Node version '${requested}' for platform linux and architecture x64.`);
      rt.node = full;
      lines.push(`Attempting to download ${requested || '20'}...`, `Found in cache @ /opt/hostedtoolcache/node/${full}/x64`, `Environment details`, `  node: v${full}`, '  npm: 10.8.2');
      if (inputs.cache === 'npm') {
        const files = rt.files ?? {};
        const deps = hashFiles(files, ['**/package-lock.json', 'package-lock.json']);
        if (!deps) return fail('Dependencies lock file is not found in ' + rt.workspace + '. Supported file patterns: package-lock.json,npm-shrinkwrap.json,yarn.lock');
        const key = `node-cache-Linux-x64-npm-${deps}`;
        if (rt.state.caches[key]) { rt.npmCached = true; lines.push(`Cache restored from key: ${key}`); }
        else {
          lines.push('npm cache is not found');
          rt.post.push({ name: `Post Run ${uses}`, run: () => { rt.state.caches[key] = '~/.npm'; return [`Cache saved with key: ${key}`]; } });
        }
      }
      return { lines, code: 0, seconds: 2 };
    }
    case 'actions/cache': {
      const path = inputs.path ?? '';
      const key = inputs.key ?? '';
      if (!path) return fail('Input required and not supplied: path');
      if (!key) return fail('Input required and not supplied: key');
      const restoreKeys = (inputs['restore-keys'] ?? '').split('\n').map((item) => item.trim()).filter(Boolean);
      const caches = rt.state.caches;
      let hit: string | undefined = caches[key] !== undefined ? key : undefined;
      if (!hit) for (const prefix of restoreKeys) { hit = Object.keys(caches).reverse().find((item) => item.startsWith(prefix)); if (hit) break; }
      const exact = hit === key;
      if (hit) {
        lines.push(`Received ${path.includes('pip') ? 48234496 : 25165824} of ${path.includes('pip') ? 48234496 : 25165824} (100.0%), 46.0 MBs/sec`, `Cache restored from key: ${hit}`);
        if (path.includes('pip')) rt.pipCached = true;
        if (/npm|node_modules/.test(path)) rt.npmCached = true;
      } else lines.push(`Cache not found for input keys: ${[key, ...restoreKeys].join(', ')}`);
      rt.post.push({
        name: `Post Run ${uses}`,
        run: () => {
          if (exact) return ['Post job cleanup.', `Cache hit occurred on the primary key ${key}, not saving cache.`];
          rt.state.caches[key] = path;
          return ['Post job cleanup.', `Cache saved with key: ${key}`];
        },
      });
      return { lines, code: 0, seconds: hit ? 2 : 1 };
    }
    case 'actions/upload-artifact': {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty input value is treated as not supplied
      const name = inputs.name || 'artifact';
      if (!inputs.path) return fail('Input required and not supplied: path');
      lines.push(`With the provided path, there will be 1 file uploaded`, `Artifact ${name} has been successfully uploaded! Final size is 2048 bytes.`);
      return { lines, code: 0, seconds: 2 };
    }
    case 'actions/download-artifact':
      lines.push(`Downloading single artifact`, `Artifact download completed successfully.`);
      return { lines, code: 0, seconds: 1 };
    case 'docker/setup-buildx-action':
    case 'docker/setup-qemu-action':
      lines.push('Docker info', 'Creating a new builder instance', 'Booting builder', 'Inspecting builder', 'Name: builder-' + shortHash(rt.run.sha, 8));
      return { lines, code: 0, seconds: 4 };
    case 'docker/login-action': {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty input value is treated as not supplied
      const registry = inputs.registry || 'docker.io';
      if (!inputs.username || !inputs.password) return fail('Username and password required');
      rt.docker.loggedIn = true;
      rt.masks.push(inputs.password);
      lines.push(`Logging into ${registry}...`, 'Login Succeeded!');
      return { lines, code: 0, seconds: 1 };
    }
    case 'docker/build-push-action': {
      const tags = (inputs.tags ?? '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
      const push = inputs.push === 'true';
      const bad = tags.find((tag) => tag !== tag.toLowerCase() || tag.endsWith(":") || /\s/.test(tag));
      if (bad) return fail(`buildx failed with: ERROR: invalid tag "${bad}": repository name must be lowercase`, 3);
      rt.docker.files = { ...(rt.files ?? rt.tree) };
      const first = tags[0] ?? 'moby-dangling:latest';
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty input value is treated as not supplied
      const built = runDockerCommand(rt.docker, `docker build -t ${first} ${inputs.context || '.'}`);
      rt.docker = built.state;
      if (built.exitCode !== 0) return fail(`buildx failed with: ERROR: failed to solve: ${built.stderr.trim()}`, 6);
      const image = rt.docker.images.find((item) => item.tag === first);
      image?.layers.forEach((layer, index) => lines.push(`#${index + 4} [${index + 1}/${image.layers.length}] ${layer}`, `#${index + 4} DONE 0.${index + 2}s`));
      lines.push(`#${(image?.layers.length ?? 0) + 4} exporting to image`);
      for (const tag of tags.slice(1)) rt.docker = runDockerCommand(rt.docker, `docker tag ${first} ${tag}`).state;
      for (const tag of tags) lines.push(`#${(image?.layers.length ?? 0) + 4} naming to ${tag} done`);
      if (push) {
        if (!rt.docker.loggedIn) return fail(`buildx failed with: ERROR: failed to push ${first}: unexpected status from POST request to https://${first.split('/')[0]}/v2/: 401 Unauthorized`, 9);
        for (const tag of tags) {
          const pushed = runDockerCommand(rt.docker, `docker push ${tag}`);
          rt.docker = pushed.state;
          if (pushed.exitCode !== 0) return fail(`buildx failed with: ERROR: failed to push ${tag}: ${pushed.stderr.trim()}`, 9);
          lines.push(`#${(image?.layers.length ?? 0) + 4} pushing ${tag} with docker done`);
        }
      }
      lines.push(`ImageID`, `sha256:${shortHash(first + rt.run.sha)}`);
      return { lines, code: 0, seconds: push ? 46 : 38 };
    }
    default:
      return fail(`Unable to resolve action \`${uses}\`, repository not found`);
  }
}

// ─── Shell ──────────────────────────────────────────────────────────────────

interface ShellResult { lines: string[]; code: number; seconds: number; outputs: Record<string, string> }

function runScript(rt: JobRuntime, script: string, env: Record<string, string>): ShellResult {
  const shellEnv: Record<string, string> = {
    GITHUB_SHA: rt.run.sha, GITHUB_REF: rt.run.ref, GITHUB_REF_NAME: plainString(rt.context.contexts.github && (rt.context.contexts.github as Record<string, ExprValue>).ref_name),
    GITHUB_REPOSITORY: rt.state.repo, GITHUB_ACTOR: rt.state.actor, GITHUB_RUN_ID: String(rt.run.id), GITHUB_RUN_NUMBER: String(rt.run.number),
    GITHUB_EVENT_NAME: rt.run.event, GITHUB_WORKSPACE: rt.workspace, GITHUB_OUTPUT: '/home/runner/work/_temp/_runner_file_commands/set_output',
    GITHUB_ENV: '/home/runner/work/_temp/_runner_file_commands/set_env', GITHUB_STEP_SUMMARY: '/home/runner/work/_temp/_runner_file_commands/step_summary',
    HOME: '/home/runner', RUNNER_OS: 'Linux', CI: 'true', ...env,
  };
  const out: ShellResult = { lines: [], code: 0, seconds: 0, outputs: {} };
  const logical = script.replace(/\\\r?\n\s*/g, ' ').split(/\r?\n/);
  for (let index = 0; index < logical.length; index++) {
    const line = logical[index]!.trim();
    if (!line || line.startsWith('#')) continue;
    const code = runLine(rt, line, shellEnv, out, index + 1);
    if (code !== 0) { out.code = code; return out; }
    if (out.code === -1) { out.code = 0; return out; }
  }
  return out;
}

function splitOutsideQuotes(line: string, separators: string[]): { parts: string[]; ops: string[] } {
  const parts: string[] = [];
  const ops: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quote) { if (char === quote) quote = null; current += char; continue; }
    if (char === '"' || char === "'") { quote = char; current += char; continue; }
    const sep = separators.find((item) => line.startsWith(item, i));
    if (sep && !(sep === '|' && line[i + 1] === '|') && !(sep === '|' && line[i - 1] === '|')) {
      parts.push(current); ops.push(sep); current = ''; i += sep.length - 1; continue;
    }
    current += char;
  }
  parts.push(current);
  return { parts, ops };
}

function runLine(rt: JobRuntime, line: string, env: Record<string, string>, out: ShellResult, lineNumber: number): number {
  const { parts, ops } = splitOutsideQuotes(line, ['&&', '||', ';']);
  let code = 0;
  for (let i = 0; i < parts.length; i++) {
    const op = ops[i - 1];
    if (op === '&&' && code !== 0) continue;
    if (op === '||' && code === 0) continue;
    code = runPipeline(rt, parts[i]!.trim(), env, out, lineNumber);
    if (out.code === -1) return 0;
  }
  return code;
}

function runPipeline(rt: JobRuntime, text: string, env: Record<string, string>, out: ShellResult, lineNumber: number): number {
  if (!text) return 0;
  const { parts } = splitOutsideQuotes(text, ['|']);
  let stdin = '';
  let code = 0;
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    let segment = parts[i]!.trim();
    let redirect: { append: boolean; target: string } | null = null;
    const redirectMatch = /\s(>>?)\s*("[^"]*"|'[^']*'|\S+)\s*$/.exec(' ' + segment);
    if (redirectMatch) {
      redirect = { append: redirectMatch[1] === '>>', target: expand(redirectMatch[2]!.replace(/^["']|["']$/g, ''), env, rt) };
      segment = (' ' + segment).slice(0, redirectMatch.index).trim();
    }
    const assignment = /^([A-Za-z_]\w*)=(.*)$/.exec(segment);
    if (assignment && !segment.includes(' ')) { env[assignment[1]!] = unquote(expand(assignment[2]!, env, rt)); code = 0; continue; }
    const argv = tokenize(expand(segment, env, rt));
    const result = execCommand(rt, argv, stdin, env, lineNumber);
    out.seconds += result.seconds;
    code = result.code;
    const produced = result.lines;
    if (redirect) {
      const content = produced.join('\n');
      if (redirect.target === env.GITHUB_OUTPUT) {
        for (const pair of content.split('\n')) { const eq = pair.indexOf('='); if (eq > 0) out.outputs[pair.slice(0, eq)] = pair.slice(eq + 1); }
      } else if (redirect.target === env.GITHUB_ENV) {
        for (const pair of content.split('\n')) { const eq = pair.indexOf('='); if (eq > 0) rt.env[pair.slice(0, eq)] = pair.slice(eq + 1); }
      } else if (redirect.target !== env.GITHUB_STEP_SUMMARY && redirect.target !== '/dev/null' && rt.files) {
        const path = redirect.target.replace(rt.workspace + '/', '').replace(/^\.\//, '');
        rt.files[path] = (redirect.append ? rt.files[path] ?? '' : '') + content + '\n';
      }
      stdin = '';
    } else if (last) out.lines.push(...produced);
    else stdin = produced.join('\n');
    if (result.exit) { out.code = code === 0 ? -1 : code; return code; }
  }
  return code;
}

function unquote(value: string): string { return value.replace(/^["']|["']$/g, ''); }

/** Expands $VAR, ${VAR}, ${VAR#prefix}, ${VAR%suffix}, ${VAR:-default} and $(cat file), except inside single quotes. */
function expand(text: string, env: Record<string, string>, rt: JobRuntime): string {
  let out = '';
  let single = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === "'" ) { single = !single; out += char; continue; }
    if (single || char !== '$') { out += char; continue; }
    const rest = text.slice(i + 1);
    const command = /^\(([^)]*)\)/.exec(rest);
    if (command) {
      const argv = tokenize(expand(command[1]!, env, rt));
      out += execCommand(rt, argv, '', env, 0).lines.join('\n');
      i += command[0].length;
      continue;
    }
    const braced = /^\{(\w+)(?:(##?|%%?|:-)([^}]*))?\}/.exec(rest);
    if (braced) {
      let value = env[braced[1]!] ?? '';
      const op = braced[2];
      const arg = braced[3] ?? '';
      if (op === ':-') value = value || arg;
      else if (op) {
        const pattern = arg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, op.length === 2 ? '.*' : '.*?');
        value = op.startsWith('#') ? value.replace(new RegExp('^' + pattern), '') : value.replace(new RegExp(pattern + '$'), '');
      }
      out += value;
      i += braced[0].length;
      continue;
    }
    const plain = /^(\w+)/.exec(rest);
    if (plain) { out += env[plain[1]!] ?? ''; i += plain[1]!.length; continue; }
    out += char;
  }
  return out;
}

function tokenize(value: string): string[] {
  return value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((item) => item.replace(/"([^"]*)"|'([^']*)'/g, (_, a: string | undefined, b: string | undefined) => a ?? b ?? '')) ?? [];
}

interface ExecResult extends ToolResult { seconds: number; exit?: boolean }

function needFiles(rt: JobRuntime): Record<string, string> { return rt.files ?? {}; }

function execCommand(rt: JobRuntime, argv: string[], stdin: string, env: Record<string, string>, lineNumber: number): ExecResult {
  const [command = '', ...args] = argv;
  const ok = (lines: string[] = [], seconds = 0): ExecResult => ({ lines, code: 0, seconds });
  const notFound = (): ExecResult => ({ lines: [`/home/runner/work/_temp/${shortHash(rt.record.name + command, 8)}.sh: line ${lineNumber}: ${command}: command not found`], code: 127, seconds: 0 });
  const files = needFiles(rt);
  switch (command) {
    case 'echo': {
      const flags = args.filter((arg) => /^-[neE]+$/.test(arg));
      const text = args.filter((arg) => !/^-[neE]+$/.test(arg)).join(' ');
      return ok((flags.some((flag) => flag.includes('e')) ? text.replace(/\\n/g, '\n') : text).split('\n'));
    }
    case 'printf': {
      const [format = '', ...rest] = args;
      let index = 0;
      return ok(format.replace(/%s/g, () => rest[index++] ?? '').replace(/\\n$/, '').split('\\n'));
    }
    case 'true': case 'cd': case 'set': case 'sleep': case 'shopt': case 'source': case '.': return ok();
    case 'false': return { lines: [], code: 1, seconds: 0 };
    case 'exit': return { lines: [], code: Number(args[0] ?? 0) || 0, seconds: 0, exit: true };
    case 'export': {
      for (const arg of args) { const eq = arg.indexOf('='); if (eq > 0) env[arg.slice(0, eq)] = arg.slice(eq + 1); }
      return ok();
    }
    case 'pwd': return ok([rt.workspace]);
    case 'ls': {
      const dir = (args.find((arg) => !arg.startsWith('-')) ?? '').replace(/\/$/, '');
      const names = new Set(Object.keys(files).filter((path) => !dir || path.startsWith(dir + '/')).map((path) => (dir ? path.slice(dir.length + 1) : path).split('/')[0]!));
      return ok([...names].sort());
    }
    case 'cat': {
      const target = args[0] ?? '';
      const path = target.replace(rt.workspace + '/', '').replace(/^\.\//, '');
      if (files[path] === undefined) return { lines: [`cat: ${target}: No such file or directory`], code: 1, seconds: 0 };
      return ok(files[path].replace(/\n$/, '').split('\n'));
    }
    case 'env': case 'printenv': return ok(Object.entries(env).map(([key, value]) => `${key}=${value}`));
    case 'git': {
      if (args[0] === 'rev-parse') return ok([args.includes('--short') ? rt.run.sha.slice(0, 7) : rt.run.sha]);
      if (args[0] === 'describe') return rt.run.ref.startsWith('refs/tags/') ? ok([rt.run.branch]) : { lines: ['fatal: No names found, cannot describe anything.'], code: 128, seconds: 0 };
      return ok();
    }
    case 'python': case 'python3': {
      if (args[0] === '--version' || args[0] === '-V') return ok([`Python ${rt.python}`]);
      if (args[0] === '-m' && args[1] === 'pip') return pip(rt, args.slice(2));
      if (args[0] === '-m' && args[1] === 'pytest') return pytest(rt, args.slice(2));
      if (args[0] === '-m' && args[1] === 'ruff') return ruff(rt, args.slice(2));
      if (args[0] === '-c') return ok();
      const script = args[0] ?? '';
      const path = script.replace(/^\.\//, '');
      if (files[path] === undefined) return { lines: [`python: can't open file '${rt.workspace}/${path}': [Errno 2] No such file or directory`], code: 2, seconds: 0 };
      const result = runPythonScript(path, files[path], env, rt.python);
      return { ...result, seconds: 2 };
    }
    case 'pip': case 'pip3': return pip(rt, args);
    case 'pytest': return pytest(rt, args);
    case 'ruff': return ruff(rt, args);
    case 'flake8':
      if (!rt.installed.has('flake8')) return notFound();
      return { ...runFlake8(files, args), seconds: 1 };
    case 'node': return args[0] === '--version' || args[0] === '-v' ? ok([`v${rt.node}`]) : ok();
    case 'npm': return npm(rt, args);
    case 'docker': return docker(rt, argv, stdin);
    case 'curl': return curl(rt, args);
    case 'bash': case 'sh': {
      const script = args[0] ?? '';
      if (script.endsWith("deploy.sh")) return deploy(rt, script, args.slice(1), env);
      if (files[script.replace(/^\.\//, '')] === undefined) return { lines: [`${command}: ${script}: No such file or directory`], code: 127, seconds: 0 };
      return ok();
    }
    default:
      if (command.endsWith("deploy.sh")) return deploy(rt, command, args, env);
      if (command.startsWith('./') || command.includes('/')) {
        const path = command.replace(/^\.\//, '');
        if (files[path] === undefined) return { lines: [`/home/runner/work/_temp/${shortHash(rt.record.name, 8)}.sh: line ${lineNumber}: ${command}: No such file or directory`], code: 127, seconds: 0 };
        return ok();
      }
      return notFound();
  }
}

function pip(rt: JobRuntime, args: string[]): ExecResult {
  if (args[0] !== 'install') return { lines: [], code: 0, seconds: 0 };
  const packages: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '-r' || arg === '--requirement') {
      const file = (args[++i] ?? '').replace(/^\.\//, '');
      const content = rt.files?.[file];
      if (content === undefined) return { lines: [`ERROR: Could not open requirements file: [Errno 2] No such file or directory: '${file}'`], code: 1, seconds: 1 };
      packages.push(...content.split(/\r?\n/).map((line) => line.replace(/#.*$/, '').trim()).filter(Boolean));
    } else if (arg === '-e' || arg === '--editable') packages.push(args[++i] ?? '.');
    else if (!arg.startsWith('-')) packages.push(arg);
  }
  const lines: string[] = [];
  const names: string[] = [];
  for (const spec of packages) {
    const name = spec.split(/[<>=!~[;\s]/)[0]!.toLowerCase();
    const version = /==\s*([\w.]+)/.exec(spec)?.[1] ?? { pytest: '8.3.3', ruff: '0.7.4', flake8: '7.1.1', fastapi: '0.115.5', pip: '24.3.1', requests: '2.32.3' }[name] ?? '1.0.0';
    rt.installed.add(name);
    lines.push(`Collecting ${spec}`, rt.pipCached ? `  Using cached ${name}-${version}-py3-none-any.whl.metadata (4.1 kB)` : `  Downloading ${name}-${version}-py3-none-any.whl.metadata (4.1 kB)`);
    names.push(`${name}-${version}`);
  }
  if (names.length) lines.push('Installing collected packages: ' + names.map((item) => item.replace(/-[^-]+$/, '')).join(', '), 'Successfully installed ' + names.join(' '));
  return { lines, code: 0, seconds: rt.pipCached ? 4 : 6 + packages.length * 5 };
}

function pytest(rt: JobRuntime, args: string[]): ExecResult {
  if (!rt.installed.has('pytest')) return { lines: [`/home/runner/work/_temp/${shortHash(rt.record.name, 8)}.sh: line 1: pytest: command not found`], code: 127, seconds: 0 };
  return { ...runPytest({ files: rt.files ?? {}, pythonVersion: rt.python, args, workspace: rt.workspace }), seconds: 4 };
}

function ruff(rt: JobRuntime, args: string[]): ExecResult {
  if (!rt.installed.has('ruff')) return { lines: [`/home/runner/work/_temp/${shortHash(rt.record.name, 8)}.sh: line 1: ruff: command not found`], code: 127, seconds: 0 };
  return { ...runRuff(rt.files ?? {}, args), seconds: 1 };
}

function npm(rt: JobRuntime, args: string[]): ExecResult {
  const raw = rt.files?.['package.json'];
  const fail = (lines: string[]): ExecResult => ({ lines, code: 1, seconds: 1 });
  if (raw === undefined) return fail([`npm error code ENOENT`, `npm error syscall open`, `npm error path ${rt.workspace}/package.json`, `npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '${rt.workspace}/package.json'`]);
  let pkg: { name?: string; version?: string; scripts?: Record<string, string> };
  try { pkg = JSON.parse(raw) as typeof pkg; } catch { return fail(['npm error code EJSONPARSE', 'npm error JSON.parse Invalid package.json']); }
  const sub = args[0];
  if (sub === 'ci' || sub === 'install' || sub === 'i') {
    if (sub === 'ci' && rt.files?.['package-lock.json'] === undefined) return fail(['npm error code EUSAGE', 'npm error', 'npm error The `npm ci` command can only install with an existing package-lock.json or', 'npm error npm-shrinkwrap.json with lockfileVersion >= 1.']);
    rt.installed.add('node_modules');
    return { lines: ['', 'added 214 packages, and audited 215 packages in ' + (rt.npmCached ? '3s' : '14s'), '', 'found 0 vulnerabilities'], code: 0, seconds: rt.npmCached ? 4 : 15 };
  }
  const script = sub === 'test' || sub === 't' ? 'test' : sub === 'run' ? args[1] ?? '' : sub ?? '';
  const body = pkg.scripts?.[script];
  if (!body) return fail([`npm error Missing script: "${script}"`, 'npm error', 'npm error To see a list of scripts, run:', 'npm error   npm run']);
  if (!rt.installed.has('node_modules')) return fail(['', `> ${pkg.name ?? 'app'}@${pkg.version ?? '1.0.0'} ${script}`, `> ${body}`, '', `sh: 1: ${body.split(' ')[0]}: not found`]);
  return { lines: ['', `> ${pkg.name ?? 'app'}@${pkg.version ?? '1.0.0'} ${script}`, `> ${body}`, '', script === 'test' ? ' Test Files  4 passed (4)\n      Tests  21 passed (21)' : 'done'], code: 0, seconds: 6 };
}

function docker(rt: JobRuntime, argv: string[], stdin: string): ExecResult {
  const sub = argv[1];
  if (sub === 'login') {
    const user = argv[argv.indexOf('-u') + 1] ?? argv[argv.indexOf('--username') + 1];
    const passwordStdin = argv.includes('--password-stdin');
    const password = passwordStdin ? stdin.trim() : argv[argv.indexOf('-p') + 1] ?? '';
    if (!password || !user || !argv.includes('-u') && !argv.includes('--username')) {
      return { lines: ['Error: Cannot perform an interactive login from a non TTY device'], code: 1, seconds: 1 };
    }
    rt.docker.loggedIn = true;
    rt.masks.push(password);
    return { lines: ['WARNING! Your password will be stored unencrypted in /home/runner/.docker/config.json.', 'Login Succeeded'], code: 0, seconds: 1 };
  }
  if (sub === 'build' || sub === 'push' || sub === 'tag') {
    const bad = argv.slice(2).find((arg) => arg.includes('/') && arg !== arg.toLowerCase());
    if (bad) return { lines: [`ERROR: invalid tag "${bad}": repository name must be lowercase`], code: 1, seconds: 1 };
  }
  rt.docker.files = { ...(rt.files ?? {}) };
  const result = runDockerCommand(rt.docker, argv.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' '));
  rt.docker = result.state;
  const text = (result.stdout + result.stderr).replace(/\n$/, '');
  return { lines: text ? text.split('\n') : [], code: result.exitCode === 0 ? 0 : 1, seconds: sub === 'build' ? 38 : sub === 'push' ? 9 : 1 };
}

function curl(rt: JobRuntime, args: string[]): ExecResult {
  const url = args.find((arg) => /^https?:\/\//.test(arg)) ?? '';
  const environment = Object.values(rt.state.environments).find((item) => item.url && url.startsWith(item.url));
  if (!environment) return { lines: [`curl: (6) Could not resolve host: ${url.replace(/^https?:\/\//, '').split('/')[0]}`], code: 6, seconds: 1 };
  if (environment.health === 'unhealthy') return { lines: ['curl: (22) The requested URL returned error: 500'], code: 22, seconds: 1 };
  return { lines: [JSON.stringify({ status: 'ok', version: environment.current })], code: 0, seconds: 1 };
}

const SEMVER = /^\d+\.\d+\.\d+$/;

/** The simulated `scripts/deploy.sh <environment> <version|--rollback>` used by deploy jobs. */
function deploy(rt: JobRuntime, script: string, args: string[], env: Record<string, string>): ExecResult {
  const path = script.replace(/^\.\//, '');
  if (rt.files?.[path] === undefined) {
    return { lines: [`/home/runner/work/_temp/${shortHash(rt.record.name, 8)}.sh: line 1: ${script}: No such file or directory`], code: 127, seconds: 0 };
  }
  const [target = '', version = ''] = args;
  const fail = (lines: string[]): ExecResult => ({ lines, code: 1, seconds: 2 });
  if (!target || !version) return fail(['Usage: scripts/deploy.sh <staging|production> <MAJOR.MINOR.PATCH | --rollback>']);
  const environment = rt.state.environments[target];
  if (!environment) return fail([`Error: unknown environment '${target}'. Known environments: ${Object.keys(rt.state.environments).join(', ')}`]);
  if (!env.DEPLOY_TOKEN) return fail(['Error: DEPLOY_TOKEN is not set.', `Deploys read DEPLOY_TOKEN from the '${target}' environment secret. Run this job with environment: ${target} and pass the secret through env.`]);
  if (rt.record.environment !== target) return fail([`Error: this job runs in environment '${rt.record.environment ?? 'none'}' but tried to deploy to '${target}'.`]);
  let release = version;
  let status: 'success' | 'rollback' = 'success';
  if (version === '--rollback') {
    const history = rt.state.deployments.filter((item) => item.environment === target && item.status !== 'failed' && !(rt.state.unhealthy[target] ?? []).includes(item.version));
    const previous = [...history].reverse().find((item) => item.version !== environment.current);
    if (!previous) return fail([`Error: no earlier healthy release of orders-api found for ${target}. Nothing to roll back to.`]);
    release = previous.version;
    status = 'rollback';
  } else if (!SEMVER.test(release)) {
    return fail([`Error: '${release}' is not a valid semantic version. Use MAJOR.MINOR.PATCH, for example 1.4.2 (no leading v).`]);
  }
  const image = `${rt.state.image}:${release}`;
  if (!rt.state.registry.includes(image) && !rt.docker.registry.includes(image)) {
    return fail([`Deploying ${image} to ${target}`, `Error response from daemon: manifest for ${image} not found: manifest unknown: manifest unknown`]);
  }
  const lines = [
    status === 'rollback' ? `Rolling back ${target} from ${environment.current ?? 'nothing'} to ${release}` : `Deploying ${image} to ${target}`,
    `Pulling ${image}... done`,
    `Updating service orders-api in ${target} (2 replicas)... done`,
  ];
  environment.current = release;
  if ((rt.state.unhealthy[target] ?? []).includes(release)) {
    environment.health = 'unhealthy';
    rt.state.deployments.push({ environment: target, version: release, runId: rt.run.id, status: 'failed' });
    return { lines: [...lines, `Health check ${environment.url}/healthz -> 500 Internal Server Error (attempt 3/3)`, `Error: ${target} is unhealthy after deploying ${release}. Roll back with: scripts/deploy.sh ${target} --rollback`], code: 1, seconds: 31 };
  }
  environment.health = 'healthy';
  rt.state.deployments.push({ environment: target, version: release, runId: rt.run.id, status });
  return { lines: [...lines, `Health check ${environment.url}/healthz -> 200 OK`, `✓ ${target} is now running orders-api ${release}`], code: 0, seconds: 24 };
}
