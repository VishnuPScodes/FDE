---
title: "Printing — how Python talks to you"
week: 1
module: python-basics
---

## What you're about to do

You'll print the name **Vishnu** to the terminal. Simple? Yes. But this exact pattern — run code, read output, iterate — is how you'll debug a production system at a customer site, so let's do it properly.

## The one thing you need to know

Python has a built-in function called `print`. It takes a value and writes it to *standard output* — usually the terminal.

```python
print("hello")
```

Run that, and `hello` appears on its own line. The quotes tell Python this is a string (text), not a variable name. Either `"..."` or `'...'` works; pick one and stay consistent.

## A real error you will see

```
SyntaxError: EOL while scanning string literal
```

This means you opened a quote but didn't close it, or mixed `"` and `'`:

```python
print("Vishnu')  # wrong — opened with " but closed with '
```

Python reads left to right and gives up when it finds something it can't parse.

## On the job

The first thing an FDE does on an unfamiliar machine is confirm the Python version and check that a basic script runs. `print` is your sanity check.
