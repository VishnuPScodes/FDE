/**
 * Helpers for turning loosely-typed check fields (typed `unknown` by the content
 * schema) into strings. They intentionally match `String(value)` exactly so the
 * graders keep their existing behaviour for every value, including arrays.
 */

/** Exactly `String(value)`, typed for `unknown` inputs. */
export function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value === null || value === undefined || typeof value === 'symbol') return String(value);
  // Content fields may legitimately be arrays/objects; keep the native coercion (e.g. "a,b").
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- intentional: preserve String() semantics for structured values
  return String(value);
}

/** Exactly `String(value ?? fallback)`. */
export function checkText(value: unknown, fallback = ''): string {
  return toText(value ?? fallback);
}
