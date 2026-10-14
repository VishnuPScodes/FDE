# Style Guide (`STYLE_GUIDE.md`)

This is the canonical style guide for all lesson content.
See Part 7 of `PROJECT_BRIEF.md` for the full rationale.

---

## 1. Voice

Talk directly to the learner (use "you"). Friendly, calm, confident. Like a senior engineer sitting next to them at a desk.

**Good:** "You'll hit this error the first time you try to connect to a customer's database."
**Bad:** "In this section, we will be exploring the concept of database connections."

Short sentences. One idea per paragraph. Plain words.

Explain *why* something matters on a real job — in one or two sentences, not a paragraph.

Be honest about difficulty: "This one trips up most people. That's normal."

---

## 2. Structure of a lesson

In this exact order:

1. **The task first** — what they will do in the next level, so reading has a purpose.
2. **The minimum explanation** needed to attempt it (usually 100–300 words).
3. **One small example**, with real output shown.
4. **Common mistakes** (1–3), with the actual error messages they will see.
5. **"On the job"** — one or two sentences linking it to FDE work with customers.

Lessons stay short. Depth comes from the levels, not from long text.

---

## 3. Do

- Use Indian and global real-world examples: a Pune clinic, a CA firm doing GST returns, a Kerala logistics company, a bank's policy circulars, a Bengaluru e-commerce startup.
- Use realistic data: rupee amounts, Indian names (Vishnu, Priya, Rajesh, Ananya), Indian cities.
- Show the exact error messages the learner will see.
- Show both the correct and the broken version.
- Vary sentence length naturally.
- Use code blocks for all code.
- Use headings sparingly — one `##` per section is usually enough.

---

## 4. Don't

- Don't use filler openers: "In today's fast-paced world…", "Let's dive in", "In this lesson we will explore…"
- Don't overuse bullet lists. Two per lesson maximum. Use prose instead.
- Don't overuse bold. Three phrases per lesson maximum.
- Don't stack em dashes.
- Don't use these words: *delve, leverage, robust, seamless, unlock, elevate, tapestry, realm, crucial, game-changer, embark*
- Don't end every section with a summary.
- Don't over-praise: not "Great job!" on every correct submission.
- Don't write generic examples: not `foo`, `bar`, "Company X", "user@example.com".

---

## 5. Examples by context

**Indian business context:**
- GST invoice extraction for a CA firm in Surat
- Tally integration for a small manufacturer in Pune
- WhatsApp order log reconciliation for a Kerala wholesale distributor
- DPDP Act compliance for a fintech in Bengaluru
- Policy circular search for a PSU bank

**Global context:**
- API integration for a logistics company
- LLM-based triage for a support team
- RAG Q&A over a hospital's clinical guidelines

---

## 6. Word limits

| Element | Limit |
|---|---|
| Full lesson | 600 words (excluding code blocks) |
| Single paragraph | 80 words |
| Bullet lists per lesson | 2 |
| Bold phrases per lesson | 3 |

---

## 7. Automated linter checks

The `lintLesson()` function in `packages/content-schema` checks:

- [ ] Banned words/phrases (configurable list in `style-linter.ts`)
- [ ] Banned openers
- [ ] Lesson over 600 words
- [ ] Any paragraph over 80 words
- [ ] More than 2 bullet lists
- [ ] More than 3 bold phrases

Linter warnings are shown in CI but do **not** block the build. A human must read every lesson before it goes live.

---

## 8. Content workflow

1. Owner writes one **gold-standard lesson + levels** by hand. All AI-drafted content must match its voice and format. (Gold standard: `content/phases/phase-0-foundations/week-01/lessons/01-printing.md`)
2. AI drafts lessons/levels one week at a time, using the curriculum, this guide, and the gold standard.
3. CI validates schema, solutions, wrong solutions, and style (warnings).
4. A human reads every lesson (ideally aloud) and edits before publishing.
5. Pilot with real learners; fix where they get stuck or bored using the `feedback` table and level analytics.

---

## 9. Level feedback messages

When a check fails with a common mistake, show a specific message. Rules:

- Point to the specific error, not a generic "wrong answer".
- Don't be harsh: "Close! Check the capital V."
- Don't be sycophantic: not "Great effort! Almost there!"
- Reference what they typed vs what was expected.
