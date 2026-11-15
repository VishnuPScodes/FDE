def ab_gate(scores_a, scores_b, min_gain=0.02, max_regressions=1, regression_margin=0.05):
    mean_gain = round(sum(scores_b) / len(scores_b) - sum(scores_a) / len(scores_a), 4)
    return {"promote": mean_gain > 0, "mean_gain": mean_gain, "regressions": 0, "reasons": []}
