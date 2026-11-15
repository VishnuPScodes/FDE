def reciprocal_rank(retrieved, relevant):
    for rank, doc in enumerate(retrieved, 1):
        if doc in relevant:
            return 1 / rank
    return 0.0


def mrr(runs):
    if not runs:
        return 0.0
    return round(sum(reciprocal_rank(r, rel) for r, rel in runs) / len(runs), 4)
