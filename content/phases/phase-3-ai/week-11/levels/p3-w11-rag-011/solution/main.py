import re

STOPWORDS = {"the", "a", "an", "is", "for", "of", "to", "in", "on", "my", "what", "how", "kya", "hai"}


def tokenize(text):
    return re.findall(r"[a-z0-9]+", text.lower())


def rerank(query, candidates, top_n=3):
    terms = {term for term in tokenize(query) if term not in STOPWORDS}
    phrase = " ".join(query.lower().split())
    scored = []
    for candidate in candidates:
        words = set(tokenize(candidate["text"]))
        score = len(terms & words)
        if terms and phrase and phrase in candidate["text"].lower():
            score += 2
        if score > 0:
            scored.append((score, candidate["retrieval_rank"], candidate["id"]))
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [item_id for _, _, item_id in scored[:top_n]]
