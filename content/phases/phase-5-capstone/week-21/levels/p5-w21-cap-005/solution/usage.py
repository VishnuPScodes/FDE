def summarize_usage(lines: list[str]) -> dict:
    users = set()
    by_action: dict[str, int] = {}
    by_day: dict[str, int] = {}
    events = 0
    for line in lines:
        parts = line.split()
        if len(parts) != 3 or "T" not in parts[0]:
            continue
        fields = dict(p.split("=", 1) for p in parts[1:] if "=" in p)
        user, action = fields.get("user", ""), fields.get("action", "")
        if not user or not action:
            continue
        day = parts[0].split("T")[0]
        events += 1
        users.add(user)
        by_action[action] = by_action.get(action, 0) + 1
        by_day[day] = by_day.get(day, 0) + 1
    return {"events": events, "unique_users": len(users), "by_action": by_action, "by_day": by_day}
