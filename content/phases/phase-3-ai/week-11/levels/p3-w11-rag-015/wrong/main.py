FALLBACK = "I could not find this in the documents."


# Common mistake: abstains correctly on a weak best score, but then keeps every chunk above
# the absolute floor. Weak chunks far below the best one still reach the model.
def plan_answer(results, min_score=0.35, relative=0.6, max_chunks=3):
    ranked = sorted(results, key=lambda r: (-r["score"], r["id"]))
    if not ranked or ranked[0]["score"] < min_score:
        return {"answerable": False, "chunk_ids": [], "fallback": FALLBACK}
    ids = [r["id"] for r in ranked if r["score"] >= min_score][:max_chunks]
    return {"answerable": True, "chunk_ids": ids, "fallback": None}
