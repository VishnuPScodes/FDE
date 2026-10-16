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

## 2026-10-14 — Linux shell: v86 vs WebVM

**Decision:** Use v86 (BSD-2-Clause licensed) for an optional browser Linux VM alongside the simulated shell. The current bundled guest is the small Buildroot image distributed by the v86 project; it is not Alpine.

**Why:** v86 is clearly free/open-source with a permissive license. WebVM/CheerpX has an unclear license for commercial/production use — the build prompt explicitly flags this for checking.

**Implementation:** Load v86 lazily when the learner selects Linux VM. The guest has no configured network device and is independent of the simulated shell's files and level grader. The simulated shell remains the graded environment. Firmware and guest image attribution are documented in `docs/THIRD_PARTY_NOTICES.md`.

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

## 2026-10-14 — Bundle static lesson content with Vite

**Decision:** Load curriculum, level YAML and lesson Markdown through Vite's static asset glob imports. Validate YAML with the shared Zod schemas in the browser, and run a Node-only CLI in CI for cross-file checks.

**Why:** Content stays versioned in Git and gets emitted as static assets by the existing Pages build. Learners do not need a content API, and Node filesystem code stays out of the browser bundle.

**Trade-off:** Content changes require a site build and deployment. Vite emits content as separate assets so the browser only downloads a lesson when its loader requests it.

**Markdown diagrams:** Render the curriculum's simple Mermaid flowchart syntax locally as SVG. This covers labeled nodes and directed arrows without adding a runtime dependency; unsupported syntax is shown as a readable code block.

## 2026-10-14 — Python workspace: Monaco, xterm.js and Pyodide

**Decision:** Use Monaco Editor and xterm.js for the Python workspace, run Pyodide 0.314.0.7 in a module Web Worker, and persist learner files in IndexedDB (with a localStorage fallback). Load the Python runtime on demand and cache it with the service worker.

**Why:** This follows the agreed M3 stack and keeps Python execution off the UI thread. Monaco's ESM entry points are imported directly so unrelated language support is not bundled. Pyodide and pytest run entirely in the browser; level checks are local, while pass status and progress are sent to the authenticated progress API.

**Licenses:** Monaco Editor and xterm.js are MIT; Pyodide is MPL-2.0. These licenses permit use on the public website. The Pyodide version is pinned in the worker URL so runtime updates are deliberate.

**Trade-off:** The editor's lazy-loaded code chunk is several megabytes, and the first Pyodide run downloads a larger runtime. Neither is part of the initial app load; both are cached by the browser/service worker.

## 2026-10-15 — SQL practice: PGlite in a dedicated worker

**Decision:** Run PGlite 0.5.10 directly inside a module Web Worker. Initialize an isolated in-memory PostgreSQL database for each opened level from its checked-in SQL fixture. Store the learner's query in the existing IndexedDB workspace, and load the database again from the fixture when the level is reopened.

**Why:** This gives learners real PostgreSQL parsing, joins, window functions, transactions and query plans without a hosted database or account. The worker keeps query execution off the UI thread. The same fixture and query checks run in the local test suite against PGlite.

**License:** PGlite is dual licensed under Apache-2.0 or the PostgreSQL License, both suitable for this public website.

**Trade-off:** The database itself is ephemeral per level session; the query file persists locally, but changes made by SQL statements reset when the learner leaves and reopens a level. PGlite adds a multi-megabyte runtime that is loaded only when an SQL level opens.

**Vite asset handling:** Exclude `@electric-sql/pglite` from dependency optimization. Import its WASM and `pglite.data` files as Vite URL assets, fetch and compile them in the SQL worker, then pass the modules and bundle to `PGlite.create`. This avoids incorrect dependency-optimized URLs and MIME types in the worker.


## 2026-10-15 — Shell practice: isolated TypeScript simulator first

**Decision:** Implement the fallback shell as an isolated TypeScript state machine, with a terminal UI and IndexedDB persistence. Keep the simulator available even if a Linux VM fails to load.

**Why:** It gives learners a lightweight shell workspace with no access to the host machine or network and provides a fast way to validate Week 1 practice content.

**Update:** The optional v86 runtime is now integrated and lazy-loaded beside the simulator. The simulator remains the graded workspace; broader VM-backed lesson grading and a curated guest image remain follow-up work.

**Verification:** A learner confirmed the VM boots in the browser, displays a shell, and responds to `ls`. Automated shell-level checks continue to grade the simulator.

## 2026-10-15 — Git practice: isomorphic-git with LightningFS

**Decision:** Run isomorphic-git against @isomorphic-git/lightning-fs in IndexedDB. Give each learner and level an isolated persistent repository. Provide a local simulated remote with pull-request review and merge controls; do not push learner data over the network.

**Why:** Learners can use real Git object, index, branch, commit, merge, and cherry-pick behavior inside the browser. LightningFS persists repository history across reloads. The simulated remote supports the PR workflow without requiring a GitHub account or exposing learner repositories.

**Trade-off:** Rebase is a supported local subset built by replaying commits. It does not implement every Git edge case or connect to GitHub. Git levels grade repository state through explicit `git_state` checks.

**Diff behavior:** `git diff` shows a compact whole-file patch against the current `HEAD`; it does not implement Git's context hunking or staged-only `--cached` view.

**Licenses:** isomorphic-git and LightningFS are MIT licensed.

## 2026-10-16 — M7: local HTTP fixtures, OAuth provider, and FastAPI tests in Pyodide

**Decision:** Keep mock API scenarios and OAuth/OIDC flows inside the browser with no public network calls. Load the official FastAPI, HTTPX, and pytest packages from the pinned Pyodide distribution only for FastAPI levels. Test FastAPI applications through HTTPX `ASGITransport`; declare app routes with `async def`, and await async test functions on Pyodide's event loop.

**Why:** Pyodide 0.314.0.7 includes FastAPI, Pydantic, HTTPX, and pytest. Its WebAssembly runtime does not support Python threads. FastAPI's sync `TestClient`, sync route handlers, and pytest-asyncio's loop runner can start threads, so these levels use async routes and HTTPX's in-process ASGI transport. The worker awaits plain async `test_*` functions directly; regular synchronous tests continue to use pytest.

**Security boundary:** The OAuth provider uses demo-only visible client credentials and an HS256 key. Its tokens are for protocol exercises and must never be accepted by a production API. Production clients verify tokens against keys published by a trusted issuer.

## 2026-10-16 — Browser Buffer for isomorphic-git

**Decision:** Install the MIT `buffer` package as `globalThis.Buffer` before isomorphic-git runs in the browser.

**Why:** Vite does not inject Node globals. The Git workspace initialized its filesystem, then failed when isomorphic-git read `Buffer`; the polyfill restores the browser runtime behavior it expects without changing Git storage or adding a server.

## 2026-10-16 — M8: TypeScript transpilation and isolated UI preview

**Decision:** Compile one active TypeScript/TSX file at a time with MIT-licensed esbuild-wasm in a lazy Web Worker. Execute the generated code in an opaque-origin sandboxed iframe with a small React-compatible element renderer, console output, timeout, and embedded `test`/`expect` checks. Keep learner files in the existing browser workspace store.

**Why:** This provides a no-server TypeScript practice loop and a lightweight preview for basic admin UI components without pulling in a browser IDE or production React runtime.

**Limitations:** esbuild strips TypeScript syntax but does not type-check it. The preview supports static text and basic elements, not a full React DOM, event system, imports, or a Node runtime. The timeout reloads the sandbox after five seconds. Levels should teach that type-checking limitation and keep exercises within the supported preview surface.

**Verification:** Web type-check, Vitest (22 tests), content validation, and production build pass. Four Week 5 levels cover typed calculations, async data, embedded behavior checks, and a basic TSX admin panel. Preview deployment remains pending because the current deploy workflow targets production on pushes to `main`; no preview deployment was triggered.
