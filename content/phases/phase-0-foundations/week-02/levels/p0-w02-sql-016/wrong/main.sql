-- Counts every order, not just delivered ones
SELECT c.state,
       COUNT(o.order_id) AS delivered_orders,
       SUM(o.total_amount) AS revenue,
       RANK() OVER (ORDER BY SUM(o.total_amount) DESC) AS revenue_rank
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
GROUP BY c.state
ORDER BY revenue_rank, c.state;
