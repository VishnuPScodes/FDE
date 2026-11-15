import json


def build_prompt(invoice_text):
    return (
        "Extract invoice_number, gstin and total_inr from the invoice below. "
        "Reply with one JSON object only.\n\n<invoice>\n" + invoice_text + "\n</invoice>"
    )


def validate(data):
    return None


def extract_invoice(client, invoice_text, max_attempts=3):
    for _ in range(max_attempts):
        try:
            return json.loads(client.complete(build_prompt(invoice_text)))
        except json.JSONDecodeError:
            continue
    raise ValueError("failed")
