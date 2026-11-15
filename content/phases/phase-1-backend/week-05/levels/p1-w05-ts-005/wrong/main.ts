type Customer = { id: string; name: string; nickname?: string };

function displayName(customer: Customer): string {
  return customer.nickname ?? customer.name;
}

test('uses the nickname when present', () => {
  expect(displayName({ id: 'C-1', name: 'Asha Rao', nickname: 'Ash' })).toBe('Ash');
});
test('falls back to the full name', () => {
  expect(displayName({ id: 'C-2', name: 'Ravi Nair' })).toBe('Ravi Nair');
});
test('ignores an empty nickname', () => {
  expect(displayName({ id: 'C-3', name: 'Mina Das', nickname: '' })).toBe('Mina Das');
});
