# Common mistake: counts a refused call against the budget and ignores the per-tool limit.
class ToolBudget:
    def __init__(self, max_calls=8, per_tool=None):
        self.max_calls = max_calls
        self.total = 0

    def try_call(self, name):
        self.total += 1
        if self.total > self.max_calls:
            return False, "budget used"
        return True, ""

    def remaining(self):
        return self.max_calls - self.total
