# Remaining Work — Gap Analysis (2026-11-09)

> **Status update 2026-11-10:** most of this audit is now done.
> - All 24 weeks have at least 15 levels each (updated 2026-11-15, after the Opus review).
> - Milestones M11–M19 have been implemented as simulators and levels.
> - lint, type-check, tests and build all pass, and the main chunk is 240 KB.
> - Level unlocks, reset buttons, error reporting and the keep-alive cron exist.
>
> **Still open:**
> - The app hasn't been verified end to end with real Supabase or a deployed API.
> - All improvements are built except I4 (dropped) and I25/I26 (deferred).
> - The Go checker CLI (`apps/checker`) exists, but it hasn't been tested against a deployed API.
>
> See `docs/HANDOVER.md` for the current pending list. The tables below are the original 2026-11-09 snapshot.

Audit of the repo against `FDE_PLATFORM_BUILD_PROMPT (1).md` (Part 9 milestones) and `docs/CURRICULUM .md`.

## Baseline health at audit time

| Check | Result |
|---|---|
| `pnpm type-check` | ✅ pass |
| `pnpm test` (unit) | ✅ 41 tests pass |
| `pnpm validate-content` | ✅ pass (several lessons above reading level 8) |
| `pnpm build` | ❌ **failed** — `esbuild-wasm` was a dangling symlink, never declared in `apps/web/package.json` (fixed) |
| `pnpm lint` | ❌ **failed** — 45 errors in `apps/api`, 1241 in `apps/web` |

## Content coverage (levels per week)

| Week | Topic | Levels | Status |
|---|---|---|---|
| 1 | Python, Git, Shell | 27 | ✅ |
| 2 | SQL & modelling | 15 | ✅ |
| 3 | REST & FastAPI | 10 | ✅ (below 15 target) |
| 4 | Auth & security | 7 | ⚠️ thin |
| 5 | TypeScript & React | 4 | ⚠️ thin |
| 6 | ETL + Project A | 15 | ✅ |
| 7 | Docker ✅ / **CI/CD ❌** | 15 | ⚠️ `github-actions-cicd` module empty |
| 8 | AWS, Terraform, Kubernetes | 0 | ❌ |
| 9 | Observability & security posture | 0 | ❌ |
| 10–15 | Applied AI (Phase 3) + Project B | 0 | ❌ |
| 16–19 | Customer craft (Phase 4) | 0 | ❌ |
| 20–22 | Capstone (Phase 5) | 0 | ❌ |
| 23–24 | Interview loop (Phase 6) | 0 | ❌ |

## Milestones not done

| # | Milestone | Missing |
|---|---|---|
| M11 | CI/CD simulator | workflow YAML runner, environments/approvals/rollback, Week 7 CI levels |
| M12 | AWS simulator | CLI + console, IAM policy engine, billing estimates, Week 8 AWS levels |
| M13 | Terraform + K8s + Helm | simulators + Week 8 levels |
| M14 | Observability simulator | logs/metrics/traces/alerts, incidents, postmortems, security posture, Week 9 |
| M15 | AI adapter (BYOK) | `ai` adapter, key settings, Weeks 10–12 |
| M16 | Agents & MCP | tool-calling sandbox, simulated MCP host, injection red-team, Weeks 13–15, Project B |
| M17 | Customer craft | writing/roleplay/decomposition workspaces, Weeks 16–19 |
| M18 | Real-world levels | Go checker CLI (`apps/checker` missing), live-url/github/checker-token API with SSRF protection |
| M19 | Capstone & interview | Weeks 20–24 |
| M20 | Polish | admin page, analytics, a11y pass, mobile mode, bundle budgets, keep-alive cron |

## Cross-cutting gaps

- Spec calls for Monaco + xterm.js in workspaces; Docker/HTTP/etc. use `<textarea>`/`<pre>`.
- No level locking/unlock enforcement in the UI; weeks are not chained (`unlocks: []` at week ends).
- No "reset level" button; each workspace duplicates submit/progress logic (new shared `useLevelSubmission` hook + `CheckResultsPanel` added).
- Main JS chunk ~428 KB (spec budget: <300 KB before runtimes).
- Phase project ids in `curriculum.yaml` (`p2-w09-project-a-deployed`, `p3-w15-project-b`) don't match the level id regex.
- No error-reporting endpoint in the API (spec Part 10).

Progress against each item is tracked in `docs/BUGS.md` and `docs/IMPROVEMENTS.md`.
