# Summarise with groups

Aggregate functions turn many rows into a summary. `COUNT`, `SUM`, `AVG`, `MIN`, and `MAX` are common starting points.

```sql
SELECT status, COUNT(*) AS order_count
FROM orders
GROUP BY status
ORDER BY status;
```

Every selected column must either be grouped or wrapped in an aggregate. Use `HAVING` to filter groups after the aggregate is calculated. `WHERE` filters input rows before the grouping.

Check the grain of the result: one row per customer, order, or status? Joining two one-to-many tables can multiply rows and inflate sums.
