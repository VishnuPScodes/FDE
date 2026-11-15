def build_messages(system, history, user_text):
    if not user_text.strip():
        raise ValueError("user_text is empty")
    turns = []
    if system.strip():
        turns.append({"role": "system", "content": system.strip()})
    for turn in list(history) + [{"role": "user", "content": user_text}]:
        content = turn["content"].strip()
        if not content:
            continue
        if turns and turns[-1]["role"] == turn["role"]:
            turns[-1] = {"role": turn["role"], "content": turns[-1]["content"] + "\n\n" + content}
        else:
            turns.append({"role": turn["role"], "content": content})
    return turns
