const PYODIDE_VERSION = 'v314.0.7';
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/pyodide.mjs`;

interface PyodideInstance {
  runPythonAsync(code: string): Promise<unknown>;
  loadPackage(name: string): Promise<void>;
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
  FS: { mkdirTree(path: string): void; writeFile(path: string, content: string): void; chdir(path: string): void };
}
interface PyodideModule { loadPyodide(): Promise<PyodideInstance> }
interface RunRequest { id: number; type: 'run'; files: Record<string, string>; command: string }

let pyodidePromise: Promise<PyodideInstance> | undefined;
let currentId = 0;
let stdout = '';
let stderr = '';

function send(message: Record<string, unknown>): void {
  self.postMessage(message);
}

async function getPyodide(): Promise<PyodideInstance> {
  if (!pyodidePromise) {
    send({ id: currentId, type: 'status', status: 'Downloading Python runtime (first run only)…' });
    pyodidePromise = import(/* @vite-ignore */ PYODIDE_URL).then((module) => (module as PyodideModule).loadPyodide());
  }
  return pyodidePromise;
}

function emit(stream: 'stdout' | 'stderr', text: string): void {
  if (stream === 'stdout') stdout += text;
  else stderr += text;
  send({ id: currentId, type: 'output', stream, text });
}

function normalizePath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((part) => part === '..' || part === '')) throw new Error(`Invalid workspace path: ${path}`);
  return `/home/pyodide/${normalized}`;
}

function commandParts(command: string): string[] {
  return command.match(/[^\s"']+|"[^"]*"|'[^']*'/g)?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? [];
}

self.addEventListener('message', async (event: MessageEvent<RunRequest>) => {
  const request = event.data;
  if (request.type !== 'run') return;
  currentId = request.id;
  stdout = '';
  stderr = '';
  try {
    const pyodide = await getPyodide();
    // Pyodide's batched callbacks omit the newline that ended each output line.
    // Reconstruct it so captured stdout matches normal Python process output.
    pyodide.setStdout({ batched: (text) => emit('stdout', `${text}\n`) });
    pyodide.setStderr({ batched: (text) => emit('stderr', `${text}\n`) });
    pyodide.FS.mkdirTree('/home/pyodide');
    pyodide.FS.chdir('/home/pyodide');
    for (const [name, content] of Object.entries(request.files)) {
      const path = normalizePath(name);
      pyodide.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
      pyodide.FS.writeFile(path, content);
    }

    const [executable, ...args] = commandParts(request.command || 'python main.py');
    let exitCode = 0;
    if (executable === 'python' || executable === 'python3') {
      const file = args[0] ?? 'main.py';
      const path = normalizePath(file);
      await pyodide.runPythonAsync(`import runpy\nrunpy.run_path(${JSON.stringify(path)}, run_name="__main__")`);
    } else if (executable === 'pytest') {
      await pyodide.loadPackage('pytest');
      const pythonArgs = JSON.stringify(args.length ? args : ['-q']);
      const result = await pyodide.runPythonAsync(`import pytest\npytest.main(${pythonArgs})`);
      exitCode = typeof result === 'number' ? result : 0;
    } else {
      throw new Error('This workspace supports `python file.py` and `pytest` commands.');
    }
    send({ id: currentId, type: 'result', result: { stdout, stderr, exitCode } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exitMatch = message.match(/SystemExit:\s*(\d+)/);
    const exitCode = exitMatch ? Number(exitMatch[1]) : 1;
    if (exitCode !== 0) emit('stderr', `${message}\n`);
    send({ id: currentId, type: 'result', result: { stdout, stderr, exitCode } });
  }
});
