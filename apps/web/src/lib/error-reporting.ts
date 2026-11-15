/**
 * Sends uncaught browser errors to the API's `POST /errors` (Workers logs).
 * Only the message, a trimmed stack and the URL path are sent — never query
 * strings, workspace contents or user details. At most 5 unique reports per page load.
 */
const MAX_REPORTS = 5;

export function installErrorReporting(apiUrl: string | undefined): void {
  if (!apiUrl || typeof window === 'undefined') return;
  const seen = new Set<string>();

  const send = (kind: 'error' | 'unhandledrejection', message: string, stack?: string) => {
    const key = `${kind}:${message}`;
    if (seen.size >= MAX_REPORTS || seen.has(key)) return;
    seen.add(key);
    const body = JSON.stringify({
      kind,
      message: message.slice(0, 500) || 'Unknown error',
      ...(stack ? { stack: stack.slice(0, 4000) } : {}),
      path: window.location.pathname.slice(0, 300),
    });
    try {
      const blob = new Blob([body], { type: 'text/plain' });
      if (!navigator.sendBeacon(`${apiUrl}/errors`, blob)) {
        void fetch(`${apiUrl}/errors`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => undefined);
      }
    } catch { /* never let reporting throw */ }
  };

  window.addEventListener('error', (event) => {
    const error = event.error as unknown;
    send('error', event.message, error instanceof Error ? error.stack : undefined);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as unknown;
    send('unhandledrejection', reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined);
  });
}
