SELECT customer_id, COUNT(*) AS delivered_orders
FROM orders
WHERE status = 'delivered'
GROUP BY customer_id
HAVING COUNT(*) >= 2
ORDER BY customer_id;
