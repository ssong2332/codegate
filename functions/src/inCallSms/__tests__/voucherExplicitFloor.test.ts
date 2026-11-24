// 2026-11-24 브라우저 A 라이브 A7(검찰 고급 상품권 핀 번호형 fv-v2mk · 세션 f726a6ca) — 사기범이 "문자로 보내 드린 구매 링크로 진행해 주십시오"라고 했을 때
// 구매 문자가 아직 없었다(참가자 "아직 안 왔어요" 뒤 도착). 서버 로그: 발화 4에 모델 도구 `transfer` = `too_early` → 발화 5에 `delivered`.
// 원인: `PROSECUTION_VOUCHER_SMS.notBeforeUserTurns = 5`에 판정표 F1의 명시 하한(`explicitNotBeforeUserTurns`)이 없어 F2(종전 5)가 모델 도구에도 걸렸다
// — 기관 고급 인증번호 문자(재시험 8 · 사용자 결정 A1)와 같은 꼴. 판정표 F 그대로: 명시 요청(도구 · "보냈다" 주장)만 3, 자동 백스톱은 5 그대로.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDeclaredSms, resolveSmsGate, type DeliveredSmsRecord } from "../smsGate";

const declared = () => resolveDeclaredSms("prosecution-cooperation-call", "fv-v2mk", { relay: undefined }).declared;
// 사건 조회 문자는 발화 2에 이미 왔다(A7 — 문자함에 사건조회 1건).
const delivered: DeliveredSmsRecord[] = [{ smsId: "prosecution-case-link", userTurnsAtArrival: 2, landingSubmitted: true }];

test("[VF 재현] 발화 4 모델 도구 구매 문자 — 명시 요청이면 allowed(종전 too_early)", () => {
  const gate = resolveSmsGate({ purpose: "transfer", declared: declared(), delivered, userTurns: 4, explicit: true, explicitFloor: true, modelTool: true });
  assert.equal(gate.status, "allowed", JSON.stringify(gate));
});

test("[VF F3] 자동 백스톱(명시 아님)은 하한 5 그대로", () => {
  assert.equal(resolveSmsGate({ purpose: "transfer", declared: declared(), delivered, userTurns: 4 }).status, "too_early");
  assert.equal(resolveSmsGate({ purpose: "transfer", declared: declared(), delivered, userTurns: 5 }).status, "allowed");
});

test("[VF] 명시 하한 3 — 발화 2는 여전히 이르다", () => {
  assert.equal(
    resolveSmsGate({ purpose: "transfer", declared: declared(), delivered, userTurns: 2, explicit: true, explicitFloor: true }).status,
    "too_early",
  );
});
