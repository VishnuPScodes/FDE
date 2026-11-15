# Retrieval metrics

In the next levels you will compute precision@k, recall@k, MRR and nDCG in plain Python, then score a whole retriever on a dataset.

## Why measure retrieval alone

If a RAG answer is wrong, there are two suspects: the search did not find the right chunk, or the model misused it. Retrieval metrics check the first suspect with no model call. They are fast, free and exact.

A retriever takes a question and returns a ranked list of chunk ids. The golden dataset says which ids are right.

## The four numbers

**precision@k**: of the top k results, how many are relevant? Divide by k. If 2 of the top 3 are good, precision@3 is 0.67.

**recall@k**: of all relevant chunks, how many are in the top k? Divide by the number of relevant chunks. If 2 of 3 are found, recall@3 is 0.67.

**MRR** (mean reciprocal rank): look at the first relevant result. Rank 1 scores 1, rank 2 scores 0.5, rank 3 scores 0.33, none scores 0. Average over all questions. Good when one good answer is enough.

**nDCG**: use when some chunks are better than others. Each position has a discount, `1 / log2(position + 1)`, so a great chunk at rank 1 beats the same chunk at rank 5. Divide by the best possible score so the result is between 0 and 1.

```python
import math
def dcg(gains):
    return sum(g / math.log2(i + 2) for i, g in enumerate(gains))
```

## Which one to watch

For a chatbot that sends the top 3 chunks to the model, watch recall@3. If the right chunk is not in those 3, the model cannot use it. Watch MRR when the first hit matters most.

## Averages hide pain

Always look at slices. 90 percent recall overall can hide 40 percent on Hinglish questions. Group by tag, and list the questions with zero recall. Those are your next fixes.

Skip unanswerable questions when you compute retrieval scores. They have no right chunk to find.

## Common mistakes

Dividing precision by the number of results returned instead of k.

Counting ranks from 0. Rank 1 is the first result.

Forgetting to guard against a division by zero when a question has no relevant ids.

## On the job

When a client changes their chunk size, you rerun these four numbers in seconds and show them a table. Opinions end, data begins.
