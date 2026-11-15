import math


def percentile(values, p):
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return ordered[rank - 1]


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
    p95 = percentile(ms_values, 95)
    return True if p95 is None else p95 <= p95_limit_ms
