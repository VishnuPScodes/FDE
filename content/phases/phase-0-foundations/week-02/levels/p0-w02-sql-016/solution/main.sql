WITH delivered AS (
  SELECT c.state, o.order_id, o.total_amount
  FROM orders o
  JOIN customers c ON c.customer_id = o.customer_id
  WHERE o.status = 'delivered'
),
by_state AS (
  SELECT state,
         COUNT(order_id) AS delivered_orders,
         SUM(total_amount) AS revenue
  FROM delivered
  GROUP BY state
)
SELECT state,
       delivered_orders,
       revenue,
       RANK() OVER (ORDER BY revenue DESC) AS revenue_rank
FROM by_state
ORDER BY revenue_rank, state;
