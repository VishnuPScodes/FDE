def compare(judge, question, a, b):
    return {"first": "A", "second": "B", "tie": "tie"}[judge(question, a, b)]


def position_bias_rate(judge, cases):
    return 0.0
