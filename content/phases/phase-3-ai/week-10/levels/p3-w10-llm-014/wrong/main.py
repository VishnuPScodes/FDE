import math


def sample_token(logits, temperature, top_p, u):
    exps = {t: math.exp(v) for t, v in logits.items()}
    total = sum(exps.values())
    running = 0.0
    for token in sorted(exps):
        running += exps[token] / total
        if u < running:
            return token
    return token
