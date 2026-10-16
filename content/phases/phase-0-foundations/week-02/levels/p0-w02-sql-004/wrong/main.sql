SELECT status, COUNT(*) - 1 AS order_count
FROM orders
GROUP BY status;

