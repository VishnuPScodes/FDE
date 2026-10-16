SELECT orders.order_id, customers.customer_name, orders.total_amount
FROM orders
CROSS JOIN customers
WHERE orders.order_id = 101;

