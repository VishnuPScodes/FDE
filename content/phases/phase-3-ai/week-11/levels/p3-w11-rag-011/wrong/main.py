def rerank(query, candidates, top_n=3):
    ordered = sorted(candidates, key=lambda c: c["retrieval_rank"])
    return [c["id"] for c in ordered[:top_n]]
