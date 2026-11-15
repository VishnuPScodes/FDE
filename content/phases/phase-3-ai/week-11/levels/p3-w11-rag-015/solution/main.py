FALLBACK = "I could not find this in the documents."


def plan_answer(results, min_score=0.35, relative=0.6, max_chunks=3):
    ranked = sorted(results, key=lambda r: (-r["score"], r["id"]))
    if not ranked or ranked[0]["score"] < min_score:
        return {"answerable": False, "chunk_ids": [], "fallback": FALLBACK}
    cutoff = max(min_score, relative * ranked[0]["score"])
    ids = [r["id"] for r in ranked if r["score"] >= cutoff][:max_chunks]
    return {"answerable": True, "chunk_ids": ids, "fallback": None}
