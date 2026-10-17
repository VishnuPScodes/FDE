import yaml from 'js-yaml';

export interface DockerImage {
  tag: string; id: string; sizeMb: number; base: string; user: string;
  command: string[]; ports: number[]; layers: string[]; stages: string[]; healthcheck: string | null;
}
export interface DockerContainer {
  id: string; name: string; image: string; status: 'running' | 'exited';
  ports: string[]; environment: Record<string, string>; logs: string; health: 'healthy' | 'none';
}
export interface DockerState {
  files: Record<string, string>; images: DockerImage[]; containers: DockerContainer[];
  registry: string[]; history: string[]; stdout: string; stderr: string; lastError: string; nextId: number;
  loggedIn: boolean; networks: string[]; volumes: string[];
}
export interface DockerResult { state: DockerState; stdout: string; stderr: string; exitCode: number }

const BASES: Record<string, number> = {
  'python:3.12': 102, 'python:3.12-slim': 48, 'python:3.12-alpine': 18,
  'node:22': 155, 'node:22-slim': 74, 'node:22-alpine': 44,
  'nginx:alpine': 24, 'alpine:3.20': 8, scratch: 0,
};

export function createDockerState(files: Record<string, string> = {}): DockerState {
  return { files: { ...files }, images: [], containers: [], registry: [], history: [],
    stdout: '', stderr: '', lastError: '', nextId: 1, loggedIn: false, networks: ['bridge', 'host', 'none'], volumes: [] };
}

export function runDockerCommand(previous: DockerState, input: string): DockerResult {
  const state: DockerState = { ...previous, files: { ...previous.files },
    images: previous.images.map((x) => ({ ...x, command: [...x.command], ports: [...x.ports], layers: [...x.layers], stages: [...x.stages] })),
    containers: previous.containers.map((x) => ({ ...x, ports: [...x.ports], environment: { ...x.environment } })),
    registry: [...previous.registry], history: [...previous.history], networks: [...previous.networks], volumes: [...previous.volumes] };
  const line = input.trim();
  if (!line) return result(state, '', '', 0);
  state.history.push(line);
  const args = tokenize(line);
  if (args.shift() !== 'docker') return result(state, '', 'zsh: command not found: ' + (args[0] ?? '') + '\n', 127);
  const command = args.shift();
  if (!command) return result(state, 'Usage: docker COMMAND\n', '', 0);
  if (command === 'help' || command === '--help') return result(state, 'Commands: build, images, run, ps, logs, stop, start, restart, rm, inspect, tag, login, push, pull, compose, network, volume, system prune\n', '', 0);
  if (command === 'build') return build(state, args);
  if (command === 'images') return images(state);
  if (command === 'run') return run(state, args);
  if (command === 'ps') return ps(state, args.includes('-a'));
  if (command === 'logs') {
    const target = args.find((x) => !x.startsWith('-')) ?? '';
    const item = state.containers.find((x) => x.name === target || x.id.startsWith(target));
    return item ? result(state, item.logs, '', 0) : fail(state, 'Error response from daemon: No such container: ' + target + '\n');
  }
  if (command === 'stop' || command === 'start' || command === 'restart') {
    const target = args.find((x) => !x.startsWith('-')) ?? '';
    const item = state.containers.find((x) => x.name === target || x.id.startsWith(target));
    if (!item) return fail(state, 'Error response from daemon: No such container: ' + target + '\n');
    item.status = command === 'stop' ? 'exited' : 'running';
    return result(state, item.id + '\n', '', 0);
  }
  if (command === 'rm') {
    const target = args.find((x) => !x.startsWith('-')) ?? '';
    const item = state.containers.find((x) => x.name === target || x.id.startsWith(target));
    if (!item) return fail(state, 'Error response from daemon: No such container: ' + target + '\n');
    if (item.status === 'running' && !args.includes('-f')) return fail(state, 'Error response from daemon: cannot remove a running container ' + item.name + '. Stop the container before attempting removal\n');
    state.containers = state.containers.filter((x) => x !== item);
    return result(state, item.id + '\n', '', 0);
  }
  if (command === 'inspect') {
    const target = args.find((x) => !x.startsWith('-')) ?? '';
    const item = state.containers.find((x) => x.name === target) ?? state.images.find((x) => x.tag === target);
    return item ? result(state, JSON.stringify(item, null, 2) + '\n', '', 0) : fail(state, 'Error: No such object: ' + target + '\n');
  }
  if (command === 'tag') {
    const values = args.filter((x) => !x.startsWith('-'));
    const image = state.images.find((x) => x.tag === values[0]);
    if (!image || !values[1]) return fail(state, 'Error response from daemon: No such image: ' + (values[0] ?? '') + '\n');
    state.images.unshift({ ...image, tag: values[1] });
    return result(state, '', '', 0);
  }
  if (command === 'login') { state.loggedIn = true; return result(state, 'Login Succeeded (simulated registry credentials)\n', '', 0); }
  if (command === 'push') {
    const target = args.find((x) => !x.startsWith('-')) ?? '';
    const image = state.images.find((x) => x.tag === target);
    if (!image) return fail(state, 'An image does not exist locally with the tag: ' + target + '\n');
    if (!state.loggedIn) return fail(state, 'denied: requested access to the resource is denied\nPlease run docker login first.\n');
    if (!target.includes('/')) return fail(state, 'tag does not reference a registry: ' + target + '\n');
    if (!state.registry.includes(target)) state.registry.push(target);
    return result(state, 'pushed ' + target + ' (' + image.id + ')\n', '', 0);
  }
  if (command === 'pull') {
    const target = args.find((x) => !x.startsWith('-')) ?? '';
    return state.registry.includes(target) ? result(state, 'Pulled ' + target + ' from simulated registry\n', '', 0) : fail(state, "pull access denied for " + target + ", repository does not exist or may require 'docker login'\n");
  }
  if (command === 'compose') return compose(state, args);
  if (command === 'network' || command === 'volume') {
    const collection = command === 'network' ? state.networks : state.volumes;
    if (args[0] === 'ls') return result(state, 'NAME\n' + collection.join('\n') + '\n', '', 0);
    if (args[0] === 'create' && args[1]) { collection.push(args[1]); return result(state, args[1] + '\n', '', 0); }
  }
  if (command === 'system' && args[0] === 'prune') {
    const count = state.images.length;
    const used = new Set(state.containers.map((x) => x.image));
    state.images = state.images.filter((x) => used.has(x.tag));
    return result(state, 'Deleted Images: ' + (count - state.images.length) + '\nTotal reclaimed space: 0MB\n', '', 0);
  }
  return fail(state, "docker: '" + command + "' is not a docker command. See 'docker --help'.\n");
}

function build(state: DockerState, args: string[]): DockerResult {
  let tag = 'latest';
  for (let i = 0; i < args.length; i++) if (args[i] === '-t' || args[i] === '--tag') tag = args[++i] ?? tag;
  if (state.files.Dockerfile === undefined) return fail(state, 'unable to prepare context: path "Dockerfile" not found\n');
  const lines = state.files.Dockerfile.split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'));
  const stages: { base: string; name: string; user: string; size: number; cmd: string[]; ports: number[]; layers: string[]; healthcheck: string | null }[] = [];
  for (const line of lines) {
    const [instruction = '', ...parts] = line.split(/\s+/);
    const op = instruction.toUpperCase();
    const value = parts.join(' ');
    if (op === 'FROM') {
      const base = parts[0] ?? '';
      const stageBase = stages.find((x) => x.name === base);
      if (!Object.hasOwn(BASES, base) && !stageBase) return fail(state, "pull access denied for " + base + ", repository does not exist or may require 'docker login'\n");
      const asIndex = parts.findIndex((x) => x.toUpperCase() === 'AS');
      stages.push({ base, name: asIndex < 0 ? 'stage' + stages.length : parts[asIndex + 1] ?? 'stage' + stages.length,
        user: stageBase?.user ?? 'root', size: stageBase?.size ?? BASES[base] ?? 0, cmd: [], ports: [], layers: ['FROM ' + base], healthcheck: stageBase?.healthcheck ?? null });
      continue;
    }
    const stage = stages.at(-1);
    if (!stage) return fail(state, 'dockerfile parse error: Dockerfile must start with a FROM instruction\n');
    if (op === 'COPY' || op === 'ADD') {
      const from = parts.find((x) => x.startsWith('--from='));
      if (from && !stages.some((x) => x.name === from.slice(7))) return fail(state, 'invalid from flag value ' + from.slice(7) + ': stage not found\n');
      const source = parts.filter((x) => !x.startsWith('--'))[0];
      if (!from && source && source !== '.' && !Object.hasOwn(state.files, source) && !Object.keys(state.files).some((x) => x.startsWith(source.replace(/\/$/, '') + '/'))) return fail(state, 'failed to calculate checksum: "' + source + '": not found\n');
      if (from) stage.size += 1;
      else if (source === '.' || source && Object.hasOwn(state.files, source)) stage.size += Math.max(1, Math.ceil(Object.values(state.files).join('').length / 50000));
    } else if (op === 'RUN') {
      if (/apt-get\s+install/.test(value)) stage.size += 58;
      else if (/apk\s+add/.test(value)) stage.size += 7;
      else if (/pip\s+install/.test(value)) stage.size += 14;
      else if (/npm\s+install/.test(value)) stage.size += 28;
    } else if (op === 'USER') stage.user = value || 'root';
    else if (op === 'CMD' || op === 'ENTRYPOINT') stage.cmd = parseCommand(value);
    else if (op === 'EXPOSE') stage.ports.push(...value.split(/\s+/).map(Number).filter(Number.isFinite));
    else if (op === 'HEALTHCHECK') stage.healthcheck = value;
    else if (!['WORKDIR', 'ENV', 'ARG', 'LABEL', 'SHELL', 'VOLUME'].includes(op)) return fail(state, 'dockerfile parse error: unknown instruction: ' + instruction + '\n');
    stage.layers.push(op + ' ' + value);
  }
  const final = stages.at(-1);
  if (!final) return fail(state, 'dockerfile parse error: Dockerfile must start with a FROM instruction\n');
  const id = state.nextId++.toString(16).padStart(12, '0');
  const image: DockerImage = { tag, id, sizeMb: final.size, base: final.base, user: final.user, command: final.cmd, ports: final.ports, layers: final.layers, stages: stages.map((x) => x.name), healthcheck: final.healthcheck };
  state.images = [image, ...state.images.filter((x) => x.tag !== tag)];
  return result(state, 'Step ' + lines.length + '/' + lines.length + ' : build complete\nSuccessfully built ' + id + '\nSuccessfully tagged ' + tag + '\n', '', 0);
}

function images(state: DockerState): DockerResult {
  const lines = ['REPOSITORY          TAG       IMAGE ID       SIZE'];
  for (const image of state.images) lines.push(image.tag.padEnd(20) + image.id + '   ' + image.sizeMb + 'MB (' + image.user + ')');
  return result(state, lines.join('\n') + '\n', '', 0);
}

function run(state: DockerState, args: string[]): DockerResult {
  let name = '';
  let detached = false;
  const ports: string[] = [];
  const environment: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const value = args[i]!;
    if (value === '--name') name = args[++i] ?? '';
    else if (value === '-p' || value === '--publish') ports.push(args[++i] ?? '');
    else if (value === '-e' || value === '--env') { const [key, ...rest] = (args[++i] ?? '').split('='); if (key) environment[key] = rest.join('='); }
    else if (value === '-d' || value === '--detach') detached = true;
  }
  const options = new Set(['--name', '-p', '--publish', '-e', '--env']);
  let imageTag = '';
  for (let i = 0; i < args.length; i++) if (!options.has(args[i]!) && i > 0 && !args[i]!.startsWith('-') && !options.has(args[i - 1]!)) imageTag = args[i]!;
  const image = state.images.find((x) => x.tag === imageTag);
  if (!image) return fail(state, "Unable to find image '" + imageTag + "' locally\nError response from daemon: pull access denied for " + imageTag + ", repository does not exist or may require 'docker login'.\n");
  name ||= 'container-' + state.nextId;
  if (state.containers.some((x) => x.name === name)) return fail(state, 'Error response from daemon: Conflict. The container name "/' + name + '" is already in use.\n');
  for (const mapping of ports) {
    const host = mapping.split(':')[0];
    if (state.containers.some((x) => x.status === 'running' && x.ports.some((port) => port.startsWith(host + ':')))) return fail(state, 'Error response from daemon: Bind for 0.0.0.0:' + host + ' failed: port is already allocated\n');
  }
  const id = state.nextId++.toString(16).padStart(12, '0');
  const container: DockerContainer = { id, name, image: imageTag, status: 'running', ports, environment, logs: (image.command.join(' ') || 'Container') + ' started\n', health: image.healthcheck ? 'healthy' : 'none' };
  state.containers.unshift(container);
  return result(state, detached ? id + '\n' : container.logs, '', 0);
}

function ps(state: DockerState, all: boolean): DockerResult {
  const lines = ['CONTAINER ID   IMAGE          STATUS       PORTS          NAMES'];
  for (const item of state.containers.filter((x) => all || x.status === 'running')) lines.push(item.id + '     ' + item.image + '   ' + (item.status === 'running' ? 'Up' : 'Exited (0)') + '   ' + item.ports.join(',') + '   ' + item.name);
  return result(state, lines.join('\n') + '\n', '', 0);
}

function compose(state: DockerState, args: string[]): DockerResult {
  const action = args.find((x) => ['up', 'down', 'ps', 'logs', 'build'].includes(x));
  const file = state.files['docker-compose.yml'] ?? state.files['compose.yaml'] ?? state.files['compose.yml'];
  if (!file) return fail(state, 'no configuration file provided: not found: docker-compose.yml\n');
  let config: unknown;
  try { config = yaml.load(file); } catch (error) { return fail(state, 'yaml: ' + (error instanceof Error ? error.message : String(error)) + '\n'); }
  if (!isRecord(config) || !isRecord(config.services)) return fail(state, 'validating compose file: services must be a mapping\n');
  if (action === 'ps') return ps(state, true);
  if (action === 'logs') return result(state, state.containers.map((x) => x.logs).join(''), '', 0);
  if (action === 'down') { state.containers = []; return result(state, 'Containers stopped and removed\n', '', 0); }
  if (action === 'build') return result(state, 'Compose build complete\n', '', 0);
  if (action !== 'up') return fail(state, 'Usage: docker compose up|down|ps|logs|build\n');
  const names = Object.keys(config.services);
  for (const name of names) {
    const service = config.services[name];
    if (!isRecord(service)) return fail(state, 'service ' + name + ' must be a mapping\n');
    const dependencies = Array.isArray(service.depends_on) ? service.depends_on.map(String) : [];
    const missing = dependencies.find((x) => !names.includes(x));
    if (missing) return fail(state, 'service ' + name + ' depends on undefined service ' + missing + '\n');
    const image = typeof service.image === 'string' ? service.image : name + ':latest';
    if (!state.images.some((x) => x.tag === image)) return fail(state, 'service ' + name + ': image ' + image + ' not found\n');
    if (!state.containers.some((x) => x.name === name)) {
      const item = state.images.find((x) => x.tag === image)!;
      state.containers.unshift({ id: state.nextId++.toString(16).padStart(12, '0'), name, image, status: 'running', ports: [], environment: {}, logs: 'Service ' + name + ' started\n', health: 'none' });
    }
  }
  return result(state, 'Network app_default Created\n' + names.map((x) => 'Container ' + x + ' Started').join('\n') + '\n', '', 0);
}

function parseCommand(value: string): string[] {
  try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed)) return parsed.map(String); } catch { /* shell form */ }
  return value ? ['/bin/sh', '-c', value] : [];
}
function tokenize(value: string): string[] { return value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((x) => x.replace(/^['"]|['"]$/g, '')) ?? []; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function result(state: DockerState, stdout: string, stderr: string, exitCode: number): DockerResult { state.stdout = stdout; state.stderr = stderr; if (stderr) state.lastError = stderr; return { state, stdout, stderr, exitCode }; }
function fail(state: DockerState, message: string): DockerResult { return result(state, '', message, 1); }
