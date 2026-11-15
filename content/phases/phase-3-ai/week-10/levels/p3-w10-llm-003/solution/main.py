import math


def estimate_tokens(message):
    return math.ceil(len(message["content"]) / 4) + 4


def fit_history(messages, context_window, reserve_output):
    budget = context_window - reserve_output
    system = [m for m in messages if m["role"] == "system"]
    rest = [m for m in messages if m["role"] != "system"]
    if not rest:
        return list(system)
    last = rest[-1]
    older = rest[:-1]
    total = sum(estimate_tokens(m) for m in system + rest)
    while older and total > budget:
        total -= estimate_tokens(older.pop(0))
    if total > budget:
        raise ValueError("The new message does not fit in the context window.")
    return system + older + [last]
