---
title: "Embeddings and vector search"
week: 11
module: embeddings-vector-search
---

## What you're about to do

You'll build a toy embedding, compare vectors with cosine similarity, filter by metadata, and write a small vector index. No API key needed.

## The idea

An embedding turns text into a list of numbers. Texts with similar meaning get lists that point the same way. "UPI refund late" and "money not credited after UPI payment" should land close together, even though they share few words.

Real embeddings come from a model. In this week's levels you use a stand-in: hash each word into one of 32 buckets and count. It does not understand meaning, but it behaves like a vector, so you can learn the rest of the pipeline.

Use `zlib.crc32` for the hash. Python's built-in `hash()` gives different values on each run, so your search results would change every time you restart.

## Cosine similarity

To compare two vectors, use the angle between them, not the length.

```python
cosine = dot(a, b) / (length(a) * length(b))
```

The score is 1.0 for the same direction and 0.0 for unrelated. A plain dot product is not enough. A long document would win just for being long.

If you scale every vector to length 1 up front, the dot product equals cosine. Vector stores do this to save work.

## Top k, filters and an index

Search means: score every chunk, sort, keep the best `k`. Break ties by id so results do not jump around.

A Bengaluru support bot should only quote policies for the customer's own state and the current year. So attach metadata to each chunk, like `{"state": "KA", "year": 2024}`. Filter first, then rank. If you rank first and filter after, you may be left with fewer than `k` results.

A chunk with no `state` key must not match a `state` filter. Missing means no match.

A vector store like pgvector or Qdrant does three jobs: store, search, update. Update is called upsert. It adds an item, or replaces one with the same id. Store a copy of the vector. Otherwise, if the caller changes their list later, your index changes silently.

## Common mistakes

Forgetting to reject a zero vector. You cannot divide by its length.

Mixing vectors of different sizes. Check the dimension on every write.

Filtering after the top k.

## On the job

When a client says "search is bad", ask three things. Which embedding model? Which chunks? Which filters? Many "bad search" tickets are a filter that quietly removes the right document.
