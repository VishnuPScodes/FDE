CREATE INDEX IF NOT EXISTS idx_event_log_customer_id ON event_log(customer_id);
EXPLAIN SELECT event_id, event_type
FROM event_log
WHERE customer_id = 77;
