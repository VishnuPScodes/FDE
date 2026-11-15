def tokens(message):
    return len(str(message.get("content", "")).split()) + 1


# Common mistake: trimming message by message, which can keep a tool result
# while dropping the assistant message that asked for it.
def trim_history(messages, max_tokens):
    system, rest = messages[0], messages[1:]
    kept = []
    used = tokens(system)
    for message in reversed(rest):
        if kept and used + tokens(message) > max_tokens:
            break
        kept.append(message)
        used += tokens(message)
    kept.reverse()
    return [system] + kept
