import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLevel } from '../lib/content-loader';
import KubernetesWorkspace from './KubernetesWorkspace';
import TerraformWorkspace from './TerraformWorkspace';

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, session: null }) }));

describe('Terraform and Kubernetes workspaces', () => {
  beforeEach(() => localStorage.clear());

  it('edits main.tf, runs terraform and passes the level', async () => {
    const user = userEvent.setup();
    const level = await loadLevel('p2-w08-tf-001');
    const onPassed = vi.fn();
    render(<TerraformWorkspace level={level} hintsUsed={0} onPassed={onPassed} />);
    const editor = await screen.findByRole('textbox', { name: 'Edit main.tf' });
    fireEvent.change(editor, { target: { value: `${(editor as HTMLTextAreaElement).value}\nresource "aws_s3_bucket" "logs" {\n  bucket = "fde-mumbai-logs-2026"\n  tags = {\n    Team = "platform"\n  }\n}\n` } });
    const input = screen.getByRole('textbox', { name: 'Terraform command' });
    for (const command of ['terraform init', 'terraform apply -auto-approve']) {
      await user.type(input, command);
      await user.click(screen.getByRole('button', { name: 'Run' }));
    }
    expect(await screen.findByText(/Apply complete! Resources: 1 added/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'All checks passed' })).toBeInTheDocument());
    expect(onPassed).toHaveBeenCalled();
  });

  it('applies a Deployment, shows it in the cluster view and resets', async () => {
    const user = userEvent.setup();
    const level = await loadLevel('p2-w08-k8s-001');
    render(<KubernetesWorkspace level={level} hintsUsed={0} onPassed={() => undefined} />);
    const editor = await screen.findByRole('textbox', { name: 'Edit deployment.yaml' });
    fireEvent.change(editor, { target: { value: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n        - name: web\n          image: nginx:1.27\n' } });
    await user.type(screen.getByRole('textbox', { name: 'Kubernetes command' }), 'kubectl apply -f deployment.yaml');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('deployment.apps/web created')).toBeInTheDocument();
    expect(screen.getAllByText('web').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Reset level' }));
    await user.click(screen.getByRole('button', { name: 'Yes, reset' }));
    await waitFor(() => expect(screen.queryByText('deployment.apps/web created')).not.toBeInTheDocument());
  });
});
