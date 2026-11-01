// §142(카드사 고급 재구성 PR-2) — 다통화 변형의 통화 사이 화면 흐름 · 서버 번호부 미러 · 화면 배선을 고정한다.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DIAL_MAX_DIGITS,
  LEG_CALLBACK_DELAY_MS,
  LEG_DIAL_CONTACTS,
  backspaceDial,
  dialContactsFor,
  digitsOf,
  formatDialDigits,
  legCallerLabelOr,
  pressDialKey,
  screenAfterLegEnd,
} from "./legTransition.ts";
import { splitBodyAtDialNumber } from "../incallsms/inCallSms.ts";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

test("[§142 표] 끝난 방식 → 화면: 호 전환 = 연결 중 · 다시 걸기 = 빈 다이얼", () => {
  assert.deepEqual(screenAfterLegEnd("transfer"), { kind: "connecting", via: "transfer", label: "연결 중" });
  assert.deepEqual(screenAfterLegEnd("dial"), { kind: "dialer", digits: "" });
  assert.ok(LEG_CALLBACK_DELAY_MS >= 10_000, "D4 — 상대가 너무 빨리 다시 걸면 참가자가 스스로 확인할 틈이 없다");
});

test("[§142 키패드] 숫자 · * · #만 · 자리 수 상한 · 지우기 · 하이픈 번호 → 숫자", () => {
  assert.equal(pressDialKey("02", "0"), "020");
  assert.equal(pressDialKey("02", "a"), "02");
  assert.equal(pressDialKey("1".repeat(DIAL_MAX_DIGITS), "2"), "1".repeat(DIAL_MAX_DIGITS));
  assert.equal(backspaceDial("0207"), "020");
  assert.equal(backspaceDial(""), "");
  assert.equal(digitsOf("02-0762-5513"), "0207625513");
});

test("[§142 표기] 02 지역번호 · 휴대전화 하이픈 표기(표시 전용)", () => {
  assert.equal(formatDialDigits("0207625513"), "02-0762-5513");
  assert.equal(formatDialDigits("01007942261"), "010-0794-2261");
  assert.equal(formatDialDigits("021"), "02-1");
  assert.equal(formatDialDigits("*#"), "*#");
});

test("[§142 라벨] 다통화 통화 라벨이 있으면 이긴다 · 부재 = 종전 라벨", () => {
  assert.equal(legCallerLabelOr("02-0762-5513", "010-0794-2261"), "02-0762-5513");
  assert.equal(legCallerLabelOr(null, "010-0794-2261"), "010-0794-2261");
  assert.equal(legCallerLabelOr(undefined, "x"), "x");
});

test("[§142 문자] 안내 번호는 본문 첫 1회만 누를 수 있다 · 본문에 없으면 null(번호를 새로 그리지 않는다)", () => {
  const body = "반송 접수는 고객센터 02-0762-5513으로 문의하세요.";
  assert.deepEqual(splitBodyAtDialNumber(body, "02-0762-5513"), {
    before: "반송 접수는 고객센터 ",
    number: "02-0762-5513",
    after: "으로 문의하세요.",
  });
  assert.equal(splitBodyAtDialNumber(body, "02-0700-3324"), null);
  assert.equal(splitBodyAtDialNumber(body, undefined), null);
});

test("[§142 미러] 연락처 = 서버 번호부의 연락처 항목(번호 · 가상 기관명) · 실제 번호 0", () => {
  const server = read("functions/src/scenarios/dialDirectory.ts");
  const names = read("functions/src/scenarios/fictionalNames.ts");
  const contacts = dialContactsFor("card-company-impersonation");
  assert.equal(contacts.length, 2);
  for (const contact of contacts) {
    assert.ok(server.includes(`"${contact.number}"`), `서버 번호부에 ${contact.number}가 없다`);
  }
  assert.ok(names.includes('cardCompany: "윤슬카드"') && names.includes('supervisor: "금융감독기관"'));
  assert.ok(server.includes("`${CARD} 고객센터`") && server.includes("`${SUPERVISOR} 대표번호`"));
  assert.deepEqual(
    contacts.map((c) => c.label),
    ["윤슬카드 고객센터", "금융감독기관 대표번호"],
  );
  for (const list of Object.values(LEG_DIAL_CONTACTS)) {
    for (const { number } of list) {
      assert.ok(!["1332", "1301", "112"].includes(digitsOf(number)), "실제 기관 번호 금지");
    }
  }
  assert.deepEqual(dialContactsFor("unknown"), []);
});

test("[§142 배선] 통화 화면 — 끊기 legEnd는 종료 래치 대신 통화 사이로 · 다음 통화는 startCallLeg · 실시간 새 연결은 오프닝부터", () => {
  const page = read("src/app/session/play/page.tsx");
  assert.ok(page.includes("const handleScammerHangupAccepted = (legEnd?: CallLegEnd) => {"));
  assert.ok(page.includes("void beginLegTransition(legEnd);"));
  assert.ok(page.includes("const result = await startCallLeg({ sessionId, action, ...(dialed ? { dialed } : {}) });"));
  assert.ok(page.includes("void realtime.startLeg(sessionId);"));
  assert.ok(page.includes("resumeTurn={legOpening ? null : openingTurnFor({"));
  // 통화 사이의 Live close는 서버 close가 아니다(종료 셸 0).
  assert.ok(page.includes("if (legSwitchingRef.current) return;\n        await endCall(\"remote\");"));
  // 전사는 다음 통화를 열기 전에 제출한다(서버가 레그 시작 발화 수를 messages로 센다 — §142.8).
  const begin = page.slice(page.indexOf("const beginLegTransition = async"), page.indexOf("const dialLeg = () => {"));
  assert.ok(begin.indexOf("await flushTranscript();") >= 0 && begin.indexOf("await flushTranscript();") < begin.indexOf("setLegScreen(screenAfterLegEnd"));
  // 폴백 응답의 통화 끝도 같은 흐름.
  assert.ok(page.includes("if (result.legEnd) {"));
  const session = read("src/lib/realtime/GeminiVoiceSession.tsx");
  assert.ok(session.includes("handlersRef.current.onScammerHangupAccepted(result.legEnd);"));
  const hook = read("src/lib/realtime/useRealtimeCall.ts");
  assert.ok(hook.includes("const suspendForLeg = useCallback(() => {"));
  assert.ok(hook.includes("const startLeg = useCallback(async (sessionId: string) => {"));
});

test("[§142 화면] 다이얼 화면 — 실제 전화 발신 0(tel: 링크 0) · 세션 중 '모의' 표식 0", () => {
  const code = read("src/components/CallLegScreens.tsx").replace(/^\/\/.*$/gm, "");
  assert.ok(!code.includes("tel:"));
  assert.ok(!/모의|훈련용/.test(code));
});

test("[§142 PR-4 R2] 시작 문자 세션 — 벨 0 · 전화 앱 다이얼로 시작 · 첫 다이얼 탭에서 오디오 준비 · 첫 통화는 받기 경로", () => {
  const page = read("src/app/session/play/page.tsx");
  assert.ok(page.includes('setSmsStart(data.startSurface === "sms");'), "서버 값(세션 문서)으로만 정한다");
  assert.ok(page.includes("    if (smsStart) return;"), "시작 문자 세션은 벨이 울리지 않는다");
  assert.ok(page.includes('setLegScreen({ kind: "dialer", digits: "" });\n  }, [smsStart, pageState, phase]);'));
  const dial = page.slice(page.indexOf("const dialLeg = () => {"), page.indexOf("const answerLegCallback"));
  assert.ok(dial.indexOf("primeSmsStartDial();") >= 0 && dial.indexOf("primeSmsStartDial();") < dial.indexOf("openNextLeg("), "탭 안에서 동기로 준비한 뒤 서버에 묻는다");
  const connect = page.slice(page.indexOf("const connectLeg = "), page.indexOf("const openNextLeg = "));
  assert.ok(connect.includes("if (smsStart && !answerHandledRef.current) {\n      handleAnswer();"));
});
