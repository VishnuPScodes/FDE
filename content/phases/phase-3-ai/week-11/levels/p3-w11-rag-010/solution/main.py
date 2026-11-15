def rrf(rankings, k=60, top_n=None):
    scores = {}
    for ranking in rankings:
        seen = set()
        for rank, item_id in enumerate(ranking, start=1):
            if item_id in seen:
                continue
            seen.add(item_id)
            scores[item_id] = scores.get(item_id, 0.0) + 1 / (k + rank)
    fused = sorted(((item_id, round(score, 6)) for item_id, score in scores.items()), key=lambda pair: (-pair[1], pair[0]))
    return fused[:top_n] if top_n is not None else fused
