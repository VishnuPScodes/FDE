export interface ShellState {
  cwd: string;
  files: Record<string, string>;
  directories: string[];
  env: Record<string, string>;
  history: string[];
  lastStdout: string;
  lastExitCode: number;
}

export interface ShellResult {
  state: ShellState;
  stdout: string;
  stderr: string;
  exitCode: number;
  prompt: string;
}

export function createShellState(files: Record<string, string> = {}): ShellState {
  const normalized = Object.fromEntries(
    Object.entries(files).map(([path, value]) => [normalizePath(path, '/workspace'), value]),
  );
  const directories = new Set(['/', '/home', '/home/learner', '/workspace']);
  for (const path of Object.keys(normalized)) {
    let parent = parentPath(path);
    while (parent !== '/') {
      directories.add(parent);
      parent = parentPath(parent);
    }
  }
  return {
    cwd: '/workspace',
    files: normalized,
    directories: [...directories],
    env: { HOME: '/home/learner', PWD: '/workspace', USER: 'learner' },
    history: [],
    lastStdout: '',
    lastExitCode: 0,
  };
}

export function runShellCommand(previous: ShellState, input: string): ShellResult {
  const state: ShellState = {
    ...previous,
    files: { ...previous.files },
    directories: [...previous.directories],
    env: { ...previous.env },
    history: [...previous.history],
  };
  const commandLine = input.trim();
  if (!commandLine) return result(state, '', '', 0);
  state.history.push(commandLine);
  const pipeline = splitOutsideQuotes(commandLine, '|');
  let piped = '';
  let last = result(state, '', '', 0);
  for (const [index, segment] of pipeline.entries()) {
    last = runOne(state, segment.trim(), index ? piped : '');
    if (last.exitCode !== 0) {
      state.lastStdout = last.stdout;
      state.lastExitCode = last.exitCode;
      return last;
    }
    piped = last.stdout;
  }
  state.lastStdout = last.stdout;
  state.lastExitCode = last.exitCode;
  return last;
}

function runOne(state: ShellState, line: string, stdin: string): ShellResult {
  const redirect = findRedirect(line);
  const commandText = redirect ? line.slice(0, redirect.index).trim() : line;
  const tokens = tokenize(commandText);
  const command = tokens.shift();
  const args = tokens.map((token) => expand(token, state));
  if (!command) return result(state, '', '', 0);

  if (command === 'help' || command === '--help')
    return result(
      state,
      'Supported commands: pwd, ls, cd, mkdir, touch, cat, echo, printf, cp, mv, rm, grep, head, wc, cut, sort, uniq, env, export, whoami, clear\n',
    );
  if (command === 'clear') return result(state, '\x1b[2J\x1b[H');
  if (command === 'pwd') return result(state, `${state.cwd}\n`);
  if (command === 'whoami') return result(state, 'learner\n');
  if (command === 'env')
    return result(
      state,
      `${Object.entries(state.env)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')}\n`,
    );
  if (command === 'export') {
    const assignment = args.join(' ');
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(assignment);
    if (!match) return result(state, '', 'bash: export: usage: export NAME=value\n', 2);
    state.env[match[1]!] = unquote(match[2]!);
    return result(state, '');
  }
  if (command === 'cd') {
    const target = resolvePath(args[0] || state.env.HOME || '/home/learner', state);
    if (!isDirectory(state, target))
      return result(state, '', `bash: cd: ${args[0] || target}: No such file or directory\n`, 1);
    state.cwd = target;
    state.env.PWD = target;
    return result(state, '');
  }
  if (command === 'ls') {
    const targetArg = args.find((arg) => !arg.startsWith('-')) || '.';
    const target = resolvePath(targetArg, state);
    if (!Object.hasOwn(state.files, target))
      return result(state, '', `ls: cannot access '${targetArg}': No such file or directory\n`, 2);
    const childPaths = [...Object.keys(state.files), ...state.directories];
    const children = [
      ...new Set(
        childPaths
          .filter((path) => path.startsWith(`${target === '/' ? '' : target}/`))
          .map((path) => path.slice(target === '/' ? 1 : target.length + 1).split('/')[0]),
      ),
    ].sort();
    return result(state, `${children.join('  ')}${children.length ? '\n' : ''}`);
  }
  if (command === 'mkdir') {
    const paths = args.filter((arg) => !arg.startsWith('-'));
    if (!paths.length) return result(state, '', 'mkdir: missing operand\n', 1);
    for (const path of paths) {
      const resolved = resolvePath(path, state);
      if (!args.includes('-p') && !isDirectory(state, parentPath(resolved)))
        return result(
          state,
          '',
          `mkdir: cannot create directory '${path}': No such file or directory\n`,
          1,
        );
      const parents = args.includes('-p') ? directoryParents(resolved) : [];
      state.directories = [...new Set([...state.directories, ...parents, resolved])];
    }
    return result(state, '');
  }
  if (command === 'touch') {
    if (!args.length) return result(state, '', 'touch: missing file operand\n', 1);
    for (const path of args) state.files[resolvePath(path, state)] ??= '';
    return result(state, '');
  }
  if (command === 'echo' || command === 'printf') {
    const text = command === 'echo' ? `${args.join(' ')}\n` : printf(args.join(' '));
    if (redirect) {
      const path = resolvePath(redirect.path, state);
      if (!isDirectory(state, parentPath(path)))
        return result(state, '', `bash: ${redirect.path}: No such file or directory\n`, 1);
      state.files[path] = redirect.append ? (state.files[path] ?? '') + text : text;
      return result(state, '');
    }
    return result(state, text);
  }
  if (command === 'cat') {
    if (!args.length) return result(state, stdin);
    let output = '';
    for (const path of args) {
      const resolved = resolvePath(path, state);
      if (!Object.hasOwn(state.files, resolved) || isDirectory(state, resolved))
        return result(state, '', `cat: ${path}: No such file or directory\n`, 1);
      output += state.files[resolved];
    }
    return result(state, output);
  }
  if (command === 'sed') {
    const expression = args.find((arg) => /^s\/.*\//.test(arg));
    const file = args.find((arg) => arg !== expression && !arg.startsWith('-'));
    const source = file ? state.files[resolvePath(file, state)] : stdin;
    if (source === undefined)
      return result(state, '', `sed: ${file}: No such file or directory\n`, 2);
    const match = expression?.match(/^s\/(.*)\/(.*)\/([gim]*)$/);
    if (!match) return result(state, '', 'sed: supported form is s/old/new/g\n', 1);
    try {
      return result(
        state,
        source.replace(new RegExp(match[1]!, match[3]!.includes('g') ? 'g' : ''), match[2]!),
      );
    } catch {
      return result(state, '', 'sed: invalid regular expression\n', 1);
    }
  }
  if (command === 'awk') {
    const program = args.find((arg) => arg.includes('{print'));
    const file = args.find((arg) => arg !== program && !arg.startsWith('-'));
    const source = file ? state.files[resolvePath(file, state)] : stdin;
    if (source === undefined)
      return result(state, '', `awk: ${file}: No such file or directory\n`, 2);
    const field = Number(program?.match(/\$([0-9]+)/)?.[1] ?? 0);
    const delimiter = args.includes('-F') ? (args[args.indexOf('-F') + 1] ?? /\s+/) : /\s+/;
    return result(
      state,
      `${source
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => (field ? (line.split(delimiter)[field - 1] ?? '') : line))
        .join('\n')}\n`,
    );
  }
  if (command === 'jq') {
    const filter = args.find((arg) => arg.startsWith('.')) ?? '.';
    const file = args.find((arg) => arg !== filter && !arg.startsWith('-'));
    const source = file ? state.files[resolvePath(file, state)] : stdin;
    if (source === undefined)
      return result(state, '', `jq: ${file}: No such file or directory\n`, 2);
    try {
      let value: unknown = JSON.parse(source);
      for (const key of filter.replace(/^\./, '').split('.').filter(Boolean))
        value = (value as Record<string, unknown>)?.[key];
      return result(
        state,
        `${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`,
      );
    } catch {
      return result(state, 'parse error: Invalid JSON\n', '', 4);
    }
  }
  if (command === 'cp' || command === 'mv') {
    if (args.length < 2) return result(state, '', `${command}: missing file operand\n`, 1);
    const source = resolvePath(args[0]!, state);
    const destination = resolvePath(args[1]!, state);
    if (!Object.hasOwn(state.files, source) || isDirectory(state, source))
      return result(
        state,
        '',
        `${command}: cannot stat '${args[0]}': No such file or directory\n`,
        1,
      );
    if (!isDirectory(state, parentPath(destination)))
      return result(
        state,
        '',
        `${command}: cannot create '${args[1]}': No such file or directory\n`,
        1,
      );
    state.files[destination] = state.files[source]!;
    if (command === 'mv') delete state.files[source];
    return result(state, '');
  }
  if (command === 'rm') {
    const paths = args.filter((arg) => !arg.startsWith('-'));
    if (!paths.length) return result(state, '', 'rm: missing operand\n', 1);
    for (const path of paths) {
      const resolved = resolvePath(path, state);
      if (!Object.hasOwn(state.files, resolved))
        return result(state, '', `rm: cannot remove '${path}': No such file or directory\n`, 1);
      delete state.files[resolved];
    }
    return result(state, '');
  }
  if (command === 'grep') {
    const pattern = args.find((arg) => !arg.startsWith('-'));
    const file = args.find((arg) => !arg.startsWith('-') && arg !== pattern);
    const content = file ? state.files[resolvePath(file, state)] : stdin;
    if (content === undefined)
      return result(state, '', `grep: ${file}: No such file or directory\n`, 2);
    const lines = content
      .split(/\r?\n/)
      .filter((line) =>
        args.includes('-i')
          ? line.toLowerCase().includes((pattern ?? '').toLowerCase())
          : line.includes(pattern ?? ''),
      );
    return result(state, lines.length ? `${lines.join('\n')}\n` : '', '', lines.length ? 0 : 1);
  }
  if (['head', 'wc', 'cut', 'sort', 'uniq'].includes(command))
    return runTextCommand(command, args, stdin, state);
  if (command === 'date') return result(state, 'Thu Jan  1 00:00:00 UTC 1970\n');
  if (command === 'ps')
    return result(state, '    PID TTY          TIME CMD\n   1001 pts/0    00:00:00 bash\n');
  if (command === 'top')
    return result(
      state,
      'top - 00:00:01 up 1 day,  1 user,  load average: 0.00, 0.00, 0.00\nTasks:   1 total,   1 running\n  PID USER      %CPU %MEM COMMAND\n 1001 learner    0.0  0.1 bash\n',
    );
  if (command === 'lsof')
    return result(
      state,
      'COMMAND  PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nbash    1001 learner cwd  DIR  0,1      64      2 /workspace\n',
    );
  if (command === 'crontab')
    return result(
      state,
      args.includes('-l') ? 'no crontab for learner\n' : '',
      args.includes('-l') ? '' : 'crontab: changes are disabled in the practice shell\n',
      args.includes('-l') ? 0 : 1,
    );
  if (command === 'curl')
    return result(state, '', 'curl: network access is disabled in this practice shell\n', 7);
  if (command === 'sudo')
    return result(state, '', 'sudo: permission denied in the practice environment\n', 1);
  return result(state, '', `bash: ${command}: command not found\n`, 127);
}

function runTextCommand(
  command: string,
  args: string[],
  stdin: string,
  state: ShellState,
): ShellResult {
  const file = args.find((arg) => !arg.startsWith('-'));
  const content = file ? state.files[resolvePath(file, state)] : stdin;
  if (content === undefined)
    return result(state, '', `${command}: ${file}: No such file or directory\n`, 1);
  const lines = content
    .split(/\r?\n/)
    .filter((line, index, all) => index < all.length - 1 || line.length > 0);
  if (command === 'head')
    return result(
      state,
      `${lines.slice(0, Number(args.find((arg) => /^-\d+$/.test(arg))?.slice(1) || 10)).join('\n')}${lines.length ? '\n' : ''}`,
    );
  if (command === 'wc')
    return result(
      state,
      ` ${lines.length} ${content.split(/\s+/).filter(Boolean).length} ${new TextEncoder().encode(content).length}${file ? ` ${file}` : ''}\n`,
    );
  if (command === 'sort')
    return result(state, `${[...lines].sort().join('\n')}${lines.length ? '\n' : ''}`);
  if (command === 'uniq')
    return result(
      state,
      `${lines.filter((line, index) => index === 0 || line !== lines[index - 1]).join('\n')}${lines.length ? '\n' : ''}`,
    );
  const field =
    Number(
      args.find((arg) => arg.startsWith('-f'))?.slice(2) || args[args.indexOf('-f') + 1] || 1,
    ) - 1;
  const delimiterArg = args.find((arg) => arg.startsWith('-d'));
  const delimiter = delimiterArg
    ? delimiterArg.slice(2)
    : args.includes('-d')
      ? args[args.indexOf('-d') + 1] || '\t'
      : '\t';
  return result(
    state,
    `${lines.map((line) => line.split(delimiter)[field] ?? '').join('\n')}${lines.length ? '\n' : ''}`,
  );
}

function result(state: ShellState, stdout: string, stderr = '', exitCode = 0): ShellResult {
  return {
    state,
    stdout,
    stderr,
    exitCode,
    prompt: `learner@fde:${state.cwd === '/home/learner' ? '~' : state.cwd} $ `,
  };
}
function resolvePath(path: string, state: ShellState): string {
  const expanded = expand(path, state);
  const absolute = expanded.startsWith('/') ? expanded : `${state.cwd}/${expanded}`;
  const segments: string[] = [];
  for (const segment of absolute.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join('/')}`;
}
function normalizePath(path: string, cwd: string): string {
  return resolvePath(path, {
    cwd,
    env: { HOME: '/home/learner' },
    files: {},
    directories: [],
    history: [],
    lastStdout: '',
    lastExitCode: 0,
  });
}
function isDirectory(state: ShellState, path: string): boolean {
  return state.directories.includes(path);
}
function parentPath(path: string): string {
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}
function directoryParents(path: string): string[] {
  const parents: string[] = [];
  let current = parentPath(path);
  while (current !== '/') {
    parents.push(current);
    current = parentPath(current);
  }
  return parents;
}
function expand(value: string, state: ShellState): string {
  return value
    .replace(/^~(?=\/|$)/, state.env.HOME || '/home/learner')
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, key: string) => state.env[key] ?? '');
}
function splitOutsideQuotes(value: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote = '';
  for (const char of value) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) quote = quote ? '' : char;
    if (char === delimiter && !quote) {
      out.push(current);
      current = '';
    } else current += char;
  }
  out.push(current);
  return out;
}
function tokenize(value: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote = '';
  for (const char of value) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? '' : char;
      continue;
    }
    if (/\s/.test(char) && !quote) {
      if (current) out.push(current);
      current = '';
    } else current += char;
  }
  if (current) out.push(current);
  return out;
}
function unquote(value: string): string {
  return value.replace(/^(['"])(.*)\1$/, '$2');
}
function findRedirect(line: string): { index: number; path: string; append: boolean } | undefined {
  const match = /\s(>>?)\s*(\S+)\s*$/.exec(line);
  return match ? { index: match.index, path: match[2]!, append: match[1] === '>>' } : undefined;
}
function printf(value: string): string {
  return unquote(value).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}
