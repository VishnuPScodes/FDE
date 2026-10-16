SELECT order_id, SUM(total_amount) AS running_total
FROM orders
WHERE customer_id = 1
GROUP BY order_id;

