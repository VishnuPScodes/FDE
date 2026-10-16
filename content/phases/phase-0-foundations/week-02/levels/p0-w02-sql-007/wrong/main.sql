SELECT customers.customer_id, COUNT(orders.order_id) AS order_count
FROM customers
JOIN orders ON orders.customer_id = customers.customer_id
GROUP BY customers.customer_id
ORDER BY customers.customer_id;

