# Level Specification (`LEVEL_SPEC.md`)

This is the canonical reference for every level in the platform.
CI rejects any level that doesn't conform to this spec.

---

## 1. File structure

Every level is a folder under `content/phases/<phase>/week-<nn>/levels/<level-id>/`:

```
levels/p0-w01-py-001/
├── level.yaml          # required — the level definition
├── starter/            # optional — files loaded into the editor on level open
│   └── main.py
├── tests/              # optional — check files (pytest, vitest, etc.)
├── solution/           # required — reference solution (must pass all checks)
│   └── main.py
└── wrong/              # required — at least one wrong solution (must fail)
    └── main.py
```

---

## 2. `level.yaml` fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique ID: `p{phase}-w{week}-{topic}-{number}`. Never reused. |
| `title` | string | ✅ | 3–80 chars |
| `phase` | int 0–6 | ✅ | |
| `week` | int 1–24 | ✅ | |
| `module` | string | ✅ | Module slug |
| `order` | int ≥ 1 | ✅ | Order inside module |
| `difficulty` | int 1–5 | ✅ | 1 = trivial, 5 = hard |
| `estimated_minutes` | int | ✅ | Honest estimate |
| `type` | enum | ✅ | See §3 |
| `environment` | enum | ✅ | See §4 |
| `lesson` | string | — | Relative path to lesson `.md` |
| `task` | string | ✅ | Markdown task description shown to learner |
| `starter_files` | list | — | Files pre-loaded in editor |
| `checks` | list | ✅ | All must pass. Min 1. |
| `hints` | list | ✅ | Revealed one at a time. **Min 2.** |
| `feedback` | list | — | Pattern-matched feedback on common mistakes |
| `solution` | string | — | Path to solution folder |
| `unlocks` | list | — | Level IDs unlocked on pass |
| `tags` | list | — | |
| `mobile_compatible` | bool | — | Default false for heavy levels |
| `timed` | bool | — | For decomposition drills |

---

## 3. Level types

| Type | What the learner does | How it's checked |
|---|---|---|
| `code` | Write code in Monaco | stdout/stderr, exit code, file contents, unit tests |
| `sql` | Write queries | Result set, EXPLAIN assertions, schema assertions |
| `terminal` | Type commands in shell/simulator | File system state, process state, simulator state |
| `console` | Click through fake AWS console | Simulator state assertions |
| `project` | Multi-file build | Combination of sub-checks per step |
| `quiz` | Multiple choice / short answer | Exact match or rubric |
| `writing` | Design doc, memo, postmortem | AI rubric (BYOK) + self-checklist fallback |
| `roleplay` | Conversation with AI persona | AI rubric on discovery quality |
| `decomposition` | Timed system design | Structured template + AI rubric |
| `realworld` | Real tools on own laptop/Codespaces | checker CLI / live URL / GitHub API |

---

## 4. Environment values

`python` | `sql` | `shell` | `git` | `js` | `ts` | `docker` | `kubernetes` | `aws` | `terraform` | `ci` | `http` | `observability` | `ai` | `writing` | `roleplay` | `quiz` | `realworld`

---

## 5. Check kinds

All checks are implemented in `packages/grader`.

| Kind | Description | Key fields |
|---|---|---|
| `stdout_equals` | Output exactly matches `expected` | `run`, `expected`, `normalize` |
| `stdout_matches` | Output matches regex `pattern` | `run`, `pattern` |
| `stderr_contains` | stderr contains `expected` | `run`, `expected` |
| `exit_code` | Process exits with `expected` code | `run`, `expected` |
| `file_exists` | File at `path` exists | `path` |
| `file_contains` | File contains string/regex | `path`, `expected`, `is_regex` |
| `json_equals` | JSON output matches (deep equal, key subset) | `run`, `expected`, `strict` |
| `pytest_passes` | `pytest` exits 0 | `test_path` |
| `vitest_passes` | Vitest exits 0 | `test_path` |
| `sql_result_equals` | Query result matches | `query`, `expected`, `ordered` |
| `sql_plan_uses_index` | EXPLAIN contains index scan | `query` |
| `git_state` | Git repo in expected state | `branch`, `commit_count`, `merged`, etc. |
| `sim_state` | JSONPath assertion on simulator state | `simulator`, `path`, `expected` |
| `sim_command_used` | Learner used a command/flag | `simulator`, `command`, `flag` |
| `http_response` | Mock server response matches | `method`, `url`, `expected_status`, etc. |
| `live_url` | Server-side: real URL returns expected response | `url`, `method`, `expected_status` |
| `github_repo` | Server-side: repo has expected files/workflow | `repo`, `assertions` |
| `checker_token` | Checker CLI sent a token | `level_id` |
| `ai_rubric` | AI grades a writing/roleplay submission | `rubric`, `criteria` |
| `checklist` | Learner self-assesses against list | `items` |
| `time_limit` | Submission within time limit (for drills) | `seconds` |

---

## 6. CI rules

CI fails if any of these are violated:

1. Every `level.yaml` passes the Zod schema (`validateLevel`)
2. Every level's `solution/` passes all its checks
3. Every `wrong/` example fails at least one check
4. Every file referenced in `starter_files` and `lesson` exists
5. Every ID in `unlocks` exists as a valid level
6. No cycles in the unlock graph
7. Every level has at least 2 hints
8. Every lesson Markdown passes `lintLesson()` (warnings only, does not block CI)

---

## 7. Solution and wrong examples

- `solution/` **must** contain files that make all checks pass when run.
- `wrong/` **must** contain at least one file set that makes at least one check fail.
- Solutions are never shown until the learner passes or clicks "Give up" after using 3 hints.
