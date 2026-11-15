import math


def cosine(a, b):
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return 0.0 if norm == 0 else sum(x * y for x, y in zip(a, b)) / norm


def matches(metadata, filters):
    for key, wanted in (filters or {}).items():
        if key not in metadata:
            return False
        if isinstance(wanted, list):
            if metadata[key] not in wanted:
                return False
        elif metadata[key] != wanted:
            return False
    return True


def search(query_vector, chunks, k, filters=None):
    candidates = [chunk for chunk in chunks if matches(chunk["metadata"], filters)]
    ranked = sorted(candidates, key=lambda chunk: (-round(cosine(query_vector, chunk["vector"]), 9), chunk["id"]))
    return [chunk["id"] for chunk in ranked[:k]]
