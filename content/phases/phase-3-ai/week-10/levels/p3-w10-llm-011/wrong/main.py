LABELS = {"billing", "appointments", "reports"}


def render_prompt(instructions, examples, query):
    shots = "\n".join(f"<example><input>{e['input']}</input><label>{e['label']}</label></example>" for e in examples)
    return f"<instructions>\n{instructions}\n</instructions>\n<examples>\n{shots}\n</examples>\n<query>{query}</query>"
