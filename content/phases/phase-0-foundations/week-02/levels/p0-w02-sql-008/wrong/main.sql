WITH partner_list(customer_id) AS (
  VALUES (1), (99)
)
SELECT partner_list.customer_id, customers.customer_name
FROM partner_list
JOIN customers ON customers.customer_id = partner_list.customer_id;

