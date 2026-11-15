def tokens(message):
    """A rough token count: one per word, plus one for the message itself."""
    return len(str(message.get("content", "")).split()) + 1


def trim_history(messages, max_tokens):
    """Keep the system message and the newest whole units that fit."""
    # TODO
    return messages
