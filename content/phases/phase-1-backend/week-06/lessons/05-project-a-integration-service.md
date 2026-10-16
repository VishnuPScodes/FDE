# Project A: enterprise integration service

Build a small, repeatable ingestion job that reads a messy CSV export, a simulated SFTP file drop, and a SOAP XML response. Normalize them into canonical customer records, reconcile duplicates by stable identifiers and update time, and write accepted output plus a quarantine report.

## Acceptance criteria

- A rerun produces the same output and does not create duplicate records.
- Invalid rows remain available with a rejection reason.
- Each accepted record retains source provenance.
- The checkpoint does not move past a failed batch.
- Tests cover malformed input, duplicate identities, schema drift, and an empty feed.

Write a README with the business problem, architecture and data flow, quality rules, limitations, and what you would change before connecting to real systems. This browser project simulates the ingestion boundary; it does not create a hosted Postgres service or production API.
