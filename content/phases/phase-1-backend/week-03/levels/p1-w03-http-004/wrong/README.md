# Common mistake

Do not retry every operation blindly. GET is safe to repeat here; a payment or other non-idempotent write may need an idempotency key first.
