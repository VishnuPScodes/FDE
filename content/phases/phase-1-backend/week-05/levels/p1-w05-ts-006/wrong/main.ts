type Result = { ok: true; value: string } | { ok: false; error: string };

function describe(result: Result): string {
  return (result as any).value ?? 'unknown';
}

const results: Result[] = [
  { ok: true, value: 'INV-10 saved' },
  { ok: false, error: 'amount must be positive' },
];
for (const result of results) console.log(describe(result));
