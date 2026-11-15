import math


def estimate_tokens(message):
    return math.ceil(len(message["content"]) / 4) + 4


def fit_history(messages, context_window, reserve_output):
    kept = list(messages)
    while sum(estimate_tokens(m) for m in kept) > context_window:
        kept.pop()
    return kept
