import type { Check } from '@fde/content-schema';
import type { MockHttpExchange } from './http-simulator';

export interface HttpCheckResult {
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export function gradeHttpLevel(checks: Check[], history: MockHttpExchange[]): HttpCheckResult[] {
  return checks.map((check) => {
    const action = String(check.action ?? 'request_exists');
    const path = String(check.path ?? '');
    const matching = history.filter((exchange) => new URL(exchange.request.path, 'https://api.fde.test').pathname === path);
    let actual = '';
    let expected = '';
    let passed = false;

    if (action === 'pages_seen') {
      const expectedPages = Array.isArray(check.pages) ? check.pages.map(Number) : [];
      const pages = matching.map((exchange) => Number(new URL(exchange.request.path, 'https://api.fde.test').searchParams.get('page')));
      actual = [...new Set(pages)].sort((a, b) => a - b).join(', ');
      expected = expectedPages.join(', ');
      passed = expectedPages.every((page) => pages.includes(page));
    } else if (action === 'statuses_include') {
      const expectedStatuses = Array.isArray(check.statuses) ? check.statuses.map(Number) : [];
      const statuses = matching.map((exchange) => exchange.response.status);
      actual = statuses.join(', ') || 'no requests';
      expected = expectedStatuses.join(', ');
      passed = expectedStatuses.every((status) => statuses.includes(status));
    } else {
      const status = Number(check.status ?? 0);
      const match = matching.find((exchange) => exchange.request.method === String(check.method ?? 'GET').toUpperCase() && exchange.response.status === status);
      actual = matching.map((exchange) => `${exchange.request.method} ${exchange.request.path} → ${exchange.response.status}`).join('; ') || 'no matching requests';
      expected = `${String(check.method ?? 'GET').toUpperCase()} ${path} → ${status}`;
      passed = Boolean(match);
      if (match && check.body_contains) {
        const body = JSON.stringify(match.response.body);
        expected += ` containing ${String(check.body_contains)}`;
        actual = body;
        passed = body.includes(String(check.body_contains));
      }
    }

    return { label: String(check.label ?? 'HTTP behavior'), passed, expected, actual };
  });
}
