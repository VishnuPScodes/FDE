---
title: "Tracing LLM calls: see where the time and tokens go"
week: 15
module: tracing-llm
---

## What you're about to do

You will build a tiny tracer. It times each step with spans, logs every LLM call with its model and token counts, prints a trace as a tree, and finds the step that is really slow. You will also remove phone numbers and emails before anything is logged.

## The idea

A chatbot request is not one step. It searches documents, builds a prompt, calls a model, maybe calls a tool, then checks the answer. When a customer says "it was slow" or "it gave a wrong answer", you need to see inside that request.

A **span** is one timed step with a name and a few facts (attributes). A **trace** is all the spans of one request. Spans can sit inside other spans, so a trace is a tree.

```python
with tracer.span("retrieve", k=5) as s:
    docs = search(question)
    s["attrs"]["hits"] = len(docs)
```

For LLM calls, always record the model name, input tokens, output tokens, and which prompt version was used. These four facts answer most "why" questions later.

**Self time** matters more than total time. An `agent` span that took 900 ms may have spent 800 ms waiting for a model call inside it. Blame the step that did the slow work itself: its duration minus the time of its direct children.

## Keep personal data out of traces

Traces are read by developers, support staff and sometimes vendors. Customers type phone numbers, account numbers and emails into chat. Replace them with `[phone]` or `[email]` before you cut the text to a short preview. If you cut first, half a number may stay behind.

## Common mistakes

Swallowing errors inside the tracer. Record the error on the span, then re-raise it. A tracer that hides failures is worse than none.

Logging the full prompt "just for now". It never gets removed, and it holds customer data.

Looking only at the longest span. Look at self time.

## On the job

A Pune insurance company's claims bot felt slow to staff. The average latency looked fine. One trace tree showed the slow part was a document lookup that ran twice per question. Nobody would have found it by reading logs. Teams often set up tracing first, because every later fix (cost, speed, quality) starts from what it shows.
