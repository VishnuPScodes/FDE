CONFIRM = {"1", "yes", "y", "ok", "okay", "confirm", "haan", "ha", "ho", "will come"}
CANCEL = {"2", "no", "cancel", "nahi", "nako", "can't come"}


def _matches(text: str, words: set[str]) -> bool:
    tokens = text.replace(",", " ").split()
    return any(w in tokens or (" " in w and w in text) for w in words)


def classify_reply(text: str) -> str:
    clean = text.strip().lower()
    if not clean:
        return "unknown"
    yes = _matches(clean, CONFIRM)
    no = _matches(clean, CANCEL)
    if yes and not no:
        return "confirm"
    if no and not yes:
        return "cancel"
    return "unknown"


def accuracy(cases: list[tuple[str, str]]) -> float:
    if not cases:
        return 0.0
    right = sum(1 for text, label in cases if classify_reply(text) == label)
    return right / len(cases)
