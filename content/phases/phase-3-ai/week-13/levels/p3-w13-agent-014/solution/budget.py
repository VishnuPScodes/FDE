class ToolBudget:
    def __init__(self, max_calls=8, per_tool=None):
        self.max_calls = max_calls
        self.per_tool = dict(per_tool or {})
        self.total = 0
        self.counts = {}

    def try_call(self, name):
        if self.total >= self.max_calls:
            return False, f"run budget used: {self.total} of {self.max_calls} tool calls"
        limit = self.per_tool.get(name)
        used = self.counts.get(name, 0)
        if limit is not None and used >= limit:
            plural = "call" if limit == 1 else "calls"
            return False, f"tool budget used: {name} allows {limit} {plural} per run"
        self.total += 1
        self.counts[name] = used + 1
        return True, ""

    def remaining(self):
        return self.max_calls - self.total
