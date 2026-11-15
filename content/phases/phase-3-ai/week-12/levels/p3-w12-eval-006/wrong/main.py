def reciprocal_rank(retrieved, relevant):
    rank = 0
    for i, doc in enumerate(retrieved, 1):
        if doc in relevant:
            rank = i
    return 1 / rank if rank else 0.0


def mrr(runs):
    return round(sum(reciprocal_rank(r, rel) for r, rel in runs) / len(runs), 4) if runs else 0.0
