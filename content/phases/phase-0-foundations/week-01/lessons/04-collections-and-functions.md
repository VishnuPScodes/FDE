---
title: Collections and functions
week: 1
module: python-basics
---

## The task

You will read customer records from a dictionary and calculate an invoice total in a function.

## Keep related data together

A list holds values in order. A dictionary maps a key to a value, which is useful when a record has named fields such as `customer` and `amount`. Use square brackets to read a known key. Use `.get()` when a key may be missing.

Functions give a name to a repeatable operation. Parameters are the inputs, and `return` sends a result back to the caller. Returning a value keeps the calculation separate from the display, so another part of the program can reuse it.

```python
def with_gst(amount, rate):
    return amount * (1 + rate)

print(round(with_gst(1000, 0.18)))
```

Output: `1180`

## Common mistakes

`KeyError: 'amount'` means that key is missing from the dictionary. A function that reaches its end without `return` gives back `None`.

## On the job

Small functions make customer-specific calculations easier to review and test before they affect an invoice.
