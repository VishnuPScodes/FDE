import { AwsError, UsageError, formatOutput, jmesSearch, parseArgs, tokenize, USAGE, type ArgType } from './cli-core';
import { OpContext, type OpOutput, type ServiceSpec } from './context';
import { ec2Service } from './services/ec2';
import { iamService, stsService } from './services/iam';
import { HighLevelError, s3Service, s3apiService } from './services/s3';
import { PolicyError } from './iam-policy';
import { ADMIN_USER, cloneAwsState, createAwsState, regionOf } from './state';
import type { AwsCommandResult, AwsState, JsonValue, Principal } from './types';

const SERVICES: Record<string, ServiceSpec> = { ec2: ec2Service, iam: iamService, sts: stsService, s3: s3Service, s3api: s3apiService };

const GLOBAL_ARGS: Record<string, ArgType> = {
  region: 'string', profile: 'string', output: 'string', query: 'string',
  'no-cli-pager': 'bool', 'no-paginate': 'bool', 'no-sign-request': 'bool', debug: 'bool', 'cli-connect-timeout': 'string', 'cli-read-timeout': 'string',
};

/** Hidden file in a level's starter files: one `aws ...` command per line, run silently as admin before the learner starts. */
export const SEED_FILE = '.aws-seed';

function resolvePrincipal(state: AwsState, profileName: string): Principal {
  const profile = state.profiles[profileName];
  if (!profile) throw new UsageError(`The config profile (${profileName}) could not be found`);
  if (profile.accessKeyId) {
    const user = state.iam.accessKeys[profile.accessKeyId];
    if (!user || !state.iam.users[user]) throw new AwsError('InvalidClientTokenId', 'The security token included in the request is invalid.');
    return { kind: 'user', name: user };
  }
  return { kind: 'user', name: ADMIN_USER };
}

function finish(state: AwsState, line: string, stdout: string, stderr: string, exitCode: number): AwsCommandResult {
  state.history.push(line);
  state.stdout = stdout;
  state.stderr = stderr;
  state.lastError = exitCode === 0 ? '' : stderr;
  return { state, stdout, stderr, exitCode };
}

/** Run one shell line against the simulated account. Pure: the input state is never mutated. */
export function runAwsCommand(previous: AwsState, input: string): AwsCommandResult {
  const line = input.trim();
  const assignment = /^([A-Za-z_]\w*)=(?:\$\((.*)\)|(\S*))$/.exec(line);
  if (assignment) return assign(previous, line, assignment[1]!, assignment[2], assignment[3] ?? '');
  const state = cloneAwsState(previous);
  const failed = (stderr: string, code: number) => finish(cloneAwsState(previous), line, '', stderr, code);
  let tokens: string[];
  try {
    tokens = tokenize(expandVariables(previous, line));
  } catch (error) {
    return failed(`bash: ${(error as Error).message}\n`, 2);
  }
  if (!tokens.length) return failed('', 0);
  const [program = '', ...rest] = tokens;
  if (program === 'cat' || program === 'ls' || program === 'echo') return shellBuiltin(state, line, program, rest);
  if (program !== 'aws') return failed(`bash: ${program}: command not found\n`, 127);
  const [serviceName, commandName, ...args] = rest;
  if (!serviceName || serviceName === 'help') return failed(USAGE, 252);
  if (serviceName === 'configure') return configure(state, previous, line, [commandName, ...args].filter((item): item is string => item !== undefined));
  const service = SERVICES[serviceName];
  if (!service) return failed(`${USAGE}\naws: error: argument command: Invalid choice, valid choices are:\n\n${Object.keys(SERVICES).sort().join('\n')}\n`, 252);
  if (!commandName || commandName === 'help') return failed(USAGE + '\nAvailable commands: ' + Object.keys(service).join(', ') + '\n', 252);
  const spec = service[commandName];
  if (!spec) return failed(`${USAGE}\naws: error: argument operation: Invalid choice, valid choices are:\n\n${Object.keys(service).sort().join('\n')}\n`, 252);
  try {
    const parsed = parseArgs(args, { ...GLOBAL_ARGS, ...(spec.args ?? {}) });
    const missing = (spec.required ?? []).filter((name) => parsed.values[name] === undefined);
    if (missing.length) throw new UsageError(`${USAGE}\naws: error: the following arguments are required: ${missing.map((name) => '--' + name).join(', ')}`);
    const profileName = typeof parsed.values.profile === 'string' ? parsed.values.profile : 'default';
    const region = regionOf(state, profileName, typeof parsed.values.region === 'string' ? parsed.values.region : undefined);
    const principal = resolvePrincipal(state, profileName);
    const ctx = new OpContext(state, region, principal, parsed);
    const output = spec.run(ctx);
    const format = typeof parsed.values.output === 'string' ? parsed.values.output : state.profiles[profileName]?.output ?? 'json';
    const query = typeof parsed.values.query === 'string' ? parsed.values.query : undefined;
    return finish(state, line, render(output, format, query, spec.op), '', 0);
  } catch (error) {
    const clean = cloneAwsState(previous);
    if (error instanceof HighLevelError) return finish(clean, line, '', error.message + '\n', 1);
    if (error instanceof UsageError) return finish(clean, line, '', error.message + '\n', 252);
    if (error instanceof PolicyError || error instanceof AwsError) {
      return finish(clean, line, '', `\nAn error occurred (${error.code}) when calling the ${spec.op} operation: ${error.message}\n`, 254);
    }
    throw error;
  }
}

function render(output: OpOutput, format: string, query: string | undefined, title: string): string {
  if (!output) return '';
  if ('text' in output) return output.text;
  let value: JsonValue = output.json;
  if (query) value = jmesSearch(value, query);
  if (value === null && format !== 'json') return 'None\n';
  return formatOutput(value, format, title);
}

function shellBuiltin(state: AwsState, line: string, program: string, args: string[]): AwsCommandResult {
  if (program === 'echo') return finish(state, line, args.join(' ') + '\n', '', 0);
  if (program === 'ls') {
    const names = Object.keys(state.files).filter((name) => !name.startsWith('.')).sort();
    return finish(state, line, names.join('\n') + (names.length ? '\n' : ''), '', 0);
  }
  const name = (args[0] ?? '').replace(/^\.\//, '');
  const content = state.files[name];
  if (content === undefined) return finish(state, line, '', `cat: ${args[0] ?? ''}: No such file or directory\n`, 1);
  return finish(state, line, content.endsWith('\n') ? content : content + '\n', '', 0);
}

/** `aws configure set <key> <value> [--profile p]` and `aws configure list`. */
function configure(state: AwsState, previous: AwsState, line: string, args: string[]): AwsCommandResult {
  const sub = args[0];
  const positionals = args.slice(1).filter((item) => !item.startsWith('--'));
  const profileIndex = args.indexOf('--profile');
  const profile = profileIndex >= 0 ? args[profileIndex + 1] ?? 'default' : 'default';
  if (sub === 'list') {
    const entry = state.profiles[profile];
    const key = entry?.accessKeyId ? '****************' + entry.accessKeyId.slice(-4) : '<not set>';
    return finish(state, line, `NAME       : VALUE\nprofile    : ${profile}\naccess_key : ${key}\nregion     : ${entry?.region ?? '<not set>'}\noutput     : ${entry?.output ?? 'json'}\n`, '', 0);
  }
  if (sub === 'set' && positionals.length >= 2) {
    const [key = '', value = ''] = positionals;
    const entry = state.profiles[profile] ?? {};
    if (key === 'region') entry.region = value;
    else if (key === 'output') entry.output = value;
    else if (key === 'aws_access_key_id') entry.accessKeyId = value;
    else if (key !== 'aws_secret_access_key') return finish(cloneAwsState(previous), line, '', `The configuration key '${key}' is not supported here.\n`, 1);
    state.profiles[profile] = entry;
    return finish(state, line, '', '', 0);
  }
  return finish(cloneAwsState(previous), line, '', 'usage: aws configure [list | set <key> <value>] [--profile <name>]\n', 252);
}

/** Fresh level state: an account plus starter files, with the optional seed script applied silently. */
export function createLevelState(starterFiles: Record<string, string> = {}): AwsState {
  const { [SEED_FILE]: seed, ...files } = starterFiles;
  let state = createAwsState(files);
  for (const raw of (seed ?? '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const result = runAwsCommand(state, line);
    if (result.exitCode !== 0) throw new Error(`Seed command failed: ${line}\n${result.stderr}`);
    state = result.state;
  }
  state.history = [];
  state.stdout = '';
  state.stderr = '';
  state.lastError = '';
  return state;
}

/** Replay a list of command lines, as the level tests do. */
export function replayCommands(state: AwsState, lines: string[]): AwsState {
  return lines.reduce((current, line) => runAwsCommand(current, line).state, state);
}

const VAR_PREFIX = '.var.';

/** Replace $NAME and ${NAME} with saved shell variables, leaving single-quoted text alone. */
function expandVariables(state: AwsState, line: string): string {
  let out = '';
  let single = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === "'") single = !single;
    if (char === '$' && !single) {
      const match = /^\$(?:\{(\w+)\}|(\w+))/.exec(line.slice(i));
      if (match) {
        const name = match[1] ?? match[2]!;
        out += state.files[VAR_PREFIX + name] ?? '';
        i += match[0].length - 1;
        continue;
      }
    }
    out += char;
  }
  return out;
}

/** `NAME=value` or `NAME=$(aws ...)`: keep the value for later commands, like a real shell. */
function assign(previous: AwsState, line: string, name: string, inner: string | undefined, literal: string): AwsCommandResult {
  let state = cloneAwsState(previous);
  let value = expandVariables(previous, literal);
  if (inner !== undefined) {
    const result = runAwsCommand(previous, inner);
    if (result.exitCode !== 0) return finish(cloneAwsState(previous), line, '', result.stderr, result.exitCode);
    state = result.state;
    state.history.pop();
    value = result.stdout.trim();
  }
  state.files[VAR_PREFIX + name] = value;
  return finish(state, line, '', '', 0);
}
