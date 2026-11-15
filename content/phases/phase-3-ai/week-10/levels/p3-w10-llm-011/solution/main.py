import html

LABELS = {"billing", "appointments", "reports"}


def render_prompt(instructions, examples, query):
    lines = ["<instructions>", instructions, "</instructions>", "<examples>"]
    for example in examples:
        if example["label"] not in LABELS:
            raise ValueError(f"unknown label {example['label']!r}")
        text = html.escape(example["input"], quote=False)
        lines.append(f"<example><input>{text}</input><label>{example['label']}</label></example>")
    lines.append("</examples>")
    lines.append(f"<query>{html.escape(query, quote=False)}</query>")
    return "\n".join(lines)
