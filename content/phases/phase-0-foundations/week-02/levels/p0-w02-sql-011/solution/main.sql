SELECT order_id,
       LAG(total_amount) OVER (ORDER BY order_date, order_id) AS previous_total
FROM orders
WHERE customer_id = 1
ORDER BY order_date, order_id;
