import math


def cosine(a, b):
    if len(a) != len(b):
        raise ValueError("vectors must have the same length")
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return sum(x * y for x, y in zip(a, b)) / (norm_a * norm_b)


def top_k(query_vector, items, k):
    scored = [(item["id"], round(cosine(query_vector, item["vector"]), 4)) for item in items]
    scored.sort(key=lambda pair: (-pair[1], pair[0]))
    return scored[:k]
