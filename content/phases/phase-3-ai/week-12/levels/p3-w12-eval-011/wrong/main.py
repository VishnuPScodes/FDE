import re


def build_judge_prompt(rubric, question, answer):
    lines = ["You are a strict grader. Score the answer from 1 to 5.", "Rubric:"]
    lines += [f"- {item}" for item in rubric]
    lines += [f"Question: {question}", f"Answer: {answer}", "Reply exactly as:",
              "SCORE: <1-5>", "REASON: <one sentence>"]
    return "\n".join(lines)


def parse_judge(raw):
    m = re.search(r"SCORE:\s*([1-5])\b", raw, re.IGNORECASE)
    if not m:
        return None
    r = re.search(r"REASON:\s*(.+)", raw, re.IGNORECASE)
    return {"score": int(m.group(1)), "reason": r.group(1).strip() if r else ""}


def run_judge(judge, rubric, examples, retries=1):
    scores = {}
    for ex in examples:
        parsed = parse_judge(judge(build_judge_prompt(rubric, ex["question"], ex["answer"])))
        scores[ex["id"]] = parsed["score"] if parsed else 0
    return {"scores": scores, "mean": round(sum(scores.values()) / len(scores), 2), "unparsed": []}
