import math


def percentile(values, p):
    if not values:
        return None
    ordered = sorted(values)
    return ordered[int(p / 100 * len(ordered)) - 1]


def latency_summary(ms_values):
    if not ms_values:
        return {"count": 0, "mean": None, "p50": None, "p95": None, "max": None}
    return {
        "count": len(ms_values),
        "mean": round(sum(ms_values) / len(ms_values), 1),
        "p50": percentile(ms_values, 50),
        "p95": percentile(ms_values, 95),
        "max": max(ms_values),
    }


def slo_ok(ms_values, p95_limit_ms):
    return sum(ms_values) / max(1, len(ms_values)) <= p95_limit_ms
