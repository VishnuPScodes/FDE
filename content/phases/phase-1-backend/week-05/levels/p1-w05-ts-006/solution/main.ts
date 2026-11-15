type Result = { ok: true; value: string } | { ok: false; error: string };

function describe(result: Result): string {
  if (result.ok) return result.value;
  return `error: ${result.error}`;
}

const results: Result[] = [
  { ok: true, value: 'INV-10 saved' },
  { ok: false, error: 'amount must be positive' },
];
for (const result of results) console.log(describe(result));
