---
title: Conditions and loops
week: 1
module: python-basics
---

## The task

You will choose an action from an amount and add up several invoice values.

## Make each decision visible

An `if` statement runs a block only when its condition is true. Use `elif` for another case and `else` for the remaining cases. Python uses indentation to mark each block; four spaces is the usual choice.

A `for` loop visits each value in a list. Add each amount to a running total when you need a sum. For a quick total, Python also has `sum`, but the loop makes each step visible while you are learning.

```python
amounts = [900, 1200, 500]
total = 0
for amount in amounts:
    total += amount
print(total)
```

Output: `2600`

## Common mistakes

`IndentationError: expected an indented block` means the statement after `if` or `for` needs indentation. A condition such as `amount = 1000` assigns a value; use `==` when you mean to compare values.

## On the job

Customer rules often have thresholds. Make the branches easy to read so someone can check the rule against their process.
