# Load data and show it clearly

Most browser requests finish later. Mark a function `async` when it waits for a Promise, then use `await` to read the result. A real admin page should show a useful loading state and handle failed requests. This exercise uses local data so it works offline.

React builds a page from components. A component is a function that returns elements. JSX is a compact way to describe those elements; the TypeScript workspace converts it before running your code.

```tsx
function InvoiceList({ names }: { names: string[] }) {
  return <ul>{names.map((name) => <li key={name}>{name}</li>)}</ul>;
}
```

Keep data separate from its display. This makes it easier to test calculations and to replace sample data with an API later.
