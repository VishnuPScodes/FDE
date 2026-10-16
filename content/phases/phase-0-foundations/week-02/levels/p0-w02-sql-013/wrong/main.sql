SELECT products.category, COUNT(*) AS units_sold
FROM order_items
JOIN products ON products.product_id = order_items.product_id
GROUP BY products.category;

