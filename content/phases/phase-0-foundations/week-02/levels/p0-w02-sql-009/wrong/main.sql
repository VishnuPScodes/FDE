SELECT customers.city, SUM(orders.total_amount) AS revenue
FROM orders
JOIN customers ON customers.customer_id = orders.customer_id
GROUP BY customers.city;

