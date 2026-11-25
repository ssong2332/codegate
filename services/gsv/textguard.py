# 합성 글 검사(Architecture.md §143.14 D4) — 토큰 글자 상한 + 금지어(토큰에 실린 목록 · Functions의 실존 기관명 목록).
import re


class Budget:
    def __init__(self, limit: int, banned: list[str]):
        self.left = limit
        self.banned = [re.sub(r"\s", "", b) for b in banned if b.strip()]

    def check(self, text: str) -> str | None:
        """합성해도 되면 None, 아니면 거절 사유."""
        if not text.strip():
            return "empty"
        if len(text) > self.left:
            return "budget"
        compact = re.sub(r"\s", "", text)
        if any(b in compact for b in self.banned):
            return "banned"
        self.left -= len(text)
        return None


# GPT 생성 설정 판정표 G(§143.19 · §143.20):
# | 행 | 토큰 `gen` | 쓰는 값 |
# | G1 | 없음(운영 토큰 — Functions는 싣지 않는다) | DEFAULT_GEN = 조합 C(메인 결정 2026-11-26 — 본인 녹음 재시험 "c가 좀 더 깔끔") |
# | G2 | 허용 키 · 숫자 | 그 값(허용 범위로 자름) · 나머지 키는 G1 |
# | G3 | 허용 밖 키 · 숫자 아님 · bool | 무시(G1 값) |
GEN_RANGES = {"top_k": (1, 50), "top_p": (0.1, 1.0), "temperature": (0.1, 2.0), "repetition_penalty": (1.0, 2.0)}
DEFAULT_GEN = {"top_k": 20, "top_p": 0.9, "temperature": 1.2}  # repetition_penalty = 라이브러리 기본(1.35)


def gen_params(raw) -> dict:
    out = dict(DEFAULT_GEN)
    if not isinstance(raw, dict):
        return out
    for k, (lo, hi) in GEN_RANGES.items():
        v = raw.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            v = min(hi, max(lo, v))
            out[k] = int(v) if k == "top_k" else float(v)
    return out
