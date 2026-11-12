// ⭐ 2026-11-12 라이브 재시험 23 관찰 ⑫(기관 사칭 고급 `fv-c5fj` · Gemini Live) — 인증번호 문자가 사기범 요구보다 늦었다.
// 서버 원인(하한)은 functions `inCallSms/__tests__/otpClaimTiming.test.ts`(판정표 OC). 여기서는 화면 판정 OD: 실시간 경로는 "보냈다" 없이 인증번호를
// 불러 달라고만 하는 대사를 주장으로 보지 않았다(텍스트 폴백은 §132.17 O1이 이미 본다) — 같은 글자의 꼴을 화면에도 둔다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scammerClaimsSmsSent, smsClaimPurposes } from "./toolWindow.ts";

const LIVE_M3 = "네, 확인되었습니다. 그럼 지금 문자로 발송해 드린 인증 번호를 불러 주시겠습니까?";

test("[재시험 23 ⑫] 라이브 대사 = 인증번호 주장 · 대상 identity(종전에도 잡혔다 — 원인은 서버 하한)", () => {
  assert.equal(scammerClaimsSmsSent(LIVE_M3), true);
  assert.deepEqual(smsClaimPurposes(LIVE_M3), ["identity"]);
});

test("[판정 OD1] '보냈다' 없는 인증번호 요구 = 주장 · 대상 identity만", () => {
  for (const said of [
    "본인 확인 마지막 절차입니다. 인증번호 여섯 자리 불러 주십시오.",
    "방금 받으신 인증번호 알려 주시겠어요?",
    "인증 코드 말씀해 주시면 바로 처리됩니다.",
  ]) {
    assert.equal(scammerClaimsSmsSent(said), true, said);
    assert.deepEqual(smsClaimPurposes(said), ["identity"], said);
  }
  // 인증번호 요구 뒤 같은 문장의 다음 단계 말은 대상이 아니다(창 10자) — 계좌 문자를 당기지 않는다.
  assert.deepEqual(smsClaimPurposes("인증번호 불러 주시면 그다음 안전계좌로 옮기는 절차를 안내하겠습니다."), ["identity"]);
});

test("[판정 OD3] 요구 꼴이 아니면 종전", () => {
  for (const said of ["인증번호 문자 곧 보내 드릴게요.", "인증번호는 더 이상 필요 없습니다.", "곧 인증 절차를 안내하겠습니다."]) {
    assert.equal(scammerClaimsSmsSent(said), false, said);
  }
});

test("[배선] 화면 꼴이 폴백(§132.17 `SMS_OTP_DEMAND`)과 글자까지 같다 · 말하는 도중 판정도 같은 함수를 쓴다", () => {
  const client = readFileSync(new URL("./toolWindow.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../../../functions/src/roleplay/smsClaim.ts", import.meta.url), "utf8");
  const line = (src: string) => src.split(/\r?\n/).find((l) => l.startsWith("export const SMS_OTP_DEMAND = "))?.trim();
  assert.ok(line(client));
  assert.equal(line(client), line(server));
  const voice = readFileSync(new URL("./GeminiVoiceSession.tsx", import.meta.url), "utf8");
  assert.match(voice, /scammerClaimsSmsSent\(stripLeakedThought\(scammerBuffer\)\)/);
});
