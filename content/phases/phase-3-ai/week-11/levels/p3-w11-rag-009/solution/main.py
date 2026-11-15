import math
import re


def tokenize(text):
    return re.findall(r"[a-z0-9-]+", text.lower())


def bm25_scores(query, docs, k1=1.5, b=0.75):
    tokens = {doc_id: tokenize(text) for doc_id, text in docs.items()}
    n_docs = len(docs)
    avg_len = sum(len(words) for words in tokens.values()) / n_docs if n_docs else 0
    scores = {doc_id: 0.0 for doc_id in docs}
    for term in set(tokenize(query)):
        containing = sum(1 for words in tokens.values() if term in words)
        if containing == 0:
            continue
        idf = math.log((n_docs - containing + 0.5) / (containing + 0.5) + 1)
        for doc_id, words in tokens.items():
            freq = words.count(term)
            if freq == 0:
                continue
            norm = k1 * (1 - b + b * len(words) / avg_len)
            scores[doc_id] += idf * freq * (k1 + 1) / (freq + norm)
    return {doc_id: round(score, 4) for doc_id, score in scores.items()}
