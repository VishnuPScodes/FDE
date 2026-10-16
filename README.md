# FDE Learning Platform

A free, self-paced, hands-on platform that teaches you to become a **Forward Deployed Engineer** over 24 weeks.

**No videos. No live teachers. No credit card. Ever.**

Every level gives you a task, the tools to do it inside the browser, and an automatic check.

---

## Quick links

- [PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md) — full build spec (AI must read this first)
- [CURRICULUM.md](docs/CURRICULUM.md) — 24-week curriculum
- [DECISIONS.md](docs/DECISIONS.md) — architectural decisions log
- [LEVEL_SPEC.md](docs/LEVEL_SPEC.md) — how to write levels
- [STYLE_GUIDE.md](docs/STYLE_GUIDE.md) — content style guide
- [FREE_TIER_LIMITS.md](docs/FREE_TIER_LIMITS.md) — service limits

---

## Monorepo structure

```
/
├── apps/
│   ├── web/          # React + Vite SPA (Cloudflare Pages)
│   ├── api/          # Cloudflare Worker (Hono)
│   └── checker/      # Go CLI for real-world level verification
├── packages/
│   ├── ui/           # Design system, layout components
│   ├── runtimes/     # Pyodide, PGlite, v86, JS/TS sandbox
│   ├── fs/           # Virtual file system
│   ├── simulators/   # Docker, K8s, AWS, Terraform, CI, Observability sims
│   ├── grader/       # Level check runner
│   ├── ai/           # BYOK AI adapter
│   ├── content-schema/ # Zod schemas + validator + style linter
│   └── config/       # Shared configs
├── content/          # Lessons (Markdown) + levels (YAML)
└── docs/
```

---

## Development

### Prerequisites

- Node.js 22+
- pnpm 9+

### Install

```bash
pnpm install
```

### Run locally

```bash
pnpm dev           # starts all apps in parallel
```

### Test

```bash
pnpm test          # unit tests (Vitest)
pnpm test:e2e      # E2E tests (Playwright, requires running dev server)
```

### Lint & format

```bash
pnpm lint
pnpm format        # auto-fix
pnpm format:check  # CI mode
```

### Validate content

```bash
pnpm validate-content
```

### Build for production

```bash
pnpm build
```

---

## Contributing content

1. Read [STYLE_GUIDE.md](docs/STYLE_GUIDE.md) and [LEVEL_SPEC.md](docs/LEVEL_SPEC.md).
2. Use the gold-standard lesson (`content/phases/phase-0-foundations/week-01/lessons/01-printing.md`) as a template.
3. Add a `solution/` that passes all checks and a `wrong/` that fails at least one.
4. Run `pnpm validate-content` — it must pass.
5. Open a PR; CI will validate automatically.

---

## Tech stack (M0)

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript (strict), Go (checker) |
| Frontend | React 19 + Vite + CSS Modules |
| Backend | Cloudflare Worker (Hono) |
| Auth | Supabase Auth (Google only) |
| DB | Supabase Postgres (free tier) |
| Hosting | Cloudflare Pages (free) |
| CI/CD | GitHub Actions |
| E2E tests | Playwright |
| Unit tests | Vitest |

---

## Milestones

Current: **M9 implementation is locally validated; Cloudflare preview deployment and review are pending** 🚧

| # | Milestone | Status |
|---|---|---|
| M0 | Repo scaffold | ✅ Done |
| M1 | Auth & shell | ✅ Implemented; Google provider setup remains in Supabase |
| M2 | Content system | ✅ Done |
| M3 | Python editor + grader | ✅ Done |
| M4 | SQL environment | ✅ Done |
| M5 | Linux shell | ✅ Shell checks pass; v86 VM boots and accepts commands; checks run in simulator |
| M6 | Git environment | ✅ Git runtime, six levels, and browser `git status` smoke check passed |
| M7 | HTTP & integration | ✅ HTTP health, signed webhook, OAuth PKCE/OIDC, and FastAPI-in-Pyodide browser checks passed |
| M8 | JS/TS sandbox | 🚧 Implemented locally: TypeScript runner, embedded behavior checks, isolated React-style preview, and four Week 5 levels. Preview deployment/review pending. |
| M9 | ETL & messy data | 🚧 Implemented locally: 15 Week 6 levels, Pyodide Excel/PDF packages, and Project A CSV/SFTP-drop/SOAP reconciliation. Content, unit, type, build, and browser runtime checks pass. Preview deployment/review pending. |
| ... | ... | |

---

## License

The platform code is MIT licensed. Curriculum content is © 2026 FDE Platform and is provided free for personal learning.
