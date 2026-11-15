function groupBy<T>(items: T[], keyOf: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    result[keyOf(item)] = [item];
  }
  return result;
}

type Invoice = { id: string; customer: string };
const invoices: Invoice[] = [
  { id: 'A', customer: 'asha' },
  { id: 'B', customer: 'ravi' },
  { id: 'C', customer: 'asha' },
];

test('groups invoices by customer', () => {
  const grouped = groupBy(invoices, (invoice) => invoice.customer);
  expect(grouped.asha.map((invoice) => invoice.id)).toEqual(['A', 'C']);
  expect(grouped.ravi.map((invoice) => invoice.id)).toEqual(['B']);
});
test('groups numbers by parity', () => {
  expect(groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? 'even' : 'odd'))).toEqual({ odd: [1, 3], even: [2, 4] });
});
test('empty input gives an empty object', () => {
  expect(groupBy([], () => 'x')).toEqual({});
});
