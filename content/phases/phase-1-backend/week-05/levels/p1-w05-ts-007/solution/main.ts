type PaymentStatus =
  | { kind: 'pending' }
  | { kind: 'paid' }
  | { kind: 'failed'; reason: string }
  | { kind: 'refunded'; amountPaise: number };

function statusLabel(status: PaymentStatus): string {
  switch (status.kind) {
    case 'pending': return 'Awaiting payment';
    case 'paid': return 'Paid';
    case 'failed': return `Failed: ${status.reason}`;
    case 'refunded': return `Refunded ${status.amountPaise} paise`;
  }
}

test('pending and paid', () => {
  expect(statusLabel({ kind: 'pending' })).toBe('Awaiting payment');
  expect(statusLabel({ kind: 'paid' })).toBe('Paid');
});
test('failed includes the reason', () => {
  expect(statusLabel({ kind: 'failed', reason: 'card declined' })).toBe('Failed: card declined');
});
test('refunded includes the amount', () => {
  expect(statusLabel({ kind: 'refunded', amountPaise: 2500 })).toBe('Refunded 2500 paise');
});
