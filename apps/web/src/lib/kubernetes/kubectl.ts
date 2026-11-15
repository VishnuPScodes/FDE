/* eslint-disable @typescript-eslint/no-confusing-void-expression -- command handlers end with `return say(...)` to stop early */
import yaml from 'js-yaml';
import { lookupImage } from './images';
import {
  INGRESS_ADDRESS, currentNamespace, eventsFor, find, ingressRequest, list, ownedPods, ownedReplicaSets, podView, reconcile, removeObject, revisionOf,
  serviceRequest, settle, statusText, templateHash, tick, strategySummary, serviceEndpoints,
} from './controller';
import { API_VERSIONS, parseManifestFile, parseObject } from './manifest';
import type { DeploymentObject, KubeKind, KubeObject, KubeResult, KubeState, PodObject, ServiceObject } from './types';
import { age, clone, formatLabels, isoTime, isRecord, matchesSelector, matchesTerms, nextUid, parseSelector, stableStringify, table, tokenize } from './util';

// ─── Names ──────────────────────────────────────────────────────────────────

const ALIASES: Record<string, KubeKind | 'Node' | 'Event' | 'All'> = {
  po: 'Pod', pod: 'Pod', pods: 'Pod', deploy: 'Deployment', deployment: 'Deployment', deployments: 'Deployment',
  rs: 'ReplicaSet', replicaset: 'ReplicaSet', replicasets: 'ReplicaSet', svc: 'Service', service: 'Service', services: 'Service',
  ing: 'Ingress', ingress: 'Ingress', ingresses: 'Ingress', cm: 'ConfigMap', configmap: 'ConfigMap', configmaps: 'ConfigMap',
  secret: 'Secret', secrets: 'Secret', ns: 'Namespace', namespace: 'Namespace', namespaces: 'Namespace',
  pvc: 'PersistentVolumeClaim', persistentvolumeclaim: 'PersistentVolumeClaim', persistentvolumeclaims: 'PersistentVolumeClaim',
  hpa: 'HorizontalPodAutoscaler', horizontalpodautoscaler: 'HorizontalPodAutoscaler', job: 'Job', jobs: 'Job',
  cronjob: 'CronJob', cronjobs: 'CronJob', cj: 'CronJob', node: 'Node', nodes: 'Node', no: 'Node', event: 'Event', events: 'Event', ev: 'Event', all: 'All',
};
const RESOURCE: Record<string, string> = {
  Pod: 'pod', Deployment: 'deployment.apps', ReplicaSet: 'replicaset.apps', Service: 'service', Ingress: 'ingress.networking.k8s.io', ConfigMap: 'configmap',
  Secret: 'secret', Namespace: 'namespace', PersistentVolumeClaim: 'persistentvolumeclaim', HorizontalPodAutoscaler: 'horizontalpodautoscaler.autoscaling', Job: 'job.batch', CronJob: 'cronjob.batch',
};
const CLUSTER_SCOPED = new Set<string>(['Namespace']);

interface Args { pos: string[]; f: Record<string, string[]>; bool: Set<string>; after: string[] }
const VALUE_FLAGS = new Set(['n', 'namespace', 'o', 'output', 'l', 'selector', 'f', 'filename', 'c', 'container', 'replicas', 'tail', 'image', 'port', 'target-port', 'type', 'from-literal', 'to-revision', 'dry-run', 'name', 'H', 'header', 'min', 'max', 'cpu-percent']);

function parseArgs(tokens: string[]): Args {
  const out: Args = { pos: [], f: {}, bool: new Set(), after: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === '--') { out.after = tokens.slice(i + 1); break; }
    if (!t.startsWith('-') || t === '-') { out.pos.push(t); continue; }
    const stripped = t.replace(/^-+/, '');
    const eq = stripped.indexOf('=');
    const key = eq < 0 ? stripped : stripped.slice(0, eq);
    if (eq >= 0) (out.f[key] ??= []).push(stripped.slice(eq + 1));
    else if (VALUE_FLAGS.has(key)) (out.f[key] ??= []).push(tokens[++i] ?? '');
    else out.bool.add(key);
  }
  return out;
}
const flag = (a: Args, ...names: string[]) => names.map((n) => a.f[n]?.[0]).find((v) => v !== undefined);
const flagAll = (a: Args, ...names: string[]) => names.flatMap((n) => a.f[n] ?? []);

// ─── Output helpers ─────────────────────────────────────────────────────────

function manifestOf(state: KubeState, o: KubeObject): Record<string, unknown> {
  const meta: Record<string, unknown> = { name: o.meta.name, ...(o.meta.namespace ? { namespace: o.meta.namespace } : {}), uid: o.meta.uid, creationTimestamp: isoTime(o.meta.createdAt), labels: o.meta.labels };
  if (Object.keys(o.meta.annotations).length) meta.annotations = o.meta.annotations;
  const base = { apiVersion: API_VERSIONS[o.kind]?.[0] ?? 'v1', kind: o.kind, metadata: meta };
  switch (o.kind) {
    case 'ConfigMap': return { ...base, data: o.data };
    case 'Secret': return { ...base, type: o.type, data: o.data };
    case 'Namespace': return { ...base, status: { phase: o.phase } };
    case 'Pod': { const v = podView(o); return { ...base, spec: { ...o.spec, nodeName: o.nodeName }, status: { phase: v.phase, podIP: o.ip, containerStatuses: o.spec.containers.map((c) => ({ name: c.name, ready: v.ready, restartCount: o.restarts })) } }; }
    case 'Deployment': { const s = depStatus(state, o); return { ...base, spec: o.spec, status: { replicas: s.total, updatedReplicas: s.updated, readyReplicas: s.available, availableReplicas: s.available } }; }
    default: return { ...base, spec: (o as { spec?: unknown }).spec };
  }
}

function jsonpath(value: unknown, expr: string): string {
  const path = expr.replace(/^\{|\}$/g, '').replace(/^\./, '').split('.').filter(Boolean);
  let cur: unknown[] = [value];
  for (const seg of path) {
    const m = /^([^[]+)(\[\*\])?$/.exec(seg);
    if (!m) return '';
    cur = cur.flatMap((c) => { const v: unknown = isRecord(c) ? c[m[1]!] : undefined; return m[2] && Array.isArray(v) ? (v as unknown[]) : [v]; });
  }
  return cur.map((v) => (typeof v === 'object' ? JSON.stringify(v) : typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '')).join(' ');
}

function depStatus(state: KubeState, dep: DeploymentObject) {
  const pods = list(state, 'Pod', dep.meta.namespace).filter((p) => p.meta.ownerKind === 'ReplicaSet' && ownedReplicaSets(state, dep).some((rs) => rs.meta.name === p.meta.ownerName));
  const hash = templateHash(dep.spec.template);
  const currentRs = ownedReplicaSets(state, dep).find((rs) => rs.templateHash === hash);
  return { total: pods.length, updated: currentRs ? pods.filter((p) => p.meta.ownerName === currentRs.meta.name).length : 0, available: pods.filter((p) => podView(p).ready).length };
}

function ports(svc: ServiceObject): string {
  return svc.spec.ports.map((p) => `${p.port}${svc.spec.type !== 'ClusterIP' && p.nodePort ? `:${p.nodePort}` : ''}/${p.protocol}`).join(',');
}

function rowsFor(state: KubeState, kind: KubeKind, items: KubeObject[], wide: boolean): string[][] {
  const a = (o: KubeObject) => age(state, o.meta.createdAt);
  switch (kind) {
    case 'Pod': return [['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', ...(wide ? ['IP', 'NODE'] : [])], ...(items as PodObject[]).map((p) => { const v = podView(p); return [p.meta.name, `${v.readyCount}/${v.total}`, v.status, String(v.restarts), a(p), ...(wide ? [p.ip ?? '<none>', p.nodeName ?? '<none>'] : [])]; })];
    case 'Deployment': return [['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'], ...(items as DeploymentObject[]).map((d) => { const s = depStatus(state, d); return [d.meta.name, `${s.available}/${d.spec.replicas}`, String(s.updated), String(s.available), a(d)]; })];
    case 'ReplicaSet': return [['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE'], ...items.flatMap((o) => { if (o.kind !== 'ReplicaSet') return []; const pods = ownedPods(state, 'ReplicaSet', o.meta.namespace, o.meta.name); return [[o.meta.name, String(o.spec.replicas), String(pods.length), String(pods.filter((p) => podView(p).ready).length), a(o)]]; })];
    case 'Service': return [['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'], ...items.flatMap((o) => (o.kind === 'Service' ? [[o.meta.name, o.spec.type, o.spec.clusterIP, o.externalIP ?? '<none>', ports(o), a(o)]] : []))];
    case 'Ingress': return [['NAME', 'CLASS', 'HOSTS', 'ADDRESS', 'PORTS', 'AGE'], ...items.flatMap((o) => (o.kind === 'Ingress' ? [[o.meta.name, o.spec.ingressClassName ?? '<none>', o.spec.rules.map((r) => r.host ?? '*').join(',') || '*', o.address ?? '', '80', a(o)]] : []))];
    case 'ConfigMap': return [['NAME', 'DATA', 'AGE'], ...items.flatMap((o) => (o.kind === 'ConfigMap' ? [[o.meta.name, String(Object.keys(o.data).length), a(o)]] : []))];
    case 'Secret': return [['NAME', 'TYPE', 'DATA', 'AGE'], ...items.flatMap((o) => (o.kind === 'Secret' ? [[o.meta.name, o.type, String(Object.keys(o.data).length), a(o)]] : []))];
    case 'Namespace': return [['NAME', 'STATUS', 'AGE'], ...items.flatMap((o) => (o.kind === 'Namespace' ? [[o.meta.name, o.phase, a(o)]] : []))];
    case 'PersistentVolumeClaim': return [['NAME', 'STATUS', 'VOLUME', 'CAPACITY', 'ACCESS MODES', 'STORAGECLASS', 'AGE'], ...items.flatMap((o) => (o.kind === 'PersistentVolumeClaim' ? [[o.meta.name, o.phase, o.volumeName ?? '', o.phase === 'Bound' ? o.spec.storage : '', o.spec.accessModes.join(','), o.spec.storageClassName, a(o)]] : []))];
    case 'HorizontalPodAutoscaler': return [['NAME', 'REFERENCE', 'TARGETS', 'MINPODS', 'MAXPODS', 'REPLICAS', 'AGE'], ...items.flatMap((o) => (o.kind === 'HorizontalPodAutoscaler' ? [[o.meta.name, 'Deployment/' + o.spec.targetName, `${o.currentCpu === null ? '<unknown>' : `${o.currentCpu}%`}/${o.spec.cpuTarget ?? 0}%`, String(o.spec.minReplicas), String(o.spec.maxReplicas), String(o.currentReplicas), a(o)]] : []))];
    case 'Job': return [['NAME', 'COMPLETIONS', 'AGE'], ...items.flatMap((o) => (o.kind === 'Job' ? [[o.meta.name, `${o.succeeded}/${o.spec.completions}`, a(o)]] : []))];
    default: return [['NAME', 'SCHEDULE', 'SUSPEND', 'AGE'], ...items.flatMap((o) => (o.kind === 'CronJob' ? [[o.meta.name, o.spec.schedule, String(o.spec.suspend), a(o)]] : []))];
  }
}

function describe(state: KubeState, o: KubeObject): string {
  const events = eventsFor(state, o.kind, o.meta.namespace, o.meta.name);
  const from = o.kind === 'Pod' ? 'kubelet' : o.kind === 'Deployment' ? 'deployment-controller' : o.kind === 'ReplicaSet' ? 'replicaset-controller' : 'controller';
  const evText = events.length ? 'Events:\n' + table([['  Type', 'Reason', 'Age', 'From', 'Message'], ...events.map((e) => ['  ' + e.type, e.reason, age(state, e.last), e.reason === 'Scheduled' || e.reason === 'FailedScheduling' ? 'default-scheduler' : from, e.message])]) : 'Events:           <none>';
  const head = 'Name:'.padEnd(18) + o.meta.name + '\n' + (o.meta.namespace ? 'Namespace:'.padEnd(18) + o.meta.namespace + '\n' : '') + 'Labels:'.padEnd(18) + (formatLabels(o.meta.labels) || '<none>').split(',').join('\n' + ' '.repeat(18)) + '\n';
  const containers = (spec: { containers: { name: string; image: string; ports: { containerPort: number; protocol: string }[]; env: { name: string; value?: string }[]; resources: { requests: Record<string, string>; limits: Record<string, string> } }[] }, pod?: PodObject) => 'Containers:\n' + spec.containers.map((c) => {
    const v = pod ? podView(pod) : null;
    const state2 = !pod ? '' : v!.phase === 'Running' && pod.outcome.kind !== 'crash' && pod.outcome.kind !== 'oom' ? '    State:          Running\n' : '    State:          Waiting\n      Reason:       ' + v!.status + '\n' + (pod.lastTermination ? `    Last State:     Terminated\n      Reason:       ${pod.lastTermination.reason}\n      Exit Code:    ${pod.lastTermination.exitCode}\n` : '');
    return '  ' + c.name + ':\n    Image:          ' + c.image + '\n    Port:           ' + (c.ports.map((p) => `${p.containerPort}/${p.protocol}`).join(', ') || '<none>') + '\n' + state2 + (pod ? `    Ready:          ${v!.ready ? 'True' : 'False'}\n    Restart Count:  ${pod.restarts}\n` : '')
      + (Object.keys(c.resources.limits).length ? '    Limits:\n' + Object.entries(c.resources.limits).map(([k, x]) => '      ' + k + ': ' + x + '\n').join('') : '') + (Object.keys(c.resources.requests).length ? '    Requests:\n' + Object.entries(c.resources.requests).map(([k, x]) => '      ' + k + ': ' + x + '\n').join('') : '')
      + '    Environment:' + (c.env.length ? '\n' + c.env.map((e) => '      ' + e.name + ': ' + (e.value ?? '<set to a reference>')).join('\n') + '\n' : '    <none>\n');
  }).join('');
  const kv = (k: string, v: string | number) => `${(k + ':').padEnd(Math.max(18, k.length + 2))}${v}\n`;
  switch (o.kind) {
    case 'Pod': return head + kv('Node', o.nodeName ? o.nodeName + '/' + (state.nodes.find((n) => n.name === o.nodeName)?.internalIP ?? '') : '<none>') + kv('Status', podView(o).phase) + kv('IP', o.ip ?? '') + (o.meta.ownerKind ? kv('Controlled By', `${o.meta.ownerKind}/${o.meta.ownerName}`) : '') + containers(o.spec, o) + evText + '\n';
    case 'Deployment': {
      const s = depStatus(state, o);
      const hash = templateHash(o.spec.template);
      const rs = ownedReplicaSets(state, o);
      return head + kv('Selector', formatLabels(o.spec.selector.matchLabels)) + kv('Replicas', `${o.spec.replicas} desired | ${s.updated} updated | ${s.total} total | ${s.available} available | ${s.total - s.available} unavailable`)
        + kv('StrategyType', o.spec.strategy.type) + kv('RollingUpdateStrategy', strategySummary(o)) + 'Pod Template:\n  Labels:  ' + formatLabels(o.spec.template.labels) + '\n' + containers(o.spec.template.spec).replace(/^/gm, '  ').replace(/ +$/, '')
        + kv('OldReplicaSets', rs.filter((r) => r.templateHash !== hash && r.spec.replicas > 0).map((r) => r.meta.name).join(', ') || '<none>') + kv('NewReplicaSet', rs.find((r) => r.templateHash === hash)?.meta.name ?? '<none>') + evText + '\n';
    }
    case 'Service': {
      const eps = serviceEndpoints(state, o);
      return head + kv('Selector', formatLabels(o.spec.selector) || '<none>') + kv('Type', o.spec.type) + kv('IP', o.spec.clusterIP) + kv('Port', o.spec.ports.map((p) => `${p.name ?? '<unset>'} ${p.port}/${p.protocol}`).join(', '))
        + kv('TargetPort', o.spec.ports.map((p) => `${p.targetPort}/${p.protocol}`).join(', ')) + kv('Endpoints', eps.ready.map((e) => `${e.pod.ip}:${e.port}`).join(',') || '<none>') + evText + '\n';
    }
    case 'Ingress': return head + kv('Address', o.address ?? '') + kv('Ingress Class', o.spec.ingressClassName ?? '<none>') + 'Rules:\n  Host  Path  Backends\n' + o.spec.rules.flatMap((r) => r.paths.map((p) => `  ${r.host ?? '*'}  ${p.path}  ${p.serviceName}:${p.servicePort}`)).join('\n') + '\n' + evText + '\n';
    case 'ConfigMap': return head + '\nData\n====\n' + Object.entries(o.data).map(([k, v]) => k + ':\n----\n' + v + '\n').join('\n') + '\n' + evText + '\n';
    default: return head + evText + '\n';
  }
}

// ─── Command runner ─────────────────────────────────────────────────────────

export function curlRequest(state: KubeState, url: string, hostHeader?: string): { status: number; body: string; headers: Record<string, string> } | { error: string } {
  const m = /^https?:\/\/([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url);
  if (!m) return { error: 'curl: (3) URL rejected: Malformed input to a URL function' };
  const [, host = '', portText, path = '/'] = m;
  const port = portText ? Number(portText) : 80;
  const ingressHosts = list(state, 'Ingress').flatMap((i) => i.spec.rules.map((r) => r.host).filter(Boolean));
  if (host === INGRESS_ADDRESS || ingressHosts.includes(host)) return ingressRequest(state, host === INGRESS_ADDRESS ? hostHeader ?? '' : host, path);
  const [name = '', ns = currentNamespace(state)] = host.replace(/\.svc(\.cluster\.local)?$/, '').split('.');
  const svc = find(state, 'Service', ns, name);
  if (!svc) return { error: 'curl: (6) Could not resolve host: ' + host };
  const result = serviceRequest(state, svc, port, path);
  if ('error' in result) return { error: `curl: (7) Failed to connect to ${host} port ${port} after 0 ms: Couldn't connect to server` };
  return result;
}

function cascade(state: KubeState, target: KubeObject) {
  const gone: KubeObject[] = [target];
  removeObject(state, target);
  for (const g of gone) {
    const children = state.objects.filter((o) => (g.kind === 'Namespace' ? o.meta.namespace === g.meta.name : o.meta.ownerKind === g.kind && o.meta.ownerName === g.meta.name && o.meta.namespace === g.meta.namespace));
    for (const c of children) { removeObject(state, c); gone.push(c); }
  }
}

const RUNTIME_FIELDS = new Set(['meta', 'rollout', 'externalIP', 'address', 'phase', 'volumeName', 'succeeded', 'failed', 'currentReplicas', 'currentCpu', 'stage', 'outcome', 'restarts', 'nodeName', 'ip', 'startedEnv', 'lastTermination']);

/** The part of an object that the manifest controls, used to tell "unchanged" from "configured". */
function bodyOf(o: KubeObject): string {
  const desired = Object.fromEntries(Object.entries(o).filter(([k]) => !RUNTIME_FIELDS.has(k)));
  return stableStringify({ labels: o.meta.labels, annotations: o.meta.annotations, desired });
}

export function runKubectl(prev: KubeState, line: string): KubeResult {
  const st = clone(prev);
  st.history.push(line.trim());
  let out = '';
  let err = '';
  let code = 0;
  const fail = (text: string) => { err += text.endsWith('\n') ? text : text + '\n'; code = 1; };
  const say = (text: string) => { out += text.endsWith('\n') ? text : text + '\n'; };
  const tokens = tokenize(line);
  const [cmd = '', sub = '', ...restTokens] = tokens;
  let dryRun = false;
  reconcile(st);

  const nsOf = (a: Args) => flag(a, 'n', 'namespace') ?? currentNamespace(st);
  const nameOf = (kind: KubeKind, ns: string, name: string) => `${RESOURCE[kind]} "${name}"`;
  /** Resolve `kind/name` or `kind name` into a kind and names. */
  const target = (a: Args, offset = 0): { kind: KubeKind | 'Node' | 'Event' | 'All'; names: string[] } | null => {
    const first = a.pos[offset];
    if (!first) return null;
    if (first.includes('/')) { const [k, n] = first.split('/') as [string, string]; const kind = ALIASES[k.toLowerCase()]; return kind ? { kind, names: [n, ...a.pos.slice(offset + 1)] } : null; }
    const kind = ALIASES[first.toLowerCase()];
    return kind ? { kind, names: a.pos.slice(offset + 1) } : null;
  };
  const files = (a: Args): { path: string; text: string }[] | string => {
    const result: { path: string; text: string }[] = [];
    for (const p of flagAll(a, 'f', 'filename')) {
      if (p in st.files) { result.push({ path: p, text: st.files[p]! }); continue; }
      const prefix = p === '.' || p === './' ? '' : p.replace(/\/?$/, '/');
      const matches = Object.keys(st.files).filter((k) => /\.ya?ml$/.test(k) && k.startsWith(prefix)).sort();
      if (!matches.length) return 'error: the path "' + p + '" does not exist';
      for (const k of matches) result.push({ path: k, text: st.files[k]! });
    }
    return result.length ? result : 'error: must specify one of -f and -k';
  };
  const pickDeployment = (a: Args, offset: number): DeploymentObject | undefined => {
    const t = target(a, offset);
    if (t?.kind !== 'Deployment' || !t.names[0]) { fail('error: expected deployment/NAME or "deployment NAME"'); return undefined; }
    const dep = find(st, 'Deployment', nsOf(a), t.names[0]);
    if (!dep) fail('Error from server (NotFound): deployments.apps "' + t.names[0] + '" not found');
    return dep;
  };

  const create = (raw: unknown, a: Args, verb: string, source: string) => {
    const parsed = parseObject(raw, source);
    if (!parsed.ok) return fail(parsed.error);
    const o = parsed.object;
    o.meta.namespace = CLUSTER_SCOPED.has(o.kind) ? '' : parsed.explicitNamespace ? o.meta.namespace : nsOf(a);
    if (flagAll(a, 'o', 'output')[0] === 'yaml' && dryRun) return say(yaml.dump(manifestOf(st, o)).trimEnd());
    if (!CLUSTER_SCOPED.has(o.kind) && !find(st, 'Namespace', '', o.meta.namespace)) return fail('Error from server (NotFound): namespaces "' + o.meta.namespace + '" not found');
    if (find(st, o.kind, o.meta.namespace, o.meta.name)) return fail(`Error from server (AlreadyExists): ${RESOURCE[o.kind]} "${o.meta.name}" already exists`);
    o.meta.uid = nextUid(st);
    o.meta.createdAt = st.clock;
    st.objects.push(o);
    say(RESOURCE[o.kind]!.split('.')[0] === 'deployment' ? 'deployment.apps/' + o.meta.name + ' ' + verb : `${RESOURCE[o.kind]}/${o.meta.name} ${verb}`);
  };

  const apply = (a: Args) => {
    const found = files(a);
    if (typeof found === 'string') return fail(found);
    const docs: { object: KubeObject; explicit: boolean; path: string }[] = [];
    for (const file of found) {
      const parsed = parseManifestFile(file.text, file.path);
      if ('error' in parsed) { fail(parsed.error); continue; }
      for (const d of parsed.docs) { if (d.ok) docs.push({ object: d.object, explicit: d.explicitNamespace, path: file.path }); else fail(d.error); }
    }
    docs.sort((x, y) => Number(y.object.kind === 'Namespace') - Number(x.object.kind === 'Namespace'));
    for (const { object: o, explicit, path } of docs) {
      o.meta.namespace = CLUSTER_SCOPED.has(o.kind) ? '' : explicit ? o.meta.namespace : nsOf(a);
      const label = `${RESOURCE[o.kind]!.startsWith('deployment') ? 'deployment.apps' : RESOURCE[o.kind]}/${o.meta.name}`;
      if (!CLUSTER_SCOPED.has(o.kind) && !find(st, 'Namespace', '', o.meta.namespace)) { fail('Error from server (NotFound): error when creating "' + path + '": namespaces "' + o.meta.namespace + '" not found'); continue; }
      const old = find(st, o.kind, o.meta.namespace, o.meta.name);
      if (!old) { o.meta.uid = nextUid(st); o.meta.createdAt = st.clock; st.objects.push(o); say(label + ' created'); continue; }
      if (o.kind === 'Service' && old.kind === 'Service') { o.spec.clusterIP = old.spec.clusterIP; o.spec.ports.forEach((p, i) => { p.nodePort ??= old.spec.ports[i]?.nodePort; }); }
      if (bodyOf(o) === bodyOf(old)) { say(label + ' unchanged'); continue; }
      if (o.kind === 'Pod' && stableStringify(o.spec) !== stableStringify((old as PodObject).spec)) { fail('The Pod "' + o.meta.name + '" is invalid: spec: Forbidden: pod updates may not change fields other than `spec.containers[*].image`, `spec.initContainers[*].image`, `spec.activeDeadlineSeconds`, `spec.tolerations` (only additions to existing tolerations) or `spec.terminationGracePeriodSeconds` (allow it to be set to 1 if it was previously negative)'); continue; }
      if (o.kind === 'Deployment' && old.kind === 'Deployment' && stableStringify(o.spec.selector) !== stableStringify(old.spec.selector)) { fail('The Deployment "' + o.meta.name + '" is invalid: spec.selector: Invalid value: v1.LabelSelector{MatchLabels:map[string]string{...}}: field is immutable'); continue; }
      o.meta.uid = old.meta.uid; o.meta.createdAt = old.meta.createdAt; o.meta.generation = old.meta.generation + 1;
      Object.assign(o, Object.fromEntries(['rollout', 'externalIP', 'address', 'phase', 'volumeName', 'succeeded', 'failed', 'currentReplicas', 'currentCpu', 'startedEnv'].filter((k) => k in old && !(k in o)).map((k) => [k, (old as unknown as Record<string, unknown>)[k]])));
      if (o.kind === 'Deployment' && old.kind === 'Deployment') o.rollout = old.rollout;
      if (o.kind === 'PersistentVolumeClaim' && old.kind === 'PersistentVolumeClaim') { o.phase = old.phase; o.volumeName = old.volumeName; }
      st.objects[st.objects.indexOf(old)] = o;
      say(label + ' configured');
    }
  };

  const get = (a: Args) => {
    const t = target(a);
    if (!t) return fail(a.pos[0] ? 'error: the server doesn\'t have a resource type "' + a.pos[0] + '"' : 'You must specify the type of resource to get. Use "kubectl api-resources" for a complete list of supported resources.');
    const all = a.bool.has('A') || a.bool.has('all-namespaces');
    const ns = nsOf(a);
    const selector = flag(a, 'l', 'selector');
    const terms = selector ? parseSelector(selector) : null;
    if (typeof terms === 'string') return fail(terms);
    const output = flag(a, 'o', 'output') ?? '';
    const wide = output === 'wide';
    if (a.bool.has('w') || a.bool.has('watch')) settle(st);
    if (t.kind === 'Node') return say(table([['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'], ...st.nodes.map((n) => [n.name, 'Ready', n.roles, '3d', 'v1.29.2'])]));
    if (t.kind === 'Event') {
      const ev = st.events.filter((e) => all || e.namespace === ns).sort((x, y) => x.last - y.last);
      return ev.length ? say(table([['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'], ...ev.map((e) => [age(st, e.last), e.type, e.reason, e.objectKind.toLowerCase() + '/' + e.objectName, e.message])])) : fail('No resources found in ' + ns + ' namespace.');
    }
    const kinds: KubeKind[] = t.kind === 'All' ? ['Pod', 'Service', 'Deployment', 'ReplicaSet'] : [t.kind];
    const collected: KubeObject[] = [];
    for (const kind of kinds) {
      let items: KubeObject[] = st.objects.filter((o) => o.kind === kind && (CLUSTER_SCOPED.has(kind) || all || o.meta.namespace === ns));
      if (t.names.length) {
        const missing = t.names.filter((n) => !items.some((o) => o.meta.name === n));
        if (missing.length) return fail(`Error from server (NotFound): ${kind === 'Deployment' ? 'deployments.apps' : kind.toLowerCase() + 's'} "${missing[0]}" not found`);
        items = items.filter((o) => t.names.includes(o.meta.name));
      }
      if (terms) items = items.filter((o) => matchesTerms(o.meta.labels, terms));
      collected.push(...items);
      if (output === 'yaml' || output === 'json' || output.startsWith('jsonpath') || output === 'name') continue;
      if (!items.length) { if (kinds.length === 1) fail('No resources found' + (CLUSTER_SCOPED.has(kind) ? '' : ' in ' + ns + ' namespace') + '.'); continue; }
      let rows = rowsFor(st, kind, items, wide);
      if (all && !CLUSTER_SCOPED.has(kind)) rows = rows.map((r, i) => [i === 0 ? 'NAMESPACE' : items[i - 1]!.meta.namespace, ...r]);
      if (a.bool.has('show-labels')) rows = rows.map((r, i) => [...r, i === 0 ? 'LABELS' : formatLabels(items[i - 1]!.meta.labels) || '<none>']);
      if (t.kind === 'All') rows = rows.map((r, i) => (i === 0 ? r : all ? [r[0]!, `${kind.toLowerCase()}/${r[1]}`, ...r.slice(2)] : [`${kind.toLowerCase()}/${r[0]}`, ...r.slice(1)]));
      say(table(rows) + (kinds.length > 1 ? '\n' : ''));
    }
    if (output === 'name') say(collected.map((o) => (RESOURCE[o.kind]?.split('.')[0] ?? '') + '/' + o.meta.name).join('\n'));
    else if (output === 'yaml' || output === 'json') {
      if (!collected.length) return fail('No resources found in ' + ns + ' namespace.');
      const docs = collected.map((o) => manifestOf(st, o));
      const value = t.names.length === 1 ? docs[0] : { apiVersion: 'v1', kind: 'List', items: docs };
      say(output === 'json' ? JSON.stringify(value, null, 2) : yaml.dump(value).trimEnd());
    } else if (output.startsWith('jsonpath')) {
      const expr = output.slice(output.indexOf('=') + 1);
      const docs = collected.map((o) => manifestOf(st, o));
      say(jsonpath(t.names.length === 1 ? docs[0] : { items: docs }, expr));
    }
  };

  const logs = (a: Args) => {
    const t = target(a);
    const ns = nsOf(a);
    let pod: PodObject | undefined;
    if (t?.kind === 'Deployment' && t.names[0]) {
      const dep = find(st, 'Deployment', ns, t.names[0]);
      if (!dep) return fail('Error from server (NotFound): deployments.apps "' + t.names[0] + '" not found');
      pod = list(st, 'Pod', ns).filter((p) => matchesSelector(p.meta.labels, dep.spec.selector)).sort((x, y) => y.meta.createdAt - x.meta.createdAt)[0];
      if (!pod) return fail('error: no pods found for deployment ' + dep.meta.name);
    } else {
      const name = t?.kind === 'Pod' ? t.names[0] : a.pos[0]?.replace(/^pods?\//, '');
      pod = name ? find(st, 'Pod', ns, name) : undefined;
      if (!pod) return fail('Error from server (NotFound): pods "' + (name ?? '') + '" not found');
    }
    const cname = flag(a, 'c', 'container') ?? pod.spec.containers[0]!.name;
    const c = pod.spec.containers.find((x) => x.name === cname);
    if (!c) return fail('Error from server (BadRequest): container ' + cname + ' is not valid for pod ' + pod.meta.name);
    const v = podView(pod);
    const o = pod.outcome;
    if (a.bool.has('previous') || a.bool.has('p')) {
      if ((o.kind === 'crash' || o.kind === 'oom') && pod.restarts > 0) return say(o.log);
      return fail('Error from server (BadRequest): previous terminated container "' + cname + '" in pod "' + pod.meta.name + '" not found');
    }
    if (!pod.nodeName) return fail('Error from server (BadRequest): pod ' + pod.meta.name + ' does not have a host assigned');
    if (v.phase === 'Pending') return fail('Error from server (BadRequest): container "' + cname + '" in pod "' + pod.meta.name + '" is waiting to start: ' + (v.status === 'ErrImagePull' || v.status === 'ImagePullBackOff' ? 'trying and failing to pull image' : v.status));
    let log = o.kind === 'crash' || o.kind === 'oom' ? o.log : o.kind === 'completed' ? o.log : o.kind === 'start-error' ? '' : lookupImage(c.image)?.startupLog(pod.startedEnv ?? {}, pod.meta.name) ?? '';
    const tail = flag(a, 'tail');
    if (tail) log = log.trimEnd().split('\n').slice(-Number(tail)).join('\n') + '\n';
    if (log) say(log);
  };

  const rollout = (a: Args) => {
    const action = a.pos[0];
    const dep = pickDeployment(a, 1);
    if (!dep) return;
    const name = dep.meta.name;
    const hash = templateHash(dep.spec.template);
    const sets = ownedReplicaSets(st, dep);
    if (action === 'status') {
      settle(st);
      const s = depStatus(st, find(st, 'Deployment', dep.meta.namespace, name)!);
      const live = find(st, 'Deployment', dep.meta.namespace, name)!;
      if (live.rollout.steps.length) say(live.rollout.steps.join('\n'));
      live.rollout.steps = [];
      if (live.rollout.stuck || s.available < live.spec.replicas || s.updated < live.spec.replicas) {
        say(`Waiting for deployment "${name}" rollout to finish: ${s.updated} out of ${live.spec.replicas} new replicas have been updated...`);
        return fail('error: deployment "' + name + '" exceeded its progress deadline');
      }
      say('deployment "' + name + '" successfully rolled out');
    } else if (action === 'history') {
      const rows = sets.filter((r) => revisionOf(r) > 0).sort((x, y) => revisionOf(x) - revisionOf(y)).map((r) => [String(revisionOf(r)), r.meta.annotations['kubernetes.io/change-cause'] ?? '<none>']);
      say('deployment.apps/' + name + '\n' + table([['REVISION', 'CHANGE-CAUSE'], ...rows]));
    } else if (action === 'undo') {
      const current = sets.find((r) => r.templateHash === hash);
      const wanted = flag(a, 'to-revision');
      const older = sets.filter((r) => r !== current && revisionOf(r) > 0 && (wanted ? revisionOf(r) === Number(wanted) : revisionOf(r) < (current ? revisionOf(current) : Infinity))).sort((x, y) => revisionOf(y) - revisionOf(x))[0];
      if (!older) return fail(wanted ? 'error: unable to find specified revision ' + wanted + ' in history' : 'error: no rollout history found for deployment "' + name + '"');
      const template = clone(older.spec.template);
      delete template.labels['pod-template-hash'];
      dep.spec.template = template;
      reconcile(st);
      say('deployment.apps/' + name + ' rolled back');
    } else if (action === 'restart') {
      dep.spec.template.annotations['kubectl.kubernetes.io/restartedAt'] = isoTime(st.clock);
      reconcile(st);
      say('deployment.apps/' + name + ' restarted');
    } else fail('error: unknown rollout command "' + (action ?? '') + '". Supported: status, history, undo, restart');
  };

  const del = (a: Args) => {
    const ns = nsOf(a);
    let victims: KubeObject[] = [];
    if (flagAll(a, 'f', 'filename').length) {
      const found = files(a);
      if (typeof found === 'string') return fail(found);
      for (const file of found) {
        const parsed = parseManifestFile(file.text, file.path);
        if ('error' in parsed) { fail(parsed.error); continue; }
        for (const d of parsed.docs) if (d.ok) { const o = find(st, d.object.kind, CLUSTER_SCOPED.has(d.object.kind) ? '' : d.explicitNamespace ? d.object.meta.namespace : ns, d.object.meta.name); if (o) victims.push(o); else fail('Error from server (NotFound): ' + nameOf(d.object.kind, ns, d.object.meta.name) + ' not found'); }
      }
    } else {
      const t = target(a);
      if (!t || t.kind === 'Node' || t.kind === 'Event' || t.kind === 'All') return fail('error: resource(s) were provided, but no name was specified');
      const terms = flag(a, 'l', 'selector') ? parseSelector(flag(a, 'l', 'selector')!) : null;
      if (typeof terms === 'string') return fail(terms);
      const pool = st.objects.filter((o) => o.kind === t.kind && (CLUSTER_SCOPED.has(t.kind) || o.meta.namespace === ns) && !('system' in o && o.system));
      if (a.bool.has('all') || terms) victims = pool.filter((o) => !terms || matchesTerms(o.meta.labels, terms));
      else if (!t.names.length) return fail('error: resource(s) were provided, but no name was specified');
      else for (const n of t.names) { const o = pool.find((x) => x.meta.name === n); if (o) victims.push(o); else fail('Error from server (NotFound): ' + (t.kind === 'Deployment' ? 'deployments.apps' : t.kind.toLowerCase() + 's') + ' "' + n + '" not found'); }
    }
    for (const v of victims) { cascade(st, v); say(nameOf(v.kind, ns, v.meta.name) + ' deleted'); }
    reconcile(st);
  };

  const exec = (a: Args) => {
    const pod = find(st, 'Pod', nsOf(a), a.pos[0]?.replace(/^pods?\//, '') ?? '');
    if (!pod) return fail('Error from server (NotFound): pods "' + (a.pos[0] ?? '') + '" not found');
    if (podView(pod).phase !== 'Running') return fail('error: unable to upgrade connection: container not found ("' + pod.spec.containers[0]!.name + '")');
    const [bin = '', ...rest] = a.after;
    const image = lookupImage(pod.spec.containers[0]!.image);
    if (!image?.binaries.includes(bin)) return fail('OCI runtime exec failed: exec failed: unable to start container process: exec: "' + bin + '": executable file not found in $PATH: unknown\ncommand terminated with exit code 126');
    const env: Record<string, string> = { ...(pod.startedEnv ?? {}), HOSTNAME: pod.meta.name };
    if (bin === 'env' || bin === 'printenv') {
      if (bin === 'printenv' && rest[0]) { if (env[rest[0]] === undefined) { code = 1; return; } return say(env[rest[0]]!); }
      return say(Object.entries(env).map(([k, v]) => k + '=' + v).join('\n'));
    }
    if (bin === 'hostname') return say(pod.meta.name);
    if (bin === 'echo') return say(rest.join(' '));
    say('');
  };

  if (cmd === 'cat') { const f = tokens[1] ?? ''; if (f in st.files) say(st.files[f]!); else fail('cat: ' + f + ': No such file or directory'); }
  else if (cmd === 'ls') say(Object.keys(st.files).sort().join('\n'));
  else if (cmd === 'curl') {
    const a = parseArgs(tokens.slice(1));
    const header = flagAll(a, 'H', 'header').find((h) => /^host:/i.test(h));
    const url = a.pos.find((p) => /^https?:\/\//.test(p)) ?? '';
    const r = curlRequest(st, url, header?.replace(/^host:\s*/i, ''));
    if ('error' in r) fail(r.error);
    else say((a.bool.has('i') ? `HTTP/1.1 ${r.status} ${statusText(r.status)}\n${Object.entries(r.headers).map(([k, v]) => k + ': ' + v).join('\n')}\n\n` : '') + r.body);
  } else if (cmd !== 'kubectl') fail('bash: ' + cmd + ': command not found. This terminal supports kubectl, curl, cat and ls.');
  else {
    const a = parseArgs(restTokens);
    dryRun = (flag(a, 'dry-run') ?? '') !== '' && flag(a, 'dry-run') !== 'none';
    switch (sub) {
      case 'apply': apply(a); break;
      case 'create': {
        const kind = a.pos[0];
        const name = a.pos[kind === 'secret' ? 2 : 1] ?? '';
        const literals = Object.fromEntries(flagAll(a, 'from-literal').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
        if (kind === 'namespace' || kind === 'ns') create({ apiVersion: 'v1', kind: 'Namespace', metadata: { name } }, a, 'created', 'create');
        else if (kind === 'configmap' || kind === 'cm') create({ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name }, data: literals }, a, 'created', 'create');
        else if (kind === 'secret') create({ apiVersion: 'v1', kind: 'Secret', type: 'Opaque', metadata: { name }, stringData: literals }, a, 'created', 'create');
        else if (kind === 'deployment' || kind === 'deploy') {
          const image = flag(a, 'image');
          if (!image) fail('error: required flag(s) "image" not set');
          else create({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name, labels: { app: name } }, spec: { replicas: Number(flag(a, 'replicas') ?? 1), selector: { matchLabels: { app: name } }, template: { metadata: { labels: { app: name } }, spec: { containers: [{ name: image.split('/').pop()!.split(':')[0]!, image }] } } } }, a, 'created', 'create');
        } else if (flagAll(a, 'f', 'filename').length) apply(a);
        else fail('error: unknown resource type "' + (kind ?? '') + '". Try: create namespace|configmap|secret generic|deployment');
        break;
      }
      case 'get': get(a); break;
      case 'describe': {
        const t = target(a);
        const ns = nsOf(a);
        if (!t || t.kind === 'Node' || t.kind === 'Event' || t.kind === 'All') { fail('error: you must specify the type of resource to describe'); break; }
        const items = st.objects.filter((o) => o.kind === t.kind && (CLUSTER_SCOPED.has(t.kind) || o.meta.namespace === ns) && (!t.names.length || t.names.includes(o.meta.name)));
        if (!items.length) fail(t.names.length ? `Error from server (NotFound): ${t.kind === 'Deployment' ? 'deployments.apps' : t.kind.toLowerCase() + 's'} "${t.names[0]}" not found` : 'No resources found in ' + ns + ' namespace.');
        else say(items.map((o) => describe(st, o)).join('\n\n'));
        break;
      }
      case 'logs': logs(a); break;
      case 'rollout': rollout(a); break;
      case 'delete': del(a); break;
      case 'exec': exec(a); break;
      case 'scale': {
        const dep = pickDeployment(a, 0);
        const n = flag(a, 'replicas');
        if (!dep) break;
        if (n === undefined || !/^\d+$/.test(n)) { fail('error: required flag(s) "replicas" not set'); break; }
        dep.spec.replicas = Number(n);
        reconcile(st);
        say('deployment.apps/' + dep.meta.name + ' scaled');
        break;
      }
      case 'set': {
        if (a.pos[0] !== 'image') { fail('error: only "kubectl set image" is supported in this simulator'); break; }
        const dep = pickDeployment(a, 1);
        if (!dep) break;
        const pairs = a.pos.slice(a.pos[1]?.includes('/') ? 2 : 3);
        let bad = false;
        for (const pair of pairs) {
          const [cn, image] = pair.split('=') as [string, string | undefined];
          const c = dep.spec.template.spec.containers.find((x) => x.name === cn);
          if (!c || !image) { fail('error: unable to find container named "' + cn + '"'); bad = true; break; }
          c.image = image;
        }
        if (!bad) { reconcile(st); say('deployment.apps/' + dep.meta.name + ' image updated'); }
        break;
      }
      case 'expose': {
        const t = target(a);
        const dep = t?.kind === 'Deployment' && t.names[0] ? find(st, 'Deployment', nsOf(a), t.names[0]) : undefined;
        const port = Number(flag(a, 'port'));
        if (!dep || !port) { fail(dep ? 'error: --port is required' : 'Error from server (NotFound): deployments.apps "' + (t?.names[0] ?? '') + '" not found'); break; }
        create({ apiVersion: 'v1', kind: 'Service', metadata: { name: flag(a, 'name') ?? dep.meta.name, labels: dep.meta.labels }, spec: { type: flag(a, 'type') ?? 'ClusterIP', selector: dep.spec.selector.matchLabels, ports: [{ port, targetPort: Number(flag(a, 'target-port') ?? port) }] } }, a, 'exposed', 'expose');
        break;
      }
      case 'config': {
        const ctx = st.contexts.find((c) => c.name === st.currentContext)!;
        if (a.pos[0] === 'current-context') say(st.currentContext);
        else if (a.pos[0] === 'get-contexts') say(table([['CURRENT', 'NAME', 'CLUSTER', 'AUTHINFO', 'NAMESPACE'], ...st.contexts.map((c) => [c.name === st.currentContext ? '*' : '', c.name, c.cluster, c.user, c.namespace])]));
        else if (a.pos[0] === 'use-context' && st.contexts.some((c) => c.name === a.pos[1])) { st.currentContext = a.pos[1]!; say(`Switched to context "${a.pos[1]}".`); }
        else if (a.pos[0] === 'set-context' && flag(a, 'namespace') !== undefined) { ctx.namespace = flag(a, 'namespace')!; say('Context "' + ctx.name + '" modified.'); }
        else fail('error: supported: config current-context | get-contexts | use-context NAME | set-context --current --namespace=NS');
        break;
      }
      case 'version': say('Client Version: v1.29.2\nServer Version: v1.29.2'); break;
      case '': case 'help': case '--help': say('kubectl controls the simulated cluster.\n\nSupported: apply -f, create, get, describe, logs, exec, rollout (status|history|undo|restart), scale, set image, expose, delete, config.\nAlso: curl http://<service>/path, cat FILE, ls.'); break;
      default: fail('error: unknown command "' + sub + '" for "kubectl"\n\nDid you mean this?\n\tget');
    }
  }
  if (dryRun && cmd === 'kubectl') {
    return { state: { ...clone(prev), history: st.history, stdout: out.replace(/(created|configured|deleted|exposed|scaled)$/gm, '$1 (dry run)'), stderr: err, lastError: err }, stdout: out.replace(/(created|configured|deleted|exposed|scaled)$/gm, '$1 (dry run)'), stderr: err, exitCode: code };
  }
  reconcile(st);
  tick(st, 10);
  st.stdout = out;
  st.stderr = err;
  st.lastError = err;
  return { state: st, stdout: out, stderr: err, exitCode: code };
}
