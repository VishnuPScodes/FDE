import math


def cosine(a, b):
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return sum(x * y for x, y in zip(a, b)) / (na * nb)


def dedupe_chunks(chunks, threshold=0.95):
    kept = []
    for chunk in chunks:
        if not any(cosine(chunk["vector"], k["vector"]) >= threshold for k in kept):
            kept.append(chunk)
    return [k["id"] for k in kept]
