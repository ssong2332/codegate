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
