# 참조 구간 고르기(Architecture.md §143.3 판정표 R1~R5) — GPU · 모델 없이 시험할 수 있는 순수 로직.
# 입력 = 받아쓰기 구간 [(시작초, 끝초, 글)], 대본 줄 [(말투, 글)]. 출력 = 기본 참조 1 + 보조 3(각 3~10초) 또는 실패 사유.
import re
from difflib import SequenceMatcher

MIN_SEC, MAX_SEC = 3.0, 10.0
MATCH_RATIO = 0.7          # R1 — 이 이상이면 "읽은 줄"
MIN_READ_LINES = 3         # R5
MIN_SPEECH_SEC = 15.0      # R5
# 대본 줄 번호(0부터) — src/app/onboarding/record/page.tsx SCRIPT_LINES 순서와 같다.
MAIN_ORDER = [1, 6]        # R3 질문 → 놀람
AUX_ORDER = [2, 3, 4]      # R4 다급 · 걱정 · 기쁨


def norm(text: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", text)


def ratio(a: str, b: str) -> float:
    a, b = norm(a), norm(b)
    return SequenceMatcher(None, a, b).ratio() if a and b else 0.0


def align(segments, script_lines):
    """R1 — 대본 줄마다 이어 붙인 구간(1~3개) 중 유사도 최댓값. 반환 {줄번호: (시작, 끝, 대본글, 유사도)}."""
    out = {}
    for li, (_cue, line) in enumerate(script_lines):
        best = None
        for i in range(len(segments)):
            for j in range(i, min(i + 3, len(segments))):
                text = " ".join(s[2] for s in segments[i:j + 1])
                r = ratio(text, line)
                if best is None or r > best[3]:
                    best = (segments[i][0], segments[j][1], line, r)
        if best and best[3] >= MATCH_RATIO:
            out[li] = best  # R2 — 글은 대본 원문
    return out


def _fit(span, read, li):
    """R3 길이 규칙 — 3초 미만이면 다음 읽은 줄을 이어 붙이고, 10초 넘으면 버린다(문장부호 자르기는 서비스 쪽 생략 — 대본 줄은 모두 10초 안)."""
    s, e, text, _r = span
    if e - s < MIN_SEC and li + 1 in read:
        ns, ne, ntext, _ = read[li + 1]
        s, e, text = s, ne, f"{text} {ntext}"
    return (s, e, text) if MIN_SEC <= e - s <= MAX_SEC else None


def pick(segments, script_lines):
    speech = sum(max(0.0, e - s) for s, e, _ in segments)
    read = align(segments, script_lines)
    if len(read) < MIN_READ_LINES or speech < MIN_SPEECH_SEC:
        return {"ok": False, "reason": "too_little_speech", "readLines": len(read)}
    order = MAIN_ORDER + [li for li in sorted(read) if li not in MAIN_ORDER]
    main = next(((li, f) for li in order if li in read and (f := _fit(read[li], read, li))), None)
    if not main:
        return {"ok": False, "reason": "no_main_ref", "readLines": len(read)}
    aux = []
    for li in AUX_ORDER + sorted(read):
        if len(aux) == 3:
            break
        if li == main[0] or li in [a[0] for a in aux] or li not in read:
            continue
        f = _fit(read[li], read, li)
        if f:
            aux.append((li, f))
    return {
        "ok": True,
        "main": {"line": main[0], "start": main[1][0], "end": main[1][1], "text": main[1][2]},
        "aux": [{"line": li, "start": f[0], "end": f[1], "text": f[2]} for li, f in aux],
        "readLines": len(read),
    }
