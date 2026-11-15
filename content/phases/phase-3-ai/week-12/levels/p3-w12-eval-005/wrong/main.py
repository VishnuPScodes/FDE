def precision_at_k(retrieved, relevant, k):
    top = retrieved[:k]
    return round(sum(1 for d in top if d in relevant) / len(top), 4) if top else 0.0


def recall_at_k(retrieved, relevant, k):
    if not relevant:
        return 0.0
    return round(sum(1 for d in retrieved[:k] if d in relevant) / len(relevant), 4)
