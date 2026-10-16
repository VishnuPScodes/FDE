# Filter rows carefully

Use `WHERE` to keep rows that match a condition. Combine conditions with `AND` and `OR`, and use parentheses when the grouping matters.

```sql
SELECT order_id, total_amount
FROM orders
WHERE status = 'delivered' AND total_amount >= 500
ORDER BY order_id;
```

`NULL` means the value is unknown or missing. It is not zero and it is not an empty string. Compare it with `IS NULL` or `IS NOT NULL`; `= NULL` never matches.

When a filter can match many rows, add an `ORDER BY` before `LIMIT` so the sample is repeatable.
