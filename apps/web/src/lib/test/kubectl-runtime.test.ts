import { describe, expect, it } from 'vitest';
import { createCluster } from '../kubernetes/controller';
import { runKubectl } from '../kubernetes/kubectl';
import type { KubeState } from '../kubernetes/types';

const DEPLOY = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n        - name: web\n          image: nginx:1.27\n';

function run(state: KubeState, ...lines: string[]) {
  let current = state;
  let last = runKubectl(state, 'kubectl version');
  for (const line of lines) { last = runKubectl(current, line); current = last.state; }
  return { ...last, state: current };
}

describe('kubectl simulator', () => {
  it('applies, reports unchanged/configured, scales and heals deleted pods', () => {
    const base = createCluster({ 'deployment.yaml': DEPLOY });
    const first = run(base, 'kubectl apply -f deployment.yaml');
    expect(first.stdout).toContain('deployment.apps/web created');
    expect(run(first.state, 'kubectl apply -f deployment.yaml').stdout).toContain('unchanged');
    const scaled = run(first.state, 'kubectl scale deployment web --replicas=3', 'kubectl get pods');
    expect(scaled.stdout.split('\n').filter((l) => l.startsWith('web-'))).toHaveLength(3);
    const podName = scaled.stdout.split('\n')[1]!.split(/\s+/)[0]!;
    const healed = run(scaled.state, 'kubectl delete pod ' + podName, 'kubectl get pods');
    expect(healed.stdout).not.toContain(podName);
    expect(healed.stdout.split('\n').filter((l) => l.startsWith('web-'))).toHaveLength(3);
  });

  it('shows pod problems in get, describe and logs', () => {
    const bad = DEPLOY.replace('nginx:1.27', 'nginx:9.9');
    const result = run(createCluster({ 'd.yaml': bad }), 'kubectl apply -f d.yaml', 'kubectl get pods', 'kubectl get pods');
    expect(result.stdout).toContain('ImagePullBackOff');
    const name = result.stdout.split('\n')[1]!.split(/\s+/)[0]!;
    expect(run(result.state, 'kubectl describe pod ' + name).stdout).toContain('Failed to pull image');
    expect(run(result.state, 'kubectl logs ' + name).stderr).toContain('waiting to start');
  });

  it('supports dry runs, create helpers, namespaces and errors', () => {
    const base = createCluster({ 'd.yaml': DEPLOY });
    const dry = run(base, 'kubectl apply -f d.yaml --dry-run=client');
    expect(dry.stdout).toContain('created (dry run)');
    expect(dry.state.objects.some((o) => o.kind === 'Deployment')).toBe(false);
    expect(run(base, 'kubectl create namespace shop', 'kubectl get ns').stdout).toContain('shop');
    expect(run(base, 'kubectl get pods -n nope').stderr).toContain('No resources found');
    expect(run(base, 'kubectl apply -f missing.yaml').stderr).toContain('does not exist');
    expect(run(base, 'kubectl bogus').stderr).toContain('unknown command');
    const exposed = run(base, 'kubectl create deployment api --image=nginx:1.27 --replicas=2', 'kubectl expose deployment api --port=80', 'curl http://api/');
    expect(exposed.stdout).toContain('Welcome to nginx');
  });

  it('tracks rollout history and restarts', () => {
    const first = run(createCluster({ 'd.yaml': DEPLOY }), 'kubectl apply -f d.yaml', 'kubectl set image deployment/web web=nginx:1.26', 'kubectl rollout restart deployment/web', 'kubectl rollout history deployment/web');
    expect(first.stdout).toContain('REVISION');
    expect(first.stdout.split('\n').filter((l) => /^\d/.test(l)).length).toBeGreaterThanOrEqual(2);
    expect(run(first.state, 'kubectl rollout status deployment/web').stdout).toContain('successfully rolled out');
  });
});
