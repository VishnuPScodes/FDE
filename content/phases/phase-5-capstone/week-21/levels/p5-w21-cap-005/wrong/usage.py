def summarize_usage(lines: list[str]) -> dict:
    by_action, by_day, users = {}, {}, set()
    for line in lines:
        parts = line.split()
        if len(parts) != 3:
            continue
        user = parts[1].split("=")[1]
        action = parts[2].split("=")[1]
        day = parts[0][:10]
        users.add(user)
        by_action[action] = by_action.get(action, 0) + 1
        by_day[day] = by_day.get(day, 0) + 1
    return {"events": sum(by_action.values()), "unique_users": len(users), "by_action": by_action, "by_day": by_day}
