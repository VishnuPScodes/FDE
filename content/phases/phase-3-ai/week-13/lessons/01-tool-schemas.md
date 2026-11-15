---
title: "Tool schemas: the contract between model and code"
week: 13
module: tool-schemas
---

## What you're about to do

You'll describe a tool so a model can call it. Then you'll check the model's arguments before you run anything. Last, you'll trim what the tool sends back.

## How tool calling works

A model cannot run code. It can only write text. With tool calling, you send the model a list of tools. Each tool has a name, a description, and a JSON Schema for its inputs. When the model wants a tool, it replies with a tool call instead of an answer:

```python
{"id": "call_1", "name": "lookup_policy", "arguments": {"policy_number": "POL-204518"}}
```

Your code runs the tool. Then it sends the result back as a tool message. The model reads it and carries on.

The description is a prompt. The model uses it to pick the tool, so say what the tool returns and when to use it. The schema is a contract. Mark required fields. Add a `pattern` for IDs. Set `additionalProperties` to `False` so made-up fields fail.

But the model does not have to obey the schema. It is still writing text, and text can be wrong. So your code checks every call before it runs.

## A small example

A Pune insurer's assistant asks for a refund with a typo:

```python
>>> validate_args(REFUND, {"order_id": "8841", "amount_inr": "1499"})
['order_id does not match pattern', 'amount_inr must be integer']
```

Nothing runs. The errors go back to the model as a tool message with `is_error` set. Most models fix the call on the next try.

## Common mistakes

Python thinks `True` is a number. This passes a naive check:

```python
>>> isinstance(True, int)
True
```

JSON does not agree. Check for `bool` first.

Letting a tool crash the whole loop is the other classic. You will see this in your logs:

```
KeyError: 'Unknown Pvt Ltd'
```

Catch the error and send it back as data instead. The model can often recover.

Last, do not dump 500 rows into the context. Send the fields the model needs, a row limit, and a note that says more exist. Leave out columns like PAN numbers. The model never needed them.

## On the job

Customers judge an assistant by its worst moment. Tight schemas and checked arguments stop most of those moments before they reach a real system like Tally or a claims database.
