def estimate_difficulty(prompt):
    if len(prompt) > 300:
        return 2
    return 1


def choose_model(difficulty, models, max_inr=None):
    if not models:
        return None
    best = max(models, key=lambda m: m["tier"])
    return best["name"]
