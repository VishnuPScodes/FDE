import copy

from shaping import shape_result

ROWS = [
    {"voucher": f"SAL-{n:04d}", "party": "Sharma Traders", "amount_inr": 1000 + n,
     "pan": "ABCPS1234K", "internal_notes": "credit hold discussed"}
    for n in range(57)
]
FIELDS = ["voucher", "amount_inr", "party"]


def test_truncates_and_explains():
    shaped = shape_result(ROWS, FIELDS)
    assert shaped["returned"] == 10
    assert shaped["total"] == 57
    assert shaped["truncated"] is True
    assert shaped["note"] == "Showing 10 of 57 rows. Ask with a narrower filter for more."
    assert [row["voucher"] for row in shaped["rows"]][:2] == ["SAL-0000", "SAL-0001"]


def test_only_allowed_fields_in_order():
    shaped = shape_result(ROWS, FIELDS, limit=3)
    assert shaped["rows"][0] == {"voucher": "SAL-0000", "amount_inr": 1000, "party": "Sharma Traders"}
    assert list(shaped["rows"][0]) == FIELDS
    for row in shaped["rows"]:
        assert "pan" not in row and "internal_notes" not in row


def test_small_result_has_no_note():
    shaped = shape_result(ROWS[:4], FIELDS)
    assert shaped["truncated"] is False
    assert shaped["returned"] == 4 and shaped["total"] == 4
    assert "note" not in shaped


def test_missing_keys_are_skipped():
    shaped = shape_result([{"voucher": "SAL-9001"}], FIELDS)
    assert shaped["rows"] == [{"voucher": "SAL-9001"}]


def test_input_is_not_changed():
    before = copy.deepcopy(ROWS)
    shape_result(ROWS, FIELDS)
    assert ROWS == before
