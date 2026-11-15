import math


def sample_token(logits, temperature, top_p, u):
    if temperature <= 0:
        return sorted(logits, key=lambda t: (-logits[t], t))[0]
    scaled = {t: v / temperature for t, v in logits.items()}
    peak = max(scaled.values())
    exps = {t: math.exp(v - peak) for t, v in scaled.items()}
    total = sum(exps.values())
    ranked = sorted(((t, e / total) for t, e in exps.items()), key=lambda x: (-x[1], x[0]))
    kept, cumulative = [], 0.0
    for token, prob in ranked:
        kept.append((token, prob))
        cumulative += prob
        if cumulative >= top_p:
            break
    mass = sum(p for _, p in kept)
    running = 0.0
    for token, prob in kept:
        running += prob / mass
        if u < running:
            return token
    return kept[-1][0]
