type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function safeLoad<T>(request: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await request() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

test('returns the value on success', async () => {
  const result = await safeLoad(async () => 42);
  expect(result).toEqual({ ok: true, value: 42 });
});
test('captures the error message on failure', async () => {
  const result = await safeLoad(async () => { throw new Error('network down'); });
  expect(result).toEqual({ ok: false, error: 'network down' });
});
test('handles non-Error rejections', async () => {
  const result = await safeLoad(() => Promise.reject('plain text'));
  expect(result).toEqual({ ok: false, error: 'plain text' });
});
