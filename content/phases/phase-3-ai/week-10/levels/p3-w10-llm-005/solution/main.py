def top_p_filter(probs, p):
    if not 0 < p <= 1:
        raise ValueError("p must be in (0, 1]")
    ordered = sorted(probs.items(), key=lambda item: (-item[1], item[0]))
    kept = []
    running = 0.0
    for token, prob in ordered:
        kept.append((token, prob))
        running += prob
        if running >= p - 1e-9:
            break
    total = sum(prob for _, prob in kept)
    return {token: round(prob / total, 4) for token, prob in kept}
