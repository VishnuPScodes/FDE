import yaml from 'js-yaml';
import type {
  ContainerSpec, EnvFromSource, EnvVar, KubeObject, LabelSelector, Labels, ObjectMeta, PodSpec, PodTemplate, Probe, ServicePort, Volume,
} from './types';
import { DNS_LABEL, DNS_SUBDOMAIN, decodeBase64, encodeBase64, isRecord, parseCpu, parseMemory } from './util';
import { plainString } from '../plain-string';

/** API versions served by the simulated API server, per kind. */
export const API_VERSIONS: Record<string, string[]> = {
  Pod: ['v1'], Service: ['v1'], ConfigMap: ['v1'], Secret: ['v1'], Namespace: ['v1'], PersistentVolumeClaim: ['v1'],
  Deployment: ['apps/v1'], Ingress: ['networking.k8s.io/v1'], HorizontalPodAutoscaler: ['autoscaling/v2', 'autoscaling/v1'],
  Job: ['batch/v1'], CronJob: ['batch/v1'],
};

export type ParsedDoc = { ok: true; object: KubeObject; explicitNamespace: boolean } | { ok: false; error: string };

class Issues {
  invalid: string[] = [];
  decode: string | null = null;
  unknown: string[] = [];
  add(path: string, message: string) { this.invalid.push(path + ': ' + message); }
}

const META_FIELDS = ['name', 'namespace', 'labels', 'annotations', 'generateName', 'uid', 'resourceVersion', 'creationTimestamp', 'generation', 'managedFields', 'ownerReferences', 'finalizers'];
const TOP_FIELDS: Record<string, string[]> = {
  default: ['apiVersion', 'kind', 'metadata', 'spec', 'status'],
  ConfigMap: ['apiVersion', 'kind', 'metadata', 'data', 'binaryData', 'immutable'],
  Secret: ['apiVersion', 'kind', 'metadata', 'data', 'stringData', 'type', 'immutable'],
};
const DEPLOYMENT_SPEC = ['replicas', 'selector', 'template', 'strategy', 'revisionHistoryLimit', 'progressDeadlineSeconds', 'minReadySeconds', 'paused'];
const POD_SPEC = ['containers', 'initContainers', 'volumes', 'restartPolicy', 'nodeSelector', 'serviceAccountName', 'terminationGracePeriodSeconds', 'securityContext', 'affinity', 'tolerations', 'imagePullSecrets', 'dnsPolicy', 'hostname', 'priorityClassName', 'automountServiceAccountToken'];
const CONTAINER = ['name', 'image', 'imagePullPolicy', 'command', 'args', 'ports', 'env', 'envFrom', 'resources', 'readinessProbe', 'livenessProbe', 'startupProbe', 'volumeMounts', 'workingDir', 'securityContext', 'lifecycle', 'stdin', 'tty', 'terminationMessagePath', 'terminationMessagePolicy'];
const SERVICE_SPEC = ['type', 'selector', 'ports', 'clusterIP', 'clusterIPs', 'externalTrafficPolicy', 'sessionAffinity', 'loadBalancerIP', 'ipFamilies', 'ipFamilyPolicy', 'internalTrafficPolicy'];
const SERVICE_PORT = ['name', 'port', 'targetPort', 'nodePort', 'protocol', 'appProtocol'];
const PROBE = ['httpGet', 'tcpSocket', 'exec', 'grpc', 'initialDelaySeconds', 'periodSeconds', 'timeoutSeconds', 'successThreshold', 'failureThreshold', 'terminationGracePeriodSeconds'];

function checkFields(value: Record<string, unknown>, allowed: string[], path: string, issues: Issues) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.unknown.push(path ? path + '.' + key : key);
}

function goType(value: unknown): string {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'bool';
  if (Array.isArray(value)) return 'array';
  if (isRecord(value)) return 'object';
  return 'string';
}

function str(value: unknown, path: string, struct: string, issues: Issues): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    issues.decode ??= 'json: cannot unmarshal ' + goType(value) + ' into Go struct field ' + struct + '.' + path + ' of type string';
    return plainString(value);
  }
  return value;
}

function int(value: unknown, path: string, struct: string, issues: Issues, type = 'int32'): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    issues.decode ??= 'json: cannot unmarshal ' + goType(value) + ' into Go struct field ' + struct + '.' + path + ' of type ' + type;
    return undefined;
  }
  return value;
}

function stringMap(value: unknown, path: string, struct: string, issues: Issues): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) { issues.decode ??= 'json: cannot unmarshal ' + goType(value) + ' into Go struct field ' + struct + '.' + path + ' of type map[string]string'; return {}; }
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') issues.decode ??= 'json: cannot unmarshal ' + goType(item) + ' into Go struct field ' + struct + '.' + path + ' of type string';
    out[key] = String(item);
  }
  return out;
}

function intOrString(value: unknown): number | string | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value;
  return undefined;
}

function readMeta(raw: Record<string, unknown>, issues: Issues): ObjectMeta & { explicitNamespace: boolean } {
  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  checkFields(metadata, META_FIELDS, 'metadata', issues);
  const name = str(metadata.name, 'metadata.name', 'ObjectMeta', issues) ?? '';
  const namespace = str(metadata.namespace, 'metadata.namespace', 'ObjectMeta', issues) ?? '';
  return {
    name, namespace, explicitNamespace: Boolean(namespace),
    labels: stringMap(metadata.labels, 'metadata.labels', 'ObjectMeta', issues),
    annotations: stringMap(metadata.annotations, 'metadata.annotations', 'ObjectMeta', issues),
    uid: '', createdAt: 0, generation: 1,
  };
}

function validateLabels(labels: Labels, path: string, issues: Issues) {
  for (const [key, value] of Object.entries(labels)) {
    if (value.length > 63 || (value !== '' && !/^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/.test(value))) {
      issues.add(path, 'Invalid value: "' + value + '": a valid label must be an empty string or consist of alphanumeric characters, \'-\', \'_\' or \'.\', and must start and end with an alphanumeric character');
    }
    if (!/^([a-z0-9.-]+\/)?[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/.test(key)) issues.add(path, 'Invalid value: "' + key + '": name part must consist of alphanumeric characters, \'-\', \'_\' or \'.\'');
  }
}

function readProbe(value: unknown, path: string, issues: Issues): Probe | undefined {
  if (!isRecord(value)) return undefined;
  checkFields(value, PROBE, path, issues);
  const probe: Probe = {};
  if (isRecord(value.httpGet)) {
    const port = intOrString(value.httpGet.port);
    if (port === undefined) issues.add(path + '.httpGet.port', 'Required value');
    probe.httpGet = { path: typeof value.httpGet.path === 'string' ? value.httpGet.path : '/', port: port ?? 0 };
  }
  if (isRecord(value.tcpSocket)) probe.tcpSocket = { port: intOrString(value.tcpSocket.port) ?? 0 };
  if (isRecord(value.exec)) probe.exec = { command: Array.isArray(value.exec.command) ? value.exec.command.map(String) : [] };
  if (!probe.httpGet && !probe.tcpSocket && !probe.exec) issues.add(path, 'Required value: must specify a handler type');
  for (const key of ['initialDelaySeconds', 'periodSeconds', 'failureThreshold'] as const) {
    const n = int(value[key], path + '.' + key, 'Probe', issues);
    if (n !== undefined) probe[key] = n;
  }
  return probe;
}

function readContainer(value: unknown, path: string, issues: Issues): ContainerSpec | null {
  if (!isRecord(value)) { issues.add(path, 'Invalid value: must be an object'); return null; }
  checkFields(value, CONTAINER, path, issues);
  const name = str(value.name, path + '.name', 'Container', issues) ?? '';
  const image = str(value.image, path + '.image', 'Container', issues) ?? '';
  if (!name) issues.add(path + '.name', 'Required value');
  else if (!DNS_LABEL.test(name)) issues.add(path + '.name', 'Invalid value: "' + name + '": a lowercase RFC 1123 label must consist of lower case alphanumeric characters or \'-\', and must start and end with an alphanumeric character (e.g. \'my-name\',  or \'123-abc\', regex used for validation is \'[a-z0-9]([-a-z0-9]*[a-z0-9])?\')');
  if (!image) issues.add(path + '.image', 'Required value');
  const ports = Array.isArray(value.ports) ? value.ports.flatMap((port, i) => {
    if (!isRecord(port)) return [];
    const containerPort = int(port.containerPort, path + '.ports.containerPort', 'ContainerPort', issues);
    if (containerPort === undefined) { issues.add(`${path}.ports[${i}].containerPort`, 'Required value'); return []; }
    return [{ ...(typeof port.name === 'string' ? { name: port.name } : {}), containerPort, protocol: typeof port.protocol === 'string' ? port.protocol : 'TCP' }];
  }) : [];
  const env: EnvVar[] = Array.isArray(value.env) ? value.env.flatMap((item, i) => {
    if (!isRecord(item)) return [];
    const envName = str(item.name, path + '.env.name', 'EnvVar', issues) ?? '';
    if (!envName) issues.add(`${path}.env[${i}].name`, 'Required value');
    const entry: EnvVar = { name: envName };
    if (item.value !== undefined) entry.value = str(item.value, 'spec.template.spec.containers.env.value', 'EnvVar', issues);
    if (isRecord(item.valueFrom)) {
      const from = item.valueFrom;
      const ref = (raw: unknown) => isRecord(raw) ? { name: plainString(raw.name ?? ''), key: plainString(raw.key ?? ''), ...(raw.optional === true ? { optional: true } : {}) } : undefined;
      entry.valueFrom = {};
      const cm = ref(from.configMapKeyRef);
      const secret = ref(from.secretKeyRef);
      if (cm) entry.valueFrom.configMapKeyRef = cm;
      if (secret) entry.valueFrom.secretKeyRef = secret;
      if (isRecord(from.fieldRef)) entry.valueFrom.fieldRef = { fieldPath: plainString(from.fieldRef.fieldPath ?? '') };
      if (!cm && !secret && !entry.valueFrom.fieldRef) issues.add(`${path}.env[${i}].valueFrom`, 'Invalid value: "": must specify one of: `fieldRef`, `resourceFieldRef`, `configMapKeyRef` or `secretKeyRef`');
    }
    return [entry];
  }) : [];
  const envFrom: EnvFromSource[] = Array.isArray(value.envFrom) ? value.envFrom.flatMap((item) => {
    if (!isRecord(item)) return [];
    const entry: EnvFromSource = {};
    if (typeof item.prefix === 'string') entry.prefix = item.prefix;
    if (isRecord(item.configMapRef)) entry.configMapRef = { name: plainString(item.configMapRef.name ?? ''), ...(item.configMapRef.optional === true ? { optional: true } : {}) };
    if (isRecord(item.secretRef)) entry.secretRef = { name: plainString(item.secretRef.name ?? ''), ...(item.secretRef.optional === true ? { optional: true } : {}) };
    return [entry];
  }) : [];
  const rawResources = isRecord(value.resources) ? value.resources : {};
  const requests = stringMap(rawResources.requests, 'spec.template.spec.containers.resources.requests', 'ResourceRequirements', issues);
  const limits = stringMap(rawResources.limits, 'spec.template.spec.containers.resources.limits', 'ResourceRequirements', issues);
  for (const map of [requests, limits]) {
    for (const [resource, quantity] of Object.entries(map)) {
      const parsed = resource === 'cpu' ? parseCpu(quantity) : resource === 'memory' ? parseMemory(quantity) : 0;
      if (Number.isNaN(parsed)) issues.decode ??= 'quantities must match the regular expression \'^([+-]?[0-9.]+)([eEinumkKMGTP]*[-+]?[0-9]*)$\'';
    }
  }
  for (const resource of ['cpu', 'memory'] as const) {
    const parse = resource === 'cpu' ? parseCpu : parseMemory;
    const req = requests[resource];
    const lim = limits[resource];
    if (req !== undefined && lim !== undefined && parse(req) > parse(lim)) {
      issues.add(path + '.resources.requests', 'Invalid value: "' + req + '": must be less than or equal to ' + resource + ' limit of ' + lim);
    }
  }
  const container: ContainerSpec = {
    name, image,
    imagePullPolicy: typeof value.imagePullPolicy === 'string' ? value.imagePullPolicy : image.endsWith(':latest') || !image.includes(':') ? 'Always' : 'IfNotPresent',
    ports, env, envFrom, resources: { requests, limits },
    volumeMounts: Array.isArray(value.volumeMounts) ? value.volumeMounts.flatMap((m) => isRecord(m) ? [{ name: plainString(m.name ?? ''), mountPath: plainString(m.mountPath ?? ''), ...(m.readOnly === true ? { readOnly: true } : {}) }] : []) : [],
  };
  if (Array.isArray(value.command)) container.command = value.command.map(String);
  if (Array.isArray(value.args)) container.args = value.args.map(String);
  const readiness = readProbe(value.readinessProbe, path + '.readinessProbe', issues);
  const liveness = readProbe(value.livenessProbe, path + '.livenessProbe', issues);
  if (readiness) container.readinessProbe = readiness;
  if (liveness) container.livenessProbe = liveness;
  return container;
}

function readPodSpec(value: unknown, path: string, issues: Issues, defaultRestart = 'Always'): PodSpec {
  const raw = isRecord(value) ? value : {};
  if (!isRecord(value)) issues.add(path, 'Required value');
  checkFields(raw, POD_SPEC, path, issues);
  const containers = Array.isArray(raw.containers) ? raw.containers.map((c, i) => readContainer(c, `${path}.containers[${i}]`, issues)).filter((c): c is ContainerSpec => c !== null) : [];
  if (!containers.length && isRecord(value)) issues.add(path + '.containers', 'Required value');
  const names = new Set<string>();
  containers.forEach((c, i) => { if (names.has(c.name)) issues.add(`${path}.containers[${i}].name`, 'Duplicate value: "' + c.name + '"'); names.add(c.name); });
  const volumes: Volume[] = Array.isArray(raw.volumes) ? raw.volumes.flatMap((v) => {
    if (!isRecord(v)) return [];
    const volume: Volume = { name: plainString(v.name ?? '') };
    if (isRecord(v.configMap)) volume.configMap = { name: plainString(v.configMap.name ?? ''), ...(v.configMap.optional === true ? { optional: true } : {}) };
    if (isRecord(v.secret)) volume.secret = { secretName: plainString(v.secret.secretName ?? ''), ...(v.secret.optional === true ? { optional: true } : {}) };
    if (isRecord(v.persistentVolumeClaim)) volume.persistentVolumeClaim = { claimName: plainString(v.persistentVolumeClaim.claimName ?? '') };
    if (isRecord(v.emptyDir)) volume.emptyDir = {};
    return [volume];
  }) : [];
  containers.forEach((c, ci) => c.volumeMounts.forEach((m, mi) => {
    if (!volumes.some((v) => v.name === m.name)) issues.add(`${path}.containers[${ci}].volumeMounts[${mi}].name`, 'Not found: "' + m.name + '"');
  }));
  const spec: PodSpec = { containers, volumes, restartPolicy: typeof raw.restartPolicy === 'string' ? raw.restartPolicy : defaultRestart };
  if (isRecord(raw.nodeSelector)) spec.nodeSelector = stringMap(raw.nodeSelector, path + '.nodeSelector', 'PodSpec', issues);
  return spec;
}

function readTemplate(value: unknown, path: string, issues: Issues, defaultRestart = 'Always'): PodTemplate {
  const raw = isRecord(value) ? value : {};
  if (!isRecord(value)) issues.add(path, 'Required value');
  checkFields(raw, ['metadata', 'spec'], path, issues);
  const meta = isRecord(raw.metadata) ? raw.metadata : {};
  const labels = stringMap(meta.labels, path + '.metadata.labels', 'ObjectMeta', issues);
  validateLabels(labels, path + '.metadata.labels', issues);
  return { labels, annotations: stringMap(meta.annotations, path + '.metadata.annotations', 'ObjectMeta', issues), spec: readPodSpec(raw.spec, path + '.spec', issues, defaultRestart) };
}

function readSelector(value: unknown, issues: Issues): LabelSelector {
  const raw = isRecord(value) ? value : {};
  return {
    matchLabels: stringMap(raw.matchLabels, 'spec.selector.matchLabels', 'LabelSelector', issues),
    matchExpressions: Array.isArray(raw.matchExpressions) ? raw.matchExpressions.flatMap((e) => isRecord(e) && typeof e.key === 'string' && typeof e.operator === 'string'
      ? [{ key: e.key, operator: e.operator as LabelSelector['matchExpressions'][number]['operator'], values: Array.isArray(e.values) ? e.values.map(String) : [] }] : []) : [],
  };
}

function percentOrInt(value: unknown, fallback: string): number | string {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+%$/.test(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return fallback;
}

/** Convert one decoded YAML document into a typed object, or a kubectl-style error. */
export function parseObject(raw: unknown, source: string): ParsedDoc {
  if (!isRecord(raw)) return { ok: false, error: 'error: error validating "' + source + '": error validating data: invalid object to validate; if you choose to ignore these errors, turn validation off with --validate=false' };
  const kind = typeof raw.kind === 'string' ? raw.kind : '';
  const apiVersion = typeof raw.apiVersion === 'string' ? raw.apiVersion : '';
  if (!apiVersion || !kind) {
    const missing = [!apiVersion ? 'apiVersion not set' : '', !kind ? 'kind not set' : ''].filter(Boolean).join(', ');
    return { ok: false, error: 'error: error validating "' + source + '": error validating data: [' + missing + ']; if you choose to ignore these errors, turn validation off with --validate=false' };
  }
  const issues = new Issues();
  const meta = readMeta(raw, issues);
  const versions = API_VERSIONS[kind];
  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- explicit narrowing kept
  if (!versions || !versions.includes(apiVersion)) {
    return { ok: false, error: 'error: resource mapping not found for name: "' + meta.name + '" namespace: "' + meta.namespace + '" from "' + source + '": no matches for kind "' + kind + '" in version "' + apiVersion + '"\nensure CRDs are installed first' };
  }
  if (!meta.name) return { ok: false, error: 'error: error when retrieving current configuration of:\nResource: "' + kind.toLowerCase() + 's", GroupVersionKind: "' + apiVersion + ', Kind=' + kind + '"\nName: "", Namespace: "' + meta.namespace + '"\nfrom server for: "' + source + '": resource name may not be empty' };
  checkFields(raw, TOP_FIELDS[kind] ?? TOP_FIELDS.default!, '', issues);
  validateLabels(meta.labels, 'metadata.labels', issues);
  const nameOk = kind === 'Namespace' || kind === 'Service' ? DNS_LABEL.test(meta.name) : DNS_SUBDOMAIN.test(meta.name);
  if (!nameOk || meta.name.length > 253) {
    issues.add('metadata.name', 'Invalid value: "' + meta.name + '": a lowercase RFC 1123 ' + (kind === 'Namespace' || kind === 'Service' ? 'label' : 'subdomain') + ' must consist of lower case alphanumeric characters, \'-\' or \'.\', and must start and end with an alphanumeric character (e.g. \'example.com\', regex used for validation is \'[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*\')');
  }
  const spec = isRecord(raw.spec) ? raw.spec : {};
  const { explicitNamespace, ...objectMeta } = meta;
  objectMeta.source = source;
  let object: KubeObject;

  switch (kind) {
    case 'Pod': {
      object = { kind, meta: objectMeta, spec: readPodSpec(raw.spec, 'spec', issues), nodeName: null, ip: null, stage: 0, restarts: 0, outcome: { kind: 'running' } };
      break;
    }
    case 'Deployment': {
      checkFields(spec, DEPLOYMENT_SPEC, 'spec', issues);
      const replicas = int(spec.replicas, 'spec.replicas', 'DeploymentSpec', issues) ?? 1;
      const template = readTemplate(spec.template, 'spec.template', issues);
      if (spec.selector === undefined) issues.add('spec.selector', 'Required value');
      const selector = readSelector(spec.selector, issues);
      if (spec.selector !== undefined && Object.keys(selector.matchLabels).length + selector.matchExpressions.length === 0) issues.add('spec.selector', 'Invalid value: v1.LabelSelector{MatchLabels:map[string]string(nil), MatchExpressions:[]v1.LabelSelectorRequirement(nil)}: empty selector is invalid for deployment');
      else if (spec.selector !== undefined && !Object.entries(selector.matchLabels).every(([k, v]) => template.labels[k] === v)) {
        issues.add('spec.template.metadata.labels', 'Invalid value: map[string]string{' + Object.entries(template.labels).map(([k, v]) => '"' + k + '":"' + v + '"').join(', ') + '}: `selector` does not match template `labels`');
      }
      const strategyRaw = isRecord(spec.strategy) ? spec.strategy : {};
      const type = strategyRaw.type === 'Recreate' ? 'Recreate' : 'RollingUpdate';
      const rolling = isRecord(strategyRaw.rollingUpdate) ? strategyRaw.rollingUpdate : {};
      const maxSurge = percentOrInt(rolling.maxSurge, '25%');
      const maxUnavailable = percentOrInt(rolling.maxUnavailable, '25%');
      if (type === 'RollingUpdate' && (maxSurge === 0 || maxSurge === '0%') && (maxUnavailable === 0 || maxUnavailable === '0%')) {
        issues.add('spec.strategy.rollingUpdate.maxUnavailable', 'Invalid value: intstr.IntOrString{Type:0, IntVal:0, StrVal:""}: may not be 0 when `maxSurge` is 0');
      }
      if (replicas < 0) issues.add('spec.replicas', `Invalid value: ${replicas}: must be greater than or equal to 0`);
      object = {
        kind, meta: objectMeta,
        spec: { replicas, selector, template, strategy: { type, maxSurge, maxUnavailable }, revisionHistoryLimit: int(spec.revisionHistoryLimit, 'spec.revisionHistoryLimit', 'DeploymentSpec', issues) ?? 10, progressDeadlineSeconds: int(spec.progressDeadlineSeconds, 'spec.progressDeadlineSeconds', 'DeploymentSpec', issues) ?? 600 },
        rollout: { steps: [], stuck: false, reason: '' },
      };
      break;
    }
    case 'Service': {
      checkFields(spec, SERVICE_SPEC, 'spec', issues);
      const type = spec.type === 'NodePort' || spec.type === 'LoadBalancer' ? spec.type : 'ClusterIP';
      if (spec.type !== undefined && !['ClusterIP', 'NodePort', 'LoadBalancer'].includes(plainString(spec.type))) issues.add('spec.type', 'Unsupported value: "' + plainString(spec.type) + '": supported values: "ClusterIP", "ExternalName", "LoadBalancer", "NodePort"');
      const ports: ServicePort[] = Array.isArray(spec.ports) ? spec.ports.flatMap((p, i) => {
        if (!isRecord(p)) return [];
        checkFields(p, SERVICE_PORT, `spec.ports[${i}]`, issues);
        const port = int(p.port, 'spec.ports.port', 'ServicePort', issues);
        if (port === undefined) { issues.add(`spec.ports[${i}].port`, 'Required value'); return []; }
        const nodePort = int(p.nodePort, 'spec.ports.nodePort', 'ServicePort', issues);
        if (nodePort !== undefined && (nodePort < 30000 || nodePort > 32767)) issues.add(`spec.ports[${i}].nodePort`, `Invalid value: ${nodePort}: provided port is not in the valid range. The range of valid ports is 30000-32767`);
        return [{ ...(typeof p.name === 'string' ? { name: p.name } : {}), port, targetPort: intOrString(p.targetPort) ?? port, ...(nodePort !== undefined ? { nodePort } : {}), protocol: typeof p.protocol === 'string' ? p.protocol : 'TCP' }];
      }) : [];
      if (!ports.length) issues.add('spec.ports', 'Required value');
      if (ports.length > 1) ports.forEach((p, i) => { if (!p.name) issues.add(`spec.ports[${i}].name`, 'Required value'); });
      object = { kind, meta: objectMeta, spec: { type, selector: stringMap(spec.selector, 'spec.selector', 'ServiceSpec', issues), ports, clusterIP: '' } };
      break;
    }
    case 'Ingress': {
      checkFields(spec, ['ingressClassName', 'rules', 'tls', 'defaultBackend'], 'spec', issues);
      const rules = Array.isArray(spec.rules) ? spec.rules.flatMap((rule, ri) => {
        if (!isRecord(rule)) return [];
        const http = isRecord(rule.http) ? rule.http : {};
        const paths = Array.isArray(http.paths) ? http.paths.flatMap((p, pi) => {
          if (!isRecord(p)) return [];
          const at = `spec.rules[${ri}].http.paths[${pi}]`;
          if (typeof p.pathType !== 'string') issues.add(at + '.pathType', 'Required value: pathType must be specified');
          else if (!['Prefix', 'Exact', 'ImplementationSpecific'].includes(p.pathType)) issues.add(at + '.pathType', 'Unsupported value: "' + p.pathType + '": supported values: "Exact", "ImplementationSpecific", "Prefix"');
          const backend = isRecord(p.backend) ? p.backend : {};
          const service = isRecord(backend.service) ? backend.service : null;
          if (!service) { issues.add(at + '.backend', 'Invalid value: "": resource or service must be specified'); return []; }
          const port = isRecord(service.port) ? (typeof service.port.number === 'number' ? service.port.number : typeof service.port.name === 'string' ? service.port.name : undefined) : undefined;
          if (port === undefined) issues.add(at + '.backend.service.port', 'Invalid value: "": port name or number is required');
          const path = typeof p.path === 'string' ? p.path : '/';
          if (!path.startsWith('/')) issues.add(at + '.path', 'Invalid value: "' + path + '": must be an absolute path');
          return [{ path, pathType: typeof p.pathType === 'string' ? p.pathType : 'Prefix', serviceName: plainString(service.name ?? ''), servicePort: port ?? 0 }];
        }) : [];
        return [{ ...(typeof rule.host === 'string' ? { host: rule.host } : {}), paths }];
      }) : [];
      const tls = Array.isArray(spec.tls) ? spec.tls.flatMap((t) => isRecord(t) ? [{ hosts: Array.isArray(t.hosts) ? t.hosts.map(String) : [], ...(typeof t.secretName === 'string' ? { secretName: t.secretName } : {}) }] : []) : [];
      object = { kind, meta: objectMeta, spec: { ...(typeof spec.ingressClassName === 'string' ? { ingressClassName: spec.ingressClassName } : {}), rules, tls } };
      break;
    }
    case 'ConfigMap': {
      const data = stringMap(raw.data, 'data', 'ConfigMap', issues);
      for (const key of Object.keys(data)) if (!/^[-._a-zA-Z0-9]+$/.test(key)) issues.add('data[' + key + ']', 'Invalid value: "' + key + '": a valid config key must consist of alphanumeric characters, \'-\', \'_\' or \'.\'');
      object = { kind, meta: objectMeta, data };
      break;
    }
    case 'Secret': {
      const data: Record<string, string> = {};
      const rawData = isRecord(raw.data) ? raw.data : {};
      for (const [key, value] of Object.entries(rawData)) {
        const decoded = decodeBase64(String(value));
        if (!decoded.ok) {
          issues.decode ??= 'illegal base64 data at input byte ' + decoded.error.replace(/\D+/g, '');
          continue;
        }
        data[key] = String(value).replace(/\s+/g, '');
      }
      for (const [key, value] of Object.entries(stringMap(raw.stringData, 'stringData', 'Secret', issues))) data[key] = encodeBase64(value);
      object = { kind, meta: objectMeta, type: typeof raw.type === 'string' ? raw.type : 'Opaque', data };
      break;
    }
    case 'Namespace': {
      object = { kind, meta: { ...objectMeta, namespace: '' }, phase: 'Active' };
      break;
    }
    case 'PersistentVolumeClaim': {
      const resources = isRecord(spec.resources) && isRecord(spec.resources.requests) ? spec.resources.requests : {};
      const storage = typeof resources.storage === 'string' ? resources.storage : '';
      if (!storage) issues.add('spec.resources[storage]', 'Required value');
      const accessModes = Array.isArray(spec.accessModes) ? spec.accessModes.map(String) : [];
      if (!accessModes.length) issues.add('spec.accessModes', 'Required value: at least 1 access mode is required');
      object = { kind, meta: objectMeta, spec: { accessModes, storage, storageClassName: typeof spec.storageClassName === 'string' ? spec.storageClassName : 'standard' }, phase: 'Pending' };
      break;
    }
    case 'HorizontalPodAutoscaler': {
      const ref = isRecord(spec.scaleTargetRef) ? spec.scaleTargetRef : {};
      if (!ref.name) issues.add('spec.scaleTargetRef.name', 'Required value');
      const maxReplicas = int(spec.maxReplicas, 'spec.maxReplicas', 'HorizontalPodAutoscalerSpec', issues);
      if (maxReplicas === undefined) issues.add('spec.maxReplicas', 'Invalid value: 0: must be greater than or equal to 1');
      const minReplicas = int(spec.minReplicas, 'spec.minReplicas', 'HorizontalPodAutoscalerSpec', issues) ?? 1;
      let cpuTarget: number | null = typeof spec.targetCPUUtilizationPercentage === 'number' ? spec.targetCPUUtilizationPercentage : null;
      if (Array.isArray(spec.metrics)) for (const metric of spec.metrics) {
        if (isRecord(metric) && isRecord(metric.resource) && metric.resource.name === 'cpu' && isRecord(metric.resource.target) && typeof metric.resource.target.averageUtilization === 'number') cpuTarget = metric.resource.target.averageUtilization;
      }
      if (maxReplicas !== undefined && minReplicas > maxReplicas) issues.add('spec.minReplicas', `Invalid value: ${minReplicas}: must be less than or equal to maxReplicas`);
      object = { kind, meta: objectMeta, spec: { targetKind: plainString(ref.kind ?? 'Deployment'), targetName: plainString(ref.name ?? ''), minReplicas, maxReplicas: maxReplicas ?? 1, cpuTarget }, currentReplicas: 0, currentCpu: null };
      break;
    }
    case 'Job': {
      const template = readTemplate(spec.template, 'spec.template', issues, '');
      if (!['Never', 'OnFailure'].includes(template.spec.restartPolicy)) issues.add('spec.template.spec.restartPolicy', template.spec.restartPolicy ? 'Unsupported value: "' + template.spec.restartPolicy + '": supported values: "OnFailure", "Never"' : 'Required value: valid values: "OnFailure", "Never"');
      object = { kind, meta: objectMeta, spec: { template, completions: int(spec.completions, 'spec.completions', 'JobSpec', issues) ?? 1, backoffLimit: int(spec.backoffLimit, 'spec.backoffLimit', 'JobSpec', issues) ?? 6 }, succeeded: 0, failed: 0 };
      break;
    }
    case 'CronJob': {
      const schedule = typeof spec.schedule === 'string' ? spec.schedule : '';
      if (!schedule) issues.add('spec.schedule', 'Required value');
      else if (schedule.trim().split(/\s+/).length !== 5 && !schedule.startsWith('@')) issues.add('spec.schedule', `Invalid value: "${schedule}": expected exactly 5 fields, found ${schedule.trim().split(/\s+/).length}: ${schedule}`);
      const jobTemplate = isRecord(spec.jobTemplate) && isRecord(spec.jobTemplate.spec) ? spec.jobTemplate.spec : {};
      const template = readTemplate(jobTemplate.template, 'spec.jobTemplate.spec.template', issues, '');
      if (!['Never', 'OnFailure'].includes(template.spec.restartPolicy)) issues.add('spec.jobTemplate.spec.template.spec.restartPolicy', 'Required value: valid values: "OnFailure", "Never"');
      object = { kind, meta: objectMeta, spec: { schedule, suspend: spec.suspend === true, jobTemplate: { template, completions: 1, backoffLimit: 6 } } };
      break;
    }
    default:
      return { ok: false, error: 'error: the server doesn\'t have a resource type "' + kind.toLowerCase() + '"' };
  }

  if (issues.unknown.length) {
    return { ok: false, error: `Error from server (BadRequest): error when creating "${source}": ${kind} in version "${apiVersion.split('/').pop()}" cannot be handled as a ${kind}: strict decoding error: ${issues.unknown.map((f) => 'unknown field "' + f + '"').join(', ')}` };
  }
  if (issues.decode) {
    return { ok: false, error: `Error from server (BadRequest): error when creating "${source}": ${kind} in version "${apiVersion.split('/').pop()}" cannot be handled as a ${kind}: ${issues.decode}` };
  }
  if (issues.invalid.length) {
    const head = 'The ' + kind + ' "' + meta.name + '" is invalid: ';
    return { ok: false, error: issues.invalid.length === 1 ? `${head}${issues.invalid[0]}` : head + '\n' + issues.invalid.map((x) => '* ' + x).join('\n') };
  }
  return { ok: true, object, explicitNamespace };
}

/** Parse a (possibly multi-document) YAML manifest file. */
export function parseManifestFile(text: string, source: string): { docs: ParsedDoc[] } | { error: string } {
  let raws: unknown[];
  try {
    raws = yaml.loadAll(text);
  } catch (error) {
    const mark: { line: number } | undefined = error instanceof yaml.YAMLException ? error.mark : undefined;
    const message = error instanceof yaml.YAMLException ? error.reason + (mark ? ` (line ${mark.line + 1})` : '') : String(error);
    return { error: 'error: error parsing ' + source + ': error converting YAML to JSON: yaml: ' + message };
  }
  const docs: ParsedDoc[] = [];
  for (const raw of raws) {
    if (raw === null || raw === undefined) continue;
    if (isRecord(raw) && raw.kind === 'List' && Array.isArray(raw.items)) { for (const item of raw.items) docs.push(parseObject(item, source)); continue; }
    docs.push(parseObject(raw, source));
  }
  if (!docs.length) return { error: 'error: no objects passed to apply' };
  return { docs };
}
