def build_judge_prompt(rubric, question, answer):
    return f"Rubric: {rubric}\nQuestion: {question}\nAnswer: {answer}"


def parse_judge(raw):
    return {"score": int(raw.split(":")[1].split()[0]), "reason": ""}
