SELECT products.category, SUM(order_items.quantity) AS units_sold
FROM order_items
JOIN products ON products.product_id = order_items.product_id
GROUP BY products.category
ORDER BY products.category;
