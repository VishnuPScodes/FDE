import time

from fake_llm import TransientError


def call_with_retry(fn, max_attempts=4, base_delay=0.5, max_delay=8.0, sleep=time.sleep):
    """Call fn(), retrying TransientError with exponential backoff."""
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except TransientError as error:
            if attempt == max_attempts:
                raise
            if error.retry_after is not None:
                delay = error.retry_after
            else:
                delay = min(base_delay * 2 ** (attempt - 1), max_delay)
            sleep(delay)
