# Common mistake

Sending a payment POST twice without an idempotency key can create two payments. Reuse one stable key for retries of the same logical operation.
