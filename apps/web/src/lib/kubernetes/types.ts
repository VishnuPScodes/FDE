/**
 * Serialisable state for the in-browser Kubernetes + Helm simulator.
 * Every field is plain JSON so the whole cluster can be saved to IndexedDB.
 */

export type Labels = Record<string, string>;

export interface ObjectMeta {
  name: string;
  namespace: string; // '' for cluster-scoped objects
  labels: Labels;
  annotations: Record<string, string>;
  uid: string;
  createdAt: number; // simulated seconds since cluster start
  generation: number;
  ownerKind?: string;
  ownerName?: string;
  /** File the object was last applied from (for messages). */
  source?: string;
}

export interface KeyRef { name: string; key: string; optional?: boolean }
export interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: { configMapKeyRef?: KeyRef; secretKeyRef?: KeyRef; fieldRef?: { fieldPath: string } };
}
export interface EnvFromSource {
  prefix?: string;
  configMapRef?: { name: string; optional?: boolean };
  secretRef?: { name: string; optional?: boolean };
}
export interface Probe {
  httpGet?: { path: string; port: number | string };
  tcpSocket?: { port: number | string };
  exec?: { command: string[] };
  initialDelaySeconds?: number;
  periodSeconds?: number;
  failureThreshold?: number;
}
export interface ContainerPort { name?: string; containerPort: number; protocol: string }
export interface ResourceRequirements { requests: Record<string, string>; limits: Record<string, string> }
export interface VolumeMount { name: string; mountPath: string; readOnly?: boolean }
export interface ContainerSpec {
  name: string;
  image: string;
  imagePullPolicy: string;
  command?: string[];
  args?: string[];
  ports: ContainerPort[];
  env: EnvVar[];
  envFrom: EnvFromSource[];
  resources: ResourceRequirements;
  readinessProbe?: Probe;
  livenessProbe?: Probe;
  volumeMounts: VolumeMount[];
}
export interface Volume {
  name: string;
  configMap?: { name: string; optional?: boolean };
  secret?: { secretName: string; optional?: boolean };
  persistentVolumeClaim?: { claimName: string };
  emptyDir?: Record<string, never>;
}
export interface PodSpec {
  containers: ContainerSpec[];
  volumes: Volume[];
  restartPolicy: string;
  nodeSelector?: Labels;
}
export interface PodTemplate { labels: Labels; annotations: Record<string, string>; spec: PodSpec }

export interface LabelSelector {
  matchLabels: Labels;
  matchExpressions: { key: string; operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist'; values: string[] }[];
}

export type PodOutcome =
  | { kind: 'unschedulable'; message: string }
  | { kind: 'image-pull'; image: string; message: string }
  | { kind: 'config-error'; message: string }
  | { kind: 'mount-error'; message: string }
  | { kind: 'start-error'; message: string; container: string }
  | { kind: 'crash'; log: string; exitCode: number; container: string }
  | { kind: 'oom'; container: string; log: string }
  | { kind: 'liveness'; message: string; container: string }
  | { kind: 'completed'; log: string }
  | { kind: 'not-ready'; message: string; container: string }
  | { kind: 'running' };

export interface PodObject {
  kind: 'Pod';
  meta: ObjectMeta;
  spec: PodSpec;
  nodeName: string | null;
  ip: string | null;
  /** Lifecycle stage: 0-1 creating, 2 first outcome, 3+ steady. */
  stage: number;
  outcome: PodOutcome;
  restarts: number;
  lastTermination?: { reason: string; exitCode: number };
  /** Env captured when the container last started cleanly. */
  startedEnv?: Record<string, string>;
  system?: boolean;
}

export interface DeploymentObject {
  kind: 'Deployment';
  meta: ObjectMeta;
  spec: {
    replicas: number;
    selector: LabelSelector;
    template: PodTemplate;
    strategy: { type: 'RollingUpdate' | 'Recreate'; maxSurge: number | string; maxUnavailable: number | string };
    revisionHistoryLimit: number;
    progressDeadlineSeconds: number;
  };
  /** Human summary of the last rollout, shown by `rollout status`. */
  rollout: { steps: string[]; stuck: boolean; reason: string };
  system?: boolean;
}

export interface ReplicaSetObject {
  kind: 'ReplicaSet';
  meta: ObjectMeta;
  spec: { replicas: number; selector: LabelSelector; template: PodTemplate };
  templateHash: string;
  system?: boolean;
}

export interface ServicePort { name?: string; port: number; targetPort: number | string; nodePort?: number; protocol: string }
export interface ServiceObject {
  kind: 'Service';
  meta: ObjectMeta;
  spec: { type: 'ClusterIP' | 'NodePort' | 'LoadBalancer'; selector: Labels; ports: ServicePort[]; clusterIP: string };
  externalIP?: string;
}

export interface IngressPath { path: string; pathType: string; serviceName: string; servicePort: number | string }
export interface IngressObject {
  kind: 'Ingress';
  meta: ObjectMeta;
  spec: { ingressClassName?: string; rules: { host?: string; paths: IngressPath[] }[]; tls: { hosts: string[]; secretName?: string }[] };
  address?: string;
}

export interface ConfigMapObject { kind: 'ConfigMap'; meta: ObjectMeta; data: Record<string, string> }
export interface SecretObject { kind: 'Secret'; meta: ObjectMeta; type: string; data: Record<string, string> }
export interface NamespaceObject { kind: 'Namespace'; meta: ObjectMeta; phase: 'Active' | 'Terminating' }
export interface PvcObject {
  kind: 'PersistentVolumeClaim';
  meta: ObjectMeta;
  spec: { accessModes: string[]; storage: string; storageClassName: string };
  phase: 'Bound' | 'Pending';
  volumeName?: string;
}
export interface HpaObject {
  kind: 'HorizontalPodAutoscaler';
  meta: ObjectMeta;
  spec: { targetKind: string; targetName: string; minReplicas: number; maxReplicas: number; cpuTarget: number | null };
  currentReplicas: number;
  currentCpu: number | null;
}
export interface JobObject {
  kind: 'Job';
  meta: ObjectMeta;
  spec: { template: PodTemplate; completions: number; backoffLimit: number };
  succeeded: number;
  failed: number;
}
export interface CronJobObject {
  kind: 'CronJob';
  meta: ObjectMeta;
  spec: { schedule: string; suspend: boolean; jobTemplate: { template: PodTemplate; completions: number; backoffLimit: number } };
}

export type KubeObject =
  | PodObject | DeploymentObject | ReplicaSetObject | ServiceObject | IngressObject | ConfigMapObject
  | SecretObject | NamespaceObject | PvcObject | HpaObject | JobObject | CronJobObject;
export type KubeKind = KubeObject['kind'];

export interface NodeInfo {
  name: string;
  roles: string;
  cpuMilli: number;
  memoryMi: number;
  internalIP: string;
  taint?: string;
  labels: Labels;
}

export interface KubeEvent {
  namespace: string;
  objectKind: string;
  objectName: string;
  type: 'Normal' | 'Warning';
  reason: string;
  message: string;
  count: number;
  first: number;
  last: number;
}

export interface KubeContext { name: string; cluster: string; user: string; namespace: string }

export interface HelmRevision {
  revision: number;
  chart: string;
  chartPath: string;
  appVersion: string;
  values: Record<string, unknown>;
  manifest: string;
  notes: string;
  status: 'deployed' | 'superseded' | 'failed' | 'uninstalled' | 'pending-install';
  description: string;
  updated: number;
}
export interface HelmRelease { name: string; namespace: string; revisions: HelmRevision[] }

export interface PortForward { localPort: number; namespace: string; target: string; remotePort: number }

export interface KubeState {
  files: Record<string, string>;
  objects: KubeObject[];
  nodes: NodeInfo[];
  events: KubeEvent[];
  contexts: KubeContext[];
  currentContext: string;
  helm: HelmRelease[];
  portForwards: PortForward[];
  history: string[];
  stdout: string;
  stderr: string;
  lastError: string;
  clock: number;
  seq: number;
}

export interface KubeResult { state: KubeState; stdout: string; stderr: string; exitCode: number }
