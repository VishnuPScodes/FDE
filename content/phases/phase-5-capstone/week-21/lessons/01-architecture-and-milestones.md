---
title: "Architecture and build milestones"
week: 21
module: capstone-build
---

## What you're about to do

You will draw a simple architecture for your capstone and split the build into daily milestones. Then you will write two small pieces of code every real deployment needs: a reply classifier with an eval, and a usage-log summary.

## Build in their world

Your customer already has tools. A clinic has a Google Sheet and WhatsApp. A CA firm in Surat has Tally and Excel. Build around those tools. Do not ask a busy owner to learn a new dashboard in week one.

A capstone architecture usually has four parts. A source of data, a small service that does the work, a place where results go back, and logs. Write one line for each. Then write what happens when each part fails. What if WhatsApp is down? What if the sheet has a blank phone number?

Plan milestones by day, not by feature list. Day 1: read the sheet. Day 2: send one test message to yourself. Day 3: write replies back. A daily milestone shows progress even when something breaks.

## A small example

```text
Sheet (Google) -> reminder job (Python, every 30 min)
    -> WhatsApp Cloud API -> patient
patient reply -> webhook -> classifier -> sheet "status" column
every action -> usage log (one line per event)
```

## Common mistakes

Skipping logs is the most common one. In week 22 you need numbers. If you did not log events, you cannot measure anything.

Another mistake is building the hard, fun part first. Get one boring message end to end before you add AI.

## On the job

FDEs ship into environments they do not control. A short architecture note with failure modes is often the first thing a customer's IT team asks for.
