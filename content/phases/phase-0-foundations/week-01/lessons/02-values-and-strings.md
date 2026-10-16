---
title: Values and strings
week: 1
module: python-basics
---

## The task

You will store a customer name and an invoice amount, then print a useful receipt line.

## Values have types

Text such as a customer name is a string. Numbers can be integers or decimals. Assign a value with `=` and give the variable a name that explains what it holds. Python keeps the type of each value, so adding two numbers works while adding text to a number raises `TypeError`.

An f-string lets you place values inside text. Put `f` before the opening quote and wrap each variable in braces. This is clearer than joining strings with `+`, especially when a value is numeric.

```python
customer = "Meera"
amount = 1200
print(f"{customer}: ₹{amount}")
```

Output:

```
Meera: ₹1200
```

## Common mistakes

`NameError: name 'ammount' is not defined` means the spelling differs between assignment and use. `TypeError: can only concatenate str (not "int") to str` often means text and a number were joined with `+`.

## On the job

When a CA firm sends invoice data, preserve amounts as numbers until you format a report. That keeps totals and tax calculations accurate.
