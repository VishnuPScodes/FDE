---
title: "Decomposition mocks"
week: 23
module: decomp-mocks
---

## What you're about to do

You will do two timed decomposition mocks. Each takes 25 minutes and uses the same eight headings.

## The framework

Decomposition is the round most candidates fail. The prompt is vague on purpose: "A logistics company wants to use AI to cut missed deliveries." The interviewer wants to see you turn that into something buildable.

Use the headings in order. Goal: the business outcome and one metric. Users: who touches the system. Data: what exists, where it lives, how clean it is. Constraints: budget, privacy, latency, people. MVP: the smallest thing that moves the metric. Architecture: the boxes and arrows. Risks: what can go wrong and how you reduce it. Rollout: pilot, measure, expand.

In a live interview, spend the first five minutes asking questions. In these mocks you cannot ask, so write your assumptions clearly. "I assume drivers have Android phones with patchy data."

Keep the MVP small. A rule-based first version is often right. Say where an LLM helps and where it does not.

## A small example

```text
Goal: cut missed deliveries from 12% to 7% in 8 weeks
MVP: day-before WhatsApp confirm with address check
     for the 3 worst routes only
```

## Common mistakes

Jumping straight to architecture is the classic error. If you start drawing a vector database before you know the metric, you have lost the room.

Another mistake is ignoring rollout. Say who pilots it, for how long and what number decides the next step.

## On the job

Customers describe outcomes, not systems. Turning "we want AI" into a two-week MVP is the core FDE skill.
