import time


def send_with_retry(send, max_attempts: int = 3, sleep=time.sleep):
    last = None
    for attempt in range(max_attempts):
        try:
            return send()
        except Exception as exc:
            last = exc
            sleep(1)
    raise last
