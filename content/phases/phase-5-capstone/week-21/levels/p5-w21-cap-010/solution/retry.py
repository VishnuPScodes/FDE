import time


def send_with_retry(send, max_attempts: int = 3, sleep=time.sleep):
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")
    delay = 1
    for attempt in range(1, max_attempts + 1):
        try:
            return send()
        except Exception:
            if attempt == max_attempts:
                raise
            sleep(delay)
            delay *= 2
