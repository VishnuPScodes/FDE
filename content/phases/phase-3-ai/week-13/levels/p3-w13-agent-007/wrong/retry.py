import time


# Common mistake: retrying every exception, so a bad request is sent four times.
def call_with_retry(fn, max_attempts=4, base_delay=0.5, max_delay=8.0, sleep=time.sleep):
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except Exception:
            if attempt == max_attempts:
                raise
            sleep(min(base_delay * 2 ** (attempt - 1), max_delay))
