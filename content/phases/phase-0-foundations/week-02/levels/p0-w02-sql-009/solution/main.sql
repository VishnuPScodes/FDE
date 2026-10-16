WITH delivered_orders AS (
  SELECT customers.city, orders.total_amount
  FROM orders
  JOIN customers ON customers.customer_id = orders.customer_id
  WHERE orders.status = 'delivered'
)
SELECT city, SUM(total_amount) AS revenue
FROM delivered_orders
GROUP BY city
ORDER BY city;
