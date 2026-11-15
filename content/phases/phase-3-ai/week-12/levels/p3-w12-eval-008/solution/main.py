import math


def precision_at_k(retrieved, relevant, k):
    return round(sum(1 for d in retrieved[:k] if d in relevant) / k, 4)


def recall_at_k(retrieved, relevant, k):
    return round(sum(1 for d in retrieved[:k] if d in relevant) / len(relevant), 4) if relevant else 0.0


def reciprocal_rank(retrieved, relevant):
    for i, d in enumerate(retrieved, 1):
        if d in relevant:
            return 1 / i
    return 0.0


def ndcg_at_k(retrieved, relevant, k):
    dcg = sum(1 / math.log2(i + 2) for i, d in enumerate(retrieved[:k]) if d in relevant)
    ideal = sum(1 / math.log2(i + 2) for i in range(min(k, len(relevant))))
    return dcg / ideal if ideal else 0.0


def evaluate_retriever(retriever, rows, k):
    used = [r for r in rows if r["relevant_ids"]]
    if not used:
        return {"precision": 0.0, "recall": 0.0, "mrr": 0.0, "ndcg": 0.0, "n": 0}
    totals = {"precision": 0.0, "recall": 0.0, "mrr": 0.0, "ndcg": 0.0}
    for r in used:
        got = retriever(r["question"])
        rel = set(r["relevant_ids"])
        totals["precision"] += precision_at_k(got, rel, k)
        totals["recall"] += recall_at_k(got, rel, k)
        totals["mrr"] += reciprocal_rank(got, rel)
        totals["ndcg"] += ndcg_at_k(got, rel, k)
    out = {name: round(v / len(used), 4) for name, v in totals.items()}
    out["n"] = len(used)
    return out
