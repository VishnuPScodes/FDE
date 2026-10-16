SELECT order_id,
       SUM(total_amount) OVER (
         ORDER BY order_date, order_id
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS running_total
FROM orders
WHERE customer_id = 1
ORDER BY order_date, order_id;
