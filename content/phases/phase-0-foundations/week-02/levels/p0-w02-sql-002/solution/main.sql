SELECT order_id, total_amount
FROM orders
WHERE status = 'delivered' AND total_amount >= 500
ORDER BY order_id;
