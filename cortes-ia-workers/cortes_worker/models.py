from dataclasses import dataclass, field


class ProcessingError(Exception):
    def __init__(self, code, retryable=False, outcome="SYSTEM_FAILURE"):
        super().__init__(code)
        self.code = code
        self.retryable = retryable
        self.outcome = outcome


@dataclass
class WordTiming:
    start_ms: int
    end_ms: int
    word: str

    def validate(self, duration):
        if not 0 <= self.start_ms < self.end_ms <= duration or not self.word or len(self.word) > 500:
            raise ProcessingError("INVALID_TRANSCRIPT")


@dataclass
class Segment:
    start_ms: int
    end_ms: int
    text: str
    words: list[WordTiming] = field(default_factory=list)

    def __post_init__(self):
        self.words = [
            item if isinstance(item, WordTiming) else WordTiming(**item)
            for item in (self.words or [])
        ]

    def validate(self, duration):
        if not 0 <= self.start_ms < self.end_ms <= duration or len(self.text) > 10000:
            raise ProcessingError("INVALID_TRANSCRIPT")
        previous = self.start_ms
        for word in self.words:
            word.validate(duration)
            if word.start_ms < self.start_ms or word.end_ms > self.end_ms or word.start_ms < previous:
                raise ProcessingError("INVALID_TRANSCRIPT")
            previous = word.start_ms


@dataclass
class Candidate:
    start_ms: int
    end_ms: int
    title: str
    reason: str
    score: float = 0

    def validate(self, duration):
        if not 0 <= self.start_ms < self.end_ms <= duration:
            raise ProcessingError("INVALID_TIMESTAMP")
        if not self.title or len(self.title) > 200 or len(self.reason) > 1000:
            raise ProcessingError("INVALID_CANDIDATE")


def validate_candidates(items, duration, quantity, minimum=0, maximum=180000, rejected=()):
    accepted = []
    for item in items:
        c = Candidate(**item)
        c.validate(duration)
        if not minimum <= c.end_ms - c.start_ms <= maximum:
            continue
        intervals = [(a.start_ms, a.end_ms) for a in accepted] + list(rejected)
        if any(
            max(0, min(c.end_ms, b) - max(c.start_ms, a))
            / min(c.end_ms - c.start_ms, b - a)
            > .6
            for a, b in intervals
        ):
            continue
        accepted.append(c)
        if len(accepted) >= quantity:
            break
    return accepted
