def no_show_rate(rows: list[dict]) -> float:
    statuses = [str(r.get("status", "")).lower() for r in rows]
    booked = [s for s in statuses if s != "cancelled"]
    if not booked:
        return 0.0
    return round(100 * booked.count("absent") / len(booked), 1)


def compare(before: float, after: float) -> dict:
    points = round(after - before, 1)
    relative = round(100 * (after - before) / before, 1) if before else 0.0
    return {"points": points, "relative_pct": relative}
