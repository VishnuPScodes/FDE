SELECT order_id, total_amount AS previous_total
FROM orders
WHERE customer_id = 1
ORDER BY order_date, order_id;

