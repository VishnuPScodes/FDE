---
title: Files and tests
week: 1
module: python-basics
---

## The task

You will read a small CSV file and check a calculation with pytest.

## Treat input as untrusted

Use Python's `csv` module instead of splitting each line by commas. CSV fields can contain commas inside quotes, and the module handles that format. A `DictReader` gives each row keys from the header. Convert numeric text with `int` or `float` before doing arithmetic.

Tests call your function with known inputs and compare the result with an expected value. A failing assertion shows the expected and actual values, which narrows down the problem. Keep tests focused on one behavior at a time.

```python
assert calculate_total([10, 20]) == 30
```

## Common mistakes

`FileNotFoundError` usually means the path is wrong or the file is not in the working folder. `AssertionError` means the result differed from the test expectation.

## On the job

Customer exports change often. A small test suite catches a broken assumption before an overnight data import writes bad totals.
