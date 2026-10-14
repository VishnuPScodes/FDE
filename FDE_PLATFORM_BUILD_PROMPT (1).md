# Build Prompt: Free, Self-Paced Forward Deployed Engineer (FDE) Learning Platform

> **How to use this file**
> Give this entire file to the AI coding assistant at the start of the project and keep it in the repo root (e.g. as `PROJECT_BRIEF.md` / `CLAUDE.md`). The assistant must re-read it at the start of every session.
> Build **one milestone at a time** (Part 9). Do not start the next milestone until the current one is finished, tested and approved.
> The **full curriculum** lives in a separate file, **`docs/CURRICULUM.md`** (same content as `FDE_Curriculum_24_Weeks.pdf`). Part 3 here is a quick summary so you know what the platform must support; `docs/CURRICULUM.md` is the complete syllabus every lesson and level must cover. Read it before any content milestone.

---

## Part 0 — Rules for you, the AI building this

1. **Read this whole document before writing any code.** If anything here conflicts with something you want to do, follow this document or ask me first.
2. **Zero cost is a hard rule.** Do not add any paid service, paid library, paid API, or anything that needs a credit card from me or from learners. Only use free tiers and free/open-source software. If something only works on a paid plan, stop and tell me.
3. **Check licenses.** Only use libraries whose license allows free use on a public website. Flag anything with a non-commercial, "contact us for production" or unclear license (examples to check carefully: WebContainers, CheerpX/WebVM). Prefer MIT / Apache-2.0 / BSD.
4. **Build in small, working steps.** Each milestone must run end to end before moving on. Prefer small commits with clear messages.
5. **Write tests as you go.** Code without tests is not done.
6. **Do not invent APIs or library features.** If unsure how a library works, check its documentation; if still unsure, tell me.
7. **Ask me before** changing the architecture, the database schema, the level format, or adding a new dependency that is large or unusual.
8. **At the end of each milestone, give me:** what was built, how to run it, how to test it, known gaps, and what the next milestone needs from me.
9. Keep a `DECISIONS.md` log: every important technical decision, the date, and why.

---

## Part 1 — What we are building

A **free website that fully teaches someone to become a Forward Deployed Engineer**, following the 24-week curriculum (Part 3). It teaches by doing, not by watching.

### Core idea
- **No videos. No live teachers.** Learning happens through short written lessons and hands-on **levels**.
- Every level gives the learner a task, the tools to do it **inside the platform**, and an automatic check.
- Example, Level 1: *"Print the name Vishnu in the terminal."* The learner sees a code editor, types `print("Vishnu")`, clicks **Submit**, the platform runs it, checks the output, and if correct, Level 1 is cleared and Level 2 unlocks.
- Every tool the learner needs is built into the platform: code editor, terminal, Linux shell, database, Git, a **simulated Docker**, **simulated Kubernetes**, **simulated AWS** (console + CLI), **simulated Terraform**, **simulated CI/CD (GitHub Actions)**, monitoring dashboards, and AI exercises.
- Simulations must feel like the real thing (same commands, same flags, similar output and error messages, similar console layout and workflows) so that when the learner later uses the real tool, it feels familiar.
- Optional **"Real-world levels"** let learners repeat key tasks on real tools (real Docker, real Kubernetes, real deployments) **for free**, on their own laptop or a free online environment, verified by our checker.

### Hard requirements (do not compromise)
| # | Requirement |
|---|---|
| R1 | **Completely free** for the owner and for learners. No paid infrastructure, no paid APIs, no credit card anywhere. |
| R2 | **Login and registration only via Google Sign-In.** No email/password, no magic links, no other providers. |
| R3 | Authentication uses **JWTs**; every API call is verified. |
| R4 | On every login, record **device and session data**: browser + version, OS + version, device type (mobile/tablet/desktop), device model where available, screen size, language, timezone, IP address, country/city (from Cloudflare headers), timestamp. Shown in a clear privacy notice; consent required at sign-up. |
| R5 | **No videos** anywhere in the learning content. |
| R6 | Everything needed to learn is **inside the platform**. External tools appear only in optional real-world levels, and only free ones. |
| R7 | Lessons must read as **human-written** (see Part 7 style guide). |
| R8 | Grading may run in the browser. **Cheating is acceptable** — this is a learning platform, not an exam. Do not over-engineer anti-cheat. |
| R9 | Learners use their **own free AI API key** for AI features (bring-your-own-key). The key never leaves their browser. |
| R10 | Works on desktop browsers (Chrome, Edge, Firefox, Safari). On phones, reading lessons and simple levels must work; heavy levels may show "use a laptop for this level". |

### Audience
- Primarily Indian learners, from beginners who can write a little Python to working developers who want to move into FDE roles.
- Many will be on mid-range laptops and average internet. Performance and download size matter.
- Use English; examples should use Indian context (names, rupees, local businesses, GST, Tally, WhatsApp-based workflows, DPDP Act) alongside global context.

---

## Part 2 — Architecture (agreed; do not change without asking)

### 2.1 Principles
- **Do as much as possible in the learner's browser.** Code execution, simulators, grading and AI calls run client-side. This is what keeps the platform free.
- **One small backend** only for what a browser cannot do safely: verifying sessions, saving progress, logging device data, checking learners' live deployed URLs, calling the GitHub API, and receiving real-world checker results.
- **Content lives in Git** as files, not in the database.
- **No separate cache server.** Use CDN caching and browser caching.

### 2.2 Tech stack
| Area | Choice | Notes |
|---|---|---|
| Repo | **Monorepo**, pnpm workspaces + Turborepo | One repo for everything |
| Language | **TypeScript** everywhere except the checker CLI (Go) | Strict mode on |
| Frontend | **React + Vite** single-page app, React Router | Static build; no server rendering needed |
| Hosting (frontend) | **Cloudflare Pages** (free) | Free subdomain is fine (e.g. `*.pages.dev`) |
| Backend API | **Cloudflare Worker** (free plan) using **Hono** | One service only |
| Auth | **Supabase Auth**, **Google provider only** | Supabase issues the JWT |
| Database | **Supabase Postgres** (free tier) with **Row Level Security** | |
| Editor | **Monaco Editor** | Same engine as VS Code |
| Terminal UI | **xterm.js** | Used by every terminal: shell, docker, kubectl, aws, etc. |
| Python runtime | **Pyodide** in a Web Worker | Includes pytest for tests |
| SQL runtime | **PGlite** (Postgres in WASM) in a Web Worker | Real Postgres behaviour |
| Linux shell | **v86** (BSD license) running a small Linux image, or WebVM/CheerpX **only if its license allows** | Lazy-loaded; cached by service worker |
| Git | **isomorphic-git** + an in-browser file system (e.g. lightning-fs / ZenFS) | Real Git behaviour on a virtual disk |
| JS/TS runtime | Sandboxed iframe / Worker + **esbuild-wasm** to compile TS | Avoid WebContainers unless the license is confirmed free for this use |
| Simulators | Our own TypeScript engines (Part 5) | Optional: **Moto** (Python AWS mock) inside Pyodide as an AWS behaviour reference/back end — spike first |
| Local storage | **IndexedDB** (via Dexie or idb) | Learner files, sandbox state, AI key |
| Offline/caching | **Service worker** (Workbox) | Cache runtimes and content after first load |
| Charts (monitoring sims) | A free chart library (e.g. uPlot/Recharts) | |
| Checker CLI | **Go**, single static binary for Windows/macOS/Linux | Distributed via GitHub Releases (free) |
| CI/CD | **GitHub Actions** (free) | Lint, test, validate content, deploy |
| E2E tests | **Playwright** | |
| Unit tests | **Vitest** (TS), `go test` (Go) | |

### 2.3 Monorepo layout
```
/
├── apps/
│   ├── web/              # React + Vite learning site
│   ├── api/              # Cloudflare Worker (Hono)
│   └── checker/          # Go CLI for real-world levels
├── packages/
│   ├── ui/               # Design system, layout, Monaco + xterm wrappers
│   ├── runtimes/         # Pyodide, PGlite, v86, JS/TS sandbox — all in Web Workers
│   ├── fs/               # Virtual file system shared by editor, terminal, git
│   ├── simulators/
│   │   ├── core/         # Shared state engine, command parser, output formatter
│   │   ├── docker/
│   │   ├── kubernetes/
│   │   ├── aws/          # Fake AWS: CLI + console + service models
│   │   ├── terraform/
│   │   ├── ci/           # GitHub Actions-style pipeline simulator
│   │   ├── observability/# Logs, metrics, traces, alerts simulator
│   │   └── http/         # Fake internet: mock APIs, webhooks, OAuth provider
│   ├── grader/           # Runs level checks in the browser
│   ├── ai/               # Bring-your-own-key AI adapter (OpenAI-compatible)
│   ├── content-schema/   # Zod schemas + validator for lessons and levels
│   └── config/           # Shared ESLint, TS, Tailwind configs
├── content/
│   ├── curriculum.yaml   # Phases → weeks → modules → level order
│   ├── phases/
│   │   └── phase-0-foundations/
│   │       └── week-01/
│   │           ├── lessons/*.md
│   │           └── levels/<level-id>/
│   │               ├── level.yaml
│   │               ├── starter/        # starter files
│   │               ├── tests/          # check files
│   │               ├── solution/       # reference solution (must pass)
│   │               └── wrong/          # at least one wrong solution (must fail)
│   └── shared/           # datasets, mock API definitions, images
├── docs/
│   ├── PROJECT_BRIEF.md  # this file
│   ├── CURRICULUM.md     # full 24-week syllabus
│   ├── STYLE_GUIDE.md    # Part 7
│   ├── LEVEL_SPEC.md     # Part 4
│   └── DECISIONS.md
└── .github/workflows/
```

### 2.4 How a level runs (data flow)
1. Learner opens a level → the web app loads `level.yaml`, lesson text and starter files from static content (CDN).
2. The required runtime/simulator lazy-loads in a Web Worker (cached after first time).
3. Learner works in editor/terminal/console; all state lives in the browser (IndexedDB).
4. Learner clicks **Submit** → `grader` runs the level's checks in the browser.
5. Result is shown with clear feedback. On pass, the web app calls the API `POST /progress` with the JWT; the API saves it.
6. For levels that need server help (live URL check, GitHub check, checker CLI), the grader calls the API, which performs the check and returns the result.

---

## Part 3 — Curriculum to implement (summary of the PDF)

24 weeks, ~15–20 hours/week. Each week becomes a **module** of lessons + levels (target 15–40 levels per week). Every week ends with a **checkpoint level** (a bigger task combining the week's skills). Each phase ends with a **phase project**.

### Phase 0 — Foundations (Weeks 1–2)
- **W1:** Python for production (virtualenvs/uv concept, pyproject, type hints, dataclasses/Pydantic, errors, logging, pytest, asyncio/httpx); Git (branch, merge, rebase, conflicts, PRs); shell (ssh concept, grep/sed/awk, jq, curl, env vars, cron, ps/top/lsof). *Build:* CLI that pulls JSON, cleans it, writes CSV + SQLite.
- **W2:** SQL (all joins, GROUP BY/HAVING, window functions, CTEs, NULLs, indexes + EXPLAIN, transactions); data modelling (normalisation, star schema). *Build:* load a messy dataset into Postgres, answer 20 business questions.

### Phase 1 — Backend & Data Integration (Weeks 3–6)
- **W3:** REST APIs, status codes, pagination, idempotency, rate limits + retries/backoff, webhooks (signatures, replay), OpenAPI; FastAPI.
- **W4:** OAuth 2.0 (auth code + PKCE, client credentials), OIDC, JWT, SSO/SAML concepts, API keys vs service accounts, RBAC, secrets, PII basics, least privilege.
- **W5:** TypeScript essentials, Node concepts, a minimal React admin UI.
- **W6:** Messy data & ETL: CSV/Excel/PDF ingestion, schema drift, dedup, entity resolution, validation, incremental loads, scheduling concepts, legacy systems (SFTP, SOAP, ODBC). *Phase project A:* enterprise integration service.

### Phase 2 — Cloud & Deployment (Weeks 7–9)
- **W7:** Docker (multi-stage, slim, non-root), compose, registries; CI/CD with GitHub Actions; environments; versioning; rollbacks.
- **W8:** AWS (IAM, VPC/subnets/security groups, private endpoints, RDS, S3, Lambda, secrets); Terraform (modules, state, plan/apply); Kubernetes (pods, deployments, services, ingress, config/secrets, Helm).
- **W9:** Observability (structured logs, metrics, traces/OpenTelemetry, dashboards, alerts, SLOs, on-call, postmortems); security posture (isolation, encryption, audit logs, dependency scanning, security questionnaires, SOC 2, DPDP Act, GDPR).

### Phase 3 — Applied AI Engineering (Weeks 10–15)
- **W10:** LLM basics (tokens, context, sampling, model trade-offs, cost, latency); APIs (messages, system prompts, streaming, structured output, caching, batch); prompt & context engineering.
- **W11:** RAG I: parsing, chunking, embeddings, vector search (pgvector), metadata filters, hybrid search, reranking, citations.
- **W12:** Evals: golden sets, recall@k, MRR, faithfulness, LLM-as-judge, human review, regression evals in CI.
- **W13:** Tool calling & agents: tool schemas, orchestration loops, errors, memory/state, human-in-the-loop, workflows vs agents.
- **W14:** MCP (servers, tools, resources, prompts, auth), connecting to enterprise systems; safety: prompt injection, exfiltration, PII redaction, guardrails, permission scoping.
- **W15:** LLMOps: tracing, token budgets, caching, fallbacks/routing, rate limits, cost tracking, latency, prompt versioning, fine-tune vs RAG vs prompts. *Phase project B:* trustworthy enterprise assistant.

### Phase 4 — Customer Craft (Weeks 16–19)
- **W16:** Discovery: stakeholder mapping, questioning, five whys, workflow shadowing, quantifying pain.
- **W17:** Decomposition framework: Goal → Users → Data → Constraints → MVP → Architecture → Risks → Rollout.
- **W18:** Writing & scoping: design docs, exec memos, plans, SOWs, status updates, scope negotiation.
- **W19:** Demos, adoption, change management, ROI, product feedback, trust.

### Phase 5 — Capstone (Weeks 20–22)
- Find a real "customer", do discovery, scope, build, deploy, measure, hand over, write a case study. The platform guides each step with templates and checkpoints; final validation via customer sign-off form + live URL checks + usage pings (Part 6.8).

### Phase 6 — Interview Loop (Weeks 23–24)
- Practical coding drills, decomposition mocks, customer-simulation role-plays, take-home practice, AI system design, behavioral story bank, full mock loop.

---

## Part 4 — Level specification (`LEVEL_SPEC.md`)

Every level is a folder with a `level.yaml`. The content validator (Zod schema) must reject invalid levels in CI.

### 4.1 `level.yaml` fields
```yaml
id: p0-w01-py-001            # phase-week-topic-number, unique, never reused
title: "Say my name"
phase: 0
week: 1
module: python-basics
order: 1                     # order inside module
difficulty: 1                # 1–5
estimated_minutes: 3
type: code                   # see 4.2
environment: python          # python | sql | shell | git | js | ts | docker | kubernetes | aws | terraform | ci | http | observability | ai | writing | roleplay | quiz | realworld
lesson: ../../lessons/01-printing.md   # short lesson shown before/alongside
task: |
  Print the name **Vishnu** in the terminal.
starter_files:
  - path: main.py
    from: starter/main.py
checks:                      # all must pass
  - kind: stdout_equals
    run: python main.py
    expected: "Vishnu\n"
    normalize: [trim_trailing_whitespace]
hints:                       # revealed one at a time
  - "Python has a built-in function that shows text on the screen."
  - "Text in Python goes inside quotes."
  - "Try: print(\"...\")"
feedback:                    # optional, matched on common mistakes
  - when: { stdout_contains: "vishnu" }
    message: "Close! Check the capital V."
solution: solution/          # reference solution (never shown until passed or 'give up' after 3 hints)
unlocks: [p0-w01-py-002]
tags: [python, print]
```

### 4.2 Level types
| Type | What the learner does | How it is checked |
|---|---|---|
| `code` | Write code in the editor | stdout/stderr match, return values, unit tests (pytest/Vitest), file contents |
| `sql` | Write queries | Result set compared to expected (order-sensitive or not), EXPLAIN contains index scan, schema assertions |
| `terminal` | Type commands in a shell or simulator | Final state assertions (files exist, process running, container healthy, resource created), command history patterns |
| `console` | Click through the fake AWS console | Final simulator state assertions |
| `project` | Multi-file build over several steps | Combination of tests; each step is a sub-check with its own feedback |
| `quiz` | Multiple choice / short answer | Exact or rubric match |
| `writing` | Write a design doc, memo, postmortem, README | AI rubric grading (BYOK) + self-checklist; never blocks progress if no AI key — fall back to self-assessment checklist |
| `roleplay` | Talk to an AI-played customer/stakeholder | AI rubric on discovery quality, questions asked, outcome reached |
| `decomposition` | Timed design of a system from a vague prompt | Structured answer template + AI rubric |
| `realworld` | Do it on real tools (own laptop/Codespaces/Cloud Shell/free hosts) | Checker CLI result, live URL checks, GitHub API checks, registry checks |

### 4.3 Check kinds (implement all in `packages/grader`)
`stdout_equals`, `stdout_matches` (regex), `stderr_contains`, `exit_code`, `file_exists`, `file_contains`, `json_equals`, `pytest_passes`, `vitest_passes`, `sql_result_equals`, `sql_plan_uses_index`, `git_state` (branch exists, commit count, merged, no conflicts), `sim_state` (JSONPath assertion on simulator state), `sim_command_used` (learner used a command/flag), `http_response` (against in-browser mock server), `live_url` (server-side, via API), `github_repo` (server-side), `checker_token` (from checker CLI), `ai_rubric` (BYOK), `checklist` (self-assessed), `time_limit` (for timed drills).

### 4.4 Content rules enforced in CI
- Every level's `solution/` must **pass** all checks; every `wrong/` example must **fail**.
- Every referenced file exists; every `unlocks` target exists; no cycles in unlock graph.
- Every level has at least 2 hints.
- Lesson markdown passes the style linter (Part 7.4).

---

## Part 5 — Simulators (the most important engineering)

### 5.1 Shared simulator core (`packages/simulators/core`)
- **State engine:** each simulator keeps an explicit, serialisable state object (e.g. images, containers, networks, volumes; or AWS resources by region/account). All actions are pure functions `state + command → new state + output`. State is saved to IndexedDB so learners can leave and return.
- **Command parser:** parses real CLI syntax including subcommands, short/long flags, `--flag=value`, quotes, pipes to a small set of built-ins (`grep`, `head`, `wc`, `jq`), and environment variables.
- **Output formatter:** reproduces real tool output formats (tables, IDs, timestamps, JSON/YAML/text output modes, colours).
- **Realistic errors:** unknown commands, wrong flags, missing resources, permission errors, port conflicts — with messages close to the real tool's wording style, and an exit code.
- **`--help` and `help`** for every supported command, written in the real tool's style.
- **Tab completion and command history** in the terminal.
- **Unsupported command message:** clearly say "This command isn't supported in the simulator yet" (never pretend it worked).
- **Scenario injection:** levels can preload state and inject faults (crash a container, fill a disk, expire a credential, throttle an API) so learners practise debugging.
- **Shared virtual file system** with the editor (Dockerfiles, manifests, Terraform files, workflow YAML are real files the learner edits).
- **Determinism for grading:** seeded random IDs and fixed clock option so tests are reliable.

### 5.2 Docker simulator
- Commands: `docker build` (parse Dockerfile: FROM, RUN, COPY, ADD, WORKDIR, ENV, ARG, EXPOSE, USER, CMD, ENTRYPOINT, HEALTHCHECK, multi-stage `AS`/`--from`), `images`, `rmi`, `tag`, `push`/`pull` (to a simulated registry), `run` (`-d`, `-p`, `-e`, `--name`, `-v`, `--network`, `--rm`, `-it`), `ps` (`-a`), `logs` (`-f`), `exec`, `stop`, `start`, `restart`, `rm`, `inspect`, `network`, `volume`, `system prune`, `login`.
- Simulated image layers and sizes (so "slim images" and "multi-stage builds" visibly matter), layer cache behaviour, non-root user checks, health status.
- When the image runs Python code, actually execute it via Pyodide where possible so `docker logs` shows real output.
- `docker compose` (`up`, `down`, `ps`, `logs`, `build`) with service dependencies, networks, env files.

### 5.3 Kubernetes simulator
- `kubectl get/describe/apply/delete/logs/exec/rollout (status, undo, history)/scale/port-forward/config (contexts, namespaces)/top` (simulated metrics), `-f`, `-n`, `-o yaml|json|wide`, labels and selectors.
- Resources: Namespace, Pod, Deployment, ReplicaSet, Service (ClusterIP/NodePort/LoadBalancer), Ingress, ConfigMap, Secret, PersistentVolumeClaim, Job, CronJob, HorizontalPodAutoscaler.
- Realistic lifecycle: Pending → ContainerCreating → Running; CrashLoopBackOff, ImagePullBackOff, OOMKilled scenarios; rolling updates and rollbacks; probes.
- YAML manifests validated with helpful errors.
- **Helm** basics: `helm install/upgrade/rollback/list/uninstall`, values files, simple templating.

### 5.4 AWS simulator (CLI + console)
- **Clearly labelled "Simulated cloud console — for practice, not affiliated with Amazon Web Services."** Do **not** use AWS logos, trademarks or copied artwork. Layout, navigation, workflows, terminology and CLI syntax should closely mirror real AWS so the real thing feels familiar.
- Two interfaces over **one shared state**: a web console UI and an `aws` CLI in the terminal (`aws <service> <command>` with `--region`, `--output json|table|text`, `--query` basic JMESPath, profiles via `aws configure`).
- Services (in order of build priority):
  1. **IAM** — users, groups, roles, policies (JSON policy evaluation: allow/deny, actions, resources), access keys, least-privilege exercises, AccessDenied errors when policies don't allow.
  2. **S3** — buckets, objects, versioning, bucket policies, public access block, presigned URL concept.
  3. **EC2 + VPC** — VPCs, subnets (public/private), route tables, internet/NAT gateways, security groups, key pairs, instances (start/stop/terminate), simulated SSH into an instance (opens a simulated shell).
  4. **RDS** — create Postgres instance (backed by PGlite so learners can really connect and query), subnet groups, security, snapshots.
  5. **Lambda** — create function (Python runs in Pyodide), invoke, environment variables, logs to CloudWatch.
  6. **ECR + ECS/Fargate** — push images from the Docker simulator, run services/tasks, load balancer (ALB) basics.
  7. **CloudWatch** — logs, metrics, alarms, dashboards (integrates with observability simulator).
  8. **Secrets Manager / SSM Parameter Store**.
  9. **Route 53 + ACM** (basic records, certificate concept).
  10. **EKS** (wraps the Kubernetes simulator), **API Gateway**, **SQS/SNS**, **Bedrock-style AI service** (wraps the BYOK AI adapter) — later.
- **Billing simulator:** show estimated cost per resource per month, and a "you forgot to delete this" warning — teaches cost awareness without real money.
- Regions and account IDs simulated; eventual-consistency delays optional for realism.
- Spike first: evaluate running **Moto** inside Pyodide as the behaviour engine for some services versus pure TypeScript models; record the decision in `DECISIONS.md`.

### 5.5 Terraform simulator
- HCL parsing for a supported subset: `provider`, `resource`, `variable`, `output`, `locals`, `data`, `module` (local), `count`, `for_each`, interpolation, references between resources.
- Commands: `terraform init`, `fmt`, `validate`, `plan` (realistic diff output with `+ ~ -`), `apply` (creates resources in the **AWS simulator**), `destroy`, `state list/show`, `output`, `workspace`.
- State file visible and editable (to teach state drift and its dangers).

### 5.6 CI/CD simulator (GitHub Actions-style)
- Learner writes `.github/workflows/*.yml` in the editor. Parse `on`, `jobs`, `runs-on`, `needs`, `steps` (`uses` for a set of known actions like checkout, setup-python, docker build/push; `run` for shell), `env`, `secrets`, `matrix`, `if`.
- A "pull request" and "merge" UI within the simulated Git repo triggers runs. Run view shows jobs, steps, logs, pass/fail, timings.
- `run:` steps execute in the shell/Pyodide where possible (e.g. real `pytest` runs). Deploy steps act on the Docker/Kubernetes/AWS simulators.
- Environments (dev/stage/prod), required approvals, rollback scenario.

### 5.7 Observability simulator
- Simulated service emits logs, metrics and traces (OpenTelemetry-style). Dashboards with charts, log search, trace waterfall view.
- Alert rules (threshold, duration), on-call notification view, SLO burn rate.
- Incident scenarios: learner must find root cause from telemetry and write a postmortem (writing level).

### 5.8 HTTP / "fake internet" simulator
- In-browser mock servers (service worker or worker-based fetch interception) for API exercises: paginated APIs, rate-limited APIs that return 429, flaky APIs that return 500, webhooks with signatures, slow responses.
- A **mock OAuth/OIDC provider** inside the simulator to practise auth code + PKCE and client credentials flows end to end, issuing JWTs learners can decode and verify.
- A mock SFTP / SOAP / CSV-export "legacy system" for ETL weeks.
- FastAPI-style exercises: run the learner's FastAPI app in Pyodide and test it with an in-process test client (spike to confirm feasibility; if FastAPI can't run fully, use the closest working approach and tell me).

### 5.9 Shell (Linux) environment
- Real Linux via v86 (or license-cleared WebVM) for shell weeks: files, permissions, processes, pipes, grep/sed/awk, jq, cron concepts, env vars.
- Grading reads the VM file system / command outputs.
- If the VM is too heavy for a device, fall back to a lighter simulated shell supporting the core commands, and tell the learner.

### 5.10 Git environment
- Real Git operations via isomorphic-git on the virtual file system: init, add, commit, log, branch, checkout/switch, merge (with conflicts the learner must resolve in the editor), rebase (supported subset), stash, diff, tag.
- A simulated "remote" (like GitHub) with pull requests, reviews and merge buttons, used by the CI simulator.

---

## Part 6 — Backend, auth, data and privacy

### 6.1 Authentication (Google only)
- Supabase Auth with **only Google** enabled. Disable email/password, magic links, phone and all other providers.
- Frontend uses Supabase client to sign in with Google; receives a session JWT.
- The Worker verifies the JWT on every request using Supabase's JWKS/public keys (check signature, issuer, audience, expiry). Reject otherwise with 401.
- Postgres **Row Level Security** on every table: a user can only read/write their own rows. Admin role for me.
- Session refresh handled by Supabase client; sign out everywhere option.

### 6.2 Device & login data (R4)
- On every sign-in and on session restore, the frontend collects: user agent, User-Agent Client Hints (brand, version, platform, platform version, mobile flag, model where available), screen width/height, device pixel ratio, viewport size, language(s), timezone, touch support.
- The Worker adds server-side: IP address, country, city, region, ASN (from Cloudflare request headers / `request.cf`), timestamp.
- Parse into readable fields (browser name + version, OS name + version, device type) with a free UA parser library.
- Stored in `login_events`. Also keep `devices` (deduplicated per user by device fingerprint of the above fields) with first_seen / last_seen.
- Show the learner their own login history and devices on their profile page.

### 6.3 Database schema (Supabase Postgres)
```
profiles        (id uuid PK = auth.users.id, google_email, full_name, avatar_url,
                 created_at, last_login_at, country, consent_version, consent_at,
                 ai_provider_pref text NULL, role text default 'learner')
login_events    (id, user_id FK, created_at, ip, country, region, city, asn,
                 browser, browser_version, os, os_version, device_type,
                 device_model, screen_w, screen_h, dpr, viewport_w, viewport_h,
                 language, timezone, touch, user_agent_raw)
devices         (id, user_id FK, device_hash, browser, os, device_type,
                 first_seen, last_seen, login_count)
level_progress  (user_id, level_id, status [locked|unlocked|in_progress|passed],
                 attempts, hints_used, first_opened_at, passed_at, time_spent_sec,
                 PRIMARY KEY (user_id, level_id))
submissions     (id, user_id, level_id, created_at, passed bool,
                 check_results jsonb, code_snapshot text NULL (size-capped))
realworld_runs  (id, user_id, level_id, created_at, source [checker|live_url|github],
                 result jsonb, passed bool)
writing_reviews (id, user_id, level_id, created_at, rubric_scores jsonb,
                 self_checklist jsonb)
feedback        (id, user_id, level_id NULL, created_at, rating, message)
consents        (id, user_id, version, accepted_at, ip)
```
- Lesson content, level definitions and curriculum are **not** in the database (they live in Git).
- Keep row sizes small (free tier storage). Cap code snapshots (e.g. 20 KB) and keep only the last N per level.

### 6.4 API endpoints (Cloudflare Worker, Hono)
| Method & path | Purpose |
|---|---|
| `POST /session/login-event` | Record device/login data (called after Google sign-in) |
| `GET /me` | Profile, consent status |
| `POST /consent` | Accept privacy notice version |
| `GET /progress` | All level progress for the user |
| `POST /progress` | Update level status/attempts/hints/time |
| `POST /submissions` | Store a submission result |
| `POST /checks/live-url` | Server-side check of a learner's deployed app (method, path, expected status/body/JSON) |
| `POST /checks/github` | Check a learner's public repo: files, workflow runs, PRs, branch protection |
| `POST /checks/registry` | Check an image exists on Docker Hub / GHCR |
| `POST /realworld/checker` | Receive results from the checker CLI |
| `GET /me/logins` | Learner's own login history and devices |
| `DELETE /me` | Delete account and all data (DPDP right to erasure) |
| `GET /me/export` | Export all of the learner's data as JSON |
| `POST /feedback` | Learner feedback on a level |
| `GET /health` | Health check |

- **SSRF protection** for `live-url`: only `https`, block private/loopback/link-local IP ranges and metadata addresses, short timeouts, response size cap, limited redirects.
- **Rate limiting** per user per endpoint (use Cloudflare free features or a simple counter in Postgres).
- **CORS** locked to our site's origin.
- GitHub checks use unauthenticated public API calls or a free GitHub token stored as a Worker secret; respect rate limits and cache results briefly.

### 6.5 Free-tier constraints to handle
- **Supabase pauses inactive free projects:** add a scheduled Cloudflare Worker cron (free) that pings the database daily.
- Stay within Cloudflare Workers free request limits; keep the API chatty-ness low (batch progress updates, debounce).
- Keep database size small; prune old submissions.
- Document all free-tier limits in `docs/FREE_TIER_LIMITS.md` with what happens when we hit them.

### 6.6 Privacy & legal (India DPDP Act 2023 + general good practice)
- Privacy notice page in plain language: what we collect (Google profile, device and login data, progress, submissions), why, how long, who can see it.
- Explicit consent checkbox at first sign-in; store version and timestamp; re-ask when the notice changes.
- Learners can view, export and delete their data.
- Never sell or share data. No third-party trackers or ad scripts.
- Terms of use page. Contact/grievance email.

### 6.7 Checker CLI (`apps/checker`, Go)
- Single binary for Windows, macOS (Intel + Apple Silicon), Linux; released free via GitHub Releases.
- Usage: `fde-check login` (device-code style flow or paste a one-time code from the website), `fde-check run <level-id>`.
- Checks: Docker (containers running, ports, health, image size, user non-root), Kubernetes via kubeconfig (deployments ready, services, probes, replicas), files in a project folder, HTTP endpoints on localhost.
- Sends a result to `POST /realworld/checker`; or prints a completion code the learner pastes on the site (fallback when offline).
- Read-only: never changes anything on the learner's machine. Clear output explaining what it checked.

### 6.8 Real-world levels (free for learners)
Provide step-by-step written guides for free options, plus troubleshooting:
- **Local:** Docker Engine (Linux), Docker Desktop (personal/education use), Podman; Kubernetes with kind, minikube or k3d; WSL2 on Windows. State hardware needs (≈8 GB RAM minimum, 16 GB comfortable for Kubernetes; virtualization enabled).
- **Online (for weak laptops):** GitHub Codespaces (free monthly hours on personal accounts), Google Cloud Shell, Play with Docker, Killercoda.
- **Free deployment targets (no credit card):** Cloudflare Pages/Workers, Vercel, Netlify, Render, Hugging Face Spaces; databases on Supabase/Neon free tiers.
- **Never require a credit card.** Real AWS/GCP/Azure is clearly marked optional; mention Azure for Students as a no-card route for students.
- Always tell learners how to avoid surprise bills and how to delete resources after.
- Capstone validation: live URL checks, a customer sign-off form (short form the customer fills via a link), and optional usage pings from the learner's app to our API.
- Free-tier terms change — store these guides as content files that are easy to update, with a "last verified" date on each.

---

## Part 7 — Content and style guide (`STYLE_GUIDE.md`)

The content must feel written by a thoughtful human teacher, not generated.

### 7.1 Voice
- Talk directly to the learner ("you"). Friendly, calm, confident. Like a senior engineer sitting next to them.
- Short sentences. One idea per paragraph. Plain words.
- Explain *why* something matters on a real job, in one or two sentences, not paragraphs.
- Be honest about difficulty: "This one trips up most people. That's normal."

### 7.2 Structure of a lesson
1. **The task first** (what they will do in the next level), so reading has a purpose.
2. **The minimum explanation** needed to attempt it (usually 100–300 words).
3. **One small example**, with real output shown.
4. **Common mistakes** (1–3), with the real error messages they will see.
5. **"On the job"**: one or two sentences linking it to FDE work with customers.
Lessons stay short; depth comes from levels, not long text.

### 7.3 Do / Don't
**Do:** use Indian and global real-world examples (a Pune clinic, a CA firm doing GST, a Kerala logistics company, a bank's policy circulars); use realistic data and real error messages; show mistakes; vary sentence length naturally; use headings sparingly.
**Don't:** use filler openings ("In today's fast-paced world…", "Let's dive in", "In this lesson we will explore…"); overuse bullet lists; overuse bold; stack em dashes; use words like *delve, leverage, robust, seamless, unlock, elevate, tapestry, realm, crucial, game-changer, embark*; end every section with a summary; over-praise ("Great job!" on every step); write generic examples (`foo`, `bar`, "Company X").

### 7.4 Automated style linter (implement in `content-schema`)
- Flag banned words/phrases (configurable list).
- Flag lessons over the word limit, paragraphs over ~80 words, more than 2 bullet lists per lesson, more than 3 bold phrases per lesson.
- Report reading level; target plain English.
- Linter warns; it does not replace human review.

### 7.5 Content workflow
1. I (the owner) write one **gold-standard lesson + levels** by hand. All AI-drafted content must match its voice and format.
2. AI drafts lessons/levels **one week at a time**, using the curriculum, this style guide and the gold standard.
3. CI validates schema, solutions, wrong solutions and style.
4. A human reads every lesson (ideally aloud) and edits before publishing.
5. Pilot with a few real learners; fix where they get stuck or bored (use the `feedback` table and level analytics: attempts, hints used, drop-off).

---

## Part 8 — AI features (bring your own key)

### 8.1 AI adapter (`packages/ai`)
- One **OpenAI-compatible** client interface (chat completions, streaming, JSON/structured output, embeddings) with provider presets: Google AI Studio (Gemini, via its OpenAI-compatible endpoint), Groq, Cerebras, OpenRouter (`:free` models), Mistral, Hugging Face, plus "custom base URL".
- Learner pastes their own key in Settings; stored **only in IndexedDB**, never sent to our API, never logged. "Remove key" button.
- Clear on-screen warning: free AI tiers may log or use prompts; **never paste personal or customer data** into AI exercises.
- Handle rate limits (429) gracefully with retry/backoff and a message suggesting switching provider.
- Provider settings page with a "Test key" button and links to each provider's key page and current free-tier limits (as editable content, with "last verified" date).
- **Fallback when no key / quota exhausted:** small in-browser models via WebLLM (where the device supports WebGPU) for simple exercises; otherwise the level shows a self-assessment checklist so progress is never blocked.

### 8.2 Where AI is used
1. **Phase 3 lessons:** learners build real LLM apps (classifier, extractor, RAG, agents, evals) calling the model through the adapter from their code in Pyodide/JS (inject a helper so their code can call the model with their key).
2. **Vector search** for RAG levels: pgvector in PGlite (verify extension support; otherwise an in-browser vector index) with embeddings from the learner's provider.
3. **MCP levels:** a simulated MCP host/client in the browser that connects to MCP servers the learner writes (running in the sandbox), following the official MCP spec.
4. **AI role-play customers** (Phase 4 & 6): scripted personas (e.g. a CFO, an operations head, a sceptical IT security lead) with hidden facts the learner must discover; persona prompts and rubrics stored as content files.
5. **AI grading** for writing, decomposition and role-play levels: rubric-based, returns scores per criterion + specific feedback; always shows the rubric to the learner.
6. **Hints tutor** (optional): explains errors in the learner's code without giving the full answer.
- Prompt-injection safety in our own AI features: treat learner text as data; keep system prompts and rubrics separate.

### 8.3 Platform-side AI (open item)
- Platform-paid AI is **out of scope** for now (R1). If we use **Cloudflare Workers AI's free daily allowance** for small features (e.g. hints), it must degrade gracefully when the allowance runs out. Ask me before implementing.

---

## Part 9 — Milestones (build in this order)

Each milestone: working, tested, deployed to a preview URL, documented. Stop and report after each.

| # | Milestone | Done when |
|---|---|---|
| M0 | **Repo scaffold**: monorepo, pnpm, Turborepo, TS strict, ESLint/Prettier, Vitest, Playwright, GitHub Actions (lint, test, build), Cloudflare Pages + Worker preview deploys, `docs/` files | CI green; empty site and `/health` deployed |
| M1 | **Auth & shell**: Google-only sign-in via Supabase, JWT verification in Worker, RLS, consent screen, privacy & terms pages, device/login logging, profile page with login history, account delete/export, app layout (nav, dashboard, settings), light/dark theme | Sign in with Google works; login_events rows recorded correctly; non-Google login impossible |
| M2 | **Content system**: `content-schema` (Zod) + validator CLI, curriculum.yaml loader, lesson renderer (Markdown with code blocks, callouts, diagrams), level page layout (lesson pane + workspace pane, resizable), unlock graph, style linter | Sample week renders; CI rejects invalid content |
| M3 | **Python editor + grader**: Monaco, virtual FS, Pyodide worker, run button, terminal output (xterm.js), grader with `stdout_*`, `exit_code`, `file_*`, `pytest_passes`; hints; feedback rules; progress saved via API; **Level 1 "Print Vishnu"** + first 15 Python levels | Full loop: open level → code → submit → pass → next level unlocks → progress persists across devices |
| M4 | **SQL environment**: PGlite worker, query editor, results table, schema browser, `sql_*` checks; Week 2 levels | Window-function and EXPLAIN levels work |
| M5 | **Linux shell**: v86 (or license-cleared WebVM) lazy-loaded + service-worker caching, fallback simulated shell; shell levels for Week 1 | Shell levels pass on a mid-range laptop; load time acceptable after first visit |
| M6 | **Git environment**: isomorphic-git, simulated remote with PRs & merge, conflict resolution in editor, `git_state` checks; Git levels | Branch/merge/conflict/rebase levels work |
| M7 | **HTTP & integration**: fake internet mock servers (pagination, 429, 500, webhooks), mock OAuth/OIDC provider, FastAPI-in-Pyodide spike + exercises, JWT decode/verify tools; Weeks 3–4 levels | Learner builds and tests an API and an OAuth flow fully in-browser |
| M8 | **JS/TS sandbox**: esbuild-wasm, sandboxed runner, Vitest-style checks, minimal React preview pane; Week 5 levels | TypeScript + small React UI levels work |
| M9 | **ETL & messy data**: CSV/Excel/PDF parsing in Pyodide, mock legacy systems (SFTP/SOAP/CSV export), Week 6 levels + **Phase project A** | Project A completable end to end |
| M10 | **Docker simulator** (+ compose) and simulated registry; Week 7 Docker levels; fault scenarios | Multi-stage/slim/non-root levels teach visibly; errors realistic |
| M11 | **CI/CD simulator**: workflow YAML runner tied to Git remote and Docker sim; environments, approvals, rollback; Week 7 CI levels | PR → pipeline → deploy → rollback works |
| M12 | **AWS simulator** (CLI + console, shared state, IAM policy engine, billing estimates): services 1–7 from §5.4; Moto spike decision | Week 8 AWS levels work in both console and CLI |
| M13 | **Terraform + Kubernetes + Helm simulators**; Week 8 remaining levels | `terraform apply` creates AWS-sim resources; K8s rollouts/rollbacks and failure states work |
| M14 | **Observability simulator** + incident scenarios + postmortem writing level; security posture levels; Week 9 | Root-cause levels solvable from telemetry alone |
| M15 | **AI adapter (BYOK)** + settings + WebLLM fallback; Weeks 10–12 levels (LLM utilities, RAG with vector search, evals) | Learner builds an evaluated RAG app in-browser with their free key |
| M16 | **Agents & MCP**: tool-calling sandbox, simulated MCP host, prompt-injection red-team levels; Weeks 13–15 + **Phase project B** | Agent and MCP server levels work; injection test suite level works |
| M17 | **Customer craft**: role-play engine, personas, rubrics, decomposition timer + template, writing levels with AI grading + self-checklist fallback; Weeks 16–19 | A learner can complete discovery, decomposition, memo and demo-prep levels |
| M18 | **Real-world levels**: checker CLI (Go) + releases, `live-url`/`github`/`registry` checks with SSRF protection, guides for free local/online environments and free hosts | A learner verifies a real Docker container, a real kind cluster and a real deployed URL |
| M19 | **Capstone & interview phases**: capstone step-by-step flow with templates, customer sign-off form, usage pings, case-study builder; interview drills, mock loop, story bank; Weeks 20–24 | All 24 weeks navigable and completable |
| M20 | **Polish**: performance (lazy loading, bundle budgets), offline caching, accessibility (keyboard, screen readers, contrast), mobile reading mode, analytics for content quality (attempts, hints, drop-off — no third-party trackers), admin page for me (users, progress, feedback, login stats), Supabase keep-alive cron, free-tier limit monitoring | Lighthouse good on mid-range laptop; admin can see learner stats |

---

## Part 10 — Quality, UX and performance requirements

- **Workspace layout:** lesson/task on the left, workspace (editor, terminal, console, simulator tabs) on the right, resizable; Submit button always visible; results panel with per-check pass/fail and the learner's actual vs expected output.
- **Progress:** dashboard with phases → weeks → levels, streaks, time spent, next level button; resume exactly where they left off (state restored from IndexedDB).
- **Performance:** first page load small (<300 KB JS before runtimes); runtimes and simulators lazy-loaded only for levels that need them; heavy assets cached by service worker; show download progress the first time a runtime loads.
- **Reliability:** autosave learner files every few seconds; never lose work on refresh; "reset level" button with confirmation.
- **Accessibility:** keyboard navigation everywhere, visible focus, ARIA labels, sufficient contrast, respects reduced-motion; terminal and editor usable with screen readers where the libraries allow.
- **Mobile:** lessons readable; light levels (quiz, writing, small code) work; heavy levels show "best on a laptop".
- **Security:** sandbox all learner code (Workers / sandboxed iframes, no access to our auth tokens or other origins); strict Content Security Policy; no secrets in the frontend; dependency scanning in CI.
- **Testing:** unit tests for every simulator command and grader check; Playwright E2E for sign-in (mocked), level pass flow, progress persistence; content CI (solutions pass, wrong solutions fail).
- **Observability for us (free):** Cloudflare's built-in analytics/logs and Supabase logs; an error reporting endpoint in our own API (no paid error tracker).

---

## Part 11 — What to give me at the very start (before M0)

Before writing code, reply with:
1. Your understanding of the project in 10 lines.
2. Any requirement you think is risky, contradictory or impossible for free, and your proposed alternative.
3. The license check results for: Pyodide, PGlite, v86, WebVM/CheerpX, WebContainers, Monaco, xterm.js, isomorphic-git, esbuild-wasm, WebLLM, Moto.
4. A confirmation of current free-tier limits for Supabase, Cloudflare Pages and Workers (and anything else we depend on), with links.
5. Questions you need me to answer before M0.

Then wait for my go-ahead.
