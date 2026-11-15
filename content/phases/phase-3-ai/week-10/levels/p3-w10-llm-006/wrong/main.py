def build_messages(system, history, user_text):
    turns = [{"role": "system", "content": system}]
    turns.extend(history)
    turns.append({"role": "user", "content": user_text})
    return turns
