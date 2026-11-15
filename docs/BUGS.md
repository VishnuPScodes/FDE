# Bug List

Found by full audit + testing on 2026-11-09 (type-check, unit tests, content validation, build, lint, and headless Chromium page sweeps at 1366×800 and 390×844 using a dev-only mocked sign-in).

Status: ✅ fixed · 🔧 in progress · ⏳ open

## Build, tooling & CI

| # | Severity | Bug | Status |
|---|---|---|---|
| B1 | Critical | Production build fails: `esbuild-wasm` was a dangling symlink, never declared in `apps/web/package.json` or the lockfile | ✅ added dependency |
| B2 | High | `apps/web` `type-check` ran `tsc --noEmit` against a solution tsconfig with `"files": []`, so it type-checked **nothing** | ✅ now `tsc --noEmit -p tsconfig.app.json` |
| B3 | High | No `vite-env.d.ts`: `import.meta.env`, CSS modules and `?url`/`?worker` imports were untyped, causing ~900 lint errors | ✅ added |
| B4 | High | `docker-runtime.ts` used `x++.toString()` (invalid JS grammar; only esbuild tolerated it) | ✅ |
| B5 | Medium | Hidden type errors: `v86` default import vs typed named export, `git branch` with no name passed `undefined`, `Uint8Array<ArrayBufferLike>` to `crypto.subtle.verify`, `.tsx` import extension in `main.tsx`, `DedicatedWorkerGlobalScope` missing from lib | ✅ |
| B6 | Medium | `pnpm lint` fails (45 errors in api, 351 remaining in web after B3) | ✅ fixed 2026-11-10 — api and web clean (some simulator rules disabled per file with a reason; see HANDOVER.md) |

## Auth, consent & account

| # | Severity | Bug | Status |
|---|---|---|---|
| B7 | Critical | Account deletion ignored the HTTP status: on a server error the learner was signed out and told everything was deleted, while their data remained | ✅ only signs out after a 2xx; clears local learner data |
| B8 | High | Data export ignored the HTTP status and downloaded the error body as "your data"; failures only went to `console.error` | ✅ |
| B9 | High | Consent page never navigated after accepting — learner stayed stuck on `/consent` | ✅ |
| B10 | High | `acceptConsent` silently did nothing when `VITE_API_URL` was unset and ignored non-2xx responses | ✅ throws with a message; falls back to the RLS-protected profile update |
| B11 | High | Consent could be bypassed: `needsConsent` was false whenever the profile fetch failed | ✅ consent required until a profile proves it |
| B12 | Medium | Consent page rendered a blank screen when the profile wasn't loaded | ✅ loading state / redirect |
| B13 | Medium | App crashed on boot (`supabaseUrl is required`) when Supabase env vars were missing, taking down public pages too | ✅ placeholder client + `supabaseConfigured` flag |
| B14 | Medium | Profile page showed "Loading..." forever if the login-history request failed | ✅ error state |

## Learning flow

| # | Severity | Bug | Status |
|---|---|---|---|
| B15 | High | Docker terminal transcript is unreadable in light theme (global `pre` background under light-on-dark text) | ✅ |
| B16 | High | No level locking: `VITE_UNLOCK_ALL_LEVELS` was documented but never read; every level was open and weeks were not chained | ✅ unlock rules + lock gate with "Open anyway"; next-level button flows across modules/weeks |
| B17 | Medium | Progress was only stored remotely; a failed sync lost the pass, and offline learners had no progress | ✅ local mirror that never downgrades a pass |
| B18 | Medium | Quiz workspace always saved `time_spent_sec: 0`, never restored attempts/passed state, and revealed the correct answer on a wrong pick | ✅ uses shared submission hook; neutral retry message |
| B19 | Medium | Phase project ids in `curriculum.yaml` (`p0-w02-checkpoint`, `p2-w09-project-a-deployed`, `p3-w15-project-b`) don't exist / don't match the level id format; the Learn page shows them as dead text | ✅ ids fixed; Week 2 checkpoint `p0-w02-sql-016` added (Week 9/15 project levels still to write) |
| B20 | Low | Module names title-cased naively ("Sql Foundations", "Gudcmarr Framework") | ✅ |
| B21 | High | Dashboard was entirely hardcoded: 0% for every phase, 0 levels, 0h, "—" next level, regardless of progress | ✅ real progress, streak, time, resume/next button |
| B22 | Medium | "Continue to next level" only appeared when `unlocks` was set, so passing the last level of a module/week left no way forward | ✅ |
| B23 | Medium | Heavy levels show no "best on a laptop" notice on phones (spec R10) | ✅ |
| B24 | Low | Learn page reset `passedLevels` to empty on every token change, flashing all levels as not passed | ✅ seeded from local mirror |

## API (Cloudflare Worker)

| # | Severity | Bug | Status |
|---|---|---|---|
| B25 | Medium | `POST /consent` and `POST /session/login-event` threw a 500 on a non-JSON body; fields were unvalidated and unbounded | ✅ zod schemas, 400 on bad input, length caps |
| B26 | Medium | Device `login_count` was reset to 1 on every login; the `increment_device_login` RPC it relied on exists in no migration, and supabase-js returns (not throws) errors so the fallback never ran | ✅ read-then-increment |
| B27 | Low | `/consent` ignored the profile-update error and returned `ok` | ✅ |

## Round 2 (after wiring new workspaces)

| # | Severity | Bug | Status |
|---|---|---|---|
| B28 | High | AI, writing, decomposition, role-play, observability and real-world levels showed "Workspace coming soon": the components existed but `LevelPage` never dispatched to them | ✅ wired; new `RealWorldWorkspace` for live-URL / GitHub / checker checks |
| B29 | High | Settings still said "AI key settings will be added in a later milestone"; the BYOK settings component was never mounted | ✅ mounted; account deletion also clears the AI key database |
| B30 | Medium | 11 type errors in the AWS (`ec2.ts`) and observability (`scenarios.ts`) simulators | ✅ |
| B31 | Medium | `p6-w23-int-007` reference transcript asked a yes/no question, so its own solution failed the "no leading questions" check | ✅ |
| B32 | Medium | Week 11 and Week 14 levels point at lesson files that don't exist; `p3-w14-mcp-005` unlocks a missing level | ✅ verified 2026-11-14: all 325 levels resolve their lesson and unlock targets |
| B33 | Low | `p5-w21-cap-009` task says to fill `submission.json` with a repo, but the level only checks a URL and usage pings | ✅ task text matches the workspace |
