import { expect, test } from '@playwright/test';

test('Week 7 Docker build, runtime, and grading work in the browser', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const [{ loadLevel }, runtime, grader] = await Promise.all([
      import('/src/lib/content-loader.ts'),
      import('/src/lib/docker-runtime.ts'),
      import('/src/lib/docker-grader.ts'),
    ]);
    const level = await loadLevel('p2-w07-dkr-003');
    const files = Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? '']));
    files.Dockerfile = 'FROM python:3.12 AS builder\nWORKDIR /src\nCOPY app.py .\nRUN pip install requests\nFROM python:3.12-slim AS runtime\nWORKDIR /app\nCOPY --from=builder /src/app.py .\nUSER 10001\nCMD ["python", "app.py"]';
    let state = runtime.createDockerState(files);
    state = runtime.runDockerCommand(state, 'docker build -t api:local .').state;
    const buildChecks = grader.gradeDockerLevel(level.checks, state);

    state = runtime.runDockerCommand(state, 'docker run -d --name api -p 8080:8000 api:local').state;
    const runChecks = grader.gradeDockerLevel([{ kind: 'sim_state', path: 'containers', contains: 'api running api:local ports=8080:8000' }], state);
    return { buildChecks, runChecks };
  });
  expect(results.buildChecks.every((check) => check.passed)).toBe(true);
  expect(results.runChecks.every((check) => check.passed)).toBe(true);
});

