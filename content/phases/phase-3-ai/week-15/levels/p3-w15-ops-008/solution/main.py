def estimate_difficulty(prompt):
    text = prompt.lower()
    if any(word in text for word in ("step by step", "prove", "legal")):
        return 3
    if len(prompt) > 300 or any(word in text for word in ("compare", "summarise", "summarize", "why")):
        return 2
    return 1


def choose_model(difficulty, models, max_inr=None):
    if not models:
        return None
    eligible = [m for m in models if m["tier"] >= difficulty]
    if not eligible:
        top = max(m["tier"] for m in models)
        eligible = [m for m in models if m["tier"] == top]
    best = min(eligible, key=lambda m: (m["inr_per_call"], m["name"]))
    if max_inr is not None and best["inr_per_call"] > max_inr:
        return None
    return best["name"]
