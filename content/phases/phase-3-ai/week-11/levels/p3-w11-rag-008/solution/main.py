import math


def normalise(vector):
    length = math.sqrt(sum(x * x for x in vector))
    if length == 0:
        raise ValueError("zero vector")
    return [x / length for x in vector]


class VectorIndex:
    def __init__(self, dim):
        self.dim = dim
        self.items = {}

    def upsert(self, item_id, vector, metadata=None):
        if len(vector) != self.dim:
            raise ValueError(f"expected {self.dim} dimensions, got {len(vector)}")
        self.items[item_id] = (normalise(list(vector)), dict(metadata or {}))

    def delete(self, item_id):
        del self.items[item_id]

    def query(self, vector, k, where=None):
        query = normalise(vector)
        results = []
        for item_id, (stored, metadata) in self.items.items():
            if where and any(metadata.get(key) != value for key, value in where.items()):
                continue
            score = round(sum(a * b for a, b in zip(query, stored)), 4)
            results.append((item_id, score))
        results.sort(key=lambda pair: (-pair[1], pair[0]))
        return results[:k]

    def __len__(self):
        return len(self.items)
