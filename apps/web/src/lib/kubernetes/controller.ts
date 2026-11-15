import { lookupImage, pullErrorMessage, type ImageInfo } from './images';
import type {
  ContainerSpec, DeploymentObject, KubeEvent, KubeKind, KubeObject, KubeState, NodeInfo, PodObject, PodOutcome, PodSpec, PodTemplate, Probe, ReplicaSetObject, ServiceObject,
} from './types';
import { clone, decodeBase64, matchesLabels, matchesSelector, nextSuffix, nextUid, parseCpu, parseMemory, safeHash, stableStringify } from './util';

export type ObjOf<K extends KubeKind> = Extract<KubeObject, { kind: K }>;

export const CLUSTER_NAME = 'fde-training';
export const INGRESS_ADDRESS = '203.0.113.20';
export const STORAGE_CLASSES = [{ name: 'standard', provisioner: 'rancher.io/local-path', isDefault: true }];
export const INGRESS_CLASSES = ['nginx'];
const SYSTEM_NAMESPACES = ['default', 'kube-system', 'kube-public', 'kube-node-lease', 'ingress-nginx'];

// ─── Lookups ────────────────────────────────────────────────────────────────

export function list<K extends KubeKind>(state: KubeState, kind: K, namespace?: string | null): ObjOf<K>[] {
  return state.objects.filter((o): o is ObjOf<K> => o.kind === kind && (namespace === undefined || namespace === null || o.meta.namespace === namespace));
}

export function find<K extends KubeKind>(state: KubeState, kind: K, namespace: string, name: string): ObjOf<K> | undefined {
  return state.objects.find((o): o is ObjOf<K> => o.kind === kind && o.meta.name === name && (kind === 'Namespace' || o.meta.namespace === namespace));
}

export function currentNamespace(state: KubeState): string {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty namespace falls back to default
  return state.contexts.find((c) => c.name === state.currentContext)?.namespace || 'default';
}

export function removeObject(state: KubeState, target: KubeObject) {
  state.objects = state.objects.filter((o) => o !== target);
}

// ─── Events ─────────────────────────────────────────────────────────────────

export function recordEvent(state: KubeState, obj: { kind: string; meta: { name: string; namespace: string } }, type: KubeEvent['type'], reason: string, message: string) {
  const existing = state.events.find((e) => e.objectKind === obj.kind && e.objectName === obj.meta.name && e.namespace === obj.meta.namespace && e.reason === reason && e.message === message);
  if (existing) { existing.count += 1; existing.last = state.clock; return; }
  state.events.push({ namespace: obj.meta.namespace, objectKind: obj.kind, objectName: obj.meta.name, type, reason, message, count: 1, first: state.clock, last: state.clock });
  if (state.events.length > 400) state.events.splice(0, state.events.length - 400);
}

export function eventsFor(state: KubeState, kind: string, namespace: string, name: string): KubeEvent[] {
  return state.events.filter((e) => e.objectKind === kind && e.namespace === namespace && e.objectName === name);
}

// ─── Initial cluster ────────────────────────────────────────────────────────

function systemPod(state: KubeState, namespace: string, name: string, image: string, labels: Record<string, string>, node: string, ip: string, cpu: string, memory: string): PodObject {
  return {
    kind: 'Pod', system: true,
    meta: { name, namespace, labels, annotations: {}, uid: nextUid(state), createdAt: -259200, generation: 1 },
    spec: { containers: [{ name: name.split('-')[0] === 'ingress' ? 'controller' : name.split('-')[0]!, image, imagePullPolicy: 'IfNotPresent', ports: [], env: [], envFrom: [], resources: { requests: { cpu, memory }, limits: {} }, volumeMounts: [] }], volumes: [], restartPolicy: 'Always' },
    nodeName: node, ip, stage: 9, restarts: 0, outcome: { kind: 'running' },
  };
}

export function createCluster(files: Record<string, string> = {}): KubeState {
  const nodes: NodeInfo[] = [
    { name: 'fde-control-plane', roles: 'control-plane', cpuMilli: 2000, memoryMi: 4096, internalIP: '172.18.0.2', taint: 'node-role.kubernetes.io/control-plane', labels: { 'kubernetes.io/hostname': 'fde-control-plane', 'node-role.kubernetes.io/control-plane': '', 'topology.kubernetes.io/zone': 'ap-south-1a' } },
    { name: 'fde-worker-1', roles: '<none>', cpuMilli: 2000, memoryMi: 4096, internalIP: '172.18.0.3', labels: { 'kubernetes.io/hostname': 'fde-worker-1', 'topology.kubernetes.io/zone': 'ap-south-1a' } },
    { name: 'fde-worker-2', roles: '<none>', cpuMilli: 2000, memoryMi: 4096, internalIP: '172.18.0.4', labels: { 'kubernetes.io/hostname': 'fde-worker-2', 'topology.kubernetes.io/zone': 'ap-south-1b' } },
  ];
  const state: KubeState = {
    files: { ...files }, objects: [], nodes, events: [],
    contexts: [{ name: 'kind-fde-training', cluster: 'kind-fde-training', user: 'kind-fde-training', namespace: '' }],
    currentContext: 'kind-fde-training', helm: [], portForwards: [], history: [], stdout: '', stderr: '', lastError: '', clock: 0, seq: 0,
  };
  for (const ns of SYSTEM_NAMESPACES) state.objects.push({ kind: 'Namespace', meta: { name: ns, namespace: '', labels: { 'kubernetes.io/metadata.name': ns }, annotations: {}, uid: nextUid(state), createdAt: -259200, generation: 1 }, phase: 'Active' });
  state.objects.push(
    systemPod(state, 'kube-system', 'coredns-76f75df574-8xk2p', 'registry.k8s.io/coredns/coredns:v1.11.1', { 'k8s-app': 'kube-dns' }, 'fde-control-plane', '10.244.0.2', '100m', '70Mi'),
    systemPod(state, 'kube-system', 'coredns-76f75df574-zq9vw', 'registry.k8s.io/coredns/coredns:v1.11.1', { 'k8s-app': 'kube-dns' }, 'fde-control-plane', '10.244.0.3', '100m', '70Mi'),
    systemPod(state, 'kube-system', 'metrics-server-6d94bc8694-5lbtr', 'registry.k8s.io/metrics-server/metrics-server:v0.7.1', { 'k8s-app': 'metrics-server' }, 'fde-control-plane', '10.244.0.4', '100m', '200Mi'),
    systemPod(state, 'ingress-nginx', 'ingress-nginx-controller-7d4db76476-r2xkc', 'registry.k8s.io/ingress-nginx/controller:v1.10.1', { 'app.kubernetes.io/name': 'ingress-nginx', 'app.kubernetes.io/component': 'controller' }, 'fde-control-plane', '10.244.0.5', '100m', '90Mi'),
  );
  state.objects.push({ kind: 'Service', meta: { name: 'kubernetes', namespace: 'default', labels: { component: 'apiserver', provider: 'kubernetes' }, annotations: {}, uid: nextUid(state), createdAt: -259200, generation: 1 }, spec: { type: 'ClusterIP', selector: {}, ports: [{ name: 'https', port: 443, targetPort: 6443, protocol: 'TCP' }], clusterIP: '10.96.0.1' } });
  state.objects.push({ kind: 'Service', meta: { name: 'kube-dns', namespace: 'kube-system', labels: { 'k8s-app': 'kube-dns' }, annotations: {}, uid: nextUid(state), createdAt: -259200, generation: 1 }, spec: { type: 'ClusterIP', selector: { 'k8s-app': 'kube-dns' }, ports: [{ name: 'dns-tcp', port: 53, targetPort: 53, protocol: 'TCP' }], clusterIP: '10.96.0.10' } });
  state.objects.push({ kind: 'Service', meta: { name: 'ingress-nginx-controller', namespace: 'ingress-nginx', labels: { 'app.kubernetes.io/name': 'ingress-nginx' }, annotations: {}, uid: nextUid(state), createdAt: -259200, generation: 1 }, spec: { type: 'LoadBalancer', selector: { 'app.kubernetes.io/name': 'ingress-nginx' }, ports: [{ name: 'http', port: 80, targetPort: 80, nodePort: 31080, protocol: 'TCP' }, { name: 'https', port: 443, targetPort: 443, nodePort: 31443, protocol: 'TCP' }], clusterIP: '10.96.112.40' }, externalIP: INGRESS_ADDRESS });
  return state;
}

// ─── Pod evaluation ─────────────────────────────────────────────────────────

export function containerRequests(c: ContainerSpec): { cpu: number; memory: number } {
  const cpu = c.resources.requests.cpu ?? c.resources.limits.cpu;
  const memory = c.resources.requests.memory ?? c.resources.limits.memory;
  return { cpu: parseCpu(cpu) || 0, memory: parseMemory(memory) || 0 };
}

export function podRequests(spec: PodSpec): { cpu: number; memory: number } {
  return spec.containers.reduce((acc, c) => { const r = containerRequests(c); return { cpu: acc.cpu + r.cpu, memory: acc.memory + r.memory }; }, { cpu: 0, memory: 0 });
}

function isTerminal(pod: PodObject): boolean {
  return pod.outcome.kind === 'completed';
}

export function nodeUsage(state: KubeState, node: string, exclude?: (pod: PodObject) => boolean): { cpu: number; memory: number } {
  return list(state, 'Pod').filter((p) => p.nodeName === node && !isTerminal(p) && !(exclude?.(p))).reduce((acc, p) => { const r = podRequests(p.spec); return { cpu: acc.cpu + r.cpu, memory: acc.memory + r.memory }; }, { cpu: 0, memory: 0 });
}

function schedule(state: KubeState, spec: PodSpec, exclude?: (pod: PodObject) => boolean): { node: NodeInfo } | { message: string } {
  const req = podRequests(spec);
  const reasons = new Map<string, number>();
  const add = (reason: string) => reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  const candidates: { node: NodeInfo; cpu: number }[] = [];
  for (const node of state.nodes) {
    if (node.taint) { add('node(s) had untolerated taint {' + node.taint + ': }'); continue; }
    if (spec.nodeSelector && !Object.entries(spec.nodeSelector).every(([k, v]) => node.labels[k] === v)) { add('node(s) didn\'t match Pod\'s node affinity/selector'); continue; }
    const used = nodeUsage(state, node.name, exclude);
    const cpuFits = used.cpu + req.cpu <= node.cpuMilli;
    const memFits = used.memory + req.memory <= node.memoryMi;
    if (!cpuFits) add('Insufficient cpu');
    if (!memFits) add('Insufficient memory');
    if (cpuFits && memFits) candidates.push({ node, cpu: used.cpu });
  }
  if (candidates.length) {
    candidates.sort((a, b) => a.cpu - b.cpu || a.node.name.localeCompare(b.node.name));
    return { node: candidates[0]!.node };
  }
  const parts = [...reasons.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([reason, count]) => `${count} ${reason}`);
  const total = state.nodes.length;
  const preempt = reasons.has('Insufficient cpu') || reasons.has('Insufficient memory')
    ? `1 Preemption is not helpful for scheduling, ${total - 1} No preemption victims found for incoming pod.`
    : `${total} Preemption is not helpful for scheduling.`;
  return { message: `0/${total} nodes are available: ${parts.join(', ')}. preemption: 0/${total} nodes are available: ${preempt}` };
}

export function resolvePort(container: ContainerSpec, port: number | string): number | null {
  if (typeof port === 'number') return port;
  if (/^\d+$/.test(port)) return Number(port);
  return container.ports.find((p) => p.name === port)?.containerPort ?? null;
}

export function probeFailure(image: ImageInfo, container: ContainerSpec, probe: Probe, ip: string): string | null {
  if (probe.httpGet) {
    const port = resolvePort(container, probe.httpGet.port);
    const url = `http://${ip}:${port ?? probe.httpGet.port}${probe.httpGet.path}`;
    if (port === null) return 'Get "' + url + '": port "' + String(probe.httpGet.port) + '" not found in container ports';
    if (port !== image.port) return `Get "${url}": dial tcp ${ip}:${port}: connect: connection refused`;
    if (image.protocol !== 'http') return 'Get "' + url + '": net/http: HTTP/1.x transport connection broken: malformed HTTP response';
    const route = image.routes[probe.httpGet.path];
    if (!route) return 'HTTP probe failed with statuscode: 404';
    return route.status >= 200 && route.status < 400 ? null : `HTTP probe failed with statuscode: ${route.status}`;
  }
  if (probe.tcpSocket) {
    const port = resolvePort(container, probe.tcpSocket.port);
    return port !== null && port === image.port ? null : 'dial tcp ' + ip + ':' + String(port ?? probe.tcpSocket.port) + ': connect: connection refused';
  }
  if (probe.exec) {
    const bin = probe.exec.command[0] ?? '';
    return image.binaries.includes(bin) || image.binaries.includes(bin.split('/').pop() ?? '') ? null : 'OCI runtime exec failed: exec failed: unable to start container process: exec: "' + bin + '": executable file not found in $PATH: unknown';
  }
  return null;
}

/** Resolve a container's environment. Returns a config error message when a reference is broken. */
export function resolveEnv(state: KubeState, namespace: string, podName: string, c: ContainerSpec): { env: Record<string, string> } | { error: string } {
  const env: Record<string, string> = {};
  for (const source of c.envFrom) {
    if (source.configMapRef) {
      const cm = find(state, 'ConfigMap', namespace, source.configMapRef.name);
      if (!cm) { if (source.configMapRef.optional) continue; return { error: 'configmap "' + source.configMapRef.name + '" not found' }; }
      for (const [k, v] of Object.entries(cm.data)) env[(source.prefix ?? '') + k] = v;
    }
    if (source.secretRef) {
      const secret = find(state, 'Secret', namespace, source.secretRef.name);
      if (!secret) { if (source.secretRef.optional) continue; return { error: 'secret "' + source.secretRef.name + '" not found' }; }
      for (const [k, v] of Object.entries(secret.data)) { const d = decodeBase64(v); env[(source.prefix ?? '') + k] = d.ok ? d.value : ''; }
    }
  }
  for (const item of c.env) {
    if (item.value !== undefined) { env[item.name] = item.value.replace(/\$\(([A-Za-z_][A-Za-z0-9_]*)\)/g, (m, key: string) => env[key] ?? m); continue; }
    const from = item.valueFrom;
    if (!from) { env[item.name] = ''; continue; }
    if (from.configMapKeyRef) {
      const ref = from.configMapKeyRef;
      const cm = find(state, 'ConfigMap', namespace, ref.name);
      if (!cm) { if (ref.optional) continue; return { error: 'configmap "' + ref.name + '" not found' }; }
      if (cm.data[ref.key] === undefined) { if (ref.optional) continue; return { error: 'couldn\'t find key ' + ref.key + ' in ConfigMap ' + namespace + '/' + ref.name }; }
      env[item.name] = cm.data[ref.key]!;
    } else if (from.secretKeyRef) {
      const ref = from.secretKeyRef;
      const secret = find(state, 'Secret', namespace, ref.name);
      if (!secret) { if (ref.optional) continue; return { error: 'secret "' + ref.name + '" not found' }; }
      const raw = secret.data[ref.key];
      if (raw === undefined) { if (ref.optional) continue; return { error: 'couldn\'t find key ' + ref.key + ' in Secret ' + namespace + '/' + ref.name }; }
      const d = decodeBase64(raw);
      env[item.name] = d.ok ? d.value : '';
    } else if (from.fieldRef) {
      const path = from.fieldRef.fieldPath;
      env[item.name] = path === 'metadata.name' ? podName : path === 'metadata.namespace' ? namespace : '';
    }
  }
  return { env };
}

function commandLine(c: ContainerSpec, image: ImageInfo): string[] {
  if (c.command?.length) return [...c.command, ...(c.args ?? [])];
  if (c.args?.length) return [...image.defaultCommand.slice(0, 1), ...c.args];
  return image.defaultCommand;
}

function batchLog(cmd: string[]): { running: boolean; log: string } {
  const text = cmd.join(' ');
  if (/sleep\s+(infinity|\d{3,})/.test(text) || /while\s+true/.test(text) || /tail\s+-f/.test(text)) return { running: true, log: '' };
  const echoes = [...text.matchAll(/echo\s+("[^"]*"|'[^']*'|[^;&|]+)/g)].map((m) => m[1]!.trim().replace(/^["']|["']$/g, ''));
  return { running: false, log: echoes.length ? echoes.join('\n') + '\n' : '' };
}

/** Decide what a pod will do. Deterministic given the cluster state. */
export function evaluatePod(state: KubeState, pod: Pick<PodObject, 'spec' | 'meta' | 'nodeName' | 'ip'>): PodOutcome {
  const ns = pod.meta.namespace;
  for (const volume of pod.spec.volumes) {
    if (!volume.persistentVolumeClaim) continue;
    const pvc = find(state, 'PersistentVolumeClaim', ns, volume.persistentVolumeClaim.claimName);
    const total = state.nodes.length;
    if (!pvc) return { kind: 'unschedulable', message: `0/${total} nodes are available: persistentvolumeclaim "${volume.persistentVolumeClaim.claimName}" not found. preemption: 0/${total} nodes are available: ${total} Preemption is not helpful for scheduling.` };
    if (pvc.phase !== 'Bound') return { kind: 'unschedulable', message: `0/${total} nodes are available: pod has unbound immediate PersistentVolumeClaims. preemption: 0/${total} nodes are available: ${total} Preemption is not helpful for scheduling.` };
  }
  if (!pod.nodeName) {
    const placed = schedule(state, pod.spec);
    if ('message' in placed) return { kind: 'unschedulable', message: placed.message };
  }
  const ip = pod.ip ?? '10.244.1.10';
  for (const c of pod.spec.containers) {
    if (!lookupImage(c.image)) return { kind: 'image-pull', image: c.image, message: pullErrorMessage(c.image) };
  }
  for (const volume of pod.spec.volumes) {
    if (volume.configMap && !volume.configMap.optional && !find(state, 'ConfigMap', ns, volume.configMap.name)) return { kind: 'mount-error', message: 'MountVolume.SetUp failed for volume "' + volume.name + '" : configmap "' + volume.configMap.name + '" not found' };
    if (volume.secret && !volume.secret.optional && !find(state, 'Secret', ns, volume.secret.secretName)) return { kind: 'mount-error', message: 'MountVolume.SetUp failed for volume "' + volume.name + '" : secret "' + volume.secret.secretName + '" not found' };
  }
  const envs: Record<string, string>[] = [];
  for (const c of pod.spec.containers) {
    const resolved = resolveEnv(state, ns, pod.meta.name, c);
    if ('error' in resolved) return { kind: 'config-error', message: resolved.error };
    envs.push(resolved.env);
  }
  let notReady: PodOutcome | null = null;
  let completed: PodOutcome | null = null;
  for (const [index, c] of pod.spec.containers.entries()) {
    const image = lookupImage(c.image)!;
    const env = envs[index]!;
    if (c.command?.length) {
      const bin = c.command[0]!;
      if (!image.binaries.includes(bin) && !image.binaries.includes(bin.split('/').pop() ?? '')) {
        return { kind: 'start-error', container: c.name, message: 'failed to create containerd task: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: exec: "' + bin + '": executable file not found in $PATH: unknown' };
      }
    }
    if (image.brokenLog) return { kind: 'crash', container: c.name, exitCode: 2, log: image.brokenLog };
    const missing = image.requiredEnv.find((key) => !env[key]);
    if (missing) return { kind: 'crash', container: c.name, exitCode: 1, log: image.crashLog(missing) };
    const limit = parseMemory(c.resources.limits.memory);
    if (limit > 0 && limit < image.memoryMi) return { kind: 'oom', container: c.name, log: image.startupLog(env, pod.meta.name).split('\n').slice(0, 2).join('\n') + '\n' };
    if (image.batch) {
      const run = batchLog(commandLine(c, image));
      if (!run.running) {
        if (pod.spec.restartPolicy === 'Always') return { kind: 'crash', container: c.name, exitCode: 0, log: run.log };
        completed = { kind: 'completed', log: run.log };
        continue;
      }
    }
    if (c.livenessProbe) {
      const failure = probeFailure(image, c, c.livenessProbe, ip);
      if (failure) return { kind: 'liveness', container: c.name, message: failure };
    }
    if (c.readinessProbe && !notReady) {
      const failure = probeFailure(image, c, c.readinessProbe, ip);
      if (failure) notReady = { kind: 'not-ready', container: c.name, message: failure };
    }
  }
  return notReady ?? completed ?? { kind: 'running' };
}

export const FAILING_OUTCOMES = new Set<PodOutcome['kind']>(['crash', 'oom', 'start-error', 'liveness']);

export interface PodView {
  status: string;
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed';
  readyCount: number;
  total: number;
  ready: boolean;
  restarts: number;
}

export function podView(pod: PodObject): PodView {
  const total = pod.spec.containers.length;
  const o = pod.outcome;
  const base = { total, restarts: pod.restarts };
  if (o.kind === 'unschedulable') return { ...base, status: 'Pending', phase: 'Pending', readyCount: 0, ready: false };
  if (pod.stage <= 0 || o.kind === 'mount-error') return { ...base, status: 'ContainerCreating', phase: 'Pending', readyCount: 0, ready: false };
  const steady = pod.stage >= 2;
  switch (o.kind) {
    case 'image-pull': return { ...base, status: steady ? 'ImagePullBackOff' : 'ErrImagePull', phase: 'Pending', readyCount: 0, ready: false };
    case 'config-error': return { ...base, status: 'CreateContainerConfigError', phase: 'Pending', readyCount: 0, ready: false };
    case 'start-error': return { ...base, status: steady ? 'CrashLoopBackOff' : 'RunContainerError', phase: 'Running', readyCount: Math.max(0, total - 1), ready: false };
    case 'crash': return { ...base, status: steady ? 'CrashLoopBackOff' : 'Error', phase: 'Running', readyCount: Math.max(0, total - 1), ready: false };
    case 'oom': return { ...base, status: pod.restarts % 2 === 1 ? 'OOMKilled' : 'CrashLoopBackOff', phase: 'Running', readyCount: Math.max(0, total - 1), ready: false };
    case 'liveness': return { ...base, status: pod.stage >= 4 ? 'CrashLoopBackOff' : 'Running', phase: 'Running', readyCount: Math.max(0, total - 1), ready: false };
    case 'completed': return { ...base, status: 'Completed', phase: 'Succeeded', readyCount: 0, ready: false };
    case 'not-ready': return { ...base, status: 'Running', phase: 'Running', readyCount: Math.max(0, total - 1), ready: false };
    default: return { ...base, status: 'Running', phase: 'Running', readyCount: total, ready: true };
  }
}

function emitOutcomeEvents(state: KubeState, pod: PodObject, first: boolean) {
  const o = pod.outcome;
  const ns = pod.meta.namespace;
  const containers = pod.spec.containers;
  if (o.kind === 'unschedulable') { recordEvent(state, pod, 'Warning', 'FailedScheduling', o.message); return; }
  if (first) recordEvent(state, pod, 'Normal', 'Scheduled', `Successfully assigned ${ns}/${pod.meta.name} to ${pod.nodeName}`);
  if (o.kind === 'mount-error') { recordEvent(state, pod, 'Warning', 'FailedMount', o.message); return; }
  if (o.kind === 'image-pull') {
    recordEvent(state, pod, 'Normal', 'Pulling', 'Pulling image "' + o.image + '"');
    recordEvent(state, pod, 'Warning', 'Failed', o.message);
    recordEvent(state, pod, 'Warning', 'Failed', 'Error: ErrImagePull');
    if (!first) { recordEvent(state, pod, 'Normal', 'BackOff', 'Back-off pulling image "' + o.image + '"'); recordEvent(state, pod, 'Warning', 'Failed', 'Error: ImagePullBackOff'); }
    return;
  }
  if (first) for (const c of containers) {
    recordEvent(state, pod, 'Normal', 'Pulled', 'Container image "' + c.image + '" already present on machine');
  }
  if (o.kind === 'config-error') { recordEvent(state, pod, 'Warning', 'Failed', 'Error: ' + o.message); return; }
  if (o.kind === 'start-error') {
    recordEvent(state, pod, 'Normal', 'Created', 'Created container ' + o.container);
    recordEvent(state, pod, 'Warning', 'Failed', 'Error: ' + o.message);
    if (!first) recordEvent(state, pod, 'Warning', 'BackOff', 'Back-off restarting failed container ' + o.container + ' in pod ' + pod.meta.name + '_' + ns + '(' + pod.meta.uid + ')');
    return;
  }
  for (const c of containers) { recordEvent(state, pod, 'Normal', 'Created', 'Created container ' + c.name); recordEvent(state, pod, 'Normal', 'Started', 'Started container ' + c.name); }
  if ((o.kind === 'crash' || o.kind === 'oom') && !first) recordEvent(state, pod, 'Warning', 'BackOff', 'Back-off restarting failed container ' + o.container + ' in pod ' + pod.meta.name + '_' + ns + '(' + pod.meta.uid + ')');
  if (o.kind === 'not-ready') recordEvent(state, pod, 'Warning', 'Unhealthy', 'Readiness probe failed: ' + o.message);
  if (o.kind === 'liveness') {
    recordEvent(state, pod, 'Warning', 'Unhealthy', 'Liveness probe failed: ' + o.message);
    recordEvent(state, pod, 'Normal', 'Killing', 'Container ' + o.container + ' failed liveness probe, will be restarted');
  }
}

/** Advance simulated time by one terminal command. */
export function tick(state: KubeState, seconds = 10) {
  state.clock += seconds;
  for (const pod of list(state, 'Pod')) {
    if (pod.system) continue;
    if (pod.outcome.kind === 'unschedulable') continue;
    pod.stage += 1;
    if (FAILING_OUTCOMES.has(pod.outcome.kind) && pod.stage >= 1) {
      pod.restarts += 1;
      const o = pod.outcome;
      pod.lastTermination = o.kind === 'oom' ? { reason: 'OOMKilled', exitCode: 137 } : o.kind === 'crash' ? { reason: o.exitCode === 0 ? 'Completed' : 'Error', exitCode: o.exitCode } : o.kind === 'liveness' ? { reason: 'Error', exitCode: 137 } : { reason: 'StartError', exitCode: 128 };
    }
    if (pod.stage >= 1) emitOutcomeEvents(state, pod, false);
  }
}

/** Move every pod to a steady state (used by `rollout status`, `-w` and grading). */
export function settle(state: KubeState, filter?: (pod: PodObject) => boolean) {
  for (let i = 0; i < 3; i++) {
    for (const pod of list(state, 'Pod')) if (!pod.system && pod.stage < 2 && (!filter || filter(pod))) {
      pod.stage += 1;
      if (FAILING_OUTCOMES.has(pod.outcome.kind)) pod.restarts += 1;
    }
    reconcile(state);
  }
}

// ─── Controllers ────────────────────────────────────────────────────────────

export function templateHash(template: PodTemplate): string {
  return safeHash(stableStringify(template), 10);
}

export function revisionOf(rs: ReplicaSetObject): number {
  return Number(rs.meta.annotations['deployment.kubernetes.io/revision'] ?? '0');
}

export function ownedReplicaSets(state: KubeState, dep: DeploymentObject): ReplicaSetObject[] {
  return list(state, 'ReplicaSet', dep.meta.namespace).filter((rs) => rs.meta.ownerKind === 'Deployment' && rs.meta.ownerName === dep.meta.name);
}

export function ownedPods(state: KubeState, kind: string, namespace: string, name: string): PodObject[] {
  return list(state, 'Pod', namespace).filter((p) => p.meta.ownerKind === kind && p.meta.ownerName === name);
}

function surgeCounts(dep: DeploymentObject): { surge: number; unavailable: number } {
  const r = dep.spec.replicas;
  const resolve = (v: number | string, up: boolean) => typeof v === 'number' ? v : (up ? Math.ceil : Math.floor)((r * Number(v.replace('%', ''))) / 100);
  let surge = resolve(dep.spec.strategy.maxSurge, true);
  const unavailable = resolve(dep.spec.strategy.maxUnavailable, false);
  if (surge === 0 && unavailable === 0) surge = 1;
  return { surge, unavailable };
}

export function strategySummary(dep: DeploymentObject): string {
  const fmt = (v: number | string) => typeof v === 'number' ? String(v) : v;
  return fmt(dep.spec.strategy.maxUnavailable) + ' max unavailable, ' + fmt(dep.spec.strategy.maxSurge) + ' max surge';
}

function templateHealthy(state: KubeState, dep: DeploymentObject, template: PodTemplate): boolean {
  const probe = { meta: { name: dep.meta.name + '-probe', namespace: dep.meta.namespace, labels: template.labels, annotations: {}, uid: '', createdAt: 0, generation: 1 }, spec: template.spec, nodeName: 'virtual', ip: '10.244.9.9' };
  const outcome = evaluatePod(state, probe);
  if (outcome.kind !== 'running') return false;
  const exclude = (p: PodObject) => p.meta.ownerKind === 'ReplicaSet' && ownedReplicaSets(state, dep).some((rs) => rs.meta.name === p.meta.ownerName);
  return state.nodes.some((n) => {
    if (n.taint) return false;
    const used = nodeUsage(state, n.name, exclude);
    const req = podRequests(template.spec);
    return used.cpu + req.cpu <= n.cpuMilli && used.memory + req.memory <= n.memoryMi;
  });
}

function rolloutSteps(dep: DeploymentObject, newRs: string, oldRs: string, oldCount: number, healthy: boolean): { steps: string[]; events: string[] } {
  const r = dep.spec.replicas;
  const name = dep.meta.name;
  const steps: string[] = [];
  const events: string[] = [];
  if (dep.spec.strategy.type === 'Recreate') {
    if (oldCount) events.push(`Scaled down replica set ${oldRs} to 0 from ${oldCount}`);
    events.push(`Scaled up replica set ${newRs} to ${r}`);
    for (let i = 0; i < r; i++) steps.push(`Waiting for deployment "${name}" rollout to finish: ${i} of ${r} updated replicas are available...`);
    return { steps, events };
  }
  const { surge, unavailable } = surgeCounts(dep);
  let oldN = oldCount;
  let newN = 0;
  if (!oldCount) {
    events.push(`Scaled up replica set ${newRs} to ${r}`);
    for (let i = 0; i < r; i++) steps.push(`Waiting for deployment "${name}" rollout to finish: ${i} of ${r} updated replicas are available...`);
    return { steps, events };
  }
  for (let guard = 0; guard < 50 && (newN < r || oldN > 0); guard++) {
    let progressed = false;
    const up = Math.min(r, r + surge - oldN);
    if (up > newN) {
      events.push(`Scaled up replica set ${newRs} to ${up}${newN ? ` from ${newN}` : ''}`);
      newN = up;
      progressed = true;
      steps.push(`Waiting for deployment "${name}" rollout to finish: ${newN} out of ${r} new replicas have been updated...`);
    }
    if (!healthy) break;
    const down = Math.max(0, Math.min(oldN, r - unavailable - newN));
    if (down < oldN) {
      events.push(`Scaled down replica set ${oldRs} to ${down} from ${oldN}`);
      oldN = down;
      progressed = true;
      if (oldN > 0) steps.push(`Waiting for deployment "${name}" rollout to finish: ${oldN} old replicas are pending termination...`);
    }
    if (!progressed) break;
  }
  if (!healthy) {
    const down = Math.max(0, Math.min(oldCount, r - unavailable));
    if (down < oldCount) events.push(`Scaled down replica set ${oldRs} to ${down} from ${oldCount}`);
    const newTarget = Math.min(r, r + surge - down);
    if (newTarget > newN) { events.push(`Scaled up replica set ${newRs} to ${newTarget} from ${newN}`); steps.push(`Waiting for deployment "${name}" rollout to finish: ${newTarget} out of ${r} new replicas have been updated...`); }
  }
  return { steps, events };
}

function reconcileDeployment(state: KubeState, dep: DeploymentObject) {
  const ns = dep.meta.namespace;
  const hash = templateHash(dep.spec.template);
  const owned = ownedReplicaSets(state, dep);
  const maxRevision = owned.reduce((m, rs) => Math.max(m, revisionOf(rs)), 0);
  let current = owned.find((rs) => rs.templateHash === hash);
  const previousActive = owned.filter((rs) => rs !== current && rs.spec.replicas > 0);
  const oldCount = previousActive.reduce((n, rs) => n + rs.spec.replicas, 0);
  let changed = false;
  if (!current) {
    const labels = { ...dep.spec.template.labels, 'pod-template-hash': hash };
    current = {
      kind: 'ReplicaSet',
      meta: { name: dep.meta.name + '-' + hash, namespace: ns, labels, annotations: { 'deployment.kubernetes.io/revision': String(maxRevision + 1), 'deployment.kubernetes.io/desired-replicas': String(dep.spec.replicas), 'deployment.kubernetes.io/max-replicas': String(dep.spec.replicas + surgeCounts(dep).surge) }, uid: nextUid(state), createdAt: state.clock, generation: 1, ownerKind: 'Deployment', ownerName: dep.meta.name },
      spec: { replicas: 0, selector: { matchLabels: { ...dep.spec.selector.matchLabels, 'pod-template-hash': hash }, matchExpressions: dep.spec.selector.matchExpressions }, template: { ...clone(dep.spec.template), labels } },
      templateHash: hash,
    };
    if (dep.meta.annotations['kubernetes.io/change-cause']) current.meta.annotations['kubernetes.io/change-cause'] = dep.meta.annotations['kubernetes.io/change-cause'];
    state.objects.push(current);
    changed = true;
  } else if (revisionOf(current) < maxRevision && (previousActive.length > 0 || current.spec.replicas === 0)) {
    current.meta.annotations['deployment.kubernetes.io/revision'] = String(maxRevision + 1);
    if (dep.meta.annotations['kubernetes.io/change-cause']) current.meta.annotations['kubernetes.io/change-cause'] = dep.meta.annotations['kubernetes.io/change-cause'];
    changed = true;
  }
  const r = dep.spec.replicas;
  const healthy = templateHealthy(state, dep, current.spec.template);
  const oldName = previousActive[0]?.meta.name ?? '';
  if (changed) {
    const plan = rolloutSteps(dep, current.meta.name, oldName, oldCount, healthy);
    dep.rollout = { steps: plan.steps, stuck: !healthy, reason: '' };
    for (const message of plan.events) recordEvent(state, dep, 'Normal', 'ScalingReplicaSet', message);
  }
  if (healthy || dep.spec.strategy.type === 'Recreate' || oldCount === 0) {
    if (current.spec.replicas !== r && !changed) recordEvent(state, dep, 'Normal', 'ScalingReplicaSet', `Scaled ${r > current.spec.replicas ? 'up' : 'down'} replica set ${current.meta.name} to ${r} from ${current.spec.replicas}`);
    current.spec.replicas = r;
    for (const rs of previousActive) { if (!changed) recordEvent(state, dep, 'Normal', 'ScalingReplicaSet', `Scaled down replica set ${rs.meta.name} to 0 from ${rs.spec.replicas}`); rs.spec.replicas = 0; }
    if (healthy) dep.rollout.stuck = false;
  } else {
    const { surge, unavailable } = surgeCounts(dep);
    let keep = Math.max(0, Math.min(oldCount, r - unavailable));
    for (const rs of [...previousActive].sort((a, b) => revisionOf(b) - revisionOf(a))) {
      const n = Math.min(rs.spec.replicas, keep);
      rs.spec.replicas = n;
      keep -= n;
    }
    const remaining = previousActive.reduce((n, rs) => n + rs.spec.replicas, 0);
    current.spec.replicas = Math.max(current.spec.replicas, Math.min(r, r + surge - remaining));
    dep.rollout.stuck = true;
  }
  current.meta.annotations['deployment.kubernetes.io/desired-replicas'] = String(r);
  // Trim history beyond revisionHistoryLimit.
  const inactive = ownedReplicaSets(state, dep).filter((rs) => rs !== current && rs.spec.replicas === 0 && ownedPods(state, 'ReplicaSet', ns, rs.meta.name).length === 0).sort((a, b) => revisionOf(a) - revisionOf(b));
  while (inactive.length > dep.spec.revisionHistoryLimit) removeObject(state, inactive.shift()!);
}

function newPod(state: KubeState, owner: { kind: string; name: string }, namespace: string, base: string, template: PodTemplate): PodObject {
  return {
    kind: 'Pod',
    meta: { name: base + '-' + nextSuffix(state), namespace, labels: { ...template.labels }, annotations: { ...template.annotations }, uid: nextUid(state), createdAt: state.clock, generation: 1, ownerKind: owner.kind, ownerName: owner.name },
    spec: clone(template.spec), nodeName: null, ip: null, stage: 0, restarts: 0, outcome: { kind: 'running' },
  };
}

function deletionOrder(pods: PodObject[]): PodObject[] {
  return [...pods].sort((a, b) => Number(podView(a).ready) - Number(podView(b).ready) || b.meta.createdAt - a.meta.createdAt || b.meta.name.localeCompare(a.meta.name));
}

function reconcileReplicaSet(state: KubeState, rs: ReplicaSetObject) {
  const pods = ownedPods(state, 'ReplicaSet', rs.meta.namespace, rs.meta.name);
  if (pods.length < rs.spec.replicas) {
    for (let i = pods.length; i < rs.spec.replicas; i++) {
      const pod = newPod(state, { kind: 'ReplicaSet', name: rs.meta.name }, rs.meta.namespace, rs.meta.name, rs.spec.template);
      state.objects.push(pod);
      recordEvent(state, rs, 'Normal', 'SuccessfulCreate', 'Created pod: ' + pod.meta.name);
    }
  } else if (pods.length > rs.spec.replicas) {
    for (const pod of deletionOrder(pods).slice(0, pods.length - rs.spec.replicas)) {
      removeObject(state, pod);
      recordEvent(state, rs, 'Normal', 'SuccessfulDelete', 'Deleted pod: ' + pod.meta.name);
    }
  }
}

function assignIp(state: KubeState, node: NodeInfo): string {
  state.seq += 1;
  return `10.244.${state.nodes.indexOf(node)}.${(state.seq % 240) + 10}`;
}

const STABLE_OUTCOMES = new Set<PodOutcome['kind']>(['running', 'not-ready', 'completed', 'oom', 'liveness', 'start-error']);

function reconcilePod(state: KubeState, pod: PodObject) {
  if (pod.system) return;
  const before = pod.outcome.kind;
  if (pod.nodeName && pod.stage > 0 && STABLE_OUTCOMES.has(pod.outcome.kind)) return;
  let first = false;
  if (!pod.nodeName) {
    const pvcBlock = evaluatePod(state, { ...pod, nodeName: 'virtual' });
    if (pvcBlock.kind === 'unschedulable') {
      pod.outcome = pvcBlock;
      recordEvent(state, pod, 'Warning', 'FailedScheduling', pvcBlock.message);
      return;
    }
    const placed = schedule(state, pod.spec);
    if ('message' in placed) {
      pod.outcome = { kind: 'unschedulable', message: placed.message };
      recordEvent(state, pod, 'Warning', 'FailedScheduling', placed.message);
      return;
    }
    pod.nodeName = placed.node.name;
    pod.ip = assignIp(state, placed.node);
    pod.stage = 0;
    first = true;
  }
  const outcome = evaluatePod(state, pod);
  if (outcome.kind !== before && !first) pod.stage = 0;
  pod.outcome = outcome;
  if (outcome.kind === 'running' || outcome.kind === 'not-ready') {
    const env: Record<string, string> = {};
    for (const c of pod.spec.containers) { const r = resolveEnv(state, pod.meta.namespace, pod.meta.name, c); if ('env' in r) Object.assign(env, r.env); }
    pod.startedEnv = env;
  }
  if (first || outcome.kind !== before) emitOutcomeEvents(state, pod, true);
}

function reconcileJob(state: KubeState, job: ObjOf<'Job'>) {
  const pods = ownedPods(state, 'Job', job.meta.namespace, job.meta.name);
  if (!pods.length) {
    const template = { ...job.spec.template, labels: { ...job.spec.template.labels, 'job-name': job.meta.name, 'batch.kubernetes.io/job-name': job.meta.name } };
    const pod = newPod(state, { kind: 'Job', name: job.meta.name }, job.meta.namespace, job.meta.name, template);
    state.objects.push(pod);
    recordEvent(state, job, 'Normal', 'SuccessfulCreate', 'Created pod: ' + pod.meta.name);
  }
  const done = ownedPods(state, 'Job', job.meta.namespace, job.meta.name).filter((p) => p.outcome.kind === 'completed' && p.stage >= 1).length;
  if (done && !job.succeeded) recordEvent(state, job, 'Normal', 'Completed', 'Job completed');
  job.succeeded = Math.min(done, job.spec.completions);
}

function reconcileHpa(state: KubeState, hpa: ObjOf<'HorizontalPodAutoscaler'>) {
  const dep = find(state, 'Deployment', hpa.meta.namespace, hpa.spec.targetName);
  if (!dep) { hpa.currentCpu = null; return; }
  const pods = list(state, 'Pod', hpa.meta.namespace).filter((p) => matchesSelector(p.meta.labels, dep.spec.selector) && podView(p).ready);
  const requests = dep.spec.template.spec.containers.reduce((n, c) => n + (parseCpu(c.resources.requests.cpu) || 0), 0);
  if (!requests || !pods.length || hpa.spec.cpuTarget === null) hpa.currentCpu = null;
  else {
    const usage = dep.spec.template.spec.containers.reduce((n, c) => n + (lookupImage(c.image)?.cpuMilli ?? 0), 0);
    hpa.currentCpu = Math.round((usage / requests) * 100);
  }
  let desired = dep.spec.replicas;
  if (hpa.currentCpu !== null && hpa.spec.cpuTarget) desired = Math.ceil(dep.spec.replicas * (hpa.currentCpu / hpa.spec.cpuTarget));
  desired = Math.min(hpa.spec.maxReplicas, Math.max(hpa.spec.minReplicas, desired));
  if (desired !== dep.spec.replicas) {
    recordEvent(state, hpa, 'Normal', 'SuccessfulRescale', `New size: ${desired}; reason: ${desired < dep.spec.replicas ? 'All metrics below target' : desired === hpa.spec.minReplicas ? 'Current number of replicas below Spec.MinReplicas' : 'cpu resource utilization (percentage of request) above target'}`);
    dep.spec.replicas = desired;
  }
  hpa.currentReplicas = dep.spec.replicas;
}

/** Bring every controller to its desired state. Idempotent. */
export function reconcile(state: KubeState) {
  for (const pvc of list(state, 'PersistentVolumeClaim')) {
    if (pvc.phase === 'Bound') continue;
    if (STORAGE_CLASSES.some((sc) => sc.name === pvc.spec.storageClassName)) {
      pvc.phase = 'Bound';
      pvc.volumeName = 'pvc-' + pvc.meta.uid;
      recordEvent(state, pvc, 'Normal', 'ProvisioningSucceeded', 'Successfully provisioned volume ' + pvc.volumeName);
    } else recordEvent(state, pvc, 'Warning', 'ProvisioningFailed', 'storageclass.storage.k8s.io "' + pvc.spec.storageClassName + '" not found');
  }
  for (const hpa of list(state, 'HorizontalPodAutoscaler')) reconcileHpa(state, hpa);
  for (const dep of list(state, 'Deployment')) if (!dep.system) reconcileDeployment(state, dep);
  for (const rs of list(state, 'ReplicaSet')) if (!rs.system) reconcileReplicaSet(state, rs);
  for (const job of list(state, 'Job')) reconcileJob(state, job);
  for (const pod of list(state, 'Pod')) reconcilePod(state, pod);
  for (const svc of list(state, 'Service')) {
    if (!svc.spec.clusterIP) { state.seq += 1; svc.spec.clusterIP = `10.96.${20 + (state.seq % 200)}.${10 + ((state.seq * 37) % 240)}`; }
    if (svc.spec.type !== 'ClusterIP') svc.spec.ports.forEach((p, i) => { p.nodePort ??= 30000 + (parseInt(safeHash(`${svc.meta.name}${i}`, 4).replace(/\D/g, '') || '1', 10) * 7 + svc.spec.ports.length * 13 + i) % 2768; });
    if (svc.spec.type === 'LoadBalancer' && !svc.externalIP) { state.seq += 1; svc.externalIP = `203.0.113.${30 + (state.seq % 200)}`; }
    if (svc.spec.type !== 'LoadBalancer') delete svc.externalIP;
  }
  for (const ing of list(state, 'Ingress')) {
    if (ing.spec.ingressClassName && INGRESS_CLASSES.includes(ing.spec.ingressClassName)) {
      if (!ing.address) recordEvent(state, ing, 'Normal', 'Sync', 'Scheduled for sync');
      ing.address = INGRESS_ADDRESS;
    } else delete ing.address;
  }
}

// ─── Networking ─────────────────────────────────────────────────────────────

export function serviceEndpoints(state: KubeState, svc: ServiceObject): { ready: { pod: PodObject; port: number }[]; notReady: PodObject[] } {
  const ready: { pod: PodObject; port: number }[] = [];
  const notReady: PodObject[] = [];
  if (!Object.keys(svc.spec.selector).length) return { ready, notReady };
  for (const pod of list(state, 'Pod', svc.meta.namespace)) {
    if (!matchesLabels(pod.meta.labels, svc.spec.selector) || !pod.ip || pod.outcome.kind === 'completed') continue;
    const view = podView(pod);
    const target = svc.spec.ports[0]?.targetPort ?? 80;
    const port = pod.spec.containers.map((c) => resolvePort(c, target)).find((p): p is number => p !== null) ?? (typeof target === 'number' ? target : 0);
    if (view.ready) ready.push({ pod, port }); else if (view.phase === 'Running' || view.status === 'Running') notReady.push(pod);
  }
  ready.sort((a, b) => a.pod.meta.name.localeCompare(b.pod.meta.name));
  return { ready, notReady };
}

export interface HttpResponse { status: number; body: string; headers: Record<string, string> }

export function statusText(status: number): string {
  return ({ 200: 'OK', 404: 'Not Found', 502: 'Bad Gateway', 503: 'Service Temporarily Unavailable' } as Record<number, string>)[status] ?? '';
}

/** Serve a request from a pod listening on `port`. */
export function podRequest(pod: PodObject, port: number, path: string): HttpResponse | { error: string } {
  const view = podView(pod);
  if (view.phase !== 'Running' || !pod.ip) return { error: 'connect: connection refused' };
  for (const c of pod.spec.containers) {
    const image = lookupImage(c.image);
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- explicit narrowing kept
    if (!image || image.port !== port) continue;
    if (image.protocol !== 'http') return { error: 'Received HTTP/0.9 when not allowed' };
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty path segment must fall back to '/'
    const clean = path.split('?')[0] || '/';
    const route = image.routes[clean];
    if (!route) return { status: 404, body: '404 page not found', headers: { 'content-type': 'text/plain; charset=utf-8' } };
    return { status: route.status, body: route.body, headers: { 'content-type': route.contentType ?? 'text/html' } };
  }
  return { error: 'connect: connection refused' };
}

function nginxPage(status: number): HttpResponse {
  const text = `${status} ${statusText(status)}`;
  return { status, body: '<html>\n<head><title>' + text + '</title></head>\n<body>\n<center><h1>' + text + '</h1></center>\n<hr><center>nginx</center>\n</body>\n</html>', headers: { 'content-type': 'text/html' } };
}

export function serviceRequest(state: KubeState, svc: ServiceObject, servicePort: number | string, path: string): HttpResponse | { error: string } {
  const port = svc.spec.ports.find((p) => p.port === servicePort || p.name === servicePort);
  if (!port) return { error: 'connect: connection refused' };
  const eps = serviceEndpoints(state, svc).ready;
  if (!eps.length) return { error: 'no endpoints' };
  const first = eps[0]!;
  const target = first.pod.spec.containers.map((c) => resolvePort(c, port.targetPort)).find((p): p is number => p !== null) ?? 0;
  return podRequest(first.pod, target, path);
}

/** Route an HTTP request through the ingress controller using the Host header. */
export function ingressRequest(state: KubeState, host: string, path: string): HttpResponse {
  const candidates: { ns: string; serviceName: string; servicePort: number | string; prefix: string; exact: boolean }[] = [];
  for (const ing of list(state, 'Ingress')) {
    if (!ing.address) continue;
    for (const rule of ing.spec.rules) {
      if (rule.host && rule.host !== host) continue;
      for (const p of rule.paths) candidates.push({ ns: ing.meta.namespace, serviceName: p.serviceName, servicePort: p.servicePort, prefix: p.path, exact: p.pathType === 'Exact' });
    }
  }
  const match = candidates
    .filter((c) => c.exact ? path === c.prefix : path === c.prefix || path.startsWith(c.prefix.endsWith('/') ? c.prefix : c.prefix + '/') || c.prefix === '/')
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!match) return nginxPage(404);
  const svc = find(state, 'Service', match.ns, match.serviceName);
  if (!svc) return nginxPage(503);
  const result = serviceRequest(state, svc, match.servicePort, path);
  if ('error' in result) return nginxPage(result.error === 'no endpoints' ? 503 : 502);
  return result;
}
