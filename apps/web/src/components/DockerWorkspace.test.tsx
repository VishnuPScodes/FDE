import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLevel } from '../lib/content-loader';
import DockerWorkspace from './DockerWorkspace';

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, session: null }) }));

describe('DockerWorkspace', () => {
  beforeEach(() => localStorage.clear());

  it('edits a Dockerfile, runs docker build, and submits passing checks', async () => {
    const user = userEvent.setup();
    const level = await loadLevel('p2-w07-dkr-001');
    render(<DockerWorkspace level={level} hintsUsed={0} onPassed={() => undefined} />);

    const dockerfile = await screen.findByRole('textbox', { name: 'Edit Dockerfile' });
    fireEvent.change(dockerfile, { target: { value: 'FROM python:3.12-slim\nWORKDIR /app\nCOPY app.py .\nCMD ["python", "app.py"]' } });
    await user.type(screen.getByRole('textbox', { name: 'Docker command' }), 'docker build -t hello:local .');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'All checks passed' })).toBeInTheDocument());
  });
});
