import hashlib


def split_dataset(rows, holdout_pct=20):
    if not 0 <= holdout_pct <= 100:
        raise ValueError("holdout_pct must be between 0 and 100")
    out = {"dev": [], "holdout": []}
    for row in rows:
        bucket = int(hashlib.sha256(str(row["id"]).encode()).hexdigest(), 16) % 100
        out["holdout" if bucket < holdout_pct else "dev"].append(row)
    return out
