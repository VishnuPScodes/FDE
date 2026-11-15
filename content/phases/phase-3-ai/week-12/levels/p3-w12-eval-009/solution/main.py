def recall_at_k(retrieved, relevant, k):
    return round(sum(1 for d in retrieved[:k] if d in relevant) / len(relevant), 4) if relevant else 0.0


def failures(retriever, rows, k):
    bad = []
    for r in rows:
        if r["relevant_ids"] and recall_at_k(retriever(r["question"]), set(r["relevant_ids"]), k) == 0.0:
            bad.append(r["id"])
    return sorted(bad)


def recall_by_tag(retriever, rows, k):
    scores = {}
    for r in rows:
        if not r["relevant_ids"]:
            continue
        score = recall_at_k(retriever(r["question"]), set(r["relevant_ids"]), k)
        for tag in r.get("tags", []):
            scores.setdefault(tag, []).append(score)
    return {tag: round(sum(v) / len(v), 4) for tag, v in sorted(scores.items())}
