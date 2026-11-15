# Security posture: be hard to hurt

You will not make a system perfectly safe. The goal is to be a harder target than the next one, and to recover fast when something goes wrong. This is your **security posture**.

## Think like an attacker: threat modeling

A threat model is a short document that answers four questions:

1. What are we protecting? (money, customer data, admin access)
2. Where can someone get in? (APIs, mobile app, admin panel, webhooks)
3. What can go wrong? (the threats)
4. What do we do about it? (the controls)

Draw a simple picture first: boxes for services, arrows for data, a line where the internet ends and your network begins.

## STRIDE: six kinds of threat

- **S**poofing: pretending to be someone else (a stolen login token).
- **T**ampering: changing data that should not change (editing a refund from ₹500 to ₹50,000).
- **R**epudiation: denying you did something, with no log to prove it.
- **I**nformation disclosure: data leaks (phone numbers in an error page).
- **D**enial of service: making the service unavailable (a flood of requests).
- **E**levation of privilege: gaining rights you should not have.

For each threat, write a control. Rate limits help against floods. Server-side checks help against tampering. Audit logs help against repudiation.

## Secrets handling

A secret is anything that proves who you are: passwords, API keys, tokens, private keys.

- Never put secrets in Git. Bots scan public repos within minutes.
- Keep them in the platform's secret store or environment variables.
- If one leaks, **revoke it first**. Deleting the file does not remove it from Git history.
- Use different keys for testing and production.
- Rotate keys on a schedule so a stolen old key stops working.

## Least privilege

Give every person and program only the permissions needed for its job, on only the things it touches. A reports job that reads one bucket gets `s3:GetObject` on that bucket. It does not get admin.

Why it matters: if the credentials are stolen, the attacker gets only that small power. This is called limiting the **blast radius**.

Warning signs: `*` for actions, `*` for resources, or one shared key for the whole team.

## Basics that stop most attacks

- Keep libraries updated. Many breaches use old, known bugs.
- Use HTTPS everywhere. Watch certificate expiry dates, because an expired certificate is an outage.
- Validate input on the server. Never trust amounts, ids or roles sent by the client.
- Turn on multi-factor login for admin and cloud accounts.
- Back up data and test the restore.

## India context

If you handle personal data, India's Digital Personal Data Protection Act expects you to protect it and to report a breach. Payment systems follow RBI rules, which include storing card data only in approved ways. When in doubt, store less data. What you do not keep cannot leak.

## Blameless postmortems

After an incident, write what happened. The rule is **blameless**: people did what seemed right with the information they had. If a person could break production with one command, the system was too fragile. Fix the system.

A good postmortem has:

- a short summary and numbers for impact
- a timeline in IST
- the root cause
- what went well and what did not (often detection time)
- action items with an owner role and a date

## Try it

In the levels you will name threats, handle a leaked key, trim a wildcard permission, write a threat model for a UPI refund service, and write a postmortem. Then you will deploy your Week 6 ETL service with a /health route and structured logs as the Phase 2 project.
