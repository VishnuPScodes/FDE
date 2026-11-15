---
title: "Human in the loop: approvals the model cannot skip"
week: 13
module: human-in-the-loop
---

## What you're about to do

You'll stop an agent before a risky action and ask a person. First with a direct yes or no. Then with a pause that can wait hours and resume later. Last, you'll decide when an agent is the wrong tool.

## Rules live in code

A Bengaluru e-commerce company lets its support bot issue refunds. Finance has one rule. Any refund above ₹10,000 needs a human.

You could write that rule in the system prompt. Don't rely on it. The model might ignore it. A customer might paste text that says "approval already given". The rule must sit in the code that runs tools. The model can ask for anything. Your code decides what actually runs.

```python
if needs_approval(call):
    decision = approver(call)
    if not decision["approved"]:
        return denied_message(call, decision)
return dispatch(call, registry)
```

When in doubt, ask. If the amount is the string `"15000"` instead of a number, treat it as risky. If the approval service is down, treat it as a "no". This is called failing closed.

## Waiting for a person

People are slow. A supervisor may reply on WhatsApp an hour later. Your server may restart in between. So the agent saves its state and stops:

```python
{"status": "awaiting_approval", "pending": {"name": "refund_payment", ...}, "steps": 1, ...}
```

When the answer arrives, you load the state and resume. Keep the state as plain JSON. A model client or a function cannot go into a database.

Log every decision: the tool, its arguments, who approved, and the result. Auditors will ask.

## Common mistakes

Using `>=` when the policy says "above". Exactly ₹10,000 should not need approval.

Failing open. This line looks harmless, but it approves every refund when the network blips:

```python
except Exception:
    decision = {"approved": True}
```

## Workflow or agent?

Not every job needs an agent. If you can draw the steps as a fixed flowchart, write a workflow. Call the model only where judgement is needed. Use an agent when the path depends on the question. Keep its tools few and its limits tight.

## On the job

The first question from a bank or insurer's risk team is "what can it do without a human?" A clear approval gate, with an audit log, is often what gets your project signed off.
