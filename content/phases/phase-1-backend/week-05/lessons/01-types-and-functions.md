# Make data contracts clear with TypeScript

JavaScript lets a function receive almost any value. TypeScript adds a check before the code runs. A type describes the values a function accepts and returns. This helps catch mistakes while building an internal tool that handles customer records.

```ts
type Invoice = { id: string; amountPaise: number; paid: boolean };

function outstanding(invoices: Invoice[]): number {
  return invoices.filter((invoice) => !invoice.paid)
    .reduce((total, invoice) => total + invoice.amountPaise, 0);
}
```

Use integer paise for money in this example. A value such as `125050` represents ₹1,250.50 without floating point rounding.

## Optional fields and unions

An optional field may be missing. A union lists the allowed alternatives. Narrow the union before using a value that only exists on one alternative.

```ts
type Result = { ok: true; value: string } | { ok: false; error: string };
```

TypeScript checks these types during development. This browser workspace transpiles TypeScript to JavaScript; it does not run the full TypeScript type checker.
