# Sampling: temperature and top-p

Next you will turn raw model scores into probabilities with softmax, then filter them with top-p. These are the two knobs you see in every API.

## Logits and softmax

At each step the model gives every possible next token a score called a logit. Softmax turns scores into probabilities that add up to 1. Bigger score, bigger share.

Temperature divides the logits before softmax. A low temperature, like 0.2, makes the gaps bigger, so the top token wins almost every time. A high temperature, like 1.5, flattens the gaps, so rarer tokens get picked more often. Temperature 0 means greedy: always take the top token.

## Top-p

Top-p (also called nucleus sampling) sorts tokens from most to least likely. It keeps tokens until their probabilities add up to at least `p`, then drops the rest. With `p = 0.8`, the long tail of strange tokens never gets picked.

## A small example

```python
logits = {"refund": 2.0, "sorry": 1.0, "hello": 0.0}
softmax(logits, 1.0)  # {'refund': 0.6652, 'sorry': 0.2447, 'hello': 0.09}
softmax(logits, 0.5)  # {'refund': 0.8668, 'sorry': 0.1173, 'hello': 0.0159}
```

Halving the temperature moved "refund" from 67% to 87%.

## Common mistakes

Multiplying by temperature instead of dividing. Your low temperature then makes output more random, the opposite of what you want.

Calling `math.exp(1000)` gives `OverflowError: math range error`. Subtract the largest logit first. The answer does not change, because softmax only cares about differences.

Floating point sums. `0.5 + 0.3` may print as `0.7999999999999999`, so a check like `total >= 0.8` can fail. Compare with a small tolerance.

## On the job

For extraction, classification and support answers, use a low temperature so the same input gives the same output. Save higher values for drafting marketing copy. Some newer models fix sampling for you and reject custom values, so check the provider's docs before you tune.
