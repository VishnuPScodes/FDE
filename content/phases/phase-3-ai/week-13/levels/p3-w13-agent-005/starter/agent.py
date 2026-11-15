from dispatcher import dispatch

SYSTEM = "You are a claims assistant for a Pune motor insurer. Use tools to check facts."


def run_agent(llm, user_message, registry, max_steps=5):
    """Run the model and tools until there is an answer or the step limit is hit."""
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user_message},
    ]
    # TODO: the loop
    pass
