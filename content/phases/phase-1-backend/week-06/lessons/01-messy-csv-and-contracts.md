# Messy CSVs and data contracts

Customer exports are interfaces, even when they arrive as files. Treat each input as untrusted: inspect its encoding and headers, preserve the original, then parse rows against an explicit contract.

## Read defensively

Open CSV files with `encoding="utf-8-sig"` to remove an optional byte-order mark. Use `csv.DictReader` so columns are addressed by name, and reject missing required headers before processing rows. Never assume that a column order or optional field will stay fixed.

## Validate at the boundary

Separate structural errors (missing columns) from row errors (bad amount, missing identifier). Keep a rejected row and its reason so an operator can fix the source. Do not silently turn invalid values into zero or discard them.

```python
import csv
from pathlib import Path

with Path("export.csv").open(encoding="utf-8-sig", newline="") as source:
    rows = list(csv.DictReader(source))
```

The original file is evidence. Normalize into a new canonical representation and keep enough provenance to trace each record back to its source.
