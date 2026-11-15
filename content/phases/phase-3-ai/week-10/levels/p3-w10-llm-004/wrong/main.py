import math


def softmax(logits, temperature):
    weights = {token: math.exp(value * temperature) for token, value in logits.items()}
    total = sum(weights.values())
    return {token: round(weight / total, 4) for token, weight in weights.items()}
