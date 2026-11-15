def no_show_rate(rows: list[dict]) -> float:
    absent = sum(1 for r in rows if r["status"] == "absent")
    return round(100 * absent / len(rows), 1) if rows else 0.0


def compare(before: float, after: float) -> dict:
    return {"points": round(after - before, 1), "relative_pct": round(after - before, 1)}
