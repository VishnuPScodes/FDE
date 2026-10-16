SELECT order_id
FROM orders
WHERE shipping_note IS NULL
ORDER BY order_id;
