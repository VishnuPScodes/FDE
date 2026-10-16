BEGIN;
UPDATE orders
SET total_amount = total_amount + 100
WHERE order_id = 112
RETURNING order_id, total_amount;
ROLLBACK;
SELECT order_id, total_amount
FROM orders
WHERE order_id = 112;
