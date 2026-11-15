def cohen_kappa(a, b):
    return round(sum(1 for x, y in zip(a, b) if x == y) / len(a), 4)


def agreement_label(kappa):
    return "substantial" if kappa >= 0.6 else "slight"
