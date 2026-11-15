import math


def cosine(a, b):
    return sum(x * y for x, y in zip(a, b))


def dedupe_chunks(chunks, threshold=0.95):
    seen = set()
    out = []
    for chunk in chunks:
        key = tuple(chunk["vector"])
        if key not in seen:
            seen.add(key)
            out.append(chunk["id"])
    return out
