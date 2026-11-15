import { useCallback, useRef, type KeyboardEvent } from 'react';
import { completeLine, stepHistory } from '../lib/terminal-input';

interface Options {
  value: string;
  setValue: (value: string) => void;
  /** Known command phrases for Tab completion. */
  phrases: readonly string[];
  /** File names offered when completing arguments. */
  files?: readonly string[];
  /** Previously run commands (oldest first). */
  history: readonly string[];
}

/**
 * Shared terminal-input behaviour: ArrowUp/ArrowDown walk command history, Tab completes the
 * current token (and never moves focus out of the input). Call `reset()` after a command runs.
 */
export function useTerminalInput({ value, setValue, phrases, files, history }: Options) {
  const index = useRef(-1);
  const draft = useRef('');

  const reset = useCallback(() => { index.current = -1; draft.current = ''; }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (index.current === -1) draft.current = value;
      const step = stepHistory([...history], index.current, event.key === 'ArrowUp' ? 'up' : 'down');
      index.current = step.index;
      setValue(step.line ?? draft.current);
    } else if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      const { value: next } = completeLine(value, phrases, files);
      if (next !== value) setValue(next);
    }
  };

  return { onKeyDown, reset };
}
