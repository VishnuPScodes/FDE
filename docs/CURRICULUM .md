# FORWARD DEPLOYED ENGINEER

# The 24-Week Curriculum

A pin-pointed, week-by-week path from working programmer to hireable (AI) Forward Deployed Engineer: engineering depth, applied AI, deployment, customer craft, a live capstone, and the FDE interview loop.

| | |
|---|---|
| **Duration** | 24 weeks, about 15-20 hours/week (roughly 400 hours) |
| **Assumes** | You can write basic Python and have built at least one small program |
| **Ends with** | 2 deployed portfolio projects, 1 real-user capstone, interview-ready decomposition skills |
| **Edition** | October 2026 - based on current FDE job postings and interview guides |

---

## 1. What you are training for

A Forward Deployed Engineer embeds with a customer to scope, build and deploy production software that solves that customer's specific problem. Exponent's widely circulated 2026 guide sums it up as half engineer, half consultant, full owner. Unlike a product software engineer you work inside messy customer environments; unlike a sales engineer you stay after the sale and own the outcome in production.

The role has exploded with enterprise AI. One 2026 analysis counted FDE postings rising from 643 (April 2025) to 5,330 (April 2026). Most new openings are **AI FDE** roles: shipping LLM applications, RAG systems and agents into enterprises. This curriculum targets that version, while keeping the general FDE fundamentals (Palantir-style data and integration work) that every variant shares.

### What employers actually ask for (from 2026 postings)

| Skill cluster | What postings say | Where in this curriculum |
|---|---|---|
| Programming | Python essential; TypeScript strongly preferred; SQL for data-heavy deployments (C++ for robotics/autonomy FDEs) | Phase 0-1 (Wk 1-6) |
| Backend & integration | Scalable backend systems, API orchestration, integrating with enterprise infrastructure, enterprise auth/security | Phase 1 (Wk 3-6) |
| Cloud & DevOps | AWS/GCP/Azure, Docker, Kubernetes, CI/CD (GitHub Actions), cloud and hybrid deployments | Phase 2 (Wk 7-9) |
| Applied AI | LLMs, RAG, agents, vector DBs, tool-calling schemas, context/token budgeting, prompt-injection risk, MCP servers, evals and monitoring | Phase 3 (Wk 10-15) |
| Customer craft | Discovery, translating vague business problems into systems, stakeholder communication, change management, feeding field insights back to product | Phase 4 (Wk 16-19) |
| Proof | Something deployed, used by someone who is not you, still running; a project with ambiguous requirements | Phase 5 capstone (Wk 20-22) |
| Interview loop | Practical coding, decomposition, customer simulation, take-home + presentation, behavioral | Phase 6 (Wk 23-24) |

> **Reality check on experience**
> Senior AI-lab FDE roles ask for 3-4+ years in a technical, customer-facing role (e.g. Anthropic's postings). Indian FDE postings reviewed in September 2026 clustered around 3-6 years. Real entry points exist: Palantir's 1+ year band, new-grad FDE programs (e.g. Applied Intuition), and adjacent titles - implementation, solutions, data or software engineer - that you convert into FDE later. This curriculum makes you competitive for those doors and accelerates the jump.

---

## 2. How to use this curriculum

- **Weekly rhythm (about 17 hrs):** 6 hrs learning, 9 hrs building, 1 hr writing a public log/blog post, 1 hr mock customer conversation or decomposition drill.
- **Every week ends with an artifact** in a GitHub repo - code, a design doc, or a recorded demo. No artifact = week not done.
- **Write like an FDE from day one.** Each project gets a one-page README: problem, user, constraints, architecture, what you'd do next. This is the habit interviewers probe.
- **Use AI coding tools** (Claude Code, Cursor, etc.) - FDEs ship fast with them - but you must be able to explain and debug every line you ship.
- **If you already know a phase,** run its 'Done when...' checks. Pass them all? Skip ahead and bank the time for the capstone.
- **Pick one domain early** (finance, healthcare, logistics, manufacturing, government, retail). Domain fluency is a top differentiator; build both portfolio projects and the capstone in it.

### Phase overview

| Phase | Weeks | Focus | Key output |
|---|---|---|---|
| 0. Foundations | 1-2 | Python, Git, Linux/shell, SQL | CLI data tool + SQL notebook |
| 1. Backend & data integration | 3-6 | APIs, Postgres, auth, TypeScript, messy-data ETL | Project A: integration service |
| 2. Cloud & deployment | 7-9 | Docker, K8s, CI/CD, Terraform, observability, security | Project A deployed with CI/CD |
| 3. Applied AI engineering | 10-15 | LLM APIs, RAG, agents, MCP, evals, guardrails | Project B: evaluated RAG + agent system |
| 4. Customer craft | 16-19 | Discovery, decomposition, writing, demos, ROI | Discovery notes, design doc, exec memo |
| 5. Capstone | 20-22 | Deploy for a real user, measure impact | Live system + case study |
| 6. Interview loop | 23-24 | Coding, decomp, customer sim, behavioral | Story bank + 10 mock interviews |

---

## Phase 0 - Foundations (Weeks 1-2)

Goal: remove every friction that slows you down in a customer's terminal. FDEs routinely land on unfamiliar machines, VPNs and databases and must be productive in hours.

| Week | What you learn (pin-pointed) | Practice / build | Done when... |
|---|---|---|---|
| 1 | **Python for production:** virtualenvs/uv, packaging (pyproject.toml), type hints, dataclasses/Pydantic, error handling, logging, pytest, async basics (asyncio, httpx). **Git:** branching, rebase vs merge, resolving conflicts, PR etiquette. **Shell:** ssh, grep/sed/awk, jq, curl, environment variables, cron, process inspection (ps, top, lsof). | Build a CLI (Typer/Click) that pulls JSON from a public API, cleans it, writes to CSV + SQLite. Tests + typed code. Do the MIT 'Missing Semester' shell/git lectures. | Fresh clone + one command runs it; >80% test coverage on core logic; you can debug it over ssh. |
| 2 | **SQL that real customers need:** joins (all types), GROUP BY/HAVING, window functions (ROW_NUMBER, LAG, running totals), CTEs, NULL handling, indexes and EXPLAIN, transactions/isolation basics. **Data modelling:** normalisation vs. wide tables, star schema intro. | Load a messy public dataset (e.g. a city's open-data portal) into Postgres; answer 20 business questions you write yourself. Solve 30 SQL problems (easy-medium). | You can read an EXPLAIN plan and fix a slow query with an index; window functions feel natural. |

> **Checkpoint**
> Write a 1-page post: 'What I learned about a dataset nobody cleaned for me.' Start your public learning log here.

---

## Phase 1 - Backend & Data Integration (Weeks 3-6)

Goal: become the person who can connect anything to anything. Enterprise AI projects fail more on integration, auth and data quality than on models.

| Week | What you learn (pin-pointed) | Practice / build | Done when... |
|---|---|---|---|
| 3 | **APIs:** REST design, status codes, pagination, idempotency keys, rate limiting & retries with backoff, webhooks (signatures, replay), OpenAPI specs. **FastAPI:** routing, dependency injection, Pydantic models, background tasks. | Build a FastAPI service with CRUD + a webhook receiver; consume a paginated, rate-limited third-party API reliably. | Survives a mock API that randomly returns 429/500; webhook signatures verified. |
| 4 | **Enterprise auth & security:** OAuth 2.0 flows (auth code + PKCE, client credentials), OIDC, JWTs, SSO/SAML concepts, API keys vs service accounts, RBAC, secrets management, PII handling basics, least privilege. | Add OAuth login (Google or Auth0/Keycloak) + role-based access to your service. Store secrets in a vault/secret manager, not .env in git. | You can draw and explain the auth-code flow on a whiteboard; role checks have tests. |
| 5 | **TypeScript essentials:** types, async/await, Node runtime, calling your API; a minimal React/Next.js UI (forms, tables, auth). Enough to ship an internal tool, not to be a frontend specialist. | Build a small admin UI for your service (login, list, search, edit). | A non-engineer friend can use it without instructions. |
| 6 | **Messy data & ETL:** CSV/Excel/PDF ingestion, schema drift, deduplication, entity resolution basics, data validation (Pandera/Great Expectations), incremental loads, job scheduling (cron, Airflow/Prefect/Dagster concepts), working with legacy systems (SFTP, SOAP, ODBC). | **Project A - 'Enterprise integration service':** ingest 2+ ugly sources (e.g. a CSV export + an API) into Postgres, reconcile them, expose through your API + UI, with data-quality checks and alerts. | README with problem, architecture diagram, data-quality rules, known limitations. |

---

## Phase 2 - Cloud & Deployment (Weeks 7-9)

Goal: deploy anywhere the customer insists - their cloud, their VPC, sometimes on-prem - and keep it running.

| Week | What you learn (pin-pointed) | Practice / build | Done when... |
|---|---|---|---|
| 7 | **Containers & CI/CD:** Dockerfiles (multi-stage, slim images, non-root), docker compose, image registries; GitHub Actions: test, lint, build, push, deploy; environment promotion (dev/stage/prod); semantic versioning & rollbacks. | Containerise Project A; full pipeline from PR to deployed staging on every merge. | A teammate can deploy by merging a PR; rollback takes < 5 minutes. |
| 8 | **Cloud (pick one deeply - AWS, Azure or GCP; Azure matters a lot in Indian enterprises):** IAM, VPCs/subnets/security groups, private endpoints, managed Postgres, object storage, serverless functions, secret managers. **Terraform:** modules, state, plan/apply. **Kubernetes basics:** pods, deployments, services, ingress, config/secrets, Helm. | Provision Project A's infra with Terraform; deploy it to managed K8s or a container service. Tear down and re-create from scratch. | 'terraform destroy' then 'apply' gives you a working system again in < 30 min. |
| 9 | **Operate it:** structured logging, metrics, tracing (OpenTelemetry), dashboards & alerts (Grafana/CloudWatch), SLOs, on-call basics, incident write-ups. **Security posture:** network isolation, encryption at rest/in transit, audit logs, dependency scanning, what a customer security review asks for (SOC 2, data residency, DPDP Act in India, GDPR). | Add tracing + a dashboard + 2 alerts to Project A. Break it on purpose; write a postmortem. Fill out a mock vendor security questionnaire for it. | You find the root cause of an injected failure from telemetry alone. |

> **Optional certification**
> AWS Solutions Architect Associate, Azure AZ-204/AI-102 or GCP Associate Cloud Engineer. Useful for Indian services/consulting firms' screens; never a substitute for deployed projects.

---

## Phase 3 - Applied AI Engineering (Weeks 10-15)

Goal: ship LLM systems an enterprise can trust. The 2026 bar has moved from 'can we build it?' to 'can we trust it?' - evaluation, reliability and safety are what separate FDEs from demo builders.

| Week | What you learn (pin-pointed) | Practice / build | Done when... |
|---|---|---|---|
| 10 | **LLM fundamentals for builders:** tokens, context windows, sampling (temperature/top-p), model families & tradeoffs (frontier vs small/open-weight), pricing math, latency. **APIs:** messages format, system prompts, streaming, structured output (JSON schema), prompt caching, batch APIs. **Prompt & context engineering:** clear instructions, examples, XML-tagged sections, 'engineer the context before the model'. | Build 5 small utilities: classifier, extractor (invoice -> JSON), summariser, router, rewriter. Compare 2 providers/models on cost, latency, quality. | You can estimate monthly cost for a use case from token counts; outputs always validate against a schema. |
| 11 | **RAG I:** document parsing (PDF/HTML/tables), chunking strategies, embeddings, vector stores (pgvector first; then Pinecone/Qdrant/Weaviate concepts), metadata filtering, hybrid search (BM25 + vectors), reranking, citations. | Build a RAG Q&A over a domain corpus of 500+ real documents with source citations. | Every answer cites the passage it came from; you can explain why each design choice was made. |
| 12 | **Evals (the most important week):** golden datasets, retrieval metrics (recall@k, MRR), answer metrics (faithfulness, correctness), LLM-as-judge and its pitfalls, human review loops, regression testing in CI, A/B prompts. Tools: Promptfoo, Ragas, Braintrust/Langfuse-style harnesses. | Create a 100-question golden set; measure baseline; improve retrieval & prompts; show the numbers move. Wire evals into CI. | A chart: baseline vs. 3 iterations, with each change's effect explained. |
| 13 | **Tool calling & agents:** tool schemas (names, descriptions, input/output contracts, safe execution boundaries), orchestration loops, error handling, memory/state, human-in-the-loop approvals, multi-step workflows vs. autonomous agents (prefer simplest that works), frameworks (LangGraph, Agent SDKs) vs plain code. | Build an agent that answers questions AND takes actions on your Project A API (e.g. 'create a ticket', 'reconcile these records') with approval for writes. | Agent completes 20 scripted tasks; destructive actions always require approval; failures degrade gracefully. |
| 14 | **MCP & agent ecosystems:** Model Context Protocol servers (tools, resources, prompts), auth for MCP, agent skills/sub-agents, connecting LLMs to enterprise systems (Slack, Jira, Salesforce, SharePoint, databases). **Safety:** prompt injection (direct & indirect), data exfiltration, PII redaction, guardrails, output filtering, permission scoping. | Expose Project A as an MCP server; use it from an AI client. Red-team your own agent with 15 injection attacks; patch and document. | Written threat model + passing injection test suite. |
| 15 | **LLMOps in production:** tracing LLM calls, token budgeting & truncation, caching, fallbacks/model routing, rate limits, cost dashboards, latency optimisation, versioning prompts, when to fine-tune vs RAG vs better prompts. | **Project B - 'Trustworthy enterprise assistant':** RAG + agent + MCP + evals + observability, deployed with Phase 2 tooling, in your chosen domain. | Public demo video (5 min), eval report, cost-per-query number, architecture doc. |

---

## Phase 4 - Customer Craft (Weeks 16-19)

Goal: the differentiator. 'If you can code but can't communicate, you are a Software Engineer.' Practise these with real people - friends in other industries, a local business, an NGO - not just in your head.

| Week | What you learn (pin-pointed) | Practice / build | Done when... |
|---|---|---|---|
| 16 | **Discovery:** stakeholder mapping (sponsor, users, IT/security, blockers), open-ended questioning, 'five whys', shadowing workflows, quantifying the pain (hours, cost, error rate), separating the stated request from the real problem. | Run 3 discovery interviews with people about their work pain (30 min each). Write structured notes: problem, current workflow, metrics, constraints. | Each interview yields a measurable problem statement the interviewee agrees with. |
| 17 | **Decomposition (the signature FDE skill):** clarify goal & success metric -> users & workflows -> data sources & access -> constraints (security, latency, budget, regulation) -> MVP slice -> architecture -> risks -> rollout & measurement. Thinking out loud, trade-offs, timeboxing. | Do 8 timed decomposition drills (45 min each, see Appendix B). Record yourself; review against the framework. | You consistently reach a scoped MVP + metrics + risks within 40 minutes. |
| 18 | **Writing & scoping:** design docs, one-page exec memos, project plans with milestones, statements of work, status updates (green/amber/red), saying no / renegotiating scope, managing expectations about AI accuracy. | Write a design doc + exec memo for one discovery problem from Week 16. Get feedback from someone senior. | A non-technical reader understands the memo's ask in 60 seconds. |
| 19 | **Demos, adoption & value:** demo storytelling (problem -> live system -> impact), handling hostile questions, change management & training users, ROI/impact measurement, writing product feedback for your own company's product team, building trust (reliability, candour). | Give 2 live demos of Project B to non-engineers; collect questions; build a simple ROI model for it. | Can deliver a 10-minute demo + ROI story without slides failing you. |

> **Recommended reading for this phase**
> *The Trusted Advisor* (Maister et al.) for client relationships; *The Pyramid Principle* (Minto) for writing; *The Mom Test* (Fitzpatrick) for discovery questions; *Never Split the Difference* (Voss) for negotiation.

---

## Phase 5 - Capstone: Deploy for a Real User (Weeks 20-22)

Hiring guides are blunt about this: the proof that counts is something deployed, used by someone who is not you, and still running - ideally with requirements that were unclear at the start. This phase is your simulated forward deployment.

| Week | What you learn (pin-pointed) | Practice / build | Done when... |
|---|---|---|---|
| 20 | **Land the 'customer':** a small business, NGO, college department, a friend's team, or your current employer's internal process. Run discovery, agree a success metric, scope an MVP in writing, get data access legitimately. | Signed-off one-page scope: problem, metric, MVP, timeline, data-handling rules. | The customer can state the success metric in their own words. |
| 21 | **Build & deploy into their environment:** their tools, their data, their constraints. Daily iteration; weekly check-in; handle at least one requirement change. | Working system in their hands by end of week; evals + monitoring running. | Real users have used it on real work. |
| 22 | **Measure, harden, hand over:** before/after metrics, fix top issues from usage logs, runbook & training, ownership handover. | **Case study** (2 pages + 3-min video): context, discovery, decomposition, architecture, what broke, impact numbers, what you'd do next. | Customer testimonial or metric you can quote; system still running a month later. |

### Capstone idea bank (pick within your domain)

- Clinic: intake-form extraction + appointment triage assistant with human review.
- CA / accounting firm: invoice and GST document extraction into their spreadsheet/Tally workflow.
- College: policy & syllabus RAG assistant for students with citation and escalation to staff.
- Small manufacturer or warehouse: inventory reconciliation agent across Excel exports and a WhatsApp order log.
- Support team: ticket classification, routing and draft-reply agent with quality evals.
- Real estate / legal office: contract clause extraction and comparison with redlining suggestions.

---

## Phase 6 - The FDE Interview Loop (Weeks 23-24)

Most FDE loops share a pattern: recruiter screen, technical screen, take-home with presentation, practical coding, decomposition, and behavioral - with customer simulation, system design or project deep-dives at some companies. Loops typically span 4-6 rounds over 3-5 weeks.

| Round | What it tests | How to prepare |
|---|---|---|
| Recruiter screen | Motivation, fit, level, timeline | A crisp 60-second 'why FDE' story tied to your capstone; know the company's customers and products. |
| Practical coding | Write working code for realistic tasks (parsing, APIs, data transforms) - often easy-medium, sometimes in a notebook | 40 practical problems: parse logs, merge datasets, build a rate limiter, call an API and aggregate. Talk while coding; test edge cases. Some loops are LeetCode-light, Palantir-style loops can be harder. |
| Decomposition | Turning a vague business goal into a scoped, buildable system; the round most candidates fail | Appendix B drills. Lead with clarifying questions and success metrics; land an MVP; discuss data, risks, rollout. |
| Customer simulation | Live discovery with an 'angry' or vague stakeholder | Role-play with a friend: they play a CFO/ops head; you discover, push back politely, and propose next steps. |
| Take-home + presentation | End-to-end build under time pressure, then explaining choices | Timebox strictly; ship a working slice; README with trade-offs and 'what I'd do with 2 more weeks'. |
| AI technical / system design | RAG/agent architecture, evals, reliability, cost, security | Whiteboard Project B from memory; prepare answers on hallucination control, injection, latency, cost. |
| Behavioral / values | Ownership, judgment, ambiguity, conflict, customer obsession | 8-10 STAR stories from Projects A/B and capstone (see below). |

### Two-week sprint

| Week | What you learn (pin-pointed) | Practice / build | Done when... |
|---|---|---|---|
| 23 | Coding drills daily (2 problems), 4 decomposition mocks, 2 customer-sim role-plays, write story bank. | Use Exponent / Pramp / peers for mock interviews. | Story bank covers: ambiguity, failure, pushback on a customer, shipped under pressure, learned a domain fast, cross-team conflict, an ethical call, measurable impact. |
| 24 | 1 full mock loop (all rounds, back-to-back), polish portfolio site, tailor resume to each posting's language, apply + referrals. | 10 total mocks completed; resume bullets lead with impact numbers. | Applications out to 15-25 targeted roles with 5+ referral asks. |

---

## Appendix A - Portfolio checklist

| Item | Must show |
|---|---|
| Project A - integration service | Messy multi-source data, auth, tests, Terraform, CI/CD, monitoring, postmortem |
| Project B - trustworthy AI assistant | RAG + agent + MCP, eval report with iterations, injection threat model, cost/latency numbers, demo video |
| Capstone case study | Real user, discovery notes, scope doc, before/after metric, testimonial, still running |
| Writing samples | 1 design doc, 1 exec memo, 1 postmortem, 6+ public blog posts from your log |
| Resume | One page; every bullet = action + system + measurable result; 'Forward Deployed' language mirrored from postings |
| GitHub / site | Pinned repos with clean READMEs, architecture diagrams, one-command setup |

---

## Appendix B - Decomposition framework & practice prompts

**The G.U.D.C.M.A.R.R. framework** (use it in order, out loud):

- **Goal** - What outcome does the business want? What metric proves success?
- **Users** - Who touches this daily? What do they do today, step by step?
- **Data** - What data exists, where, what quality, who controls access?
- **Constraints** - Security, regulation, latency, budget, timeline, existing systems.
- **MVP** - The smallest slice that delivers measurable value in 2-4 weeks.
- **Architecture** - Components, data flow, where AI is used and where rules/humans are better.
- **Risks** - Accuracy, adoption, data access, failure modes; mitigation for each.
- **Rollout** - Pilot group, evaluation, feedback loop, scaling plan, how you measure impact.

### Practice prompts (45 minutes each)

- A hospital network's physicians spend about two hours a day on clinical documentation. Reduce it.
- A lender's underwriters take 3-4 days per loan file. Speed this up without raising default rates.
- A retailer receives 10,000 support tickets a day and can no longer keep up. Fix it.
- An Indian state transport department wants to reduce bus breakdowns using existing maintenance logs.
- A pharma company needs to answer regulator queries faster from 20 years of trial documents.
- A logistics firm's dispatchers coordinate 500 trucks over phone calls and WhatsApp. Improve dispatch.
- A bank wants an internal assistant for 5,000 branch employees on ever-changing policy circulars.
- A manufacturer wants to cut quality-inspection escapes on its assembly line.

---

## Appendix C - Core resources

| Area | Resources |
|---|---|
| Foundations | MIT 'The Missing Semester'; 'Fluent Python' (Ramalho); SQLBolt / Mode SQL tutorial; Postgres docs on EXPLAIN |
| Backend & systems | FastAPI docs; 'Designing Data-Intensive Applications' (Kleppmann); OAuth 2.0 Simplified (Parecki); 'System Design Interview' Vol 1 (Xu) |
| Cloud & DevOps | Official AWS/Azure/GCP learning paths; Terraform tutorials (HashiCorp); Kubernetes docs 'Tutorials'; OpenTelemetry docs; Google SRE book (free online) |
| Applied AI | 'AI Engineering' (Chip Huyen); Anthropic and OpenAI docs and cookbooks; Model Context Protocol spec & SDKs; DeepLearning.AI short courses (RAG, agents, evals); OWASP Top 10 for LLM Applications; Hamel Husain's writing on evals |
| Customer craft | 'The Trusted Advisor'; 'The Mom Test'; 'The Pyramid Principle'; 'Never Split the Difference' |
| Interview prep | Exponent's FDE course and 2026 FDE interview guide; Educative 'Forward Deployed Engineer' course; company engineering blogs (Palantir, Databricks, Anthropic, OpenAI) |

### Where to aim

**FDE-native / AI labs:** Palantir, Anthropic, OpenAI, xAI, Scale AI, Databricks, ElevenLabs, Ramp, Applied Intuition, plus many applied-AI startups. **India:** watch global labs' and US startups' Bengaluru/remote openings, Indian AI startups, and the FDE/'AI engineer - client' tracks at large IT services and consulting firms - often the most realistic first door, and you can convert to an AI-lab FDE after 2-3 years of customer-facing delivery.

*Salary context (US figures from 2026 guides; Indian packages are lower in absolute terms and vary widely): general FDE roughly $100k entry to $250k+ senior; AI FDE roughly $120k-$150k entry rising to $270k-$350k+ at staff level.*

### Sources used to build this curriculum

- Exponent - Forward Deployed Engineer Interview: The Definitive 2026 Guide (tryexponent.com)
- Exponent - The FDE Interview Process; Databricks FDE Interview Guide (tryexponent.com)
- Educative - Forward Deployed Engineer course: The Four Interview Rounds (educative.io)
- InterviewBit - FDE Qualifications and Eligibility; FDE Skills: What AI Companies Actually Hire For in 2026
- Scaler - Forward Deployed Engineer Skills in 2026
- Second Talent - Forward Deployed Engineer and AI Forward Deployed Engineer occupation guides
- Anthropic careers - Forward Deployed Engineer, Applied AI postings
- Job postings: xAI, Applied Intuition (new grad), Tesla, Mesodyne, Resume-Library AI FDE, Everest/Palantir AI FDE
- AlgeriaTech News - The Forward Deployed Engineer boom (May 2026)
