import { expect, test } from '@playwright/test';

test('Week 6 Python ETL levels run in the browser worker', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { loadLevel, loadSolutionFiles } = await import('/src/lib/content-loader.ts');
    const { createPythonRuntime } = await import('/src/lib/python-runtime.ts');
    const runtime = createPythonRuntime(() => undefined, () => undefined);
    try {
      const runLevel = async (id: string) => {
        const level = await loadLevel(id);
        const files = Object.fromEntries((level.starter_files ?? []).map((file) => [file.path, file.content ?? '']));
        Object.assign(files, await loadSolutionFiles(id, ['main.py']));
        return runtime.run(files, level.checks[0]?.run ?? 'pytest -q test_main.py');
      };
      const capstone = await runLevel('p1-w06-etl-015');
      const spreadsheet = await runLevel('p1-w06-etl-006');
      const pdf = await runLevel('p1-w06-etl-007');
      return { capstone, spreadsheet, pdf };
    } finally {
      runtime.terminate();
    }
  });

  expect(result.capstone.exitCode, result.capstone.stderr).toBe(0);
  expect(result.spreadsheet.exitCode, result.spreadsheet.stderr).toBe(0);
  expect(result.pdf.exitCode, result.pdf.stderr).toBe(0);
});
