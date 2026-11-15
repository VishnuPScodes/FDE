type Invoice = { id: string; amountPaise: number; status: 'draft' | 'sent' | 'paid' };
type ParseResult = { ok: true; value: Invoice } | { ok: false; errors: string[] };

function parseInvoice(input: unknown): ParseResult {
  const value = input as Invoice;
  if (!value || typeof value.id !== 'string') return { ok: false, errors: ['expected an object'] };
  return { ok: true, value };
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
