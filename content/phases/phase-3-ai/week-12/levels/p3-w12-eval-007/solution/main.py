import math


def dcg(gains):
    return sum(g / math.log2(i + 2) for i, g in enumerate(gains))


def ndcg_at_k(retrieved, grades, k):
    actual = dcg([grades.get(d, 0) for d in retrieved[:k]])
    ideal = dcg(sorted(grades.values(), reverse=True)[:k])
    if ideal == 0:
        return 0.0
    return round(actual / ideal, 4)
