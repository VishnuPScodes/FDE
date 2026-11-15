def customer_score(c: dict) -> int:
    score = 0
    if c["weekly_meeting"]:
        score += 2
    if c["data_access"]:
        score += 2
    if c["pain_hours_per_week"] >= 5:
        score += 2
    if c["review_weeks"] > 2:
        score -= 3
    return score


def best_customer(candidates: list[dict]) -> "str | None":
    if not candidates:
        return None
    ranked = sorted(candidates, key=lambda c: (-customer_score(c), c["name"]))
    best = ranked[0]
    return best["name"] if customer_score(best) >= 2 else None
