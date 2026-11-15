# Prompt caching and batch requests

Next you will work out when prompt caching saves money, and build a batch file for overnight jobs.

## Prompt caching

Many apps send the same long prefix on every call: a system prompt, tool definitions, a 6,000-token rulebook. Prompt caching lets the provider reuse the work for that prefix. The first call writes the cache and costs a little more. Later calls read it for a small fraction of the normal price, often around 10%.

The cache only hits when the prefix is byte-for-byte identical. A timestamp in the system prompt, or tool JSON with keys in a different order, breaks it silently. You pay full price and nothing warns you. So build the prefix in a stable way: fixed text first, sorted JSON keys, and the changing question last.

```python
without, with_cache = caching_cost(6000, 200, calls=1000, input_usd_per_m=4.0)
print(without, with_cache)   # 24.8 3.2276
```

## Batch requests

If nobody waits for the answer, use a batch API. You upload a file of requests, each with your own `custom_id`, and collect results later, usually within a day. Batches are often about half price.

Results come back in any order. Some will fail. Always match results by `custom_id`, and keep a row for every input, even the failed ones.

## Common mistakes

Putting `datetime.now()` or a request ID at the top of the system prompt. Your cache hit rate drops to zero.

Caching a prefix you only use once. The write costs more than a normal call, so one-off calls get more expensive.

Matching batch results by position. You will tag the wrong complaint, and the numbers will look fine until a customer calls.

## On the job

A Kerala logistics company tagging 5,000 complaints overnight does not need instant answers. Batching plus caching the instructions can cut that bill by more than half. Point this out early, before the customer asks.
