def tokens(message):
    """A rough token count: one per word, plus one for the message itself."""
    return len(str(message.get("content", "")).split()) + 1


def trim_history(messages, max_tokens):
    """Keep the system message and the newest whole units that fit."""
    system, rest = messages[0], messages[1:]
    units = []
    for message in rest:
        if message["role"] == "tool" and units:
            units[-1].append(message)
        else:
            units.append([message])
    kept = []
    used = tokens(system)
    for unit in reversed(units):
        size = sum(tokens(message) for message in unit)
        if kept and used + size > max_tokens:
            break
        kept.append(unit)
        used += size
    kept.reverse()
    return [system] + [message for unit in kept for message in unit]
