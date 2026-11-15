class Budget:
    def __init__(self, limit):
        self.limit = limit
        self.used = {}

    def charge(self, user, tokens, day):
        if tokens < 0:
            raise ValueError("tokens must not be negative")
        key = (user, day)
        current = self.used.get(key, 0)
        if current + tokens > self.limit:
            return False
        self.used[key] = current + tokens
        return True

    def remaining(self, user, day):
        return max(0, self.limit - self.used.get((user, day), 0))
