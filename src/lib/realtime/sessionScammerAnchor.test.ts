// ⭐ 2026-11-08(#538 발견 1 · 사용자 결정 "고치기") — 실시간 모델 도구(문자 `send_prepared_sms` · 확인 오퍼 announce)가 서버에 넘기는
// 사기범 전사 수(= 앵커 입력)는 **세션 누적값**이다. 종전에는 Live 컴포넌트(`GeminiVoiceSession`) 안 지역 사본이라 새 연결마다 0부터 셌다.
//
// 판정표(그 연결에서 도구가 넘기는 값):
// | # | 연결 상황 | 종전(모델 도구) | 고친 뒤 | 백스톱 · 화면 경로(종전) |
// |---|---|---|---|---|
// | K1 | 세션 첫 연결 | 이 연결 flush 수 = 세션 수 | 세션 누적 | 세션 누적 |
// | K2 | 다통화 다음 통화(`startLeg` — 기관 고급 통화 2 · 3 · 카드사 R1 통화 2 ~ 4) | 0부터 | 세션 누적 | 세션 누적 |
// | K3 | 같은 인물 재연결(참가자가 끊은 뒤 다시 걸려 옴 · `startLeg`) | 0부터 | 세션 누적 | 세션 누적 |
// | K4 | 연결 끊김 다시 잇기(`reconnect` — 화면 꺼짐 · 10분 이어받기) | 0부터 | 세션 누적 | 세션 누적 |
// | K5 | 페이지 새로고침 복원 | 부모 계수도 0(전사 복원만) | 바뀌지 않음 — 범위 밖 | 같음 |
// 추가(2026-11-08 라이브 재시험 7 · 통화 1개 · 재연결 없음에서도 문자가 한 대사 앞에 놓였다) — 요청은 사기범이 턴을 말하는 **도중**에 온다:
// | K6 | 이 턴에 이미 말한 사기범 대사가 있다(flush 전 · 거른 뒤 비어 있지 않음) — 모델 도구 · 말하는 도중 "보냈다" 주장 백스톱 | 그 턴 빠짐 | 세션 누적 + 1 | — |
// | K7 | 이 턴에 말한 대사 없음(턴 시작 직후 도구 · 발화 뒤 백스톱) | 같음 | 세션 누적 그대로 | 같음 |
// 리포트에서 그 값이 어느 턴에 찍히는지(1 → turnIndex 1 · 12 → 23 재현)는 functions `report/__tests__/multiLegSmsAnchor.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countTranscriptFlush, INITIAL_TURN_COUNTERS, type TurnCounters } from "./contextInjection.ts";
import { claimedScammerTranscriptTurns } from "./toolTurnTranscript.ts";

const page = readFileSync("src/app/session/play/page.tsx", "utf8");
const session = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8");
const hook = readFileSync("src/lib/realtime/useRealtimeCall.ts", "utf8");

function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

/** 도구 두 경로가 세션 누적 getter를 쓰는가 — 정상 소스와 오염 사본에 **같은 검사식**을 쓴다(G139). 위반 목록을 돌려준다. */
function toolAnchorViolations(source: string): string[] {
  const code = codeOnly(source);
  const violations: string[] = [];
  if (/let modelToolScammerTurns|modelToolScammerTurns \+= 1/.test(code)) violations.push("지역 사본");
  if (!/const sessionScammerTurns = \(\) =>\s*claimedScammerTranscriptTurns\(handlersRef\.current\.getSessionScammerTurns\(\), guardScammer\(scammerBuffer\) !== ""\);/.test(code)) {
    violations.push("getter 정의");
  }
  const sms = code.slice(code.indexOf('if (kind === "send_prepared_sms") {'));
  if (!/scammerTranscriptTurns: sessionScammerTurns\(\),/.test(sms.slice(0, sms.indexOf("return failureResponse();")))) violations.push("문자 앵커");
  const offer = code.slice(code.indexOf("const result = await deliverVerifyOffer({"));
  if (!/scammerTurns: sessionScammerTurns\(\),/.test(offer.slice(0, 400))) violations.push("확인 오퍼 앵커");
  return violations;
}

test("[K2 · K3 · K4 전제] Live 컴포넌트는 연결마다 다시 마운트된다 — 다음 통화(startLeg) · 다시 잇기(reconnect)가 연결 번호를 올린다", () => {
  assert.ok(/<GeminiVoiceSession[\s\S]{0,200}key=\{realtime\.connectionSeq\}/.test(page), "page — key = connectionSeq");
  for (const fn of ["const reconnect = useCallback(", "const startLeg = useCallback("]) {
    const at = hook.indexOf(fn);
    assert.ok(at > 0, fn);
    const next = hook.indexOf("useCallback(", at + fn.length);
    assert.ok(hook.slice(at, next > 0 ? next : undefined).includes("setConnectionSeq((n) => n + 1);"), `${fn} — 연결 번호 증가`);
  }
});

test("[K1 ~ K4] 실시간 모델 도구 두 경로(문자 · 확인 오퍼)가 세션 누적 getter를 넘긴다 — 지역 사본 0", () => {
  assert.deepEqual(toolAnchorViolations(session), []);
  // getter 원천 = 부모 계수(백스톱 질의 · 화면 경로와 같은 값).
  const pageCode = codeOnly(page);
  assert.ok(pageCode.includes("const getSessionScammerTurns = useCallback(() => turnCountersRef.current.scammerTranscriptTurns, []);"));
  assert.ok(pageCode.includes("getSessionScammerTurns={getSessionScammerTurns}"));
  assert.ok(
    pageCode.includes("scammerTranscriptTurns: claimedScammerTranscriptTurns(counters.scammerTranscriptTurns, smsClaimRaisedMidTurnRef.current),"),
    "백스톱 질의도 같은 계수(말하는 도중 주장이면 그 턴 +1 — K6)",
  );
  assert.ok(pageCode.includes("scammerTurnsRef.current = turnCountersRef.current.scammerTranscriptTurns;"), "화면 경로도 같은 계수");
  // 부모 계수는 flush 한 곳에서만 바뀐다(연결 · 통화가 바뀌어도 되돌리지 않는다).
  assert.equal((pageCode.match(/turnCountersRef\.current = /g) ?? []).length, 1);
  assert.ok(pageCode.includes("turnCountersRef.current = countTranscriptFlush(turnCountersRef.current, role, text);"));
});

test("[K1 ~ K4 계수] 연결이 바뀌어도 부모 계수는 이어지고 · 종전 지역 사본은 0으로 돌아갔다", () => {
  // 연결별 사기범 전사 flush(빈 전사 포함 — 세지 않는다). K1 첫 연결 → K2 다음 통화 → K3 같은 인물 재연결 → K4 다시 잇기.
  const connections: { row: string; flushes: string[] }[] = [
    { row: "K1", flushes: ["a", "b", "", "c"] },
    { row: "K2", flushes: ["d", "e"] },
    { row: "K3", flushes: ["f"] },
    { row: "K4", flushes: [" ", "g", "h"] },
  ];
  let parent: TurnCounters = INITIAL_TURN_COUNTERS;
  const seen: { row: string; old: number; fixed: number }[] = [];
  for (const { row, flushes } of connections) {
    let local = 0; // 종전 — 재마운트마다 0
    for (const text of flushes) {
      parent = countTranscriptFlush(parent, "scammer", text);
      if (text.trim()) local += 1;
    }
    seen.push({ row, old: local, fixed: parent.scammerTranscriptTurns });
  }
  assert.deepEqual(seen, [
    { row: "K1", old: 3, fixed: 3 },
    { row: "K2", old: 2, fixed: 5 },
    { row: "K3", old: 1, fixed: 6 },
    { row: "K4", old: 2, fixed: 8 },
  ]);
});

test("[역검증] 종전 배선(지역 사본)으로 되돌린 오염 사본은 같은 검사식이 잡는다", () => {
  const poisoned = session
    .replace(/const sessionScammerTurns = \(\) =>\s*claimedScammerTranscriptTurns\([^;]*\);/, "let modelToolScammerTurns = 0;")
    .replace("scammerTranscriptTurns: sessionScammerTurns(),", "scammerTranscriptTurns: modelToolScammerTurns,");
  assert.notEqual(poisoned, session, "치환이 일어났다");
  assert.deepEqual(toolAnchorViolations(poisoned), ["지역 사본", "getter 정의", "문자 앵커"]);
});

test("[K6 · K7] 말하는 도중 요청이면 이미 말한 그 턴을 더한다 — 재시험 7 재현(⑥ 도중 문자 · ⑧ 뒤 도구)", () => {
  assert.equal(claimedScammerTranscriptTurns(5, true), 6, "K6");
  assert.equal(claimedScammerTranscriptTurns(5, false), 5, "K7");
  // 재시험 7 사기범 대사 ①~⑨(세션 생성 오프닝 문서는 서버 앵커 +1이 맡는다). 앵커 N = N번째 사기범 문서(오프닝 포함) → 리플레이는 그 대사 뒤에 문자를 놓는다.
  const docs = ["오프닝(낭독 안 함 · 숨김)", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];
  const placedAfter = (claimed: number) => docs[1 + claimed - 1]; // 서버 `realtimeAnchorScammerTurn` = 1 + 값 → docs[앵커 − 1]
  // 문자 1 — ①~⑤ flush 뒤 ⑥을 말하는 도중("발송해 드리겠습니다") 도구.
  assert.equal(placedAfter(claimedScammerTranscriptTurns(5, false)), "⑤", "종전 = ⑤ 뒤(라이브 관찰)");
  assert.equal(placedAfter(claimedScammerTranscriptTurns(5, true)), "⑥", "고친 뒤 = ⑥ 뒤");
  // 문자 2 — ①~⑦ flush 뒤 ⑧을 말한 직후(아직 flush 전) 도구 → 도구 뒤 ⑨.
  assert.equal(placedAfter(claimedScammerTranscriptTurns(7, false)), "⑦", "종전 = ⑦ 뒤(라이브 관찰)");
  assert.equal(placedAfter(claimedScammerTranscriptTurns(7, true)), "⑧", "고친 뒤 = ⑧ 뒤(⑨ 바로 앞)");
});

test("[K6 배선] 두 경로가 '이 턴에 말한 대사'를 같은 거름 식으로 본다 · 역검증", () => {
  const code = codeOnly(session);
  // 모델 도구 — flush와 같은 `guardScammer`(사고 문장 · 금지 표식만 남은 버퍼 = 말한 대사 없음).
  assert.ok(code.includes("const guardScammer = (raw: string) => guardLiveScammerLine(stripLeakedThought(raw), userTextsForGuard()).trim();"));
  // 말하는 도중 주장 — 부모 표식은 주장 때 켜지고 그 턴 flush에서 꺼진다(그 사이 백스톱만 +1).
  const pageCode = codeOnly(page);
  assert.ok(pageCode.includes("smsClaimRaisedMidTurnRef.current = true;"));
  assert.ok(pageCode.includes('if (role === "scammer") smsClaimRaisedMidTurnRef.current = false;'));
  // 역검증 — +1 판정을 빼면(종전 K1 동작) 같은 검사식이 잡는다.
  const poisoned = session.replace(', guardScammer(scammerBuffer) !== "")', ", false)");
  assert.notEqual(poisoned, session);
  assert.deepEqual(toolAnchorViolations(poisoned), ["getter 정의"]);
});

