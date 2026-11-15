def top_p_filter(probs, p):
    return {token: prob for token, prob in probs.items() if prob >= p}
