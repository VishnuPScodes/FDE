/** Stringify an unknown value without producing "[object Object]" for objects. */
export function plainString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'function') return '[function]';
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- only primitives (number, boolean, bigint, symbol) reach here
  return String(value);
}
