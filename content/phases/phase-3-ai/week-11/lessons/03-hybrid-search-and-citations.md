---
title: "Hybrid search, reranking and citations"
week: 11
module: hybrid-search
---

## What you're about to do

You'll score text with BM25, merge two ranked lists with Reciprocal Rank Fusion, rerank a short list, and check that an answer cites real chunks.

## Why two kinds of search

Vector search finds meaning. It can miss exact terms. A question about `GSTR-3B` may pull up a chunk about `GSTR-1`, because the two look alike to an embedding.

Keyword search finds exact terms. BM25 is the standard scoring method. It likes rare words, so `gstr-3b` counts for more than `due`. It also stops a long document from winning just by repeating a word.

Use both. That is hybrid search.

## BM25 in short

For each query word, find how many documents contain it. Rare words get a bigger weight, called idf. Then score each document by how often the word appears, with the effect flattening out as the count grows. Add up the scores over the query words. Count a repeated query word once.

## Merging with RRF

BM25 scores might run from 0 to 12. Cosine scores run from 0 to 1. You cannot add them. So merge by rank, not score.

```python
score = sum(1 / (60 + rank))   # one term per list the id appears in
```

An id near the top of both lists wins. An id high in only one list still gets a fair score. The number 60 is a common default.

## Reranking

Retrieval gives you maybe 20 rough candidates. A reranker reads each one against the query more closely and keeps the best three or four. Real rerankers are models. Your level uses a simple one: points for each query word found, bonus for the whole phrase, ties broken by the first search rank.

## Citations

An answer that cannot be traced is an answer nobody at a bank will trust. Put each chunk into the prompt with its id:

```
<chunk id="upi#3">UPI refunds reach the account within T+1 working days.</chunk>
```

Escape `&`, `<` and `>` in the text so a document cannot fake a closing tag. Ask the model to write `[upi#3]` after each claim. Then check in code:

- Did it cite an id that was never given? That is made up.
- Which sentences have no citation?

## Common mistakes

Adding BM25 and cosine scores directly.

Trusting a citation just because it looks right. Check it against the chunk list.

## On the job

Clients in finance and law ask for citations first and accuracy second. The check in this lesson is cheap, and it catches fake sources before a customer sees them.
