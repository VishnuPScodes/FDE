import { useEffect, useRef } from 'react';
import * as monaco from '../../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
import '../../node_modules/monaco-editor/esm/vs/basic-languages/monaco.contribution.js';
import EditorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import type { CodeEditorProps } from './CodeEditor';

type MonacoGlobal = typeof globalThis & { MonacoEnvironment?: { getWorker: () => Worker } };
const env = self as MonacoGlobal;
env.MonacoEnvironment ??= { getWorker: () => new EditorWorker() };

export function languageFor(path: string): string {
  const name = path.split('/').pop()?.toLowerCase() ?? '';
  if (name === 'dockerfile' || name.startsWith('dockerfile.') || name.endsWith('.dockerfile')) return 'dockerfile';
  if (/\.ya?ml$/.test(name)) return 'yaml';
  if (/\.(tf|tfvars|hcl)$/.test(name)) return 'hcl';
  if (/\.(md|markdown)$/.test(name)) return 'markdown';
  if (name.endsWith('.json')) return 'json';
  if (/\.(sh|bash)$/.test(name)) return 'shell';
  if (name.endsWith('.py')) return 'python';
  return 'plaintext';
}

const currentTheme = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'vs' : 'vs-dark');

export default function CodeEditorMonaco({ value, onChange, path, ariaLabel, className, minHeight = 256 }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    if (!host.current) return;
    const editor = monaco.editor.create(host.current, {
      value: valueRef.current, language: languageFor(path), theme: currentTheme(), automaticLayout: true,
      minimap: { enabled: false }, fontSize: 14, tabSize: 2, scrollBeyondLastLine: false, ariaLabel,
      wordWrap: languageFor(path) === 'markdown' ? 'on' : 'off',
    });
    editorRef.current = editor;
    const sub = editor.onDidChangeModelContent(() => {
      const next = editor.getValue();
      if (next !== valueRef.current) onChangeRef.current(next);
    });
    const observer = new MutationObserver(() => monaco.editor.setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { observer.disconnect(); sub.dispose(); editor.dispose(); editorRef.current = null; };
  }, [path, ariaLabel]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) editor.setValue(value);
  }, [value]);

  return <div ref={host} className={className} style={{ minHeight, height: minHeight, width: '100%', resize: 'vertical', overflow: 'hidden' }} />;
}
