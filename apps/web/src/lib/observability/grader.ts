import type { Check } from '@fde/content-schema';
import type { SubmissionCheckResult } from '../../hooks/useLevelSubmission';
import { evaluateAlert } from './alerts';
import { telemetryFor, type ObservabilityState } from './runtime';
import { ROOT_CAUSE_OPTIONS } from './types';

/**
 * Grades an observability level.
 *
 * sim_command_used  { command: "traces> trace" }  or  { pattern: "^metrics> .*histogram_quantile" }
 * sim_state paths:
 *   history                       all queries run, one per line
 *   report.root_cause | report.service | report.evidence
 *   answer:<key>                  a value typed into the report form (checks with `prompt` render inputs)
 *   alert:valid | alert:fires_during_incident | alert:false_positives | alert:episodes | alert:detection_delay | alert:for_minutes | alert:expr
 *   __stdout__ | __stderr__       output of the last query
 * comparisons: expected, expected_fact (hidden scenario fact), any_of, contains, pattern, min, max, tolerance (relative)
 */

function readString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** "1.5 rps", "43.2 minutes", "12%", "1,200 ms" → number. */
export function parseLooseNumber(value: string): number | undefined {
  const cleaned = value.replace(/,/g, '').trim();
  const match = /^[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i.exec(cleaned);
  if (!match) return undefined;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : undefined;
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function defaultLabel(path: string): string {
  if (path === 'report.root_cause') return 'Root cause identified';
  if (path === 'report.service') return 'Affected service identified';
  if (path === 'report.evidence') return 'Evidence cites telemetry';
  if (path.startsWith('answer:')) return 'Answer: ' + path.slice('answer:'.length).replaceAll('_', ' ');
  if (path.startsWith('alert:')) return 'Alert rule: ' + path.slice('alert:'.length).replaceAll('_', ' ');
  return path;
}

export function gradeObservabilityLevel(checks: Check[], state: ObservabilityState): SubmissionCheckResult[] {
  const telemetry = telemetryFor(state);
  let alert: ReturnType<typeof evaluateAlert> | undefined;
  const alertResult = () => (alert ??= evaluateAlert(telemetry, state.alertRule));

  return checks.map((check): SubmissionCheckResult => {
    const kind = check.kind;
    const path = readString(check.path);
    const label = typeof check.label === 'string' ? check.label : kind === 'sim_command_used' ? 'Used the right kind of query' : defaultLabel(path);
    const feedback = typeof check.feedback === 'string' ? check.feedback : undefined;
    const result = (passed: boolean, actual: string, expected: string): SubmissionCheckResult => (feedback ? { kind, label, passed, actual, expected, feedback } : { kind, label, passed, actual, expected });

    if (kind === 'sim_command_used') {
      const command = readString(check.command).trim().toLowerCase();
      const pattern = readString(check.pattern);
      let regex: RegExp | null = null;
      if (pattern) { try { regex = new RegExp(pattern, 'i'); } catch { regex = null; } }
      const passed = state.history.some((line) => (command ? line.trim().toLowerCase().startsWith(command) : false) || (regex ? regex.test(line) : false));
      return result(passed, state.history.slice(-5).join('\n') || 'No queries run yet', command || pattern);
    }
    if (kind !== 'sim_state') return result(false, 'Unsupported check: ' + kind, 'sim_state or sim_command_used');

    let actual = '';
    let numericActual: number | undefined;
    if (path === 'history') actual = state.history.join('\n');
    else if (path === 'report.root_cause') actual = state.report.rootCause;
    else if (path === 'report.service') actual = state.report.service;
    else if (path === 'report.evidence') actual = state.report.evidence;
    else if (path.startsWith('answer:')) actual = state.answers[path.slice('answer:'.length)] ?? '';
    else if (path === '__stdout__') actual = state.lastOutput;
    else if (path === '__stderr__') actual = state.lastError;
    else if (path.startsWith('alert:')) {
      const evaluation = alertResult();
      const field = path.slice('alert:'.length);
      if (field === 'valid') actual = evaluation.valid ? 'true' : 'false: ' + evaluation.error;
      else if (field === 'fires_during_incident') actual = String(evaluation.firesDuringIncident);
      else if (field === 'false_positives') { numericActual = evaluation.falsePositives; actual = String(numericActual); }
      else if (field === 'episodes') { numericActual = evaluation.episodes.length; actual = String(numericActual); }
      else if (field === 'detection_delay') { numericActual = evaluation.detectionDelay; actual = String(numericActual); }
      else if (field === 'for_minutes') { numericActual = evaluation.rule?.forMinutes ?? -1; actual = String(numericActual); }
      else if (field === 'expr') actual = evaluation.rule?.expr ?? '';
      if (!evaluation.valid && field !== 'valid') actual = 'rule is not valid: ' + evaluation.error;
    } else return result(false, 'Unknown path ' + path, 'a supported observability path');

    const display = path === 'report.root_cause' ? ROOT_CAUSE_OPTIONS.find((option) => option.id === actual)?.label ?? actual : actual;

    if (Array.isArray(check.any_of)) {
      const options = check.any_of.map(readString);
      return result(options.some((option) => normalise(option) === normalise(actual)), display, options.join(' or '));
    }

    let expectedValue: unknown = check.expected;
    if (typeof check.expected_fact === 'string') {
      expectedValue = telemetry.facts[check.expected_fact];
      if (expectedValue === undefined) return result(false, display, 'scenario fact ' + check.expected_fact + ' (missing)');
    }
    const tolerance = readNumber(check.tolerance);
    const min = readNumber(check.min);
    const max = readNumber(check.max);

    if (min !== undefined || max !== undefined) {
      const value = numericActual ?? parseLooseNumber(actual);
      const expected = (min !== undefined ? '≥ ' + String(min) : '') + (min !== undefined && max !== undefined ? ' and ' : '') + (max !== undefined ? '≤ ' + String(max) : '');
      const passed = value !== undefined && (min === undefined || value >= min) && (max === undefined || value <= max);
      return result(passed, display || '(empty)', expected);
    }
    if (expectedValue !== undefined) {
      const expectedText = readString(expectedValue);
      const expectedNumber = readNumber(expectedValue);
      if (expectedNumber !== undefined && (tolerance !== undefined || typeof expectedValue === 'number')) {
        const value = numericActual ?? parseLooseNumber(actual);
        const allowed = Math.abs(expectedNumber) * (tolerance ?? 0) + 1e-9;
        const passed = value !== undefined && Math.abs(value - expectedNumber) <= allowed;
        // Hidden facts are never echoed back in full: show the tolerance, not the answer.
        const expected = check.expected_fact ? 'the value shown by the telemetry' + (tolerance ? ' (±' + String(Math.round(tolerance * 100)) + '%)' : '') : expectedText + (tolerance ? ' (±' + String(Math.round(tolerance * 100)) + '%)' : '');
        return result(passed, display || '(empty)', expected);
      }
      const passed = normalise(actual) === normalise(expectedText);
      const expected = check.expected_fact ? 'the value shown by the telemetry' : path === 'report.root_cause' ? 'the root cause supported by the telemetry' : expectedText;
      return result(passed, display || '(empty)', expected);
    }
    const contains = readString(check.contains);
    if (contains) return result(normalise(actual).includes(normalise(contains)), display || '(empty)', 'contains "' + contains + '"');
    const pattern = readString(check.pattern);
    if (pattern) {
      let passed = false;
      try { passed = new RegExp(pattern, 'i').test(actual); } catch { passed = false; }
      return result(passed, display || '(empty)', 'matches /' + pattern + '/');
    }
    return result(actual.trim().length > 0, display || '(empty)', 'a non-empty value');
  });
}
