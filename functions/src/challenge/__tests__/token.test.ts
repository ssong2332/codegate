import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateShareToken, hashToken } from "../token";

test("generateShareToken(): 호출마다 서로 다른 토큰을 만든다(충돌 회피, §14.4 256-bit)", () => {
  const a = generateShareToken();
  const b = generateShareToken();
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.tokenHash, b.tokenHash);
});

test("generateShareToken(): tokenHash는 반환된 token의 SHA-256(hex)과 일치한다", () => {
  const { token, tokenHash } = generateShareToken();
  const expected = createHash("sha256").update(token).digest("hex");
  assert.equal(tokenHash, expected);
});

test("hashToken(): 같은 입력이면 항상 같은 해시(결정적) — T37이 조회 시 재사용 가능해야 한다", () => {
  const token = "fixed-test-token-value";
  assert.equal(hashToken(token), hashToken(token));
});

test("hashToken(): 평문 토큰과 해시는 다른 문자열이다(평문 미저장 원칙, §14.4)", () => {
  const { token, tokenHash } = generateShareToken();
  assert.notEqual(token, tokenHash);
  // base64url(32바이트) ≈43자 vs sha256 hex=64자 — 형태 자체도 다르다.
  assert.equal(tokenHash.length, 64);
});
