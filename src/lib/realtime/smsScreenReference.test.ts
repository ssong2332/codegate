// ⭐ 2026-11-09 라이브 재시험 17 G1(은행 사칭 · 직접 확인 고급 `bank-security-verify-scam` · 카드 없음) — 문자 시점(관찰 a 계열) 재발. 사용자 결정 "고치기".
// 넘김 전 첫 통화 1분 9초에 사기범이 "보호계좌 안내 화면에서 절차를 마저 진행해 주셔야 …"라고 했는데 문자는 넘김(2분) 뒤 종료(2분 1초)까지 0통이었다.
// 원인(코드 경로): 판정표 T(#567)는 레그를 가리지 않고 턴 끝마다 돌지만(아래 배선 단언) '링크' 낱말만 봤다 — 이 꼴은 `SMS_SENT_CLAIM` · `SMS_ARRIVED_REFERENCE` ·
// `SMS_LINK_REFERENCE` 어디에도 맞지 않아 주장 백스톱(§104)이 돌지 않았다. 주장이 없으면 fv-62q8 강제 발송은 게이트 열림(3발화) + 4발화다
// (functions `inCallSms/__tests__/transferLinkClaim.test.ts`). 그 통화의 발화 수 · 모델 도구 호출 여부는 운영 기록 없이 확인할 수 없다 — 추정: 7발화 전에 끝났고 도구는 부르지 않았다.
// 판정표 T4 ~ T8(`toolWindow.ts`) — 링크 문자 0통일 때 문자 속 화면을 가리키는 말도 "보냈다" 주장으로 본다(앱 · 통화 화면은 뺀다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  scammerClaimsSmsSent,
  scammerRefersToLink,
  scammerRefersToSmsScreen,
  scammerRefersToUnsentLink,
  smsClaimPurposes,
} from "./toolWindow.ts";

const LIVE_G1 =
  "지금 바로 조치하지 않으시면 출금이 그대로 진행될 수 있습니다. 보호계좌 안내 화면에서 절차를 마저 진행해 주셔야 계좌가 안전합니다.";

test("[T4 재현 G1] '링크' 없는 '안내 화면' 가리킴 — 종전 판정 셋 다 못 잡고, 고친 뒤 링크 문자 0통이면 주장", () => {
  assert.equal(scammerClaimsSmsSent(LIVE_G1), false, "종전 주장 판정");
  assert.equal(scammerRefersToLink(LIVE_G1), false, "종전 판정표 T(링크 낱말)");
  assert.equal(scammerRefersToSmsScreen(LIVE_G1), true);
  assert.equal(scammerRefersToUnsentLink(LIVE_G1, false), true, "T4 — 주장");
  assert.equal(scammerRefersToUnsentLink(LIVE_G1, true), false, "T2 — 링크 문자가 이미 왔으면 주장 아님");
  // 대상 목적은 넓히지 않는다 — 빈 목록 = 서버 CL2(주장으로 본다).
  assert.deepEqual(smsClaimPurposes(LIVE_G1), []);
});

test("[T4 · T5 · T6] 문자 속 화면 가리킴 — 링크 문자 0통이면 주장", () => {
  for (const said of [
    "안전계좌 화면으로 이동하셔서 금액 확인해 주세요.",
    "보호계좌 화면에서 옮기기 누르시면 됩니다.",
    "링크 화면에서 정보 입력해 주시면 됩니다.",
    "안내 화면 확인하셨으면 다음 단계 진행하겠습니다.",
    "문자 속 버튼 눌러 주시면 됩니다.",
    "문자 안의 주소로 들어가 주세요.",
    "문자에 있는 주소로 접속하셔서 진행해 주세요.",
    "문자에 나온 화면 따라서 입력해 주세요.",
    "보내 드린 화면에서 확인해 주세요.",
    "방금 발송된 페이지 열어 보시면 됩니다.",
  ]) {
    assert.equal(scammerRefersToUnsentLink(said, false), true, said);
    assert.equal(scammerRefersToUnsentLink(said, true), false, `T2 ${said}`);
  }
});

test("[T7 · T8 · T3] 오탐 막기 — 통화 화면 · 내 은행 앱 화면 · '화면'만 · 하지 말라는 꼴 · 앞으로 보내겠다는 꼴은 주장 아님", () => {
  for (const said of [
    // T8 — '화면'만(문자 속 화면 꼴이 아니다)
    "통화 화면에서 스피커 눌러 주세요.",
    "은행 앱 화면에서 이체 누르시면 됩니다.",
    "휴대폰 화면 확인해 보세요.",
    "이체 화면에서 진행해 주세요.",
    "확인 화면에서 완료 눌러 주세요.",
    "화면에서 진행해 주시면 됩니다.",
    // T7 — 같은 꼴이어도 앞에 앱 · 통화 · 전화 · 폰
    "은행 앱 안내 화면에서 확인해 보세요.",
    "통화 안내 화면에서 확인하시면 됩니다.",
    "휴대폰 안내 화면 확인해 보세요.",
    // T6 밖 — "보낸 화면"은 참가자 행동일 수 있다
    "송금 보낸 화면 캡처해 주세요.",
    // T3 — 하지 말라는 꼴 · 앞으로 보내겠다는 꼴
    "안내 화면에서 진행하지 마세요.",
    "문자 속 링크는 누르지 마세요.",
    "안내 화면을 보내 드리겠습니다.",
    "곧 안내 문자 보내 드릴게요.",
  ]) {
    assert.equal(scammerRefersToUnsentLink(said, false), false, said);
  }
});

test("[역검증] 각 행의 막는 장치를 끄면 오탐이 생긴다 — T7 앞말 제외 · T3 부정 · T8 꾸밈말 목록", () => {
  // T7을 끈 판정(앞말 무시)이라면 "은행 앱 안내 화면에서 확인"이 주장이 된다 = 이 행이 막는 것.
  const tw = readFileSync("src/lib/realtime/toolWindow.ts", "utf8");
  const screen = new RegExp(/export const SMS_SCREEN_REFERENCE =\s*\/(.+)\/;/.exec(tw)![1]);
  assert.equal(screen.test("은행 앱 안내 화면에서 확인해 보세요."), true, "꼴 자체는 맞는다 — T7이 뺀다");
  assert.equal(screen.test("안내 화면에서 진행하지 마세요."), true, "꼴 자체는 맞는다 — T3이 뺀다");
  // T8 — 꾸밈말 목록에 '이체' · '확인' · '통화'가 없다(있으면 내 은행 앱 · 통화 화면이 걸린다).
  const loose = new RegExp(screen.source.replace(String.raw`(?:안내|보호\s*계좌|안전\s*계좌|링크)`, String.raw`(?:안내|보호\s*계좌|안전\s*계좌|링크|이체|확인|통화)`));
  assert.notEqual(loose.source, screen.source, "치환 앵커가 맞아야 역검증이 의미 있다");
  assert.equal(loose.test("이체 화면에서 진행해 주세요."), true);
  assert.equal(screen.test("이체 화면에서 진행해 주세요."), false);
});

test("[배선] 넘김 전 · 뒤 모두 — 턴 끝 판정에 레그 · 넘김 조건이 없고, 말하는 도중 경로는 그대로", () => {
  const page = readFileSync("src/app/session/play/page.tsx", "utf8").replace(/\r\n/g, "\n");
  const line = '} else if (role === "scammer" && !claimRaisedMidTurn && scammerRefersToUnsentLink(text, linkSmsArrivedRef.current)) {';
  assert.equal(page.split(line).length - 1, 1, "턴 끝 판정 줄 1곳");
  const fnAt = page.indexOf("const handleTranscriptTurn = useCallback(");
  const lineAt = page.indexOf(line);
  assert.ok(fnAt > 0 && lineAt > fnAt && lineAt - fnAt < 3000, "handleTranscriptTurn 안");
  for (const word of ["leg", "Leg", "verify", "Verify", "placed", "handoff"]) assert.equal(line.includes(word), false, word);
  const session = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8");
  assert.equal(session.includes("scammerRefersToSmsScreen"), false);
});
