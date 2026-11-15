# Postmortem: UPI payments failing (10:31 to 11:00 IST)

## Summary
Between 10:31 and 11:00 IST on a Monday, about one in four payment requests failed with HTTP 503. Customers of our Pune fintech saw "payment could not be completed". The cause was an exhausted database connection pool in the payments service.

## Impact
The payments error rate rose from near 0% to about 25%. Roughly 1,900 payments failed in 29 minutes. We estimate ₹14 lakh of payments were delayed and retried by users. The monthly availability budget of 43 minutes was used almost three times over for this hour.

## Timeline
10:30 deploy 2.4.1 finished on payments.
10:31 database connections in use reached the pool limit of 20.
10:33 first customer complaint on support chat.
10:41 on-call engineer paged by a support lead, not by an alert.
10:52 logs showed PoolTimeout errors; trace waterfall showed a long db.pool.acquire span.
10:58 connection pool size raised and a slow query fixed in a hotfix.
11:00 error rate back to normal.

## Root cause
Deploy 2.4.1 held database connections longer than before, so the pool of 20 ran out under normal traffic. No alert watched the pool or the error rate.

## What went well and what did not
Structured logs with request IDs let us follow one failed payment fast. It went badly that we heard about it from customers 10 minutes late, because no alert existed for the payments error ratio.

## Action items
1. Add an alert on payments 5xx ratio above 5% for 2 minutes. Owner: platform lead. Due: Friday.
2. Alert when pool use stays above 80% for 5 minutes. Owner: backend lead. Due: next Wednesday.
3. Add a load test for connection use to the deploy checklist. Owner: QA lead. Due: end of month.
