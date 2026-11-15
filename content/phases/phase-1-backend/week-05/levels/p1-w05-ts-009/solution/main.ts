function findFirst<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (const item of items) {
    if (predicate(item)) return item;
  }
  return undefined;
}

type Invoice = { id: string; amountPaise: number };
const invoices: Invoice[] = [
  { id: 'A', amountPaise: 500 },
  { id: 'B', amountPaise: 1500 },
  { id: 'C', amountPaise: 2500 },
];

test('finds the first large invoice', () => {
  expect(findFirst(invoices, (invoice) => invoice.amountPaise > 1000)?.id).toBe('B');
});
test('works with numbers', () => {
  expect(findFirst([3, 8, 12], (n) => n % 2 === 0)).toBe(8);
});
test('returns undefined when nothing matches', () => {
  expect(findFirst(['a', 'b'], (s) => s === 'z')).toBe(undefined);
});
