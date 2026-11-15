import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** File name or path; the extension picks the syntax highlighting language. */
  path: string;
  ariaLabel: string;
  className?: string;
  spellCheck?: boolean;
  minHeight?: number;
}

// Monaco lives in its own lazily loaded chunk so it never bloats the main bundle.
const MonacoEditor = lazy(() => import('./CodeEditorMonaco'));

function FallbackTextarea({ value, onChange, ariaLabel, className, spellCheck }: CodeEditorProps) {
  return <textarea className={className} aria-label={ariaLabel} spellCheck={spellCheck ?? false} value={value} onChange={(event) => onChange(event.target.value)} />;
}

class MonacoBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function CodeEditor(props: CodeEditorProps) {
  // Monaco cannot run in jsdom, so unit tests stay on the textarea.
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { setEnabled(import.meta.env.MODE !== 'test'); }, []);
  const fallback = <FallbackTextarea {...props} />;
  if (!enabled) return fallback;
  return <MonacoBoundary fallback={fallback}><Suspense fallback={fallback}><MonacoEditor {...props} /></Suspense></MonacoBoundary>;
}
