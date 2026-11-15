import json


def build_prompt(invoice_text):
    return (
        "Extract invoice_number, gstin and total_inr from the invoice below. "
        "Reply with one JSON object only.\n\n<invoice>\n" + invoice_text + "\n</invoice>"
    )


def validate(data):
    if not isinstance(data, dict):
        return "reply is not a JSON object"
    if not isinstance(data.get("invoice_number"), str):
        return "invoice_number must be a string"
    gstin = data.get("gstin")
    if not isinstance(gstin, str) or len(gstin) != 15:
        return "gstin must be a 15 character string"
    total = data.get("total_inr")
    if isinstance(total, bool) or not isinstance(total, (int, float)):
        return "total_inr must be a number"
    return None


def strip_fence(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    return text.strip()


def extract_invoice(client, invoice_text, max_attempts=3):
    base = build_prompt(invoice_text)
    prompt = base
    reason = "no reply"
    for _ in range(max_attempts):
        reply = client.complete(prompt)
        try:
            data = json.loads(strip_fence(reply))
            reason = validate(data)
        except json.JSONDecodeError as error:
            reason = f"not valid JSON ({error.msg})"
        if reason is None:
            return data
        prompt = base + f"\n\nYour last reply was invalid: {reason}. Reply with JSON only."
    raise ValueError(f"No valid reply after {max_attempts} attempts: {reason}")
