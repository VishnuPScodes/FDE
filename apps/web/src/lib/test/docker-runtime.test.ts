import { describe, expect, it } from 'vitest';
import { createDockerState, runDockerCommand } from '../docker-runtime';
import { gradeDockerLevel } from '../docker-grader';

function command(state: ReturnType<typeof createDockerState>, text: string) {
  return runDockerCommand(state, text);
}

describe('Docker simulator', () => {
  it('builds from a slim base and exposes estimated size and user', () => {
    let state = createDockerState({ Dockerfile: 'FROM python:3.12-slim\nCOPY app.py .\nUSER 10001\nCMD ["python","app.py"]', 'app.py': 'print(1)' });
    state = command(state, 'docker build -t api:local .').state;
    expect(state.images[0]).toMatchObject({ tag: 'api:local', sizeMb: 49, user: '10001' });
    expect(gradeDockerLevel([{ kind: 'sim_state', path: 'images', contains: 'api:local 49MB user=10001' }], state)[0]?.passed).toBe(true);
  });

  it('keeps the runtime base in a multi-stage image and rejects missing COPY sources', () => {
    const good = createDockerState({ Dockerfile: 'FROM python:3.12 AS builder\nRUN pip install requests\nFROM python:3.12-slim AS runtime\nCOPY --from=builder /app/app.py .', 'app.py': 'ok' });
    const built = command(good, 'docker build -t api:local .');
    expect(built.state.images[0]?.sizeMb).toBe(49);
    expect(built.state.images[0]?.stages).toEqual(['builder', 'runtime']);
    const bad = command(createDockerState({ Dockerfile: 'FROM python:3.12-slim\nCOPY missing.py .' }), 'docker build -t bad:local .');
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr).toContain('missing.py');
  });

  it('runs, logs, stops containers and reports a host port conflict', () => {
    let state = createDockerState({ Dockerfile: 'FROM python:3.12-slim\nCMD ["python","app.py"]' });
    state = command(state, 'docker build -t api:local .').state;
    state = command(state, 'docker run -d --name api -p 8080:8000 api:local').state;
    expect(command(state, 'docker logs api').stdout).toContain('python app.py');
    const conflict = command(state, 'docker run -d --name other -p 8080:9000 api:local');
    expect(conflict.stderr).toContain('port is already allocated');
    state = command(state, 'docker stop api').state;
    expect(state.containers[0]?.status).toBe('exited');
  });

  it('requires simulated registry login before push and supports compose lifecycle', () => {
    let state = createDockerState({ Dockerfile: 'FROM alpine:3.20', 'docker-compose.yml': 'services:\n  api:\n    image: api:local\n  worker:\n    image: api:local\n    depends_on: [api]\n' });
    state = command(state, 'docker build -t api:local .').state;
    state = command(state, 'docker tag api:local registry.example.test/team/api:1').state;
    expect(command(state, 'docker push registry.example.test/team/api:1').stderr).toContain('docker login');
    state = command(state, 'docker login registry.example.test').state;
    state = command(state, 'docker push registry.example.test/team/api:1').state;
    expect(state.registry).toContain('registry.example.test/team/api:1');
    state = command(state, 'docker compose up -d').state;
    expect(state.containers.map((item) => item.name)).toEqual(['worker', 'api']);
    state = command(state, 'docker compose down').state;
    expect(state.containers).toHaveLength(0);
  });

  it('tracks image health checks, Docker networks, and volumes', () => {
    let state = createDockerState({ Dockerfile: 'FROM alpine:3.20\nHEALTHCHECK CMD test -f /ready\n' });
    state = command(state, 'docker build -t api:local .').state;
    state = command(state, 'docker run -d --name api api:local').state;
    expect(state.containers[0]?.health).toBe('healthy');
    state = command(state, 'docker network create backend').state;
    state = command(state, 'docker volume create pgdata').state;
    expect(state.networks).toContain('backend');
    expect(state.volumes).toContain('pgdata');
  });
});
