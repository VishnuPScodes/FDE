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
    n = len(rows)
    got = [(retriever(r["question"]), set(r["relevant_ids"])) for r in rows]
    return {
        "precision": round(sum(precision_at_k(g, s, k) for g, s in got) / n, 4),
        "recall": round(sum(recall_at_k(g, s, k) for g, s in got) / n, 4),
        "mrr": round(sum(reciprocal_rank(g, s) for g, s in got) / n, 4),
        "ndcg": round(sum(ndcg_at_k(g, s, k) for g, s in got) / n, 4),
        "n": n,
    }
