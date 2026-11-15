import hashlib
from collections import OrderedDict


class CachedLLM:
    def __init__(self, llm, capacity=100):
        self.llm = llm
        self.capacity = capacity
        self.hits = 0
        self.misses = 0
        self._store = OrderedDict()

    def ask(self, model, prompt):
        key = prompt
        if key in self._store:
            self.hits += 1
            return {"text": self._store[key], "cached": True}
        text = self.llm(model, prompt)
        self.misses += 1
        self._store[key] = text
        if len(self._store) > self.capacity:
            self._store.popitem(last=False)
        return {"text": text, "cached": False}

    def hit_rate(self):
        total = self.hits + self.misses
        return round(self.hits / total, 4) if total else 0.0
