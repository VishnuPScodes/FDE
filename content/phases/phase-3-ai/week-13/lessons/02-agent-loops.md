---
title: "The agent loop: call, act, repeat, stop"
week: 13
module: agent-loops
---

## What you're about to do

You'll build the loop that drives an agent. Then you'll make it stop safely, retry when the API is busy, trim old messages, and run several tool calls in one turn.

## The loop

An agent is a loop around a model:

```python
for step in range(1, max_steps + 1):
    reply = llm.complete(messages, tools=specs)
    messages.append({"role": "assistant", "content": reply["content"], "tool_calls": reply["tool_calls"]})
    if not reply["tool_calls"]:
        return reply["content"]
    for call in reply["tool_calls"]:
        messages.append(dispatch(call, registry))
```

That is most of it. The hard part is stopping. A model can ask for the same broken call again and again. Each call costs money and time. So you need clear stop rules. Stop when there is an answer. Stop at a step limit. Stop when the same call fails twice. Stop when a tool hands off to a human.

## A fake model for practice

Real models change their answers between runs, so tests would be flaky. In these levels, `fake_llm.py` plays the model. It returns scripted replies, one per call. It also records every message list it was sent. So the tests can check what your loop did, not what the model did.

```python
llm = FakeLLM([call("get_claim_status", {"claim_id": "CLM-1042"}), say("Approved.")])
run_agent(llm, "Status of CLM-1042?", REGISTRY)
# {'answer': 'Approved.', 'stopped': 'answer', 'steps': 2, ...}
```

## Busy APIs and long chats

At peak hours, model APIs return HTTP 429 or 503. Retry those with a growing wait: 0.5 s, then 1 s, then 2 s. If the server sends `retry_after`, use it. Never retry a bad request. It will fail the same way every time.

Long chats outgrow the context window. Drop the oldest messages first. But keep each tool result with the assistant message that asked for it. Real APIs reject a lonely tool result with an error like:

```
messages.3: tool_result block(s) provided when previous message does not have tool_use blocks
```

## Common mistakes

A `while True` loop with no limit is the big one. In these levels it shows up as:

```
RuntimeError: FakeLLM script ran out: your code called the model more times than expected
```

The other is stopping at the first failed tool in a parallel turn. If Delhi's warehouse times out, Pune and Kochi still have answers. Send all three results back.

## On the job

Customers rarely ask how smart the agent is. They ask what happens when it goes wrong. Step limits, retries and clear stop reasons are your answer.
