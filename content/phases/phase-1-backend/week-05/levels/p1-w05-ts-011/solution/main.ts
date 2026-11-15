type Invoice = { id: string; amountPaise: number };

function isInvoice(value: unknown): value is Invoice {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.amountPaise === 'number' && Number.isFinite(record.amountPaise);
}

function safeTotal(rows: unknown[]): number {
  return rows.filter(isInvoice).reduce((total, row) => total + row.amountPaise, 0);
}

test('accepts a valid invoice', () => {
  expect(isInvoice({ id: 'A', amountPaise: 100 })).toBe(true);
});
test('rejects bad shapes', () => {
  expect(isInvoice(null)).toBe(false);
  expect(isInvoice('INV')).toBe(false);
  expect(isInvoice({ id: 'A', amountPaise: '100' })).toBe(false);
  expect(isInvoice({ id: 'A' })).toBe(false);
  expect(isInvoice({ id: 'A', amountPaise: NaN })).toBe(false);
});
test('totals only valid rows', () => {
  expect(safeTotal([{ id: 'A', amountPaise: 100 }, null, { id: 'B', amountPaise: 'x' }, { id: 'C', amountPaise: 250 }])).toBe(350);
});
