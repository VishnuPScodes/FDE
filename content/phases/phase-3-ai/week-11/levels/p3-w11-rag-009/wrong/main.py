import math
import re


def tokenize(text):
    return re.findall(r"[a-z0-9-]+", text.lower())


def bm25_scores(query, docs, k1=1.5, b=0.75):
    return {doc_id: float(sum(tokenize(text).count(term) for term in tokenize(query))) for doc_id, text in docs.items()}
