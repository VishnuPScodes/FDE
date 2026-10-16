# Data quality, deduplication, and entity resolution

Repeated rows are common in exports and retries. Pick a stable business key, define which copy wins, and make the rule deterministic. “Keep the first row” is not a safe policy if files can arrive in a different order.

## Normalize before matching

Trim whitespace, standardize case where identifiers are case-insensitive, and parse money into integer minor units. Avoid fuzzy name matching as the only identity rule: names change and can collide. Prefer authoritative identifiers such as GSTIN; record uncertain matches for review.

## Preserve the audit trail

For each accepted record, keep its source and source identifier. For rejected records, keep the original row and a human-readable reason. Track counts for read, accepted, duplicate, and rejected records; the counts should reconcile.

```text
read = accepted + duplicates + rejected
```

Validation is a product decision. Make rules visible and test boundary cases such as blank strings, `NULL`, malformed dates, and unknown optional columns.
