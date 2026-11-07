// 2026-11-07 Edge 시험(docs/research/edge-scenario-test-2026-11-07.md) — 리포트가 실제로 일어난 일만 보여 주게 한 서버 쪽 수정 고정.
// 판 1 · 3(인증번호 · 비밀번호 순간 라벨) · 판 2 · 17 · 18 · 20 · 22(시도된 수법 누락) · 판 5 · 6(대처법 문구) · 판 19(이체 화면 사실) · 판 27(공식 번호 확인).
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, pickCorrectAction, type AnalysisMessage } from "../analyzeConversation";
import { resolveAttemptedTacticLabels, resolveSecretCodeLabel } from "../attemptedTactics";
import { applyMockScreens } from "../mockScreenTimeline";
import { resolveOfficialCheck } from "../generateReportCore";
import { FLOW_VARIANTS, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { MOCK_SCREENS } from "../../scenarios/mockScreens";
import { CARD_GENUINE_CENTER_NUMBER_ID, CARD_FAKE_CALLBACK_NUMBER_ID } from "../../scenarios/dialDirectory";
import { NEUTRAL_SCAMMER_LINES } from "./neutralScammerLines";

const LIST = [
  "권위 암시 — '서울중앙지검 수사관입니다'",
  "신원정보 직접 요구 — '성함과 생년월일 말씀해 주십시오'",
  "인증번호 요구 — '방금 간 인증번호 여섯 자리 불러 주십시오'",
  "계좌 비밀번호 요구 — '계좌 비밀번호 네 자리 말씀해 주세요'",
  "확인 시도 무력화 — '저희 쪽으로만 확인 가능합니다'",
  "전화 끊음 저지 — '끊으시면 불이익이 있습니다'",
  "부인 시 명의 도용 암시 — '명의가 도용된 겁니다'",
];

const t0 = 1_000_000;
const msg = (turnIndex: number, role: "scammer" | "user", textMasked: string, sec: number): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: t0 + sec * 1000,
});

test("[판 2 · 17 · 18 · 20 · 22] 바꿔 말한 확인 차단 · 끊음 저지 · 명의 도용 · 인증번호 · 비밀번호 요구가 목록 라벨로 잡힌다(A1~A5)", () => {
  const cases: [string, string[]][] = [
    ["저희가 지금 처리 중이라 고객님께서 직접 확인하시는 것은 어려우십니다.", ["확인 시도 무력화"]],
    ["임의로 번호를 찾지 마시고 문자로 드린 링크에서 확인하세요.", ["확인 시도 무력화"]],
    ["지금 밖이라 영상통화는 안 돼. 시끄러워서.", ["확인 시도 무력화"]],
    ["확인하시는 순간 일이 복잡해집니다.", ["확인 시도 무력화"]],
    ["통화 끊지 마시고 그대로 계세요.", ["전화 끊음 저지"]],
    ["고객님 명의가 도용되어 대포통장이 개설됐습니다.", ["부인 시 명의 도용 암시"]],
    ["문자로 간 인증번호를 불러 주십시오.", ["인증번호 요구"]],
    ["계좌 비밀번호 네 자리를 말씀해 주세요.", ["계좌 비밀번호 요구"]],
  ];
  for (const [line, expected] of cases) {
    assert.deepEqual(resolveAttemptedTacticLabels(line, LIST), expected, line);
  }
});

test("[A 표 — 새 라벨 0] 목록에 맞는 라벨이 없으면 아무것도 더하지 않는다", () => {
  const noBlock = ["권위 암시 — '수사관입니다'", "신원정보 직접 요구 — '성함 말씀해 주십시오'"];
  assert.deepEqual(resolveAttemptedTacticLabels("직접 확인하시는 것은 어렵습니다. 끊지 마세요. 인증번호 불러 주세요.", noBlock), []);
});

test("[A 표 — 오탐 0] 중립 대사 × 전 시나리오(전 변형)에서 라벨을 만들지 않는다", () => {
  const lists = [
    ...Object.values(SCENARIO_PROMPTS).map((p) => p.weakenedTactics),
    ...FLOW_VARIANTS.map((v) => resolveSessionScenarioPrompt(v.scenarioId, v.variantId)?.weakenedTactics ?? []),
  ];
  const neutral = [...NEUTRAL_SCAMMER_LINES, "통화가 조금 끊기네요, 다시 말씀해 주시겠어요?", "확인해 보시고 연락 주세요."];
  for (const tactics of lists) {
    for (const line of neutral) assert.deepEqual(resolveAttemptedTacticLabels(line, tactics), [], line);
  }
});

test("[판 1] 인증번호를 불러 준 순간 = '인증번호 요구'(목록에 있을 때) · 시도된 수법에도 오른다", () => {
  const messages = [
    msg(0, "scammer", "본인 확인 마지막 절차입니다. 방금 문자로 간 인증번호 여섯 자리 불러 주십시오.", 10),
    msg(1, "user", "128139요", 20),
  ];
  const result = analyzeConversation(messages, t0, LIST);
  assert.equal(result.deceivedMoments.length, 1);
  assert.equal(result.deceivedMoments[0]!.tactic, "인증번호 요구");
  assert.ok(result.tacticsUsed.includes("인증번호 요구"));
});

test("[판 3] 비밀번호를 말한 순간 = 비밀번호 라벨(목록에 있을 때) · 없으면 종전 라벨", () => {
  const messages = [msg(0, "scammer", "보호 조치를 위해 계좌 비밀번호 네 자리를 불러 주세요.", 10), msg(1, "user", "1234요", 20)];
  assert.equal(analyzeConversation(messages, t0, LIST).deceivedMoments[0]?.tactic, "계좌 비밀번호 요구");
  const noPassword = LIST.filter((t) => !t.startsWith("계좌 비밀번호"));
  assert.equal(resolveSecretCodeLabel(messages[0]!.textMasked, noPassword), undefined);
});

test("[판 정 무변경] A 표는 속은 순간 개수 · turnIndex를 바꾸지 않는다(거절한 세션 = 속음 0)", () => {
  const messages = [
    msg(0, "scammer", "직접 확인하시는 것은 어렵습니다. 끊지 마세요.", 10),
    msg(1, "user", "공식 번호로 직접 전화해 볼게요.", 20),
  ];
  const result = analyzeConversation(messages, t0, LIST);
  assert.equal(result.wasDeceived, false);
  assert.deepEqual(result.deceivedMoments, []);
  assert.ok(result.tacticsUsed.includes("확인 시도 무력화"));
  assert.ok(result.tacticsUsed.includes("전화 끊음 저지"));
});

test("[판 5 · 6] 대처법 문구 — '본인확인'은 확인 차단 문구가 아니고, 회사 '권위·정당성 포장'에 '경찰·기관' 문구를 쓰지 않는다", () => {
  assert.doesNotMatch(pickCorrectAction("본인확인 빙자 정보 수집"), /확인 전화를 막으려/);
  assert.match(pickCorrectAction("확인 시도 무력화"), /확인 전화를 막으려/);
  assert.doesNotMatch(pickCorrectAction("권위·정당성 포장"), /경찰·기관/);
  assert.match(pickCorrectAction("권위 암시"), /경찰·기관/);
});

test("[판 19] 이체 화면 항목에 화면 종류 · 제출 사실 · 금액 비교가 실린다(판정 · 승격은 종전대로)", () => {
  const catalog = MOCK_SCREENS["messenger-child-impersonation-kakao"] ?? [];
  const messages = [
    { role: "scammer" as const, turnIndex: 0, createdAtMs: t0 + 10_000, landingIds: ["child-bank-transfer"] },
    { role: "user" as const, turnIndex: 1, createdAtMs: t0 + 20_000 },
  ];
  const result = applyMockScreens(
    [{ landingId: "child-bank-transfer", kind: "credential-form", shownAtMs: t0 + 15_000, submittedAtMs: t0 + 30_000, amountComparison: "less" }],
    [],
    messages,
    t0,
    catalog,
  );
  assert.equal(result.mockScreenTimeline[0]?.bankTransfer, true);
  assert.equal(result.mockScreenTimeline[0]?.submitted, true);
  assert.equal(result.mockScreenTimeline[0]?.amountComparison, "less");
  assert.equal(result.deceivedMoments.length, 1, "제출 승격은 종전 그대로");
  const notSubmitted = applyMockScreens(
    [{ landingId: "child-insurance-install", kind: "app-install", shownAtMs: t0 + 15_000 }],
    [],
    messages,
    t0,
    catalog,
  );
  assert.equal("bankTransfer" in notSubmitted.mockScreenTimeline[0]!, false, "그 밖 화면 = 키 0(무백필)");
  assert.equal("submitted" in notSubmitted.mockScreenTimeline[0]!, false);
});

test("[판 27] 진짜 기관 번호로 직접 건 기록 → officialCheck · 가짜 번호 · 부재는 없음", () => {
  assert.deepEqual(resolveOfficialCheck("card-company-impersonation", CARD_GENUINE_CENTER_NUMBER_ID), {
    label: "윤슬카드 고객센터",
    number: "02-0715-8800",
  });
  assert.equal(resolveOfficialCheck("card-company-impersonation", CARD_FAKE_CALLBACK_NUMBER_ID), undefined);
  assert.equal(resolveOfficialCheck("card-company-impersonation", undefined), undefined);
  assert.equal(resolveOfficialCheck("other-scenario", CARD_GENUINE_CENTER_NUMBER_ID), undefined);
});

// ── 판 30 · 31(메인 추가 자료) — 질문 · 되묻기 · 거절 = 응함 아님(C6a~C6c) ─────────────────────────────
const SUBSIDY = SCENARIO_PROMPTS["messenger-subsidy-smishing-sms"]!.weakenedTactics;
const CARD = SCENARIO_PROMPTS["card-company-impersonation"]!.weakenedTactics;
const judge = (tactics: string[], scammer: string, user: string) =>
  analyzeConversation([msg(0, "scammer", scammer, 10), msg(1, "user", user, 20)], t0, tactics).deceivedMoments.length;

test("[판 31] C6a — '아니요. 안 보낼게요.'는 응함이 아니다(부정문 안의 '보낼게')", () => {
  assert.equal(judge(SUBSIDY, "지금 바로 입금해 주세요.", "아니요. 안 보낼게요."), 0);
  assert.equal(judge(SUBSIDY, "지금 바로 입금해 주세요.", "그건 못 드려요. 안 할게요."), 0);
  assert.equal(judge(SUBSIDY, "지금 바로 입금해 주세요.", "알겠어요. 보낼게요."), 1, "긍정 약속은 종전대로 속음");
});

test("[판 31] C6b — '왜 …?' 따지는 질문은 응함이 아니다(실제 제공은 그대로 속음)", () => {
  assert.equal(
    judge(SUBSIDY, "확인금 3만 원을 먼저 이체해 주셔야 지원금이 지급됩니다.", "근데 지원금 받는데 왜 돈을 먼저 보내야 해요? 이체할 화면도 없는데요."),
    0,
  );
  assert.equal(judge(SUBSIDY, "계좌번호 알려 주세요.", "왜 필요한지 모르겠지만요? [계좌]"), 1, "H1 실제 제공은 질문과 무관하게 속음");
});

test("[판 30 — 결정 대기] 요구 뒤 일반 방법 질문은 종전대로 속음(§129 C4 후반 사용자 결정 유지) · 보낼 곳을 묻는 질문도 속음", () => {
  assert.equal(judge(CARD, "카드 도용 여부 확인을 위해 카드번호를 불러 주셔야 합니다.", "그럼 제가 뭘 해야 하나요?"), 1);
  assert.equal(judge(SUBSIDY, "확인금 3만 원을 이체해 주셔야 합니다.", "어디로 보내면 돼요?"), 1);
});

test("[판 32 · 31 원문 3쌍] 거절 · 따지는 질문은 속은 순간이 아니다", () => {
  const CHILD = SCENARIO_PROMPTS["messenger-child-impersonation-kakao"]!.weakenedTactics;
  const pairs: [string[], string, string][] = [
    [CHILD, "아빠한테는 말하지 마ㅠㅠ 200만 원만 지금 바로 보내줘.", "안 보낼게. 네 진짜 번호로 통화되면 그때 얘기하자."],
    [SUBSIDY, "1만 원을 먼저 보내셔야 지급이 됩니다. 이체 메뉴를 찾아 주시고 입금해 주세요.", "근데 지원금 받는데 왜 돈을 먼저 보내야 해요? 이체할 화면도 없는데요."],
    [SUBSIDY, "센터에 직접 알아보시면 지원 대상에서 제외되실 수 있습니다.", "아니요. 안 보낼게요."],
  ];
  for (const [tactics, scammer, user] of pairs) assert.equal(judge(tactics, scammer, user), 0, user);
});
