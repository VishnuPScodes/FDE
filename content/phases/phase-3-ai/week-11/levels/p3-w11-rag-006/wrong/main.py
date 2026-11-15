def cosine(a, b):
    return sum(x * y for x, y in zip(a, b))


def top_k(query_vector, items, k):
    scored = [(item["id"], round(cosine(query_vector, item["vector"]), 4)) for item in items]
    scored.sort(key=lambda pair: pair[1])
    return scored[:k]
