def recall_at_k(retrieved, relevant, k):
    return round(sum(1 for d in retrieved[:k] if d in relevant) / len(relevant), 4) if relevant else 0.0


def failures(retriever, rows, k):
    return [r["id"] for r in rows if recall_at_k(retriever(r["question"]), set(r["relevant_ids"]), k) == 0.0]


def recall_by_tag(retriever, rows, k):
    return {}
