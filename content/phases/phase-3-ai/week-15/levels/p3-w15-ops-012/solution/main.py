def ab_gate(scores_a, scores_b, min_gain=0.02, max_regressions=1, regression_margin=0.05):
    if not scores_a or len(scores_a) != len(scores_b):
        raise ValueError("scores must be non-empty and the same length")
    mean_gain = round(sum(scores_b) / len(scores_b) - sum(scores_a) / len(scores_a), 4)
    regressions = sum(1 for a, b in zip(scores_a, scores_b) if round(a - b, 4) > regression_margin)
    reasons = []
    if mean_gain < min_gain:
        reasons.append("gain too small")
    if regressions > max_regressions:
        reasons.append("too many regressions")
    return {"promote": not reasons, "mean_gain": mean_gain, "regressions": regressions, "reasons": reasons}
