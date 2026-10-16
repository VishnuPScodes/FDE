SELECT customer_id, MIN(order_id) AS order_id
FROM orders
GROUP BY customer_id;

