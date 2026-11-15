def rrf(rankings, k=60, top_n=None):
    scores = {}
    for ranking in rankings:
        for rank, item_id in enumerate(ranking):
            scores[item_id] = scores.get(item_id, 0.0) + 1 / (k + rank)
    return sorted(((i, round(s, 6)) for i, s in scores.items()), key=lambda pair: -pair[1])[:top_n]
