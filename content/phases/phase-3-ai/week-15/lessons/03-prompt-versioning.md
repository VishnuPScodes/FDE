---
title: "Prompt versioning: change prompts without fear"
week: 15
module: prompt-versioning
---

## What you're about to do

You will build a prompt registry with version numbers and one-call rollback, fill templates safely, fingerprint prompts for your traces, and write an A/B gate that decides whether a new prompt may go live.

## The idea

A prompt is part of your program. A one-word change can make answers better or much worse. So treat prompts like code: every change gets a version, old versions are kept, and the app uses one **active** version.

```python
v = registry.register("emi-reminder", new_text)   # becomes active
registry.rollback("emi-reminder")                  # back to the previous one
```

Rollback only moves the active pointer. It never deletes the bad version, because you will want to study it.

**Templates.** Prompts have holes like `{name}`. Fill them strictly. If a value is missing, fail loudly. A prompt with a raw `{amount}` in it makes the model invent an amount. Fill holes in one pass, so a value that contains `{something}` is not expanded again. That also blocks a customer from slipping a template hole into their message.

Fingerprints. Save a short hash of the prompt text in every trace. When quality drops on Tuesday, you can see which prompt text was running.

## The A/B gate

Before a new version goes live, run old and new on the same golden set. Look at two numbers:

- the mean gain (is it better overall?), and
- the number of **regressions** (cases that got clearly worse).

A good average can hide broken cases. Require a minimum gain and a low number of regressions. If the gate says no, the prompt does not ship.

## Common mistakes

Editing the live prompt in an admin page with no history.

Comparing prompts on different test cases. Use the same set, in the same order.

Promoting on a tiny gain that is just noise. Set a minimum gain, and use enough cases.

## On the job

A Chennai lending startup changed one line of its reminder prompt on a Friday. The tone turned sharp and complaints started that night. Because they had versions, they rolled back in under a minute. Because they had an eval gate in CI, the next change was tested before it reached a single customer.
