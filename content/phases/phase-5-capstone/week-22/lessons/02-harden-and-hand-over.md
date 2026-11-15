---
title: "Harden and hand over"
week: 22
module: capstone-measure
---

## What you're about to do

You will fix the top issues from your usage logs and write a runbook. The runbook lets your customer keep the system running without you.

## Fix what users actually hit

Read your logs and your customer's messages from the pilot. Group the problems. Count how often each one happened. Fix the top two or three. Do not polish things nobody uses.

Then write the runbook. It is for a non-engineer on a bad day. Use plain steps. Say how to check the system is alive, what to do when common things break and who to call. Include how to turn it off safely.

Handover also means ownership. Move the accounts, keys and repo access to the customer, or to someone they trust. Remove your own access when they are ready.

## A small example

```text
Problem: reminders stopped this morning
1. Open https://clinic-reminders.onrender.com/health
2. If it does not say "ok", wait 1 minute and refresh.
3. Still down? Do morning calls as before.
4. WhatsApp Priya (98xxx xxxxx) or email the backup contact.
```

## Common mistakes

A runbook full of terms like "redeploy the container" helps nobody at the front desk. Write for the person who will read it.

Leaving everything in your personal accounts is the other mistake. If your free account expires, their system dies.

## On the job

FDEs leave. Good ones leave behind systems that keep running. A runbook and a clean handover are what customers remember.
