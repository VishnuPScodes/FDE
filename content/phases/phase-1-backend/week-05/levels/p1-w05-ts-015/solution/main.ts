type Invoice = { id: string; amountPaise: number; status: 'draft' | 'sent' | 'paid' };
type ParseResult = { ok: true; value: Invoice } | { ok: false; errors: string[] };

const statuses = ['draft', 'sent', 'paid'] as const;

function parseInvoice(input: unknown): ParseResult {
  if (typeof input !== 'object' || input === null) return { ok: false, errors: ['expected an object'] };
  const record = input as Record<string, unknown>;
  const errors: string[] = [];
  const { id, amountPaise, status } = record;
  if (typeof id !== 'string' || id.length === 0) errors.push('id must be a non-empty string');
  if (typeof amountPaise !== 'number' || !Number.isInteger(amountPaise) || amountPaise <= 0) errors.push('amountPaise must be a positive integer');
  if (!statuses.includes(status as Invoice['status'])) errors.push('status must be draft, sent or paid');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { id: id as string, amountPaise: amountPaise as number, status: status as Invoice['status'] } };
}

test('accepts a valid payload', () => {
  expect(parseInvoice({ id: 'INV-1', amountPaise: 5000, status: 'sent' })).toEqual({
    ok: true,
    value: { id: 'INV-1', amountPaise: 5000, status: 'sent' },
  });
});
test('rejects non-objects', () => {
  expect(parseInvoice(null)).toEqual({ ok: false, errors: ['expected an object'] });
});
test('collects every field error', () => {
  expect(parseInvoice({ id: '', amountPaise: 12.5, status: 'void' })).toEqual({
    ok: false,
    errors: ['id must be a non-empty string', 'amountPaise must be a positive integer', 'status must be draft, sent or paid'],
  });
});
test('reports a single bad field', () => {
  const result = parseInvoice({ id: 'INV-2', amountPaise: -5, status: 'paid' });
  expect(result).toEqual({ ok: false, errors: ['amountPaise must be a positive integer'] });
});
