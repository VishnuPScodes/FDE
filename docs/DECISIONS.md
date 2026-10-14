# Technical Decisions Log

Every significant decision is recorded here: what we chose, why, and what we rejected.
Format: `## YYYY-MM-DD — Decision title`

---

## 2026-10-14 — Monorepo tooling: pnpm + Turborepo

**Decision:** Use pnpm workspaces (v9) with Turborepo (v2) for the monorepo.

**Why:** pnpm has efficient disk usage (symlinked node_modules), first-class workspace support, and strict peer dependency resolution. Turborepo gives us task caching and parallelism with minimal config. Both are free and MIT-licensed.

**Rejected:** Nx (more opinionated, heavier config), Lerna (mostly deprecated), Yarn workspaces (Turborepo integration is better with pnpm).

---

## 2026-10-14 — TypeScript strict mode everywhere

**Decision:** All TypeScript code uses strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.

**Why:** The platform will have many contributors and AI-generated content. Strict types catch bugs at compile time that would otherwise appear as runtime crashes in a learner's session.

**Rejected:** Loose mode, `allowJs`, `any` sprinkled in — these cause pain at scale.

---

## 2026-10-14 — Frontend: React + Vite, NOT Next.js

**Decision:** Use React + Vite as a plain SPA deployed to Cloudflare Pages.

**Why:** Server-side rendering is not needed (content is static files from CDN, all runtime is client-side). Vite is fast, easy to configure, and Cloudflare Pages works perfectly with static builds. Next.js would add deployment complexity and cost.

**Rejected:** Next.js (SSR overhead, costs on free tier), Remix, SvelteKit.

---

## 2026-10-14 — Backend: Cloudflare Worker with Hono

**Decision:** Single Cloudflare Worker (free plan) using Hono as the routing framework.

**Why:** Workers free plan gives 100k requests/day — enough for a learning platform at early scale. Hono is tiny (~13 KB), has a clean API similar to Express/Fastify, and runs natively on Workers. No Node.js APIs to worry about.

**Rejected:** Express on a VPS (costs money), AWS Lambda (costs money), Vercel serverless (limited on free tier for API).

---

## 2026-10-14 — Auth: Supabase Auth, Google only

**Decision:** Supabase Auth with only the Google provider enabled.

**Why:** R2 hard requirement. Google Sign-In is widely trusted, requires zero password management, and Supabase's free tier is generous enough. Supabase issues JWTs; we verify them in the Worker using their public JWKS endpoint.

**Rejected:** Auth0 (free tier limits), Clerk (paid for features we need), custom JWT — too much to maintain.

---

## 2026-10-14 — CSS: Vanilla CSS modules, no Tailwind

**Decision:** Use CSS custom properties for the design system + CSS Modules for component styles.

**Why:** CSS custom properties give us a full design token system without JavaScript. CSS Modules give scoped styles. No build-step dependency on a CSS framework. Tailwind has a larger learning curve for contributors and can produce bloated markup.

**Rejected:** Tailwind CSS (not in the project brief), styled-components/Emotion (runtime CSS-in-JS, heavier).

---

## 2026-10-14 — Python runtime: Pyodide in Web Worker (OPEN — spike required)

**Decision (tentative):** Use Pyodide inside a Web Worker for Python execution.

**Why:** Pyodide is MIT-licensed, runs CPython in WASM, supports pip packages including pytest. Web Worker keeps the UI responsive during execution.

**Open question:** Pyodide download size (~20 MB compressed). We will lazy-load it only when a Python level is opened, cache via service worker, and show a download progress bar on first load.

**To decide next milestone:** Whether FastAPI can run fully in Pyodide (spike M7).

---

## 2026-10-14 — Linux shell: v86 vs WebVM (OPEN — license check required)

**Decision (tentative):** Use v86 (BSD-2-Clause licensed) running a minimal Alpine Linux image.

**Why:** v86 is clearly free/open-source with a permissive license. WebVM/CheerpX has an unclear license for commercial/production use — the build prompt explicitly flags this for checking.

**Action required:** Confirm v86 can run the shell commands needed for Week 1 levels before M5. If not, evaluate the lightweight simulated shell fallback.

---

## 2026-10-14 — SQL runtime: PGlite (OPEN — verify pgvector support)

**Decision (tentative):** Use PGlite (Postgres in WASM, MIT-licensed) for SQL levels and as the RDS simulator backend.

**Why:** Real Postgres behaviour in the browser. Free, open-source. Supports most Postgres extensions.

**Open question:** pgvector support for RAG levels (M15). Need to verify at spike time.

---

## 2026-10-14 — Simulated AWS: TypeScript models, Moto as optional spike

**Decision:** Build the AWS simulator as pure TypeScript state machines. Evaluate running Moto (Python AWS mock library) inside Pyodide as a behaviour reference for complex services.

**Why:** TypeScript models give us control over output formatting and UI integration. Moto covers hundreds of API operations — if we can run it in Pyodide, we get realistic behaviour for free.

**Spike required:** Can Moto's full service coverage run inside Pyodide? Memory and startup time? Document result in this file.

---

## 2026-10-14 — Content in Git, not database

**Decision:** All lessons (Markdown) and level definitions (YAML) live in the Git repo as files, served from Cloudflare Pages CDN.

**Why:** Learner progress is tiny (a few KB per user). Lesson content can be gigabytes. Keeping content in Git means: version history, PR review workflow, CI validation, CDN caching, zero database cost.

**Rejected:** Storing lessons in Postgres (expensive queries, no CDN caching, hard to diff/review).
