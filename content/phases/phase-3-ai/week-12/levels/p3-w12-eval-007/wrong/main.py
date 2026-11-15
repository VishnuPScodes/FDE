import math


def dcg(gains):
    return sum(g / math.log2(i + 1) for i, g in enumerate(gains, 1) if i > 1) + (gains[0] if gains else 0)


def ndcg_at_k(retrieved, grades, k):
    return round(dcg([grades.get(d, 0) for d in retrieved[:k]]), 4)
