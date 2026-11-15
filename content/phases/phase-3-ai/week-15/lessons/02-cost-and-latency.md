---
title: "Cost and latency: pay less, answer faster"
week: 15
module: cost-latency
---

## What you're about to do

You will turn token counts into rupees, measure p50 and p95 latency, add a cache for repeated questions, and route easy questions to a cheaper model.

## The idea

Models charge per token, quoted in dollars per million tokens. Input and output have different prices. Your finance team thinks in rupees, so convert, and keep the exchange rate in one place.

```python
usd = (input_tokens * in_price + output_tokens * out_price) / 1_000_000
inr = round(usd * 83.0, 4)
```

Cached input tokens cost about 10% of the normal price when the provider has seen the same prefix. Count them separately.

**Latency** is best shown with percentiles. The p50 is the typical wait. The p95 is the wait that 1 in 20 users go past. A service with a good average and a bad p95 still feels broken, because people remember the slow ones. Set an SLO (a promise), such as "p95 under 2 seconds", and check it.

Three cheap wins:

1. **Cache.** The same question asked twice should not be paid for twice. Normalise spaces, key on model plus prompt, and drop the least recently used entry when full.
2. **Route.** Short, simple questions go to a small model. Only hard ones go to the large one. Cheapest model that is good enough.
3. Cap. Give each user or job a rupee budget. Refuse or degrade when it runs out, instead of finding out on the invoice.

## Common mistakes

Caching answers that depend on the user ("what is my balance?") under a key that ignores the user. Include everything that changes the answer in the key, or do not cache it.

Reporting only the mean latency.

Routing by gut feeling with no test. Run your eval set against the cheap model first. Route only where scores hold.

## On the job

A Kochi travel startup spent ₹2 lakh a month on one large model for everything. Half of the questions were "what is the baggage limit?". A cache plus a small model for simple questions cut the bill by more than half, and p95 latency dropped from 6 seconds to 2. Quote savings in rupees. It is the number the customer understands.
