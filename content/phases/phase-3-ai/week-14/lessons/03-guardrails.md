---
title: "Guardrails: checks around the model"
week: 14
module: guardrails
---

## What you're about to do

You'll hide Indian personal data, force valid JSON out of a model, cap spending per user, block or escalate risky messages with a rule list, and test your guard with a set of cases.

## The idea

A guardrail is plain code that runs before or after the model. The model may be wrong or fooled. The code does not get tired. Put hard rules in code, and keep the prompt for style and judgement.

## Hide personal data

Before text goes to a model, a log or a vendor, redact what you do not need. For India that means Aadhaar numbers (12 digits, often as `2345 6789 0123`), PAN (`ABCDE1234F`), mobile numbers (`+91 98765 43210`) and emails.

Replace each with a label like `[PAN]`. Order matters. Run the Aadhaar rule before the phone rule, because 12 digits contain 10 digits. Use digit boundaries so a long number is not cut in the middle.

## Check the output

Ask for JSON and the model sometimes adds chat words or code fences. Parse the reply. Check required keys and types. If it fails, ask again and put the exact error in the new request. Stop after a few tries and raise an error. Never loop forever.

## Set budgets

One user stuck in a loop can spend a month's money in an afternoon. Keep a token count per user per day. Before a call, ask "would this go over the limit?" If yes, refuse and do not charge. A refused call costs nothing.

## Block or escalate

Make a list of rules. Each has a name, a pattern and an action: `block` or `escalate`. A message that asks to "disable the fraud check" may be blocked. One that mentions a legal notice may go to a human.

When several rules match, the strictest wins: block, then escalate, then allow. Return the reasons too. You will need them in the audit log.

## Test the guard

Keep a list of cases: a message and the action you expect. Run them on every change. Include attacks that must be blocked and ordinary messages that must pass. A guard that blocks everything is as broken as one that blocks nothing.

## Common mistakes

Redacting after logging.

Retrying without telling the model what was wrong.

Case-sensitive patterns. "IGNORE" and "ignore" are the same attack.

## On the job

Risk teams at Indian banks care about two logs: what was blocked, and why. Build the reasons in from day one.
