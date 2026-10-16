# Combine related tables

Tables split facts so that a customer's name is stored once instead of copied into every order. A join brings related rows together by matching keys.

```sql
SELECT orders.order_id, customers.customer_name, orders.total_amount
FROM orders
JOIN customers ON customers.customer_id = orders.customer_id;
```

An inner join keeps matching pairs. A left join keeps every row from its left table and fills missing right-side values with `NULL`. Right and full joins preserve rows from the other side or both sides. A cross join makes every possible pair.

A common table expression, written with `WITH`, gives a subquery a name. It can make a multi-step analysis easier to read and test.
