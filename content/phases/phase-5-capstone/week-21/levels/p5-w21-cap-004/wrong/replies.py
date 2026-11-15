def classify_reply(text: str) -> str:
    if "1" in text or "yes" in text:
        return "confirm"
    if "2" in text or "cancel" in text:
        return "cancel"
    return "unknown"


def accuracy(cases):
    right = sum(1 for text, label in cases if classify_reply(text) == label)
    return right / len(cases)
