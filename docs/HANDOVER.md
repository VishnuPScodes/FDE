# Handover — updated 2026-11-15 10:50

State of the "finish the platform" effort. Nothing is committed yet (all work is in the working tree).

## Status

| Area | State |
|---|---|
| Content | All 24 weeks have ≥15 levels (389 total); unlock chains linear (id order = chain order); `pnpm validate-content` passes |
| Workspaces | All wired in `apps/web/src/pages/LevelPage.tsx`: python, sql, shell, git, http/oauth, quiz, ts, docker, ci, aws, terraform, kubernetes, observability, ai, writing/decomposition, roleplay, realworld |
| Web | type-check clean · lint clean (28 justified line/file disables left, was 49) · vitest 228 pass / 105 skipped (the skipped are the two python harnesses: 105/105 pass with the pytest venv) · build OK · main chunk 240 KB |
| API | type-check, lint clean · 154 tests pass · routes incl. `/checks`, `/checker`, `/usage`, `/errors`, `/admin` |
| Bugs | `docs/BUGS.md` B1–B33 all fixed (B6 closed 2026-11-10) |
| Improvements | `docs/IMPROVEMENTS.md` — all done incl. I2; I4 dropped (no mobile); I25/I26 deferred (need owner input) |

## Done in session 2026-11-14/15 — content filled + Opus review

- **Weeks 10–24 filled to 15 levels each** (about 64 new levels) by Sonnet agents, then **reviewed and fixed by Opus** week by week.
- **Opus review fixes:**
  - Tests or checks a wrong answer could pass: missing renormalisation, `hash()` vs sha256, `<=` vs `<`, linear vs exponential backoff, `bool("false")`, and regexes that matched "phone", "hours" or the word "by".
  - Numbers in solutions that the task never gave. Either the facts were added to the task or the numbers recomputed.
  - Duplicates rewritten: w10 llm-015 is now "Assemble streamed tool calls", plus w18 write-013 and w22 cap-012.
  - Hints that gave away the answer or were copied from other levels.
  - Wrong attempts that were only filler now contain realistic mistakes.
- **Chain rule settled:** levels in a week are sorted by id, and each level unlocks the next id (enforced by `customer-craft-levels.test.ts`). Weeks 16–19 and 23–24 were renumbered to match; nothing outside the level folders referenced the old ids.
- **Phase boundaries:** w15→w16 and w19→w20 have no unlock, by design. The first level of every week is open, and the next-level button moves on to the next module.
- **New and extended tests:**
  - `python-ai-levels.test.ts` now covers weeks 10–15, including week 13.
  - New `python-capstone-levels.test.ts` covers the weeks 20–24 Python levels.
  - Together they run 105 tests with the venv.
- **I2:** Ctrl/Cmd+Enter submits in all 17 workspaces through `hooks/useSubmitShortcut.ts`. It's capture-phase so it works inside Monaco and terminals. Not tried in a browser.
- **Lint suppressions:** went from 49 lines in 31 files to 28 lines in 16 files.
  - About 125 string `+` chains became template literals via a type-aware codemod.
  - `roleplay-engine.ts` now parses personas into `unknown`-typed raw types.
  - Remaining disables each give a reason. Most are `prefer-nullish-coalescing`, kept where `||` must also catch an empty string.
- **Owner decision:** week 17 now has 7 full-decomposition drills of the same shape (005–007, 009–011, 013). Each is distinct, but consider trimming.
- **Python venv:** venvs in the scratchpad are temporary. Recreate one with `python3 -m venv <dir> && <dir>/bin/pip install pytest pytest-asyncio fastapi httpx pyyaml`. Python levels are kept 3.9-compatible.

## Done in session 2026-11-10 (15:33–15:50)

- **Web lint: 302 → 0 errors.** Mix of real fixes and *documented* disables:
  - Real fixes: optional chaining, `.find`, `Reflect.deleteProperty`, `void` on floating promises, typed `navigator.userAgentData`, unused vars/imports removed, template literals.
  - New helper `apps/web/src/lib/plain-string.ts` (`plainString(unknown)`) for `no-base-to-string` in workspaces/sql-grader.
  - File-level `eslint-disable <rule> -- <reason>` in simulator/grader files for `restrict-plus-operands`, `prefer-nullish-coalescing` (`||` empty-string fallback is intended), `no-base-to-string` (untyped YAML check fields), `no-unnecessary-condition` (guards on untrusted JSON). Kubernetes files (`lib/kubernetes/*`) are suppression-only.
  - `eslint.config.mjs` ignores `apps/web/*.config.d.ts` and `apps/web/e2e/**` (outside any tsconfig → parse errors only).
  - Small behaviour-risk changes to eyeball: `sql.worker.ts` + `sql-levels.test.ts` use `statements.at(-1)` instead of "last statement with rows"; `PythonWorkspace` `createEditor` is now sync; `oauth-simulator` `authorizeWithPkce` returns `Promise.resolve` instead of `async`; stale `react-hooks/exhaustive-deps` disable removed in ObservabilityWorkspace.
- **Browser smoke (item 2) done:** ci-001, aws-001, tf-001, k8s-001, obs-001, dec-001 × 1366/390 × light/dark — all render, no horizontal overflow. One transient `useAuth must be used inside <AuthProvider>` pageerror on the very first cold load (ci-001), not reproduced on rerun — probably Vite HMR during concurrent edits; recheck once. At 390px all levels except `p4-w17-dec-001` show the "works best on a laptop" banner (check whether dec-001 should too).
- Verified after: web lint 0, type-check clean, vitest 168 pass / 54 skipped, build OK, API `pnpm lint` clean (note: `eslint .` in apps/api flags `vitest.config.ts` not in tsconfig; the lint script only covers `src`).

## Done in session 2026-11-10 evening (20:20–20:35)

- **Weeks 3–5 filled to 15 levels each.**
  - **Week 3:** http-007, wh-003, wh-004, fa-004, fa-005. There is no http-006 on purpose, because `http-simulator.ts` maps ids ending in 006 to the webhook scenario.
  - **Week 4:** jwt-003..005, oa-003..004, sm-004..006.
  - **Week 5:** ts-005..015, plus a new replay test `src/lib/test/ts-levels.test.ts`. ts-001..004 are skipped there because their solutions are README-only.
  - The new FastAPI solutions pass pytest when run with `pytest-asyncio`.
  - The HTTP, OAuth and quiz levels have no automated replay test, so they were checked only by reading the simulator code.
  - In quizzes the correct option is listed first, same as the older quizzes. Check whether the quiz UI shuffles options.
- **Improvements done:**
  - **I1** reset button: new `ResettableWorkspace` wrapper on Docker, Git, Http, OAuth, Python, SecurityQuiz, Shell and Ts.
  - **I6** "level passed" banner in `CheckResultsPanel`, for the 8 workspaces that use it.
  - **I10** module page header.
  - **I14** Monaco editor through a lazy `CodeEditor` in Docker, CI and Writing. Not seen in a browser yet.
  - **I15** ↑/↓ history and Tab completion via `useTerminalInput` in the TF, K8s, AWS, Docker, Git and CI terminals, but not v86.
  - **I16** progress export/import on the Settings page.
  - **I22** pages are `React.lazy` in `App.tsx`.
  - **I23** build-time level index: Vite plugin `apps/web/level-index-plugin.ts` → `virtual:level-index`.
  - **I24** download progress for v86 and PGlite. Pyodide shows status text only.
  - **I27** offline pill.
- **Deleted tracked stale files** `apps/web/vite.config.{js,js.map,d.ts,d.ts.map}`. They were old tsc output, and `vite.config.js` was overriding `vite.config.ts`. Review this deletion before committing.
- **I23 caveat:** the build-time index doesn't run zod validation, so invalid levels are no longer filtered out of lists. `loadLevel(id)` still validates each level, and `pnpm validate-content` covers this in CI.
- **Browser smoke passed** for: dashboard, learn, module header, settings export/import, the new w3/w4/w5 levels, TF Tab completion and history, Docker reset with an inline confirm, and the offline pill. Checked at desktop and phone sizes, light and dark. Screenshots: scratchpad `shots2/`.
- **Python level tests:** with a pytest venv, `python-ai-levels.test.ts` passes 54/54.
  - Create the venv with `python3 -m venv <dir> && <dir>/bin/pip install pytest pytest-asyncio fastapi httpx`.
  - Then run `PATH=<dir>/bin:$PATH FDE_PYTHON=python pnpm exec vitest run src/lib/test/python-ai-levels.test.ts`.

## Done in session 2026-11-10 late (20:36–20:45) — dev work complete

- **I19 admin page + I18 analytics.**
  - API: `apps/api/src/routes/admin.ts`, mounted at `/admin`. `GET /admin/overview` and `GET /admin/analytics` return 401 without a token and 403 for non-admins. Tests are in `admin.test.ts`.
  - Web: `pages/AdminPage.tsx`, a lazy route at `/admin`, with the nav link shown only to admins. Mock auth gives the dev user `admin` and sample data.
  - **Migration `supabase/migrations/003_admin.sql`** adds a trigger so learners can't change their own `profiles.role`, plus an index on `level_progress(level_id)`. Apply it before using the page.
  - Make yourself admin in the SQL editor: `UPDATE public.profiles SET role='admin' WHERE google_email='<you>';`
- **I9 shared theming.**
  - New terminal and toolbar CSS tokens in `index.css`, for dark and light.
  - Docker, Shell, SimTerminal, V86, Git, SQL, Python and AWS workspace CSS have no hard-coded colours left.
  - The xterm in the Shell level reads the tokens. It doesn't pick up a theme change until the level is reopened.
  - There is no shared toolbar component; this was CSS-only.
- **Bugs fixed.**
  - ts-010 localStorage error: Theme, Auth and virtual-files localStorage access is now guarded. The error seen in the smoke test came from the test script itself running inside the sandboxed iframe.
  - ts-002 async output: the TS sandbox now waits a few event-loop turns before reporting results, so `.then(console.log)` output is captured. Verified in a browser.
  - The TS Monaco editor now follows the light/dark theme.
  - Git level "EEXIST" on load: the repo setup in `git-runtime.ts` is now safe when React runs it twice in dev. Verified in a browser.
- **Browser checks.** Monaco works in Docker, CI and Writing: it renders, takes typing and switches theme. Screenshots are in scratchpad `shots3/` and `shots4/`.

## Pending, in order

> **Development is complete.** The app is **not yet verified end to end**: everything so far ran locally with mock auth. Items 1–3 need the owner's Supabase project and secrets, and real play-throughs.

1. **End-to-end run with real Supabase sign-in.** Create a Supabase project and apply `supabase/migrations/` 001–003. Run web + API without `VITE_MOCK_AUTH`, then walk through sign up → consent → dashboard → complete a level → reload and confirm progress persisted → settings/profile → sign out.
2. **Deploy the API and test real-world checks.** Set `GITHUB_TOKEN` and `CHECKER_KEY_SECRET` on the deployed API. Add the `SUPABASE_URL` and `SUPABASE_ANON_KEY` repo secrets for `keep-alive.yml`. Then run one real-world level through `/checks` and `/checker`.
3. **Play through whole weeks as a learner**, not just the 6 smoke-tested levels: at least one full week per phase. Also run one `ai_rubric` check against the real AI endpoint to sanity-check the rubric wording.
4. Optional: the remaining 28 lint disables (notably file-level `no-confusing-void-expression` in `kubernetes/kubectl.ts` and `no-dynamic-delete` in `aws/services/*`).
5. Owner decisions: I25/I26, and whether to trim week 17's decomposition drills.
6. **Commit:** nothing is committed. Review the deleted `apps/web/vite.config.{js,js.map,d.ts,d.ts.map}` (stale tsc output) before committing.

## How to run things

- **Dev with mock sign-in (no Supabase needed):**
  `cd apps/web && VITE_MOCK_AUTH=true VITE_UNLOCK_ALL_LEVELS=true pnpm exec vite --host 127.0.0.1 --port 5199`
  Mock auth is dev-only (`src/lib/mock-auth.ts`). Set `localStorage['fde-mock-consent']='1.0'` to skip the consent gate.
- **Headless smoke test:** Playwright with the already-installed Chromium:
  `CHROME="$HOME/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"` and `chromium.launch({ executablePath: process.env.CHROME })` (the bundled headless shell version doesn't match). Log console errors and check `scrollWidth > innerWidth` for overflow.
- **Python level tests** (`src/lib/test/python-ai-levels.test.ts`, weeks 11/12/14/15) skip unless pytest is available. System python is 3.9 without pytest; make a venv with pytest and run
  `PATH=<venv>/bin:$PATH FDE_PYTHON=python pnpm exec vitest run src/lib/test/python-ai-levels.test.ts` (~50 s).
- Content level tests replay `solution/` and `wrong/` per simulator: `*-levels.test.ts` in `apps/web/src/lib/test/`.

## Key files added this effort

- Shared: `hooks/useLevelSubmission.ts`, `components/CheckResultsPanel.tsx`, `lib/unlocks.ts`, `lib/format.ts`, `lib/progress.ts` (local mirror), `lib/error-reporting.ts`, `components/LevelFeedback.tsx`
- Simulators: `lib/ci-runtime.ts` + `ci-grader.ts`; `lib/aws/run.ts`, `billing.ts` + `aws-grader.ts`; `lib/terraform/` + `terraform-grader.ts`; `lib/kubernetes/kubectl.ts` + `kubernetes-grader.ts`; `components/SimTerminalWorkspace.tsx` (shared by Terraform/K8s)
- API: `routes/errors.ts`, `routes/checks.ts`, `routes/checker.ts`, `routes/usage.ts`, `lib/ssrf.ts`; migration `supabase/migrations/002_realworld.sql`
- CI: `.github/workflows/keep-alive.yml` (needs `SUPABASE_URL`, `SUPABASE_ANON_KEY` repo secrets)

## Known gaps / caveats

- Simulator scope limits: Terraform has no `data`/`module` blocks; kubectl lacks `edit`/`port-forward`/`top`; AWS has no rds/lambda; CI doesn't simulate `schedule` triggers or matrix `fail-fast`.
- Terraform seed state uses a simplified `terraform.tfstate` JSON, not the real v4 format.
- `ai_rubric` checks are skipped in offline tests; rubric wording is untested.
- The role-play engine has no "learner is interviewee" mode, so Week 24's behavioural round is a writing level.
- Real-world checks need a deployed API with `GITHUB_TOKEN` / `CHECKER_KEY_SECRET` configured; locally they show a "sign in / API not configured" message.

## Working preferences (owner)

- Use at most 2–3 agents at a time, Sonnet for content and mechanical work, and check in after each batch (usage limits).
- Don't commit unless asked.
