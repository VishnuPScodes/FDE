SELECT orders.order_id, customers.customer_name, orders.total_amount
FROM orders
JOIN customers ON customers.customer_id = orders.customer_id
WHERE orders.order_id = 101;
