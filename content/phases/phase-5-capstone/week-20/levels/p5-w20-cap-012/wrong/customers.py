def customer_score(c: dict) -> int:
    return 2 * c["weekly_meeting"] + 2 * c["data_access"] + 2 * (c["pain_hours_per_week"] >= 5)


def best_customer(candidates: list[dict]) -> "str | None":
    best = None
    for c in candidates:
        if best is None or customer_score(c) > customer_score(best):
            best = c
    return best["name"] if best else None
