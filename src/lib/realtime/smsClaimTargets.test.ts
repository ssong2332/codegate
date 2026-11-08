// ⭐ 2026-11-08 라이브 재시험 8 · 9(기관 사칭 고급 · Gemini Live) — 화면 쪽 "보냈다" 주장 판정. 사용자 결정 A1 · B1.
// 서버 판정(판정표 F · CL)과 재현은 functions `inCallSms/__tests__/smsTimingOrder.test.ts`.
//
// a — 재시험 8 사기범 대사 "문자로 간 인증번호 여섯 자리를 불러주시겠습니까?"는 주장 정규식(`SMS_SENT_CLAIM`)에 걸리지 않았다(주장 백스톱 · 정정 0).
//     ⇒ `SMS_ARRIVED_REFERENCE`(화면 전용 · 대상이 인증번호 · 계좌인 꼴만).
// b — 재시험 9 사기범 대사 "보내 드린 인증번호를 불러 달라"가 주장으로 잡혀 다음 문자(안전계좌)를 당겼다.
//     ⇒ 주장이 가리키는 문자 목적(`smsClaimPurposes`)을 함께 보내 서버가 "이미 받은 문자를 가리킨 말"을 걸러 낸다(판정표 CL3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeClaimPurposes, scammerClaimsSmsSent, smsClaimPurposes, SMS_SENT_CLAIM } from "./toolWindow.ts";

test("[A1 재현 a] '문자로 간 인증번호'가 주장으로 잡힌다(종전 정규식은 못 잡음) · 앞으로 보내겠다는 말은 아니다", () => {
  const said = "본인 확인 마지막 절차입니다. 문자로 간 인증번호 여섯 자리를 불러주시겠습니까?";
  assert.equal(SMS_SENT_CLAIM.test(said), false, "종전 정규식은 이 꼴을 놓쳤다");
  assert.equal(scammerClaimsSmsSent(said), true);
  assert.deepEqual(smsClaimPurposes(said), ["identity"]);
  for (const ok of ["문자에 온 인증번호 불러 주세요", "문자로 도착한 계좌로 보내 주시면 됩니다", "문자에 받으신 인증 코드 여섯 자리요"]) {
    assert.equal(scammerClaimsSmsSent(ok), true, ok);
  }
  // 앞으로 보내겠다 · 대상 없는 가리킴은 주장이 아니다(종전 그대로).
  for (const no of ["인증번호 안내 문자 하나 보내드리겠습니다", "곧 문자 발송해 드리겠습니다", "문자로 온 안내 확인해 보세요"]) {
    assert.equal(scammerClaimsSmsSent(no), false, no);
  }
});

test("[B1 판정표 CL 입력] 주장 대상 목적 — 주장 꼴 둘레(같은 문장 · 앞 15자 ~ 뒤 10자)만 본다", () => {
  const cases: Array<[string, string[]]> = [
    // 재시험 9 꼴 — 이미 받은 인증번호를 가리킴.
    ["방금 문자로 보내드린 인증번호 여섯 자리 불러 주십시오.", ["identity"]],
    // 같은 문장 뒤쪽의 다음 단계 말(안전계좌)은 대상으로 세지 않는다.
    ["보내드린 인증번호 불러 주시면 바로 안전계좌로 옮겨 드리겠습니다.", ["identity"]],
    ["안전계좌 안내 문자를 보내드렸습니다. 확인해 주세요.", ["transfer"]],
    ["출금 예약 안내 문자 보내드렸습니다", ["transfer"]],
    ["보안 앱 설치 링크 문자로 보내드렸습니다", ["link"]],
    // 다른 문장의 말은 섞이지 않는다.
    ["계좌는 나중에 알려 드립니다. 문자로 보내드렸습니다.", []],
    // 링크 · 주소 · 안내만 = 판정 불가(빈 목록 → 서버 종전 주장 CL2).
    ["문자로 보내드린 링크 눌러 보세요", []],
    ["주장 아닌 말 — 인증번호 불러 주세요", []],
  ];
  for (const [said, expected] of cases) assert.deepEqual(smsClaimPurposes(said), expected, said);
});

test("[B1] 대기 중 주장 목록 합치기 — 표 순서 · 중복 0", () => {
  assert.deepEqual(mergeClaimPurposes([], ["identity"]), ["identity"]);
  assert.deepEqual(mergeClaimPurposes(["transfer"], ["identity", "transfer"]), ["identity", "transfer"]);
  assert.deepEqual(mergeClaimPurposes(["link"], []), ["link"]);
});

test("[A1 · B1 배선] 말하는 도중 · 턴 끝 주장 모두 대상 목록을 싣고, 주장이 내려가면 비운다", () => {
  const session = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8");
  assert.ok(session.includes("onScammerSmsClaim?.(claimedUserTurns(), smsClaimPurposes(stripLeakedThought(scammerBuffer)));"));
  const page = readFileSync("src/app/session/play/page.tsx", "utf8").replace(/\r\n/g, "\n");
  assert.ok(page.includes("smsClaimPurposesRef.current = mergeClaimPurposes(smsClaimPurposesRef.current, smsClaimPurposes(text));"), "턴 끝 주장");
  assert.ok(page.includes("smsClaimPurposesRef.current = mergeClaimPurposes(smsClaimPurposesRef.current, purposes);"), "말하는 도중 주장");
  assert.ok(page.includes("{ smsClaimedPurposes: [...smsClaimPurposesRef.current] }"), "백스톱 질의에 싣는다");
  assert.ok(page.includes("if (!smsClaimPendingRef.current) smsClaimPurposesRef.current = [];"), "주장이 내려가면 비운다");
  // 화면 계약 = 목적 enum 목록만(문장 원문 0).
  const types = readFileSync("src/lib/api/types.ts", "utf8");
  assert.ok(types.includes('smsClaimedPurposes?: ("identity" | "transfer" | "link")[];'));
});
