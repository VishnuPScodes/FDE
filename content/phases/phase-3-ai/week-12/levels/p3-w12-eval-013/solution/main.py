def _label(verdict, swapped):
    if verdict == "tie":
        return "tie"
    first_wins = verdict == "first"
    if swapped:
        return "B" if first_wins else "A"
    return "A" if first_wins else "B"


def compare(judge, question, a, b):
    one = _label(judge(question, a, b), False)
    two = _label(judge(question, b, a), True)
    return one if one == two else "tie"


def position_bias_rate(judge, cases):
    if not cases:
        return 0.0
    bad = 0
    for question, a, b in cases:
        if _label(judge(question, a, b), False) != _label(judge(question, b, a), True):
            bad += 1
    return round(bad / len(cases), 2)
