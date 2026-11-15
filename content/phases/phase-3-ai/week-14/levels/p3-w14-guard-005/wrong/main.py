def run_cases(guard, cases):
    passed = sum(1 for text, expected in cases if guard(text)["action"] == expected)
    return {"total": len(cases), "passed": passed, "rate": passed / len(cases), "failures": []}
