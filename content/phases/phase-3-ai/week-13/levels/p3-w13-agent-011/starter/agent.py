from approval import needs_approval
from dispatcher import dispatch

SYSTEM = "You are a refund assistant for a Bengaluru e-commerce company."


def start(llm, user_message, registry, max_steps=6):
    state = {
        "status": "running",
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user_message}],
        "pending": None,
        "answer": None,
        "steps": 0,
        "max_steps": max_steps,
    }
    # TODO
    return state


def resume(state, decision, llm, registry):
    # TODO
    return state
