type Status = 'draft' | 'sent' | 'paid';
type Invoice = { id: string; status: Status };

function countByStatus(invoices: Invoice[]): Record<Status, number> {
  const counts: Record<Status, number> = { draft: 0, sent: 0, paid: 0 };
  for (const invoice of invoices) counts[invoice.status] += 1;
  return counts;
}

const sample: Invoice[] = [
  { id: 'A', status: 'sent' },
  { id: 'B', status: 'paid' },
  { id: 'C', status: 'sent' },
];

test('counts each status', () => {
  expect(countByStatus(sample)).toEqual({ draft: 0, sent: 2, paid: 1 });
});
test('keeps zero counts for an empty list', () => {
  expect(countByStatus([])).toEqual({ draft: 0, sent: 0, paid: 0 });
});
