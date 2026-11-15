import math


def cosine(a, b):
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return 0.0 if norm == 0 else sum(x * y for x, y in zip(a, b)) / norm


def matches(metadata, filters):
    return all(metadata.get(key, value) == value for key, value in (filters or {}).items())


def search(query_vector, chunks, k, filters=None):
    ranked = sorted(chunks, key=lambda chunk: -cosine(query_vector, chunk["vector"]))[:k]
    return [chunk["id"] for chunk in ranked if matches(chunk["metadata"], filters)]
