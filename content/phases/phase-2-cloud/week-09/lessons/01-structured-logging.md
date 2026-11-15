# Structured logging: logs a machine can search

It is 10:40 on a Monday at a Pune fintech. Customers say UPI payments are failing. Your phone buzzes. The first thing you open is the logs. If the logs are good, you find the problem in five minutes. If they are bad, you scroll for an hour.

## Plain text vs structured

A plain text log looks like this:

    Payment failed for Meera at 10:25 because npci timed out

You can read it, but a computer cannot easily count it. To find all failures from one service, you would have to guess the words.

A **structured log** is one JSON object per line. Every piece of information has a name:

    {"ts":"2026-11-09T10:25:02+05:30","service":"payments","level":"error","msg":"npci collect failed","request_id":"req-7a00093e","status":502,"peer":"npci-upi"}

Now a tool can answer questions like "how many error lines came from payments?" in a blink.

## The fields every line should have

- `ts`: the time, with the time zone. For India, +05:30.
- `service`: which program wrote the line.
- `level`: `debug`, `info`, `warn` or `error`.
- `msg`: a short fixed sentence. Do not stuff changing values into it.
- `request_id`: one id for one customer request. Pass it from service to service.

Add extra fields for what is useful: `route`, `status`, `latency_ms`, `peer` (the outside service you were calling), `error_type`.

## Log levels in one minute

- `error`: something failed and a user probably noticed.
- `warn`: something is odd but the request still worked, like a slow call to a tax portal.
- `info`: normal events, like "request completed" or "deploy finished".
- `debug`: details for developers. Usually off in production.

Warnings are your early signal. In many outages, the warnings start 10 minutes before the first error.

## Never log secrets or personal data

Logs travel far. They go to dashboards, backups and vendor tools. Never write:

- passwords, API keys, tokens
- full card numbers, Aadhaar numbers, PAN
- phone numbers or UPI IDs in full (mask them: `98xxxxxx21`)

Log a `request_id` and a reason instead. Support can still trace the problem.

## The request_id habit

One customer payment touches the gateway, the payments service and a bank. Each writes its own lines. If all of them carry the same `request_id`, you can search that one id and see the whole story in order. When a customer sends you a reference like `req-7a00093e`, this is how you find what happened.

## Querying in the simulator

The Logs tab uses a small query language:

- Filter: `service:payments level:error`
- Number compare: `latency_ms:>1000`
- Exact phrase: `msg:"config reloaded"`
- Group and count: `level:error | count by service`
- Stats: `stats p95(latency_ms) by route`
- Also: `| sort latency_ms desc`, `| limit 5`, `| fields time,service,msg`

A good habit is to go from wide to narrow: count errors by service, then by status, then read a few raw lines.

## Try it

In the levels, you will find which service fails, group errors by status and type, spot a slow dependency from warnings, and follow one request by its id.
