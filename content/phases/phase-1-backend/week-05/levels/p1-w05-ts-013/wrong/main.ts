type Customer = { id: string; name: string };
const directory: Record<string, string> = { 'C-1': 'Asha Rao', 'C-2': 'Ravi Nair', 'C-3': 'Mina Das' };
let started = 0;
let active = 0;
let maxActive = 0;

async function fetchCustomer(id: string): Promise<Customer> {
  started += 1;
  active += 1;
  maxActive = Math.max(maxActive, active);
  await Promise.resolve();
  active -= 1;
  return { id, name: directory[id] };
}

async function loadNames(ids: string[]): Promise<string[]> {
  const names: string[] = [];
  for (const id of ids) {
    names.push((await fetchCustomer(id)).name);
  }
  return names;
}

test('returns names in id order', async () => {
  expect(await loadNames(['C-3', 'C-1', 'C-2'])).toEqual(['Mina Das', 'Asha Rao', 'Ravi Nair']);
});
test('requests overlap instead of running one by one', async () => {
  started = 0; maxActive = 0;
  await loadNames(['C-1', 'C-2', 'C-3']);
  expect(started).toBe(3);
  expect(maxActive).toBe(3);
});
