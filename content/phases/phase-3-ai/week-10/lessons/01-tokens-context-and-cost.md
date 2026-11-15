# Tokens, context windows and cost

In the next levels you will estimate what one model call costs, project a monthly bill, and trim chat history so it fits the model.

## What a token is

Models do not read characters or words. They read tokens. A token is a chunk of text, often part of a word. For English, a good rule of thumb is about 4 characters per token. Hindi, Tamil and code often use more tokens for the same meaning, so treat the rule as a rough guide.

You pay per token. Input tokens (what you send) and output tokens (what the model writes) have different prices. Output usually costs four to five times more. Prices are quoted in US dollars per one million tokens.

## The context window

Every model has a context window. It is the most tokens it can handle in one call, counting your input and its answer together. If the chat history grows too long, the API returns an error. So you trim the oldest turns, keep the system prompt, and leave room for the reply.

## A worked example

A Bengaluru fintech bot gets 900 input tokens and writes 250 output tokens per chat. On a model priced at $0.10 input and $0.50 output per million:

```python
per_call = (900 * 0.10 + 250 * 0.50) / 1_000_000
print(per_call)               # 0.000215
print(per_call * 2000 * 30)   # 12.9  -> dollars a month at 2,000 chats a day
```

The same traffic on a $4 / $20 model costs $516 a month. Same feature, forty times the bill.

## Common mistakes

Rounding tokens down undercounts. `len(text) // 4` turns 10 characters into 2 tokens, not 3. Use `math.ceil`.

Using one price for both input and output gives a number that looks fine and is wrong.

Forgetting to reserve output space. If you fill the whole window with history, the API fails with an error like `maximum context length is 8192 tokens. However, you requested 8400 tokens`.

## On the job

The first question a customer's CFO asks is "what will this cost per month?" You should answer from token counts in a few minutes, and show the cheaper model that is good enough.
