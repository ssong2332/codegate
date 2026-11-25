# 합성 · 준비 토큰(Architecture.md §143.8) — Functions(`functions/src/voice/gsvToken.ts`)가 같은 키로 만든다.
# 형식: base64url(iv 12바이트 | AES-256-GCM 암호문 + 태그 16바이트), 평문 = JSON. 브라우저는 내용을 못 읽는다(참조 서명 URL 숨김).
import base64, json, time
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class TokenError(Exception):
    pass


def _key(key_b64: str) -> bytes:
    key = base64.b64decode(key_b64)
    if len(key) != 32:
        raise TokenError("key")
    return key


def open_token(token: str, key_b64: str, kind: str, now: float | None = None) -> dict:
    """복호 · 종류 · 만료를 검사한다. 실패면 TokenError(이유는 로그에 본문 없이 종류만)."""
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
        body = json.loads(AESGCM(_key(key_b64)).decrypt(raw[:12], raw[12:], None))
    except TokenError:
        raise
    except Exception as e:  # 위조 · 손상 · 다른 키
        raise TokenError("decrypt") from e
    if body.get("kind") != kind:
        raise TokenError("kind")
    if not isinstance(body.get("exp"), (int, float)) or body["exp"] < (time.time() if now is None else now):
        raise TokenError("expired")
    return body


def seal_token(body: dict, key_b64: str, iv: bytes | None = None) -> str:
    """시험용(Functions가 실제 발급처). iv를 주면 고정 벡터를 만든다."""
    import os
    iv = iv or os.urandom(12)
    ct = AESGCM(_key(key_b64)).encrypt(iv, json.dumps(body).encode(), None)
    return base64.urlsafe_b64encode(iv + ct).decode().rstrip("=")
