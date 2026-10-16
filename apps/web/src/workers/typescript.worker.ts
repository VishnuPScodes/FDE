import * as esbuild from 'esbuild-wasm';
import wasmUrl from 'esbuild-wasm/esbuild.wasm?url';

interface CompileRequest { id: number; type: 'compile'; code: string; loader: 'ts' | 'tsx' | 'js' | 'jsx' }
let initialized: Promise<void> | undefined;

self.addEventListener('message', async (event: MessageEvent<CompileRequest>) => {
  const request = event.data;
  if (request.type !== 'compile') return;
  try {
    initialized ??= esbuild.initialize({ wasmURL: wasmUrl, worker: false });
    await initialized;
    const result = await esbuild.transform(request.code, {
      loader: request.loader,
      target: 'es2022',
      format: 'iife',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      legalComments: 'none',
      sourcefile: request.loader === 'tsx' || request.loader === 'jsx' ? 'main.tsx' : 'main.ts',
    });
    self.postMessage({ id: request.id, type: 'compiled', code: result.code });
  } catch (error) {
    self.postMessage({ id: request.id, type: 'compile-error', error: error instanceof Error ? error.message : String(error) });
  }
});
