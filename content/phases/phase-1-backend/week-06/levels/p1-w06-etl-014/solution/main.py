def quality_counts(read, accepted, rejected):
    values = (read, accepted, rejected)
    if any(value < 0 for value in values) or accepted + rejected > read:
        raise ValueError("counts do not reconcile")
    duplicates = read - accepted - rejected
    return {"read": read, "accepted": accepted, "duplicates": duplicates, "rejected": rejected}
