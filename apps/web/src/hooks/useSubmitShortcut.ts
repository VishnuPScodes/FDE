import { useEffect, useRef } from 'react';

/** True for Ctrl/Cmd+Enter (the level submit shortcut). */
export function isSubmitShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
}

/** Title / aria-keyshortcuts text for Submit buttons. */
export const SUBMIT_SHORTCUT_TITLE = 'Submit (Ctrl/Cmd+Enter)';
export const SUBMIT_SHORTCUT_ARIA = 'Control+Enter Meta+Enter';
/** Spread onto a Submit button. */
export const submitButtonProps = { title: SUBMIT_SHORTCUT_TITLE, 'aria-keyshortcuts': SUBMIT_SHORTCUT_ARIA } as const;

/**
 * Runs `onSubmit` on Ctrl/Cmd+Enter anywhere in the page (including inside
 * Monaco and terminal inputs). Ignored while `enabled` is false or while a
 * previous async submission is still running.
 */
export function useSubmitShortcut(onSubmit: () => unknown, enabled = true): void {
  const handler = useRef(onSubmit);
  handler.current = onSubmit;
  const running = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (!isSubmitShortcut(event) || event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      if (running.current) return;
      const result = handler.current();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        running.current = true;
        void (result as Promise<unknown>).then(
          () => { running.current = false; },
          () => { running.current = false; },
        );
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}
