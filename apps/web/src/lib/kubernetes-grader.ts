import type { Check } from '@fde/content-schema';
import type { SubmissionCheckResult } from '../hooks/useLevelSubmission';
import { podView, reconcile, serviceEndpoints, settle } from './kubernetes/controller';
import { curlRequest } from './kubernetes/kubectl';
import type { KubeKind, KubeObject, KubeState } from './kubernetes/types';
import { clone, decodeBase64, matchesTerms, parseSelector } from './kubernetes/util';

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

/** A copy of the cluster after pods have had time to start, so grading never depends on how many commands were typed. */
export function settledCopy(state: KubeState): KubeState {
  const copy = clone(state);
  reconcile(copy);
  settle(copy);
  return copy;
}

function summary(state: KubeState, o: KubeObject): string {
  const base: Record<string, unknown> = { kind: o.kind, name: o.meta.name, namespace: o.meta.namespace, labels: o.meta.labels };
  if ('spec' in o) Object.assign(base, { spec: o.spec });
  if (o.kind === 'ConfigMap') base.data = o.data;
  if (o.kind === 'Secret') base.data = Object.fromEntries(Object.entries(o.data).map(([k, v]) => { const d = decodeBase64(v); return [k, d.ok ? d.value : v]; }));
  if (o.kind === 'Deployment') {
    const pods = state.objects.filter((p) => p.kind === 'Pod' && p.meta.namespace === o.meta.namespace && p.meta.labels['pod-template-hash'] !== undefined && Object.entries(o.spec.selector.matchLabels).every(([k, v]) => p.meta.labels[k] === v));
    base.replicas = o.spec.replicas;
    base.ready = pods.filter((p) => p.kind === 'Pod' && podView(p).ready).length;
    base.image = o.spec.template.spec.containers[0]?.image;
  }
  if (o.kind === 'Service') { base.endpoints = serviceEndpoints(state, o).ready.length; base.externalIP = o.externalIP; }
  if (o.kind === 'Ingress') base.address = o.address ?? '';
  return JSON.stringify(base);
}

/**
 * Grade a Kubernetes workspace on a settled copy of the cluster. Supported `sim_state` paths:
 * pods (namespace, selector, status, count | min_count), object (kind, name, namespace),
 * http (url, host), events, __stdout__, __stderr__. `sim_command_used` matches commands the learner ran.
 */
export function gradeKubernetesLevel(checks: Check[], source: KubeState): SubmissionCheckResult[] {
  const state = settledCopy(source);
  return checks.map((check) => {
    const kind = check.kind;
    const label = typeof check.label === 'string' ? check.label : kind.replaceAll('_', ' ');
    let actual = '';
    let expected = '';
    let passed = false;
    if (kind === 'sim_command_used') {
      expected = text(check.command ?? check.expected);
      actual = source.history.join('\n');
      passed = source.history.some((line) => line.trim() === expected || line.trim().startsWith(expected + ' '));
    } else if (kind === 'sim_state') {
      const path = text(check.path);
      const ns = text(check.namespace) || 'default';
      if (path === 'pods') {
        const terms = check.selector ? parseSelector(text(check.selector)) : [];
        const pods = state.objects.flatMap((o) => (o.kind === 'Pod' && !o.system && o.meta.namespace === ns && Array.isArray(terms) && matchesTerms(o.meta.labels, terms) ? [o] : []));
        const lines = pods.map((p) => { const v = podView(p); return `${p.meta.name} ${v.status} ${v.readyCount}/${v.total}`; });
        const wanted = text(check.status);
        const matched = wanted ? pods.filter((p) => podView(p).status === wanted && podView(p).ready === (wanted === 'Running')) : pods;
        actual = lines.join('\n') || '(no pods)';
        if (check.count !== undefined) { expected = text(check.count) + (wanted ? ' pods ' + wanted : ' pods'); actual = `${matched.length} pods${wanted ? ' ' + wanted : ''}\n${actual}`; passed = matched.length === Number(check.count); }
        else if (check.min_count !== undefined) { expected = 'at least ' + text(check.min_count) + ' pods ' + wanted; actual = `${matched.length} pods ${wanted}\n${actual}`; passed = matched.length >= Number(check.min_count); }
        else { expected = text(check.contains); passed = actual.includes(expected); }
      } else if (path === 'object') {
        const k = text(check.kind_name) as KubeKind;
        const o = state.objects.find((x) => x.kind === k && x.meta.name === text(check.name) && (k === 'Namespace' || x.meta.namespace === ns));
        actual = o ? summary(state, o) : '';
        expected = text(check.contains);
        passed = check.assert === 'exists' || check.exists === true ? actual.length > 0 : actual.includes(expected);
        if (check.exists === true) expected = 'object exists';
        if (check.not_contains !== undefined) { expected += ' and not ' + text(check.not_contains); passed = passed && !actual.includes(text(check.not_contains)); }
      } else if (path === 'http') {
        const r = curlRequest(state, text(check.url), text(check.host) || undefined);
        actual = 'error' in r ? r.error : `${r.status} ${r.body}`;
        expected = text(check.contains);
        passed = actual.includes(expected);
      } else if (path === 'events') {
        actual = state.events.filter((e) => e.namespace === ns).map((e) => e.reason + ': ' + e.message).join('\n');
        expected = text(check.contains);
        passed = actual.includes(expected);
      } else {
        actual = path === '__stdout__' ? source.stdout : path === '__stderr__' ? source.lastError : 'Unsupported path: ' + path;
        expected = text(check.contains);
        passed = actual.includes(expected);
      }
    } else {
      actual = 'Unsupported check: ' + kind;
      expected = 'sim_state or sim_command_used';
    }
    return { kind, label, passed, actual, expected };
  });
}
