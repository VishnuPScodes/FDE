import time


class RateLimiter:
    def __init__(self, max_requests, window_seconds, clock=time.monotonic):
        self.max = max_requests
        self.window = window_seconds
        self.clock = clock
        self.hits = []

    def allow(self, key):
        now = self.clock()
        self.hits = [t for t in self.hits if now - t < self.window]
        self.hits.append(now)
        return len(self.hits) <= self.max
