import type { Check } from '@fde/content-schema';
import type { SqlQueryResult } from './sql-runtime';

export interface SqlCheckResult {
  kind: string;
  label: string;
  passed: boolean;
  actual: string;
  expected: string;
}

export async function gradeSqlLevel(
  checks: Check[],
  query: string,
  run: (sql: string) => Promise<SqlQueryResult>,
): Promise<SqlCheckResult[]> {
  const results: SqlCheckResult[] = [];
  for (const check of checks) {
    const sql = typeof check.query === 'string' ? check.query : typeof check.run === 'string' ? check.run : query;
    const result = await run(sql);
    const kind = check.kind;
    const label = typeof check.label === 'string' ? check.label : kind.replaceAll('_', ' ');
    const expected = check.expected === undefined ? '' : JSON.stringify(check.expected);
    let actual = JSON.stringify(result.rows);
    let passed = false;

    if (kind === 'sql_result_equals') {
      const expectedRows = Array.isArray(check.expected) ? check.expected : [];
      const expectedNormalized = expectedRows.map(stableValue);
      const actualNormalized = result.rows.map(stableValue);
      if (check.order_sensitive === true || check.ordered === true) {
        passed = JSON.stringify(actualNormalized) === JSON.stringify(expectedNormalized);
      } else {
        passed = JSON.stringify([...actualNormalized].sort()) === JSON.stringify([...expectedNormalized].sort());
      }
      actual = JSON.stringify(result.rows, null, 2);
    } else if (kind === 'sql_plan_uses_index') {
      const plan = result.rows.map((row) => Object.values(row).join(' ')).join('\n');
      const indexName = String(check.index ?? check.expected ?? '').trim();
      actual = plan;
      passed = /\bindex\s+(scan|only scan)\b/i.test(plan) && (!indexName || plan.toLowerCase().includes(indexName.toLowerCase()));
    }
    results.push({ kind, label, passed, actual, expected });
  }
  return results;
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
