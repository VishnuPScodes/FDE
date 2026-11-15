from datetime import date


def weekly_averages(daily: list) -> dict:
    groups = {}
    for iso, rate in daily:
        if rate is None:
            continue
        year, week, _ = date.fromisoformat(iso).isocalendar()
        groups.setdefault(f"{year}-W{week:02d}", []).append(rate)
    return {label: round(sum(rates) / len(rates), 1) for label, rates in sorted(groups.items())}


def first_week_below(weekly: dict, target: float):
    for label, avg in weekly.items():
        if avg < target:
            return label
    return None
