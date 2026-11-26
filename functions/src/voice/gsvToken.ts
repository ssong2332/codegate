// 복제 목소리 합성 서비스 토큰(Architecture.md §143.8) — Modal 쪽 `services/gsv/gsvtoken.py`가 같은 키로 연다.
// 형식: base64url(iv 12바이트 | AES-256-GCM 암호문 | 태그 16바이트), 평문 = JSON. 브라우저는 내용(참조 서명 URL)을 읽지 못한다.
import { createCipheriv, randomBytes } from "node:crypto";

export type GsvTokenKind = "prepare" | "warm" | "synth";

export function sealGsvToken(body: { kind: GsvTokenKind; exp: number } & Record<string, unknown>, keyB64: string, iv?: Buffer): string {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("GSV_TOKEN_KEY must be 32 bytes (base64)");
  const nonce = iv ?? randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(JSON.stringify(body), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, ct, cipher.getAuthTag()]).toString("base64url");
}

/** 만료 = 초 단위 유닉스 시각(Python `time.time()`과 같은 단위). */
export function gsvExp(nowMs: number, ttlMs: number): number {
  return Math.floor((nowMs + ttlMs) / 1000);
}
