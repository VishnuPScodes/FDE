import type { Check } from '@fde/content-schema';
import { estimateTokens } from './ai/estimate';
import type { WorkspaceFiles } from './virtual-files';
import { plainString } from './plain-string';

/**
 * Deterministic grader for `ai` environment levels. It checks the learner's
 * prompt/config files only, so grading never needs an API key or a network.
 *
 * Supported checks:
 * - file_exists   { path }
 * - file_contains { path, expected, is_regex?, ignore_case? }
 * - json_equals   { path, expected, pointer?, strict? }  (key-subset match unless strict)
 * - sim_state     { simulator: prompt, file, path, op?, expected? }
 *     path is a dotted path into the parsed JSON file. `$tokens` is the
 *     estimated token count of the value at the path (or the whole file).
 *     op: eq (default) | lte | gte | lt | gt | includes | matches | length_gte | length_lte | exists | valid_json_schema
 */
export interface AiCheckResult { kind: string; label: string; passed: boolean; actual: string; expected: string }

export function getPath(value: unknown, path: string): unknown {
  if (!path) return value;
  let current: unknown = value;
  for (const part of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (part === '$tokens') return estimateTokens(typeof current === 'string' ? current : JSON.stringify(current));
    if (part === 'length' && (Array.isArray(current) || typeof current === 'string')) { current = current.length; continue; }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Key-subset deep match (arrays compared item by item). */
export function deepMatch(actual: unknown, expected: unknown, strict = false): boolean {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((item, index) => deepMatch(actual[index], item, strict));
  }
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
  const actualRecord = actual as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  if (strict && Object.keys(actualRecord).length !== Object.keys(expectedRecord).length) return false;
  return Object.entries(expectedRecord).every(([key, value]) => deepMatch(actualRecord[key], value, strict));
}

const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

/** Small structural check for a JSON Schema used for structured output. */
export function validateJsonSchema(schema: unknown, at = '$'): string[] {
  const problems: string[] = [];
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [`${at} must be an object`];
  const record = schema as Record<string, unknown>;
  const type = record.type;
  const types = Array.isArray(type) ? type : [type];
  if (type === undefined && !record.enum && !record.anyOf) problems.push(`${at} needs a "type"`);
  for (const item of types) if (item !== undefined && !SCHEMA_TYPES.has(String(item))) problems.push(`${at}.type "${String(item)}" is not a JSON Schema type`);
  if (types.includes('object')) {
    const properties = record.properties;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) problems.push(`${at}.properties must be an object`);
    else for (const [key, child] of Object.entries(properties)) problems.push(...validateJsonSchema(child, `${at}.properties.${key}`));
    if (record.required !== undefined) {
      if (!Array.isArray(record.required)) problems.push(`${at}.required must be an array`);
      else for (const key of record.required) if (!properties || typeof properties !== 'object' || !Object.hasOwn(properties, String(key))) problems.push(`${at}.required lists "${String(key)}" but it is not in properties`);
    }
  }
  if (types.includes('array') && record.items !== undefined) problems.push(...validateJsonSchema(record.items, `${at}.items`));
  return problems;
}

function show(value: unknown): string {
  if (value === undefined) return '(missing)';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parseJsonFile(files: WorkspaceFiles, path: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const text = files[path];
  if (text === undefined) return { ok: false, error: `${path} not found` };
  try { return { ok: true, value: JSON.parse(text) as unknown }; }
  catch (error) { return { ok: false, error: `${path} is not valid JSON: ${error instanceof Error ? error.message : 'parse error'}` }; }
}

function compare(op: string, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    case 'lte': return typeof actual === 'number' && actual <= Number(expected);
    case 'gte': return typeof actual === 'number' && actual >= Number(expected);
    case 'lt': return typeof actual === 'number' && actual < Number(expected);
    case 'gt': return typeof actual === 'number' && actual > Number(expected);
    case 'length_gte': return (Array.isArray(actual) || typeof actual === 'string') && actual.length >= Number(expected);
    case 'length_lte': return (Array.isArray(actual) || typeof actual === 'string') && actual.length <= Number(expected);
    case 'includes':
      if (Array.isArray(actual)) return actual.some((item) => deepMatch(item, expected));
      return typeof actual === 'string' && actual.toLowerCase().includes(String(expected).toLowerCase());
    case 'matches':
      try { return typeof actual === 'string' && new RegExp(String(expected), 'i').test(actual); } catch { return false; }
    case 'valid_json_schema': return validateJsonSchema(actual).length === 0;
    default: return deepMatch(actual, expected);
  }
}

export function gradeAiLevel(checks: Check[], files: WorkspaceFiles): AiCheckResult[] {
  return checks.map((check) => {
    const kind = check.kind;
    const label = typeof check.label === 'string' ? check.label : kind.replaceAll('_', ' ');
    const path = plainString(check.path ?? check.file ?? '');
    if (kind === 'file_exists') {
      const exists = Object.hasOwn(files, path);
      return { kind, label, passed: exists, actual: exists ? 'exists' : 'missing', expected: path };
    }
    if (kind === 'file_contains') {
      const text = files[path] ?? '';
      const needle = plainString(check.expected ?? '');
      let passed: boolean;
      if (check.is_regex) {
        try { passed = new RegExp(needle, check.ignore_case ? 'i' : '').test(text); } catch { passed = false; }
      } else passed = check.ignore_case ? text.toLowerCase().includes(needle.toLowerCase()) : text.includes(needle);
      return { kind, label, passed, actual: passed ? 'found' : `not found in ${path}`, expected: needle };
    }
    if (kind === 'json_equals') {
      const parsed = parseJsonFile(files, path);
      if (!parsed.ok) return { kind, label, passed: false, actual: parsed.error, expected: show(check.expected) };
      const actual = getPath(parsed.value, plainString(check.pointer ?? ''));
      return { kind, label, passed: deepMatch(actual, check.expected, Boolean(check.strict)), actual: show(actual), expected: show(check.expected) };
    }
    if (kind === 'sim_state') {
      const file = plainString(check.file ?? 'prompt.json');
      const parsed = parseJsonFile(files, file);
      const op = plainString(check.op ?? 'eq');
      const expectedText = op === 'eq' ? show(check.expected) : `${op} ${op === 'exists' || op === 'valid_json_schema' ? '' : show(check.expected)}`.trim();
      if (!parsed.ok) return { kind, label, passed: false, actual: parsed.error, expected: expectedText };
      const actual = getPath(parsed.value, plainString(check.path ?? ''));
      const passed = compare(op, actual, check.expected);
      const actualText = op === 'valid_json_schema' && !passed ? validateJsonSchema(actual).join('; ') || show(actual) : show(actual);
      return { kind, label, passed, actual: actualText, expected: expectedText };
    }
    return { kind, label, passed: false, actual: `Unsupported check in the AI workspace: ${kind}`, expected: '' };
  });
}
