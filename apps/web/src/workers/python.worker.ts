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

    const usesFastApi = Object.values(request.files).some((content) => /(?:from|import)\s+(?:fastapi|starlette|httpx)\b/.test(content));
    if (usesFastApi) {
      send({ id: currentId, type: 'status', status: 'Loading FastAPI, HTTPX, and their Pyodide packages…' });
      await pyodide.loadPackage('fastapi');
      await pyodide.loadPackage('httpx');
    }

    const [executable, ...args] = commandParts(request.command || 'python main.py');
    let exitCode = 0;
    if (executable === 'python' || executable === 'python3') {
      const file = args[0] ?? 'main.py';
      const path = normalizePath(file);
      await pyodide.runPythonAsync(`import runpy\nrunpy.run_path(${JSON.stringify(path)}, run_name="__main__")`);
    } else if (executable === 'pytest') {
      const usesAsyncApiTests = Object.values(request.files).some((content) => /pytest\.mark\.asyncio|pytest_asyncio/.test(content));
      await pyodide.loadPackage('pytest');
      if (usesAsyncApiTests) {
        // pytest-asyncio starts threads to manage event loops, which Pyodide
        // cannot do. Pyodide provides asyncio through runPythonAsync instead,
        // so invoke the marked async test functions on its browser event loop.
        const testFiles = JSON.stringify(args.filter((arg) => !arg.startsWith('-') && arg.endsWith('.py')));
        const asyncTestRunner = `
import asyncio, glob, importlib, inspect, os, traceback
import pytest
_fde_test_files = ${testFiles}
if not _fde_test_files:
    _fde_test_files = glob.glob('test_*.py')
async def _fde_run_tests():
    _fde_passed = 0
    _fde_failed = 0
    for _fde_file in _fde_test_files:
        _fde_module = importlib.import_module(os.path.splitext(os.path.basename(_fde_file))[0])
        for _fde_name in sorted(name for name in vars(_fde_module) if name.startswith('test_')):
            _fde_test = getattr(_fde_module, _fde_name)
            if not callable(_fde_test):
                continue
            try:
                _fde_result = _fde_test()
                if inspect.isawaitable(_fde_result):
                    await _fde_result
                print(f'{_fde_file}::{_fde_name} PASSED')
                _fde_passed += 1
            except Exception:
                traceback.print_exc()
                print(f'{_fde_file}::{_fde_name} FAILED')
                _fde_failed += 1
    print(f'{_fde_passed} passed, {_fde_failed} failed')
    return 0 if _fde_failed == 0 and _fde_passed > 0 else 1
await _fde_run_tests()
`;
        const result = await pyodide.runPythonAsync(asyncTestRunner);
        exitCode = typeof result === 'number' ? result : 0;
      } else {
        const pythonArgs = JSON.stringify(args.length ? args : ['-q']);
        const result = await pyodide.runPythonAsync(`import os\nos.environ['PYTEST_DISABLE_PLUGIN_AUTOLOAD'] = '1'\nimport pytest\npytest.main(${pythonArgs})`);
        exitCode = typeof result === 'number' ? result : 0;
      }
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
