from budget import ToolBudget


def test_calls_are_allowed_until_the_run_budget_is_used():
    budget = ToolBudget(max_calls=2)
    assert budget.try_call("order_status") == (True, "")
    assert budget.try_call("order_status") == (True, "")
    assert budget.try_call("order_status") == (False, "run budget used: 2 of 2 tool calls")


def test_refused_calls_do_not_count():
    budget = ToolBudget(max_calls=2, per_tool={"refund_payment": 1})
    assert budget.try_call("refund_payment")[0] is True
    assert budget.try_call("refund_payment")[0] is False
    assert budget.remaining() == 1
    assert budget.try_call("order_status")[0] is True
    assert budget.remaining() == 0


def test_per_tool_limit_message():
    budget = ToolBudget(max_calls=10, per_tool={"refund_payment": 1, "search": 2})
    budget.try_call("refund_payment")
    assert budget.try_call("refund_payment") == (False, "tool budget used: refund_payment allows 1 call per run")
    budget.try_call("search")
    budget.try_call("search")
    assert budget.try_call("search") == (False, "tool budget used: search allows 2 calls per run")


def test_run_budget_is_checked_first():
    budget = ToolBudget(max_calls=1, per_tool={"search": 1})
    budget.try_call("search")
    assert budget.try_call("search") == (False, "run budget used: 1 of 1 tool calls")


def test_budgets_are_per_instance():
    first, second = ToolBudget(max_calls=1), ToolBudget(max_calls=1)
    first.try_call("a")
    assert second.try_call("a")[0] is True


def test_default_budget_is_eight_and_input_dict_is_not_shared():
    limits = {"search": 1}
    budget = ToolBudget(per_tool=limits)
    limits["search"] = 99
    budget.try_call("search")
    assert budget.try_call("search")[0] is False
    assert budget.remaining() == 7
