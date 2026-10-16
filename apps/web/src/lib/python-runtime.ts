export interface PythonRunResult { stdout: string; stderr: string; exitCode: number }
export interface PythonRuntime {
  run(files: Record<string, string>, command: string): Promise<PythonRunResult>;
  terminate(): void;
}

type WorkerMessage =
  | { id: number; type: 'run'; files: Record<string, string>; command: string }
  | { id: number; type: 'output'; stream: 'stdout' | 'stderr'; text: string }
  | { id: number; type: 'status'; status: string }
  | { id: number; type: 'result'; result: PythonRunResult }
  | { id: number; type: 'error'; message: string };

export function createPythonRuntime(onOutput: (stream: 'stdout' | 'stderr', text: string) => void, onStatus: (status: string) => void): PythonRuntime {
  const worker = new Worker(new URL('../workers/python.worker.ts', import.meta.url), { type: 'module' });
  let nextId = 0;
  const pending = new Map<number, { resolve: (result: PythonRunResult) => void; reject: (error: Error) => void }>();
  worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;
    if (message.type === 'status') { onStatus(message.status); return; }
    if (message.type === 'output') { onOutput(message.stream, message.text); return; }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.type === 'result') request.resolve(message.result);
    if (message.type === 'error') request.reject(new Error(message.message));
  });
  worker.addEventListener('error', (event) => {
    for (const request of pending.values()) request.reject(new Error(event.message || 'Python worker failed.'));
    pending.clear();
  });

  return {
    run(files, command) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, type: 'run', files, command });
      });
    },
    terminate() {
      worker.terminate();
      for (const request of pending.values()) request.reject(new Error('Python worker was stopped.'));
      pending.clear();
    },
  };
}
