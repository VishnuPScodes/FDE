class VectorIndex:
    def __init__(self, dim):
        self.dim = dim
        self.items = []

    def upsert(self, item_id, vector, metadata=None):
        self.items.append((item_id, vector, metadata or {}))

    def delete(self, item_id):
        self.items = [item for item in self.items if item[0] != item_id]

    def query(self, vector, k, where=None):
        scored = [(i, round(sum(a * b for a, b in zip(vector, v)), 4)) for i, v, _ in self.items]
        return sorted(scored, key=lambda pair: -pair[1])[:k]

    def __len__(self):
        return len(self.items)
