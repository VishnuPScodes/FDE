WITH partner_list(customer_id) AS (
  VALUES (1), (99)
)
SELECT partner_list.customer_id, customers.customer_name
FROM partner_list
FULL OUTER JOIN customers ON customers.customer_id = partner_list.customer_id
WHERE partner_list.customer_id IS NULL OR customers.customer_id IS NULL
ORDER BY partner_list.customer_id NULLS LAST;
