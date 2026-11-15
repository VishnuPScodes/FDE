# Golden datasets

In the next levels you will load a golden dataset from a file, check it for mistakes, measure what it covers, and give it a version number.

## What a golden dataset is

A golden dataset is a set of questions where you already know the right answer. You run your AI feature on every question and compare. It is a test suite for something that does not give the same output every time.

Without it, you are guessing. "The new prompt feels better" is not evidence. A score on 150 fixed questions is.

## Keep it in JSONL

JSONL means one JSON object per line. It is easy to diff in git, easy to append to, and one bad line does not break the rest.

```json
{"id": "q1", "question": "How long does a UPI refund take?", "relevant_ids": ["upi#3"], "tags": ["refunds"]}
{"id": "q2", "question": "mera refund kab aayega?", "relevant_ids": ["upi#3"], "tags": ["hinglish", "refunds"]}
```

Each row has a stable `id`, the `question`, the chunk ids that answer it, and tags. Never reuse an id for a different question.

## Coverage and edge cases

A dataset full of easy questions gives a happy score and a sad production. Cover what real users do:

- Typos: "refnd status".
- Hinglish and other Indian languages mixed with English.
- Questions that need two chunks (multi-hop).
- Questions with no answer. The right behaviour is "I don't know", so tag them `unanswerable`.

Count rows per tag. If a tag has zero rows, you have a blind spot.

## Versioning

When a score moves, ask: did the model change, or the dataset? Give the dataset a fingerprint. Hash the rows in a fixed order with fixed key order, and keep the first 12 characters. Store that version next to every score.

## Common mistakes

Writing the questions from the documents. Real users ask differently. Start from real support tickets (with personal data removed).

Fixing the dataset to make a score go up. If an expected answer is wrong, fix it, bump the version, and re-run the baseline.

Testing on the same questions you tuned the prompt on. Keep a held-out slice you never look at.

## On the job

A customer at a Pune insurance firm will ask "how do you know it works?" Show them the dataset, its version, and the score history. That one page builds more trust than any demo.
