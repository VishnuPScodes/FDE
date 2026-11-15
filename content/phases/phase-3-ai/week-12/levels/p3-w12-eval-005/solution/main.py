def precision_at_k(retrieved, relevant, k):
    hits = sum(1 for d in retrieved[:k] if d in relevant)
    return round(hits / k, 4)


def recall_at_k(retrieved, relevant, k):
    if not relevant:
        return 0.0
    hits = sum(1 for d in retrieved[:k] if d in relevant)
    return round(hits / len(relevant), 4)
