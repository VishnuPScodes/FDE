# Improvements Backlog

Ways to make the platform better, from the 2026-11-09 audit and headless browser sweeps. Ordered by value ÷ effort within each group. Status: ✅ done · ⏳ open · 💤 deferred (needs owner input or external setup).

## UX — learning flow

| # | Improvement | Why | Status |
|---|---|---|---|
| I1 | "Reset level" button (with confirmation) on every workspace | Spec Part 10; learners get stuck in broken states | ✅ inline-confirm reset on Docker/Git/Http/OAuth/Python/Quiz/Shell/Ts (SQL has Reset database) |
| I2 | Keyboard shortcut `Ctrl/Cmd+Enter` to submit; `Ctrl/Cmd+'` to reveal a hint | Faster loop, keyboard-first learners | ✅ Ctrl/Cmd+' reveals a hint; Ctrl/Cmd+Enter submits via `useSubmitShortcut` in all workspaces (Ai, Aws, Ci, Docker, Git, Http, Observability, OAuth, Python, RealWorld, Roleplay, SecurityQuiz, Shell (not VM mode), SimTerminal incl. Kubernetes/Terraform, Sql, Ts, Writing); Submit buttons carry title/aria-keyshortcuts |
| I3 | Previous / next level arrows in the level header, plus "Level 3 of 15 in Docker Basics" | Orientation; today the only nav is "back to curriculum" | ✅ |
| I4 | Collapse the lesson pane on narrow screens into tabs (Task · Lesson · Hints · Workspace) | Mobile reading mode (R10); today the workspace is stacked under a long lesson | ➖ dropped (owner: no mobile mode needed) |
| I5 | Keyboard-resizable splitter (arrow keys) and remembered split position | The splitter is focusable but only mouse-draggable; a11y | ✅ arrows/Shift/Home/End; position remembered |
| I6 | Celebrate passes: confetti-free "level passed" banner with time + attempts, respects reduced motion | Motivation without noise | ✅ |
| I7 | Show hint cost transparently ("hints used: 1") and remember revealed hints per level | Hints reset on reload today | ✅ remembered per level |
| I8 | Search / filter on the Learn page (by title, tag, environment) | 250+ levels are hard to browse | ✅ search by title/module/tool/tag |

## UI — visual polish

| # | Improvement | Why | Status |
|---|---|---|---|
| I9 | One consistent workspace chrome (toolbar, terminal, results) themed via CSS variables | Docker/Shell/HTTP each hand-roll dark colours; light theme breaks (see B15) | ✅ (shared --terminal-*/--toolbar-* tokens; Docker, Shell incl. xterm theme at mount, SimTerminal, V86, Git, Sql, Python, Aws converted; no shared toolbar component) |
| I10 | Module page: header with week, description, progress bar and estimated total time | Module page is a bare list | ✅ |
| I11 | Dashboard "Continue" hero card with the next level's title, module and time | Clear next action | ✅ (resume/next button) |
| I12 | Empty/coming-soon states for modules without levels | "No levels are published" reads like an error | ✅ ("Coming soon" count) |
| I13 | Respect `prefers-color-scheme` on first visit ("System" theme option) | Today defaults to one theme | ✅ already follows `prefers-color-scheme` until the learner picks |

## Functionality

| # | Improvement | Why | Status |
|---|---|---|---|
| I14 | Monaco editor (already a dependency) for Docker/K8s/Terraform/CI/writing file editing | Spec 2.2; textarea lacks syntax highlighting | ✅ (shared lazy `CodeEditor` in apps/web/src/components; wired into Docker, CI, Writing workspaces; K8s/Terraform have no textarea editors) |
| I15 | Command history (↑/↓) and Tab completion in every simulated terminal | Real terminals do this; muscle memory | ✅ (Terraform, Kubernetes, AWS, Docker, Git, CI; not the v86 Linux shell) |
| I16 | Export/import my workspace for a level (zip/JSON) | Learners switch devices; workspaces are browser-local | ✅ progress export/import (JSON) in Settings; per-level workspace files not included |
| I17 | Error-reporting endpoint `POST /errors` + window `error`/`unhandledrejection` hook | Spec Part 10 "observability for us (free)" | ✅ Workers logs; path only, max 5 per load |
| I18 | Content-quality analytics (attempts, hints, drop-off per level) from progress rows — no third-party trackers | Spec M20 | ✅ |
| I19 | Admin page (role = admin): users, progress, feedback, login stats | Spec M20 | ✅ |
| I20 | "Was this level clear?" thumbs + comment → `feedback` table | Table exists in schema, unused | ✅ shown under hints; RLS insert |
| I21 | Supabase keep-alive cron (GitHub Actions weekly ping) | Free tier pauses after 7 days idle | ✅ `.github/workflows/keep-alive.yml` (needs `SUPABASE_URL`, `SUPABASE_ANON_KEY` repo secrets) |

## Performance

| # | Improvement | Why | Status |
|---|---|---|---|
| I22 | Split the 428 KB main chunk (content YAML/MD globs, js-yaml, zod) below the 300 KB budget | Spec Part 10 budget | ✅ |
| I23 | Precompute a level index at build time instead of parsing every level.yaml on the Learn/Dashboard pages | `loadAllLevels()` parses ~250 YAML files on page load | ✅ |
| I24 | Show download progress when a heavy runtime (Pyodide, v86) loads the first time | Spec Part 10 | ✅ (v86 + SQL bundle show % progress; Pyodide status text only) |

## Features (bigger)

| # | Improvement | Why | Status |
|---|---|---|---|
| I25 | Certificates of completion per phase (shareable, verifiable URL) | Motivation; portfolio | 💤 |
| I26 | Spaced-repetition "review" quiz built from passed levels' quizzes | Retention | 💤 |
| I27 | Offline mode indicator + queued progress sync | Average internet in target audience | ✅ (offline pill; progress already mirrored locally and merged on load) |
