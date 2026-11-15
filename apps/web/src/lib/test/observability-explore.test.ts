import { it } from 'vitest';
import { generateScenario, SCENARIO_KINDS, runObservabilityQuery, createObservabilityState, evaluateAlert } from '../observability';
it('explore', () => {
  for (const kind of SCENARIO_KINDS) {
    const t0 = Date.now();
    const t = generateScenario(kind, 7);
    console.log(kind, Date.now() - t0, 'ms logs', t.logs.length, 'spans', t.spans.length, JSON.stringify(t.facts));
    const s = createObservabilityState({ scenario: kind, seed: 7 });
    for (const [k, q] of [
      ['logs', 'service:payments level:error | count by status'],
      ['metrics', 'sum(rate(http_requests_total{service="payments",status=~"5.."}[5m])) / sum(rate(http_requests_total{service="payments"}[5m]))'],
      ['metrics', 'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service="invoices"}[5m])))'],
      ['traces', 'slowest 3'],
    ] as const) console.log(runObservabilityQuery(s, k, q).result.text.slice(0, 600));
    for (const rule of ['expr: sum(rate(http_requests_total{service="payments",status=~"5.."}[5m])) / sum(rate(http_requests_total{service="payments"}[5m])) > 0.05\nfor: 5m', 'expr: sum(rate(http_requests_total{service="payments",status=~"5.."}[1m])) / sum(rate(http_requests_total{service="payments"}[1m])) > 0.01\nfor: 0m']) {
      const e = evaluateAlert(t, rule); console.log(e.valid, e.error, JSON.stringify(e.episodes), e.falsePositives, e.firesDuringIncident, e.detectionDelay);
    }
  }
});
