# Common mistake

Retrying immediately ignores the server's `Retry-After` instruction. Respect the delay and keep retries bounded to avoid increasing load.
