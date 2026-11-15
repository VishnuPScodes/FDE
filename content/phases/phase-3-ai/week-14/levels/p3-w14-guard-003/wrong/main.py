class Budget:
    def __init__(self, limit):
        self.limit = limit
        self.used = 0

    def charge(self, user, tokens, day):
        self.used += tokens
        return self.used <= self.limit

    def remaining(self, user, day):
        return self.limit - self.used
