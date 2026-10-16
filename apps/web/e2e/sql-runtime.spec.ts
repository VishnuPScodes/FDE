import { expect, test } from '@playwright/test';

test('SQL worker initializes PGlite and runs a query', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createSqlRuntime } = await import('/src/lib/sql-runtime.ts');
    const runtime = createSqlRuntime(() => undefined);
    try {
      await runtime.initialize('CREATE TABLE checks (answer integer); INSERT INTO checks VALUES (42);');
      return await runtime.run('SELECT answer FROM checks;');
    } finally {
      runtime.terminate();
    }
  });

  expect(result.columns).toEqual(['answer']);
  expect(result.rows).toEqual([{ answer: 42 }]);
});
