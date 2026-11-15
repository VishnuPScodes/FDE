# Metrics, traces and alerts

Logs tell you what happened to one request. **Metrics** tell you how the whole system is doing, in numbers over time. **Traces** show where one request spent its time. You need all three.

## Metrics: numbers over time

A metric is a name, some labels, and a number that is sampled every minute or so.

    http_requests_total{service="payments", status="503"}

Two main kinds:

- **Counter**: only goes up. Total requests, total errors. Not useful raw, because the number just keeps growing.
- **Gauge**: goes up and down. Memory used, connections in use, queue length.

## rate(): turn a counter into a speed

`rate(http_requests_total[5m])` means "requests per second, averaged over the last 5 minutes". This is the most used function in PromQL, the metrics query language.

Error ratio, the share of requests that failed:

    sum(rate(http_requests_total{service="payments",status=~"5.."}[5m]))
    /
    sum(rate(http_requests_total{service="payments"}[5m]))

`status=~"5.."` is a pattern that matches 500, 502, 503 and so on. A result of 0.25 means 25% of requests failed.

## Percentiles, not averages

Say 100 customers pay in a day. Ninety-five finish in 200 ms and five wait 10 seconds. The average looks fine: about 700 ms. But five people are angry.

The **p95** is the time that 95 out of 100 requests beat. Here it would be about 200 ms, and **p99** would show the 10 second wait. Use `histogram_quantile`:

    histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service="invoices"}[5m])))

## The golden signals

Watch four things for every service: **latency** (how slow), **traffic** (how many requests), **errors** (how many fail) and **saturation** (how full: memory, CPU, connection pool).

A memory metric that climbs and then drops to zero with a pod restart is a leak. A pool gauge stuck at its maximum is saturation.

## Traces: one request, many spans

A trace is the story of one request. Each step is a **span** with a start time and a duration. In a waterfall, the widest bar is the first suspect.

For a payment: the gateway span contains a payments span, which contains a database span and a call to the bank. If `db.pool.acquire` takes 5 seconds, the request is waiting for a database connection, not doing slow work.

Traces share the `trace_id` that appears in your logs, so you can jump between them. In the Traces tab: `slowest 5`, `errors 5`, then `trace <id>`.

## SLOs and error budgets

An **SLO** is a promise: "99.9% of payment requests succeed over 30 days". The leftover 0.1% is your **error budget**: about 43 minutes of full failure per month.

**Burn rate** says how fast you spend it. Burn rate 1 spends the budget exactly in 30 days. Burn rate 100 would finish it in about 7 hours. If a one-hour incident burns 20% of the month's budget, stop risky launches.

## Alerts people can live with

A good alert fires when users hurt, and not otherwise. Every alert has:

- an **expr**: the condition, like error ratio greater than 0.05
- a **for** time: how long it must hold before paging
- a severity: page now, or open a ticket

Too sensitive and the team learns to ignore pages at 3 a.m. Too relaxed and customers tell you first. Alert on symptoms that users feel (error rate, latency), and use causes (CPU, memory) as tickets.

## Putting it together

When a page comes in: check the **metrics** to see how bad and since when, the **logs** to see which error and which service, and a **trace** to see which step is slow. Then write down what you saw. That is the incident report.
