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

/** `export function name(` 본문(다음 `export ` 앞까지). */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name}를 찾지 못했다`);
  const next = src.indexOf("export ", start + 1);
  return src.slice(start, next < 0 ? src.length : next);
}

test("[G512 · C4-1 · Minor-2] pendingSession — set은 세션 저장소 · try/catch · peek는 읽기만(삭제 0) · clear가 지운다 · clearPendingSession도 지운다", () => {
  const src = read("src/lib/recording/pendingSession.ts");
  const setBody = fnBody(src, "setPendingEndReason");
  const peekBody = fnBody(src, "peekPendingEndReason");
  const clearHintBody = fnBody(src, "clearPendingEndReason");
  assert.ok(setBody.includes("window.sessionStorage.setItem(END_REASON_HINT_KEY") && setBody.includes("try {"), "set이 세션 저장소 · try/catch가 아니다");
  // Minor-2 — 읽기는 순수(초기화 함수에서 불려도 부수효과 0). 함수 머리 주석까지 잘리지 않게 본문의 코드만 본다.
  const peekCode = peekBody.slice(peekBody.indexOf("{"));
  assert.equal(/removeItem|setItem/.test(peekCode), false, "peek에 저장소 쓰기 · 삭제 부수효과가 있다(Minor-2)");
  assert.ok(
    peekCode.includes("readEndReasonHint(window.sessionStorage.getItem(END_REASON_HINT_KEY), sessionId)") && peekCode.includes("try {"),
    "peek이 순수 판정을 거치지 않는다",
  );
  assert.ok(clearHintBody.includes("window.sessionStorage.removeItem(END_REASON_HINT_KEY)") && clearHintBody.includes("try {"), "clear가 힌트를 지우지 않는다");
  assert.equal(src.includes("consumePendingEndReason"), false, "읽으며 지우는 옛 API가 남았다");
  const clearBody = src.slice(src.indexOf("export function clearPendingSession("));
  assert.ok(clearBody.includes("window.sessionStorage.removeItem(END_REASON_HINT_KEY)"), "clearPendingSession이 힌트를 남긴다");
  assert.equal(/localStorage/.test(setBody + peekBody + clearHintBody), false, "힌트는 탭 범위(세션 저장소)여야 한다");
});

test("[G512 · C4-2 · Minor-2] 종료 화면 — 힌트를 읽어 endSession에 싣는다 · 지우기는 endSession 성공 뒤에만 · 하드코딩 user_ended 0", () => {
  const src = read("src/app/session/end/page.tsx");
  assert.ok(src.includes("peekPendingEndReason(sessionId)"), "종료 화면이 힌트를 읽지 않는다");
  // 두 성공 경로: 마운트 effect(`clearPendingSession` — 힌트 키 포함) · 재시도(`.then` 안의 `clearPendingEndReason`).
  const effectAwait = src.indexOf("await requestEndSession(sessionId, endReason);");
  const effectClear = src.indexOf("clearPendingSession();");
  assert.ok(effectAwait >= 0 && effectClear > effectAwait, "마운트 경로의 정리가 endSession 성공 뒤가 아니다");
  const retryStart = src.indexOf("const handleRetry");
  const retryThen = src.indexOf(".then(", retryStart);
  const retryCatch = src.indexOf(".catch(", retryThen);
  const retryClear = src.indexOf("clearPendingEndReason();", retryStart);
  assert.ok(retryThen > 0 && retryClear > retryThen && retryClear < retryCatch, "재시도 경로의 힌트 삭제가 성공 콜백(.then) 안이 아니다");
  assert.equal(src.split("clearPendingEndReason(").length - 1, 1, "힌트 삭제 호출은 재시도 성공 콜백 1곳뿐이어야 한다");
  assert.ok(src.includes("endSession({ sessionId: sid, endReason })"), "endSession 요청에 힌트 값이 실리지 않는다");
  assert.equal(src.includes('endReason: "user_ended"'), false, "옛 고정값 요청이 남았다");
  // C4-2 주석 정정 — 옛 문장(C1 허용목록 뒤 거짓)이 원문 그대로 남아 있지 않다.
  assert.equal(src.includes("endSession 서버는 이미 어떤 endReason이든 멱등하게 처리한다"), false, "옛 거짓 주석이 그대로 남았다");
});

/**
 * ⭐ T192 C5(§79.9 E6) — 힌트 기록은 공통 종료 함수 `endCall`의 E6 **한 곳**으로 옮겨졌다(C4의 한도 effect 직접 기록 → 래치 사유).
 * 사유 값은 `beginCallEnding`이 래치한 `ending.reason`(`reasonForEndedBy` — limit → `limit_reached` · scammer → `scammer_ended`)이다.
 */
function endCallBody(src: string): string {
  const start = src.indexOf("const endCall = async (");
  assert.ok(start > 0, "공통 종료 함수를 찾지 못했다");
  return src.slice(start, src.indexOf("const handleEndTraining = async (", start));
}

test("[G512 · C4-3 → C5] 힌트는 공통 종료 함수 E6 한 곳 — 래치 사유 · flush 뒤 · 이동 앞 · 한도 effect는 endCall(\"limit\")", () => {
  const src = read("src/app/session/play/page.tsx");
  const calls = src.match(/setPendingEndReason\(/g) ?? [];
  assert.equal(calls.length, 1, "통화 화면의 힌트 기록이 1곳이 아니다");
  const body = endCallBody(src);
  const hintAt = body.indexOf("if (sessionId) setPendingEndReason(sessionId, ending.reason);");
  assert.ok(hintAt >= 0, "공통 종료 함수에 래치 사유 힌트가 없다");
  assert.ok(body.indexOf("await flushTranscript();") < hintAt, "힌트가 전사 flush 앞이다(§79.9 E5 → E6)");
  assert.ok(hintAt < body.lastIndexOf('router.push("/session/end")'), "힌트가 이동 뒤다 — 종료 화면이 못 읽는다");
  const effectStart = src.indexOf("autoEndedRef.current = true;");
  const effectEnd = src.indexOf("}, [callMode, phase, elapsedSec, maxSessionMs]);");
  assert.ok(effectStart > 0 && effectEnd > effectStart, "실시간 한도 effect를 찾지 못했다");
  assert.ok(src.slice(effectStart, effectEnd).includes('await endCall("limit")'), "한도 effect가 공통 종료 함수를 limit으로 부르지 않는다");
});

test("[G512 역검증] 힌트 줄을 지운 사본 · 고정값으로 되돌린 사본은 같은 판정식에 걸린다", () => {
  const play = read("src/app/session/play/page.tsx");
  const playPoisoned = play.replace("if (sessionId) setPendingEndReason(sessionId, ending.reason);", "");
  assert.notEqual(playPoisoned, play, "주입 앵커가 없다");
  assert.equal((playPoisoned.match(/setPendingEndReason\(/g) ?? []).length, 0);
  const end = read("src/app/session/end/page.tsx");
  const endPoisoned = end.replace("endSession({ sessionId: sid, endReason })", 'endSession({ sessionId: sid, endReason: "user_ended" })');
  assert.notEqual(endPoisoned, end, "주입 앵커가 없다");
  assert.equal(endPoisoned.includes('endReason: "user_ended"'), true);
});
