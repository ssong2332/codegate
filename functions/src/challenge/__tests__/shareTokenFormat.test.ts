// SEC-01(외부 보안 점검 2026-11-01) — 공개 챌린지 토큰 형식 검사.
//
// 운영에서 숫자 · 객체 토큰을 보내면 hashToken()의 createHash().update()가 던져 500 INTERNAL이 났다.
// 핸들러는 Firestore · 시크릿에 의존하는 onCall이라 직접 실행하지 않고(freeTextLengthGates.test.ts와 같은
// 판단), 순수 판정 함수 + 소스 스캔(검사가 hashToken 호출보다 앞인가)으로 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { generateShareToken, hashToken, isWellFormedShareToken } from "../token";

const USER_ACCESS_SRC = path.resolve(__dirname, "../../../src/challenge/userAccess.ts");

test("[형식] generateShareToken()이 만든 토큰은 100회 모두 통과한다(길이 43)", () => {
  for (let i = 0; i < 100; i++) {
    const { token } = generateShareToken();
    assert.equal(token.length, 43);
    assert.equal(isWellFormedShareToken(token), true, token);
  }
});

test("[형식] 문자열이 아니면 거절 — 운영 500 재현 입력(숫자 · 객체 · 배열 · null)", () => {
  for (const bad of [123, 0, {}, { a: 1 }, ["a"], null, undefined, true]) {
    assert.equal(isWellFormedShareToken(bad), false, String(JSON.stringify(bad)));
  }
  // 거절하지 않으면 실제로 던지는 입력임을 함께 고정한다(검사의 존재 이유).
  assert.throws(() => hashToken(123 as unknown as string));
});

test("[형식] 길이 · 문자 집합이 다르면 거절", () => {
  const ok = generateShareToken().token;
  assert.equal(isWellFormedShareToken(""), false);
  assert.equal(isWellFormedShareToken(ok.slice(0, 42)), false);
  assert.equal(isWellFormedShareToken(ok + "A"), false);
  assert.equal(isWellFormedShareToken(ok.slice(0, 42) + "="), false, "패딩 문자");
  assert.equal(isWellFormedShareToken(ok.slice(0, 42) + "+"), false, "표준 base64 문자");
  assert.equal(isWellFormedShareToken(ok.slice(0, 42) + "/"), false, "표준 base64 문자");
  assert.equal(isWellFormedShareToken(` ${ok.slice(1)}`), false, "공백");
  assert.equal(isWellFormedShareToken(`${ok}\n`), false, "끝 줄바꿈");
  assert.equal(isWellFormedShareToken("가".repeat(43)), false, "비 ASCII");
});

test("[소스 스캔] 토큰을 받는 4개 핸들러 모두 형식 검사가 hashToken() 호출보다 앞에 있다", () => {
  const src = readFileSync(USER_ACCESS_SRC, "utf8");
  const handlers = ["getChallengeLanding", "consentChallenge", "reportChallenge", "setChallengeResultSharing"];
  for (const name of handlers) {
    const start = src.indexOf(`export const ${name} =`);
    assert.ok(start > -1, `${name} 정의가 없다`);
    const hashIdx = src.indexOf("hashToken(token)", start);
    const checkIdx = src.indexOf("isWellFormedShareToken(token)", start);
    assert.ok(checkIdx > -1 && hashIdx > -1, `${name}: 검사 또는 해시 호출이 없다`);
    assert.ok(checkIdx < hashIdx, `${name}: 형식 검사가 hashToken() 뒤에 있다`);
    const next = handlers
      .map((h) => src.indexOf(`export const ${h} =`, start + 1))
      .filter((i) => i > start)
      .sort((a, b) => a - b)[0];
    if (next !== undefined) assert.ok(hashIdx < next, `${name}: 자기 hashToken() 호출을 찾지 못했다`);
  }
  // 존재 여부만 보던 옛 검사가 남아 있으면 안 된다.
  assert.doesNotMatch(src, /if \(!token\b/);
  // hashToken(token) 호출 수 = 핸들러 수 — 새 핸들러가 검사 없이 추가되면 여기서 걸린다.
  assert.equal(src.split("hashToken(token)").length - 1, handlers.length);
});

test("[소스 스캔] 형식 위반은 invalid-argument로 거절한다", () => {
  const src = readFileSync(USER_ACCESS_SRC, "utf8");
  const re = /if \(!isWellFormedShareToken\(token\)[^\n]*\{\r?\n\s*throw new HttpsError\("invalid-argument"/g;
  assert.equal(src.match(re)?.length, 4);
});
