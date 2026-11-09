// ⭐ 2026-11-09 라이브 재시험 15 E2 · 16 F1(은행 사칭 · 직접 확인 고급 `bank-security-verify-scam` fv-62q8) — 문자 시점(관찰 a 계열) 재발. 사용자 결정 "고치기".
// '확인 부서로 연결'로 넘겨받은 담당자가 "링크 접속하시면 …"(1분 33초) · "링크에서 안내하는 절차에 따라 …"(2분 20초)라고 했는데 보호계좌 문자는 2분 33초 · 2분 36초에 왔다.
// 원인(코드 경로): ① 이 두 꼴은 화면 주장 판정(`SMS_SENT_CLAIM` · `SMS_ARRIVED_REFERENCE`)에 맞지 않아 주장 백스톱(§104)이 돌지 않았다(아래 재현).
// ② 넘김(확인 오퍼 전환 완료) 뒤 서버 백스톱은 넛지를 건너뛰고(`deliverInCallSms` nudge 분기) fv-62q8은 기본 간격 2라 강제 발송이 게이트 열림 + 4발화다
//    (functions `inCallSms/__tests__/transferLinkClaim.test.ts`). 넘겨받은 담당자가 도구를 불렀는지는 운영 기록 없이 확인할 수 없다 — 추정: 부르지 않았다
//    (게이트가 열린 뒤 불렀다면 그 자리에서 도착한다).
// 판정표 T(`toolWindow.ts`) — 링크 있는 문자가 아직 0통일 때 링크를 가리키는 말을 "보냈다" 주장으로 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scammerClaimsSmsSent, scammerRefersToLink, scammerRefersToUnsentLink, smsClaimPurposes } from "./toolWindow.ts";

const LIVE_E2 = "네, 고객님. 문자로 안내된 보호계좌 링크 접속하시면 바로 옮기실 수 있습니다.";
const LIVE_F1 = "정상 절차가 맞습니다. 링크에서 안내하는 절차에 따라 진행해 주시면 됩니다.";

test("[T 재현] 넘겨받은 담당자의 링크 가리킴 — 종전 주장 판정은 못 잡고, 고친 뒤 링크 문자 0통이면 주장(T1)", () => {
  for (const said of [LIVE_E2, LIVE_F1]) {
    assert.equal(scammerClaimsSmsSent(said), false, `종전 판정이 놓친 꼴: ${said}`);
    assert.equal(scammerRefersToUnsentLink(said, false), true, said);
  }
  // 대상 목적 — 둘레에 보호계좌가 있으면 transfer · 없으면 판정 불가(서버 CL2 = 주장으로 본다).
  assert.deepEqual(smsClaimPurposes(LIVE_E2), ["transfer"]);
  assert.deepEqual(smsClaimPurposes(LIVE_F1), []);
});

test("[T2] 링크 있는 문자가 이미 왔으면 같은 말도 주장이 아니다(다음 문자를 당기지 않는다)", () => {
  for (const said of [LIVE_E2, LIVE_F1]) assert.equal(scammerRefersToUnsentLink(said, true), false, said);
});

test("[T3] 하지 말라는 꼴 · 앞으로 보내겠다는 꼴 · 링크 아닌 말은 종전(주장 아님)", () => {
  for (const said of [
    "모르는 링크는 누르지 마세요.",
    "출처 모를 링크에 접속하지 마시고요.",
    "링크를 보내 드리겠습니다.",
    "보호계좌로 옮기셔야 합니다.",
  ]) {
    assert.equal(scammerRefersToLink(said), false, said);
  }
  for (const said of ["링크로 들어가셔서 이체 누르시면 됩니다", "문자 속 링크 눌러 주세요", "링크 클릭하시면 화면이 나옵니다"]) {
    assert.equal(scammerRefersToLink(said), true, said);
  }
});

test("[T 배선] 턴 끝 판정 — 종전 주장 줄 뒤 else if · 링크 문자 도착 ref는 문자 구독 값에서", () => {
  const page = readFileSync("src/app/session/play/page.tsx", "utf8").replace(/\r\n/g, "\n");
  const claimAt = page.indexOf('if (role === "scammer" && !claimRaisedMidTurn && scammerClaimsSmsSent(text)) {');
  const linkAt = page.indexOf('} else if (role === "scammer" && !claimRaisedMidTurn && scammerRefersToUnsentLink(text, linkSmsArrivedRef.current)) {');
  assert.ok(claimAt > 0 && linkAt > claimAt, "종전 주장 판정 바로 뒤");
  const block = page.slice(linkAt, linkAt + 600);
  assert.ok(block.includes("smsClaimPendingRef.current = true;"));
  assert.ok(block.includes("setSmsClaimTick((n) => n + 1);"));
  assert.ok(block.includes("smsClaimPurposesRef.current = smsClaimPurposes(text);"));
  assert.ok(
    page.includes("linkSmsArrivedRef.current = inCallSms.some((sms) => sms.fakeLandingId !== undefined || sms.linkDisplayText !== undefined);"),
  );
  // 말하는 도중 경로(GeminiVoiceSession)는 바꾸지 않는다 — 도착한 문자 목록을 모른다.
  const session = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8");
  assert.equal(session.includes("scammerRefersToUnsentLink"), false);
});
