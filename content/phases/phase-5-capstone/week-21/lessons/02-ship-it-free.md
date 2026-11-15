---
title: "Ship it on a free tier"
week: 21
module: capstone-build
---

## What you're about to do

You will deploy your capstone to a public URL and connect your repository. Your customer must be able to use it without your laptop being on.

## Free options, no credit card

You do not need a paid cloud account. These free tiers work well for small capstones and did not need a card when this guide was last verified (November 2026). Free-tier terms change, so check the pricing page before you start.

Cloudflare Pages and Workers suit static sites and small APIs. Vercel and Netlify suit front ends with a few serverless functions. Render runs small Python web services. Hugging Face Spaces suits Gradio or Streamlit demos. Supabase and Neon give you a free Postgres database.

Add a `/health` route that returns the text `ok`. It tells you, and our checker, that the service is alive. Keep secrets in the platform's environment variables, never in the repo.

## A small example

```text
$ curl -i https://clinic-reminders.onrender.com/health
HTTP/2 200
content-type: text/plain

ok
```

A 200 status and the word ok mean the deployment is live.

## Common mistakes

Free services on some platforms sleep when idle. The first request after a quiet hour can take 30-50 seconds. Tell your customer, or use a scheduled ping.

Pushing a `.env` file is the other big one. If you see `remote: Push cannot contain secrets` from GitHub, remove the file, rotate the key and add `.env` to `.gitignore`.

To avoid surprise bills, never add a card "just in case". If a platform asks for one, pick another from the list. Delete unused services when the project ends.

## On the job

Customers judge you on whether the thing is up on Monday morning. A health check and a known deploy process make that boring, which is exactly what you want.
