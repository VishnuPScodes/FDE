# Start with the question

A database stores facts in tables. A query asks for a useful view of those facts. Start with the columns and rows you need, then add filters and joins.

```sql
SELECT customer_name, city
FROM customers
ORDER BY customer_name;
```

`SELECT` names the columns. `FROM` names the table. `ORDER BY` makes the output order clear. Use `LIMIT` while exploring a large table.

Avoid `SELECT *` in application code. Naming columns makes the query easier to review and less likely to break when a table changes.
