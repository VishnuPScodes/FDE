# Free-Tier Limits

This document tracks every free-tier service used by the platform, its current limits, and what happens when we hit them.

**Update this file** whenever free-tier terms change or when we observe approaching limits in the admin dashboard.

---

## Cloudflare Pages (Frontend)

| Limit | Free tier |
|---|---|
| Requests | 500 requests/month for Functions; unlimited for static assets |
| Bandwidth | Unlimited |
| Builds | 500 builds/month |
| Sites | Unlimited |
| Custom domains | Unlimited |

**What happens if we hit it:** The platform remains up (static assets have no limit). Only Pages Functions (if any) would be throttled — but we are using a Cloudflare Worker for the API, not Pages Functions.

**Last verified:** October 2026

---

## Cloudflare Workers (API)

| Limit | Free plan |
|---|---|
| Requests | 100,000 requests/day |
| CPU time | 10ms per request (after first 10ms is free) |
| Workers | 100 |
| KV reads | 100,000/day |
| KV writes | 1,000/day |

**What happens if we hit 100k requests/day:** The API returns HTTP 429 for additional requests. The frontend should handle this gracefully with a "platform is busy, try again shortly" message. At 100k/day we have ~1 learner actively making ~1 request/sec all day — very unlikely before significant scale.

**Mitigation:** Batch progress updates; debounce; cache profile and progress data in the browser.

**Last verified:** October 2026

---

## Supabase (Database + Auth)

| Limit | Free tier |
|---|---|
| Database size | 500 MB |
| Bandwidth | 5 GB/month |
| Auth users | 50,000 MAU |
| Storage | 1 GB |
| Edge Functions | 500,000 invocations/month |
| **Project pause** | Paused after 1 week of inactivity |

**Project pause mitigation:** A Cloudflare Worker cron (`0 8 * * *`) pings `GET /health` daily, which queries the database, keeping the project active.

**Database size mitigation:**
- Code snapshots capped at 20 KB; keep only last 5 per level per user
- Prune `submissions` older than 180 days (implement in the keep-alive cron)
- `login_events` older than 90 days pruned automatically

**What happens if storage hits 500 MB:** Inserts will fail. Admin dashboard monitors row counts and alerts before this happens.

**Last verified:** October 2026

---

## GitHub Actions

| Limit | Free (public repos) |
|---|---|
| Minutes | Unlimited for public repos |
| Concurrent jobs | 20 |
| Storage | 500 MB |

**What happens:** This platform's repo should be public (it's a free educational platform). Unlimited Actions minutes. If the repo is private, we have 2,000 minutes/month.

**Decision:** Keep the repo public.

**Last verified:** October 2026

---

## AI API Keys (learner-provided)

The platform uses the learner's own API key. The platform itself pays nothing.

| Provider | Free tier (as of Oct 2026) |
|---|---|
| Google AI Studio | Gemini Flash 1.5 free tier: 15 req/min, 1M tokens/day |
| Groq | LLaMA 3.1 8B: 14,400 req/day, 131K context |
| Cerebras | 30 req/min |
| OpenRouter | Many `:free` models |

**What happens when quota exhausted:** The AI adapter retries with backoff, then shows a message suggesting switching provider. Writing/roleplay levels fall back to a self-assessment checklist so progress is never blocked.

**Last verified:** October 2026

---

## Pyodide (client-side Python)

Not a hosted service — runs in the learner's browser. No server cost.

**Constraint:** ~25 MB first download (compressed). Cached by service worker after first load. Show download progress bar on first Python level.

---

## Free hosting for real-world levels

| Service | Free offer | Credit card? |
|---|---|---|
| GitHub Codespaces | 120 core-hours/month (personal) | No |
| Google Cloud Shell | 50 hrs/week | No |
| Render | Free instance (spins down after 15 min inactivity) | No |
| Cloudflare Pages | See above | No |
| Netlify | 100 GB bandwidth, 300 build minutes | No |
| Vercel | Hobby plan: unlimited deployments | No |
| Supabase | 500 MB Postgres | No |
| Neon | 512 MB Postgres | No |
| Play with Docker | 4 hrs sessions | No |
| Killercoda | Free interactive labs | No |

**Last verified:** October 2026 — these offers change frequently. Guides in `content/shared/real-world-guides/` carry a `last_verified` date and must be reviewed quarterly.
