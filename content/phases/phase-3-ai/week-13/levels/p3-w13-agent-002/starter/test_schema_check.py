from schema_check import validate_args

REFUND = {
    "type": "object",
    "properties": {
        "order_id": {"type": "string", "pattern": "^ORD-[0-9]+$"},
        "amount_inr": {"type": "integer", "minimum": 1, "maximum": 200000},
        "reason": {"type": "string", "enum": ["damaged", "late", "wrong_item"]},
        "notify": {"type": "boolean"},
        "tags": {"type": "array"},
    },
    "required": ["order_id", "amount_inr"],
    "additionalProperties": False,
}


def test_valid_arguments():
    assert validate_args(REFUND, {"order_id": "ORD-8841", "amount_inr": 1499, "reason": "late"}) == []


def test_not_an_object():
    assert validate_args(REFUND, "ORD-8841") == ["arguments must be an object"]


def test_missing_required_fields():
    errors = validate_args(REFUND, {})
    assert "missing required field: order_id" in errors
    assert "missing required field: amount_inr" in errors


def test_unexpected_field():
    errors = validate_args(REFUND, {"order_id": "ORD-1", "amount_inr": 10, "coupon": "DIWALI50"})
    assert errors == ["unexpected field: coupon"]


def test_open_schema_allows_extra_fields():
    schema = dict(REFUND, additionalProperties=True)
    assert validate_args(schema, {"order_id": "ORD-1", "amount_inr": 10, "coupon": "DIWALI50"}) == []


def test_wrong_type_skips_other_rules():
    errors = validate_args(REFUND, {"order_id": "ORD-1", "amount_inr": "1499"})
    assert errors == ["amount_inr must be integer"]


def test_bool_is_not_an_integer():
    errors = validate_args(REFUND, {"order_id": "ORD-1", "amount_inr": True})
    assert errors == ["amount_inr must be integer"]
    assert validate_args(REFUND, {"order_id": "ORD-1", "amount_inr": 5, "notify": True}) == []


def test_enum_pattern_and_range():
    errors = validate_args(REFUND, {"order_id": "8841", "amount_inr": 250000, "reason": "changed mind"})
    assert sorted(errors) == sorted([
        "order_id does not match pattern",
        "amount_inr must be <= 200000",
        "reason must be one of: damaged, late, wrong_item",
    ])
    assert validate_args(REFUND, {"order_id": "ORD-1", "amount_inr": 0}) == ["amount_inr must be >= 1"]


def test_number_accepts_floats():
    schema = {"type": "object", "properties": {"weight_kg": {"type": "number", "minimum": 0}}}
    assert validate_args(schema, {"weight_kg": 2.5}) == []
    assert validate_args(schema, {"weight_kg": False}) == ["weight_kg must be number"]
