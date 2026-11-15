import random


def split_dataset(rows, holdout_pct=20):
    shuffled = list(rows)
    random.shuffle(shuffled)
    cut = len(shuffled) * holdout_pct // 100
    return {"dev": shuffled[cut:], "holdout": shuffled[:cut]}
