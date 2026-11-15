---
title: "Practical coding drills"
week: 23
module: coding-drills
---

## What you're about to do

You will solve four practical problems of the kind FDE loops ask: parse logs, reconcile two datasets, build a rate limiter and pull data from a paginated API. Give each one about 25 minutes.

## What practical rounds test

FDE coding rounds are rarely about clever algorithms. They test whether you can turn messy input into a correct answer, quickly, while talking. The input is usually text, CSV rows or JSON from an API.

Work in this order. First, read the input and say what can go wrong: blank lines, odd casing, commas inside numbers, missing fields. Second, write the simplest version that handles the happy path. Third, run the tests. Fourth, handle the edge cases one by one.

Talk while you code. Say "I'm skipping malformed lines here, and I'd log them in production." The interviewer is scoring your judgment as much as your code.

## A small example

```python
amount = "Rs 1,250.00"
float(amount)
# ValueError: could not convert string to float: 'Rs 1,250.00'

clean = amount.replace("Rs", "").replace(",", "").strip()
float(clean)  # 1250.0
```

Money from an Indian export almost always needs this kind of cleaning.

## Common mistakes

Not checking edge cases is the most common one. Ask: what if the list is empty? You will see `ZeroDivisionError: division by zero` if you forget.

Another mistake is silent assumptions. If you assume IDs are unique, say so out loud.

## On the job

Every FDE week has a "can you just pull this export and match it to that one?" task. These drills are that job, with a timer.
