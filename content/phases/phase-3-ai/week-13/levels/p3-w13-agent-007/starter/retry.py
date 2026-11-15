import time

from fake_llm import TransientError


def call_with_retry(fn, max_attempts=4, base_delay=0.5, max_delay=8.0, sleep=time.sleep):
    """Call fn(), retrying TransientError with exponential backoff."""
    # TODO
    return fn()
