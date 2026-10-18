// T192 C4 · G512 — 종료 사유 힌트(Architecture.md §79.9 E6 · 종료 화면 글머리 · §79.10 · §79.16 G512).
// ⓐ 판정(순수 함수) ⓑ 종료 화면이 힌트를 읽어 허용목록 밖이면 `user_ended`(소스 스캔) ⓒ 실시간 한도 effect가 힌트
// `limit_reached`를 남기는 지점은 1곳(소스 스캔 — 화면은 테스트에서 렌더할 수 없는 관측 불가 지점).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  END_REASON_HINT_ALLOWED,
  encodeEndReasonHint,
  readEndReasonHint,
  resolveEndReasonHint,
} from "./endReasonHint.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string): string => fs.readFileSync(path.join(REPO, rel), "utf8");

test("[G512] 허용목록 3값은 그대로 · 밖 · 없음 · 깨진 값은 user_ended", () => {
  assert.deepEqual([...END_REASON_HINT_ALLOWED], ["user_ended", "limit_reached", "scammer_ended"]);
  for (const ok of END_REASON_HINT_ALLOWED) assert.equal(resolveEndReasonHint(ok), ok);
  for (const bad of ["completed", "deceived", "LIMIT_REACHED", " limit_reached", "", null, undefined, 1, {}]) {
    assert.equal(resolveEndReasonHint(bad), "user_ended", `값=${String(bad)}`);
  }
});

test("[G512] 저장 형식 왕복 — 같은 세션이면 그 값 · 다른 세션 · 없음 · 파싱 실패 · 목록 밖은 user_ended", () => {
  const stored = encodeEndReasonHint("sess-a", "limit_reached");
  assert.equal(readEndReasonHint(stored, "sess-a"), "limit_reached");
  assert.equal(readEndReasonHint(stored, "sess-b"), "user_ended", "이전 훈련의 힌트가 다음 세션에 섞였다");
  assert.equal(readEndReasonHint(null, "sess-a"), "user_ended");
  assert.equal(readEndReasonHint("{not json", "sess-a"), "user_ended");
  assert.equal(readEndReasonHint("null", "sess-a"), "user_ended");
  assert.equal(readEndReasonHint(JSON.stringify({ sessionId: "sess-a", reason: "deceived" }), "sess-a"), "user_ended");
  assert.equal(readEndReasonHint(encodeEndReasonHint("sess-a", "scammer_ended"), "sess-a"), "scammer_ended");
});

test("[G512 · C4-1] pendingSession — set/consume는 세션 저장소 · try/catch · consume는 지운다 · clearPendingSession도 지운다", () => {
  const src = read("src/lib/recording/pendingSession.ts");
  const setBody = src.slice(src.indexOf("export function setPendingEndReason("), src.indexOf("export function consumePendingEndReason("));
  const consumeStart = src.indexOf("export function consumePendingEndReason(");
  const consumeBody = src.slice(consumeStart, src.indexOf("\n}", consumeStart));
  assert.ok(setBody.includes("window.sessionStorage.setItem(END_REASON_HINT_KEY") && setBody.includes("try {"), "set이 세션 저장소 · try/catch가 아니다");
  assert.ok(consumeBody.includes("window.sessionStorage.removeItem(END_REASON_HINT_KEY)"), "consume이 힌트를 지우지 않는다(1회성)");
  assert.ok(consumeBody.includes("readEndReasonHint(stored, sessionId)") && consumeBody.includes("try {"), "consume이 순수 판정을 거치지 않는다");
  const clearBody = src.slice(src.indexOf("export function clearPendingSession("));
  assert.ok(clearBody.includes("window.sessionStorage.removeItem(END_REASON_HINT_KEY)"), "clearPendingSession이 힌트를 남긴다");
  assert.equal(/localStorage/.test(setBody + consumeBody), false, "힌트는 탭 범위(세션 저장소)여야 한다");
});

test("[G512 · C4-2] 종료 화면 — 힌트를 읽어 endSession에 싣는다 · 하드코딩 user_ended 0", () => {
  const src = read("src/app/session/end/page.tsx");
  assert.ok(src.includes("consumePendingEndReason(sessionId)"), "종료 화면이 힌트를 읽지 않는다");
  assert.ok(src.includes("endSession({ sessionId: sid, endReason })"), "endSession 요청에 힌트 값이 실리지 않는다");
  assert.equal(src.includes('endReason: "user_ended"'), false, "옛 고정값 요청이 남았다");
  // C4-2 주석 정정 — 옛 문장(C1 허용목록 뒤 거짓)이 원문 그대로 남아 있지 않다.
  assert.equal(src.includes("endSession 서버는 이미 어떤 endReason이든 멱등하게 처리한다"), false, "옛 거짓 주석이 그대로 남았다");
});

test("[G512 · C4-3] 실시간 한도 effect에만 힌트 limit_reached — 화면 전체 setPendingEndReason 호출 1곳 · 이동 직전 · flush 뒤", () => {
  const src = read("src/app/session/play/page.tsx");
  const calls = src.match(/setPendingEndReason\(/g) ?? [];
  assert.equal(calls.length, 1, "통화 화면의 힌트 기록이 1곳이 아니다(폴백 끊기 힌트는 C5 공통 종료 함수 소관)");
  const effectStart = src.indexOf("autoEndedRef.current = true;");
  const effectEnd = src.indexOf("}, [callMode, phase, elapsedSec, maxSessionMs]);");
  assert.ok(effectStart > 0 && effectEnd > effectStart, "실시간 한도 effect를 찾지 못했다");
  const effect = src.slice(effectStart, effectEnd);
  const hintAt = effect.indexOf('setPendingEndReason(sessionId, "limit_reached")');
  assert.ok(hintAt >= 0, "한도 effect에 limit_reached 힌트가 없다");
  assert.ok(effect.indexOf("await flushTranscript();") < hintAt, "힌트가 전사 flush 앞이다(§79.9 E5 → E6)");
  assert.ok(hintAt < effect.indexOf('router.push("/session/end")'), "힌트가 이동 뒤다 — 종료 화면이 못 읽는다");
});

test("[G512 역검증] 힌트 줄을 지운 사본 · 고정값으로 되돌린 사본은 같은 판정식에 걸린다", () => {
  const play = read("src/app/session/play/page.tsx");
  const playPoisoned = play.replace('if (sessionId) setPendingEndReason(sessionId, "limit_reached");', "");
  assert.notEqual(playPoisoned, play, "주입 앵커가 없다");
  assert.equal((playPoisoned.match(/setPendingEndReason\(/g) ?? []).length, 0);
  const end = read("src/app/session/end/page.tsx");
  const endPoisoned = end.replace("endSession({ sessionId: sid, endReason })", 'endSession({ sessionId: sid, endReason: "user_ended" })');
  assert.notEqual(endPoisoned, end, "주입 앵커가 없다");
  assert.equal(endPoisoned.includes('endReason: "user_ended"'), true);
});
