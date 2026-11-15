async function withRetry<T>(task: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function flaky(failures: number): { run: () => Promise<string>; calls: () => number } {
  let calls = 0;
  return {
    run: async () => {
      calls += 1;
      if (calls <= failures) throw new Error(`fail ${calls}`);
      return 'ok';
    },
    calls: () => calls,
  };
}

test('succeeds after transient failures', async () => {
  const task = flaky(2);
  expect(await withRetry(task.run, 3)).toBe('ok');
  expect(task.calls()).toBe(3);
});
test('stops retrying after the first success', async () => {
  const task = flaky(0);
  await withRetry(task.run, 5);
  expect(task.calls()).toBe(1);
});
test('throws the last error when attempts run out', async () => {
  const task = flaky(10);
  let message = '';
  try { await withRetry(task.run, 3); } catch (error) { message = (error as Error).message; }
  expect(message).toBe('fail 3');
  expect(task.calls()).toBe(3);
});
