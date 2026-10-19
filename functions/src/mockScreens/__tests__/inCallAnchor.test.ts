// T194-c-1 G606 · G584(docs/Architecture.md §84.5.3 · §84.15.3 · ADR-0022 Addendum 2) — 통화 중 문자로 연 설치 화면(Q2)의 기록:
// callMode 필수 · 문자 미도착 거부 · 앵커 = 그 문자 문서의 anchorScammerTurn(응낙 시점 클라 계수 0).
// ⚠️ onCall 핸들러는 직접 실행하지 않는다(저장소 관례) — 판정은 순수 함수(`../inCallAnchor`)로, 배선 · 순서는 소스 스캔으로 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { HttpsError } from "firebase-functions/v2/https";
import { anchorFromInCallSmsDoc, findDeclaredSmsIdForLanding, readMockScreenCallMode } from "../inCallAnchor";
import type { RecordMockScreenEventRequest } from "../types";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const code = (e: unknown) => (e instanceof HttpsError ? e.code : String(e));

test("[T194-c-1 G606 · G584] callMode — realtime · fallback만 통과, 부재 · 값 밖은 invalid-argument", () => {
  assert.equal(readMockScreenCallMode("realtime"), "realtime");
  assert.equal(readMockScreenCallMode("fallback"), "fallback");
  for (const bad of [undefined, null, "", "live", 1]) {
    assert.throws(() => readMockScreenCallMode(bad), (e: unknown) => code(e) === "invalid-argument", String(bad));
  }
});

test("[T194-c-1 G606] 그 랜딩을 여는 선언 문자 — 자가 고급 Q2 3 단위는 설치 문자 · 챌린지 단위(base 변형) · 변형 없음 · 다른 랜딩은 없음", () => {
  const rows: [string, string, string | undefined, string, string | undefined][] = [
    ["card-delivery 자가", "card-delivery-call", "fv-tvnj", "card-delivery-app-install", "card-delivery-app-link"],
    ["card-company 자가", "card-company-impersonation", "fv-x7ue", "card-guard-app-install", "card-guard-app-link"],
    ["loan 자가", "loan-refinance-scam", "fv-m3hd", "loan-check-app-install", "loan-check-app-link"],
    ["card-company 챌린지(fv-akj5)", "card-company-impersonation", "fv-akj5", "card-guard-app-install", undefined],
    ["loan 챌린지(fv-6s5p)", "loan-refinance-scam", "fv-6s5p", "loan-check-app-install", undefined],
    ["card-delivery 변형 없음", "card-delivery-call", undefined, "card-delivery-app-install", undefined],
  ];
  for (const [label, scenarioId, variantId, landingId, expected] of rows) {
    assert.equal(findDeclaredSmsIdForLanding(scenarioId, variantId, landingId), expected, label);
  }
});

test("[T194-c-1 G606 · R-c] 앵커 = 문자 문서 값 그대로 — 요청에 scammerTurns 99를 실어도 무관(타입에 그 필드 없음) · 미도착은 failed-precondition", (t) => {
  // R-c ① — 클라가 scammerTurns: 99를 실은 요청. 타입에 그 필드가 없어 이 객체는 RecordMockScreenEventRequest로 컴파일되지 않는다
  // (`@ts-expect-error`가 그 사실을 컴파일 시점에 고정한다 — 필드가 생기면 이 줄이 빌드를 깬다).
  // @ts-expect-error — scammerTurns는 요청 계약에 없다(Q-X5)
  const poisonedRequest: RecordMockScreenEventRequest = { sessionId: "s", landingId: "card-guard-app-install", event: "consented", callMode: "realtime", scammerTurns: 99 };
  // 서버 판정은 요청 값을 입력으로 받지 않는다 — 앵커는 문자 문서(도착 때 서버가 계산한 값)에서만 온다.
  const anchor = anchorFromInCallSmsDoc({ exists: true, anchorScammerTurn: 3 });
  t.diagnostic(`[G606 · R-c] 요청 scammerTurns=${(poisonedRequest as unknown as { scammerTurns: number }).scammerTurns} → 문서 앵커=${anchor}(문자 문서 값)`);
  assert.equal(anchor, 3);
  assert.notEqual(anchor, 99);
  // R-c ② — 설치 문자 미도착 상태의 응낙.
  assert.throws(() => anchorFromInCallSmsDoc({ exists: false }), (e: unknown) => code(e) === "failed-precondition");
  // 문자 문서에 앵커가 없거나 정수가 아니면 미해결(undefined) — 리포트가 승격하지 않는다(조용한 임의 값 0).
  assert.equal(anchorFromInCallSmsDoc({ exists: true }), undefined);
  assert.equal(anchorFromInCallSmsDoc({ exists: true, anchorScammerTurn: "3" }), undefined);
  assert.equal(anchorFromInCallSmsDoc({ exists: true, anchorScammerTurn: -1 }), undefined);
  // 요청 타입 소스에도 scammerTurns가 없다(§84.15.3 "요청 증분 = callMode만").
  const types = read("mockScreens/types.ts").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/scammerTurns/.test(types), false);
  assert.match(types, /callMode\?: "realtime" \| "fallback";/);
});

test("[T194-c-1 G606 배선] recordMockScreenEvent — 통화 중 문자 표면 항목만 ⑥(callMode · 도착 get · 앵커 복사)을 타고, 도달 술어 뒤 · 기록 앞이다(소스 스캔)", () => {
  const src = read("mockScreens/index.ts").replace(/\/\/[^\n]*/g, "");
  const reach = src.indexOf("isMockScreenReachable(session, item)");
  const sixth = src.indexOf('item.entrySurface === "in-call-sms" && item.kind === "app-install"\n      ? await readInCallLandingAnchor(sessionId, session, landingId, request.data?.callMode)');
  const write = src.indexOf('.collection("mockScreens")');
  assert.ok(reach > 0 && sixth > reach && write > sixth, "⑥이 도달 술어 뒤 · 기록 앞이 아니다");
  assert.match(src, /\.\.\.\(inCallAnchor !== undefined \? \{ anchorScammerTurn: inCallAnchor \} : \{\}\),/);
  assert.match(src, /\.collection\("inCallSms"\)\.doc\(smsId\)\.get\(\)/);
  assert.match(src, /anchorFromInCallSmsDoc\(\{ exists: smsSnap\.exists, anchorScammerTurn: smsSnap\.get\("anchorScammerTurn"\) \}\)/);
});
