import { KUBERNETES_COMMANDS } from '../lib/terminal-vocab';
import { useState } from 'react';
import type { LevelMeta } from '../lib/content-loader';
import { createCluster, list, podView, serviceEndpoints } from '../lib/kubernetes/controller';
import { runKubectl } from '../lib/kubernetes/kubectl';
import type { KubeState } from '../lib/kubernetes/types';
import { gradeKubernetesLevel } from '../lib/kubernetes-grader';
import SimTerminalWorkspace, { type SimEngine } from './SimTerminalWorkspace';
import styles from './SimTerminalWorkspace.module.css';

interface Props { level: LevelMeta; hintsUsed: number; onPassed: () => void }

const engine: SimEngine<KubeState> = {
  phrases: KUBERNETES_COMMANDS,
  label: 'Kubernetes',
  create: createCluster,
  run: runKubectl,
  grade: gradeKubernetesLevel,
  firstFile: /deployment\.ya?ml$/,
  placeholder: 'kubectl get pods',
  intro: 'Cluster ready (kind-fde-training, 3 nodes). Try: kubectl apply -f deployment.yaml, kubectl get pods, kubectl describe pod NAME, kubectl logs NAME. Type help for commands.',
  footnote: 'A small cluster simulated in your browser. Each command moves time forward about 10 seconds, so run kubectl get pods again to see pods change.',
};

const statusClass = (status: string) => (status === 'Running' || status === 'Completed' ? styles.good : status === 'ContainerCreating' || status === 'Pending' ? styles.warn : styles.bad);

function ClusterView({ state }: { state: KubeState }) {
  const namespaces = list(state, 'Namespace').map((ns) => ns.meta.name).filter((name) => !name.startsWith('kube-') && name !== 'ingress-nginx');
  const [chosen, setChosen] = useState('');
  const ns = namespaces.includes(chosen) ? chosen : namespaces.find((name) => list(state, 'Pod', name).length > 0) ?? 'default';
  const pods = list(state, 'Pod', ns);
  const deployments = list(state, 'Deployment', ns);
  const services = list(state, 'Service', ns);
  const ingresses = list(state, 'Ingress', ns);
  return (
    <>
      <select className={styles.picker} aria-label="Namespace" value={ns} onChange={(event) => setChosen(event.target.value)}>
        {namespaces.map((name) => <option key={name} value={name}>namespace: {name}</option>)}
      </select>
      <div className={styles.group}>
        <h4>Deployments</h4>
        {deployments.length === 0 ? <p className={styles.empty}>None</p> : (
          <ul className={styles.rows}>
            {deployments.map((dep) => {
              const ready = pods.filter((p) => podView(p).ready && Object.entries(dep.spec.selector.matchLabels).every(([k, v]) => p.meta.labels[k] === v)).length;
              return <li key={dep.meta.name} className={styles.row}><span>{dep.meta.name}</span><span className={ready === dep.spec.replicas ? styles.good : styles.warn}>{ready}/{dep.spec.replicas} ready</span></li>;
            })}
          </ul>
        )}
      </div>
      <div className={styles.group}>
        <h4>Pods</h4>
        {pods.length === 0 ? <p className={styles.empty}>None</p> : (
          <ul className={styles.rows}>
            {pods.map((pod) => { const view = podView(pod); return <li key={pod.meta.name} className={styles.row}><span>{pod.meta.name}</span><span className={statusClass(view.status)}>{view.status}</span></li>; })}
          </ul>
        )}
      </div>
      <div className={styles.group}>
        <h4>Services</h4>
        {services.length === 0 ? <p className={styles.empty}>None</p> : (
          <ul className={styles.rows}>
            {services.map((svc) => { const n = serviceEndpoints(state, svc).ready.length; return <li key={svc.meta.name} className={styles.row}><span>{svc.meta.name}</span><span className={n ? styles.good : styles.bad}>{n} endpoint{n === 1 ? '' : 's'}</span></li>; })}
          </ul>
        )}
      </div>
      {ingresses.length > 0 && (
        <div className={styles.group}>
          <h4>Ingress</h4>
          <ul className={styles.rows}>
            {ingresses.map((ing) => <li key={ing.meta.name} className={styles.row}><span>{ing.meta.name}</span><span className={ing.address ? styles.good : styles.warn}>{ing.address ?? 'no address'}</span></li>)}
          </ul>
        </div>
      )}
    </>
  );
}

/** Kubernetes level workspace: YAML editor, simulated kubectl, and a live cluster view. */
export default function KubernetesWorkspace({ level, hintsUsed, onPassed }: Props) {
  return <SimTerminalWorkspace level={level} hintsUsed={hintsUsed} onPassed={onPassed} engine={engine} kind="kubernetes" sideTitle="Cluster view" side={(state) => <ClusterView state={state} />} />;
}
