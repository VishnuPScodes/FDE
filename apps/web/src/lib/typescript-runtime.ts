export interface CompileResult { ok: boolean; code?: string; error?: string }
interface WorkerMessage { id: number; type: 'compiled' | 'compile-error'; code?: string; error?: string }
interface PendingCompile { resolve: (result: CompileResult) => void }

export interface TypeScriptCompiler {
  compile(code: string, loader: 'ts' | 'tsx' | 'js' | 'jsx'): Promise<CompileResult>;
  terminate(): void;
}

export function createTypeScriptCompiler(): TypeScriptCompiler {
  const worker = new Worker(new URL('../workers/typescript.worker.ts', import.meta.url), { type: 'module' });
  let nextId = 0;
  const pending = new Map<number, PendingCompile>();
  worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    task.resolve(message.type === 'compiled'
      ? { ok: true, code: message.code ?? '' }
      : { ok: false, error: message.error ?? 'TypeScript compilation failed.' });
  });
  worker.addEventListener('error', (event) => {
    for (const task of pending.values()) task.resolve({ ok: false, error: event.message || 'The compiler worker failed.' });
    pending.clear();
  });
  return {
    compile(code, loader) {
      const id = ++nextId;
      return new Promise((resolve) => {
        pending.set(id, { resolve });
        worker.postMessage({ id, type: 'compile', code, loader });
      });
    },
    terminate() {
      worker.terminate();
      for (const task of pending.values()) task.resolve({ ok: false, error: 'The compiler worker was stopped.' });
      pending.clear();
    },
  };
}
