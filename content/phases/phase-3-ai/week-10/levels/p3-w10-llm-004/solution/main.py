import math


def softmax(logits, temperature):
    if temperature < 0:
        raise ValueError("temperature must be >= 0")
    if temperature == 0:
        best = min(logits, key=lambda token: (-logits[token], token))
        return {token: 1.0 if token == best else 0.0 for token in logits}
    scaled = {token: value / temperature for token, value in logits.items()}
    top = max(scaled.values())
    weights = {token: math.exp(value - top) for token, value in scaled.items()}
    total = sum(weights.values())
    return {token: round(weight / total, 4) for token, weight in weights.items()}
