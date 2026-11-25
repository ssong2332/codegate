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


# GPT 생성 설정(억양 시험 · §143.19) — 토큰(서버가 봉인)에 실린 값만, 허용 범위로 잘라 쓴다. 운영 토큰에는 없다 = 사전학습 기본값.
GEN_RANGES = {"top_k": (1, 50), "top_p": (0.1, 1.0), "temperature": (0.1, 2.0), "repetition_penalty": (1.0, 2.0)}


def gen_params(raw) -> dict:
    if not isinstance(raw, dict):
        return {}
    out = {}
    for k, (lo, hi) in GEN_RANGES.items():
        v = raw.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            v = min(hi, max(lo, v))
            out[k] = int(v) if k == "top_k" else float(v)
    return out
