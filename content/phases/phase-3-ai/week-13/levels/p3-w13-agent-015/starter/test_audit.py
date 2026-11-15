from audit import audit_entry, redact


def test_sensitive_keys_are_redacted_case_insensitively():
    assert redact({"Phone": "9876543210", "city": "Pune", "PAN": "ABCDE1234F"}) == {
        "Phone": "[REDACTED]", "city": "Pune", "PAN": "[REDACTED]"}


def test_nested_dicts_and_lists_are_redacted():
    data = {"customer": {"name": "Meera", "aadhaar": "1234 5678 9012"},
            "contacts": [{"phone": "9000000000"}, {"email": "m@example.in"}]}
    assert redact(data) == {
        "customer": {"name": "Meera", "aadhaar": "[REDACTED]"},
        "contacts": [{"phone": "[REDACTED]"}, {"email": "m@example.in"}]}


def test_long_text_is_truncated_with_a_count():
    text = "x" * 130
    assert redact({"note": text}) == {"note": "x" * 100 + "...[+30 chars]"}
    assert redact({"note": "y" * 100}) == {"note": "y" * 100}


def test_input_is_not_changed():
    data = {"phone": "9876543210", "items": [{"token": "abc"}]}
    redact(data)
    assert data == {"phone": "9876543210", "items": [{"token": "abc"}]}


def test_non_container_values_pass_through():
    assert redact(42) == 42
    assert redact(None) is None
    assert redact(True) is True


def test_custom_sensitive_set():
    assert redact({"email": "a@b.in", "phone": "1"}, sensitive={"email"}) == {"email": "[REDACTED]", "phone": "1"}


def test_audit_entry_shape():
    call = {"id": "c1", "name": "update_contact", "arguments": {"customer_id": "CUST-1", "phone": "9876543210"}}
    assert audit_entry(call, "approved", "Priya") == {
        "tool": "update_contact",
        "arguments": {"customer_id": "CUST-1", "phone": "[REDACTED]"},
        "approval": "approved", "reviewer": "Priya"}
    assert audit_entry({"id": "c2", "name": "ping"}, "not_required") == {
        "tool": "ping", "arguments": {}, "approval": "not_required", "reviewer": None}
