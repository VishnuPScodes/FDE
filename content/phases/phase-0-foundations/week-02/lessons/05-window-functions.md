# Keep detail while calculating a group value

`GROUP BY` reduces a group to one row. A window function calculates across related rows while keeping each row in the output.

```sql
ROW_NUMBER() OVER (
  PARTITION BY customer_id
  ORDER BY order_date DESC, order_id DESC
)
```

`PARTITION BY` starts a separate window for each customer. The `ORDER BY` inside the window defines the row sequence. `LAG` reads a value from an earlier row. A running `SUM` uses a frame such as `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.

Add a tie-breaker to the window order when dates or scores can repeat.
