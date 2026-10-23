// §101(2026-10-21 사용자 요청 — 검찰 수사 협조 × 고급) — *"코인 전환 단계별로 안내하는 게 사용자가 실제로 해야 하는 것처럼 들리는데 … 문자로 보내서
// 웹사이트에 접속해서 진행하는 거로 가자"*. 새 변형 fv-h3vn이 그 요구를 데이터 · 조립 산출물 · 리포트 판정 층에서 닫는지 고정한다
// (모델 행동 자체는 실 키 텍스트 프로브 — docs/Architecture.md §101).
//
// | # | 무엇을 보나 | 기대 |
// |---|---|---|
// | S1 | 배정 풀 · 은퇴 | 고급 자가 풀 = [fv-h3vn] · fv-c8wq는 은퇴(내용 무변경 — 보관 지갑 문자 · 원래 페르소나) |
// | S2 | 통화 문면 | 거래소 계좌 이동 · 코인 구매 · 지갑 번호 입력 같은 절차 설명 0 · "화면 안내대로만" · "어느 화면까지" 재촉 있음 |
// | S3 | 문자 · 사이트 | 사건 조회(link) + 자산 검수(transfer) · 사이트 = 본인 확인 → 검수 대상 → 금액 → 이체 확인(화면 4) · 단계 문면 3 |
// | S4 | 무해성 | 실존 거래소 · 코인 이름 0 · 지갑 주소 형식 0 · 8자리+ 숫자 0 · 거래소 가입 · 구매 조작 문구 0 |
// | S5 | 리포트 판정(§101 판정표) | 가장 깊은 단계 1건 · 단계별 문면 · 열고 닫음 = 0건 · 한 화면 폼은 단계 시각을 보지 않는다 |
// | S6 | 기록 계약 | recordInCallSmsEvent가 단계 3값을 받고 문서 필드로 옮긴다 · 랜딩 없는 문서는 거절 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { findFlowVariant, listFlowVariants, resolveSessionScenarioPrompt } from "../flowVariants";
import { assignablePool } from "../variantPool";
import { findInCallSmsItem } from "../inCallSms";
import { findMockScreenItem, LANDING_PROGRESS_STEPS, MOCK_SCREENS } from "../mockScreens";
import { sessionReachableLandingIds } from "../reachability";
import { extractTacticLabel } from "../tacticFlavor";
import { CASE_RECORD_NAMES, PROSECUTION_WALLET_PERSONA } from "../prosecutionCooperationCall.prompt";
import { maskFictionalInstitutionNames } from "./harmlessnessPatterns";
import { resolveTacticCategory } from "../../report/tacticCategory";
import { promoteSmsLandingSubmits, type SmsTimelineMessage, type SmsTimelineSource } from "../../report/smsTimeline";

const PROS = "prosecution-cooperation-call";
const SITE = "asset-check-site";

test("[§101 S1] 검찰 고급 새 세션 풀 = fv-h3vn · fv-c8wq는 은퇴(내용 무변경 — 보관 지갑 문자 · 원래 페르소나)", () => {
  assert.deepEqual(listFlowVariants(PROS, "advanced").map((v) => v.variantId), ["fv-h3vn"]);
  assert.deepEqual(assignablePool(PROS, "advanced").map((v) => v.variantId), ["fv-h3vn"]);
  const old = findFlowVariant("fv-c8wq")!;
  assert.equal(old.retired, true);
  assert.deepEqual(old.sms.map((s) => s.smsId), ["prosecution-case-link", "prosecution-wallet-link"]);
  assert.equal(old.legs[0]!.personaPrompt, PROSECUTION_WALLET_PERSONA);
  assert.deepEqual(sessionReachableLandingIds(PROS, "fv-c8wq"), ["asset-check-wallet", "case-record-view"]);
});

/** 통화에서 말로 하면 "실제로 따라 해야 하는 절차"처럼 들리는 문구(사용자 지적) — 새 변형의 페르소나 · 수법 · 단계 어디에도 없어야 한다. */
const PROCEDURE_PHRASES = [
  "OO거래소 계좌로 옮",
  "거래소에서 코인으로",
  "코인으로 바꾸신다",
  "지갑 번호와 금액을 넣어",
  "전송 누르시면",
  "앱에서 바꾸시면",
  "한 단계씩 지시",
  "한 단계씩 짚어",
];

test("[§101 S2] 통화 문면 — 절차 설명 0 · 사이트로 보내기 · 단계 확인 재촉", () => {
  const prompt = resolveSessionScenarioPrompt(PROS, "fv-h3vn")!;
  const stages = findFlowVariant("fv-h3vn")!.stages.map((s) => s.summary);
  const text = [prompt.personaPrompt, ...prompt.weakenedTactics, ...stages].join("\n");
  assert.deepEqual(PROCEDURE_PHRASES.filter((p) => text.includes(p)), [], "절차 설명 문구");
  // 대조군 — 옛 변형 fv-c8wq에는 같은 검사식이 실제로 걸린다(검사식 공회전 방지).
  const old = resolveSessionScenarioPrompt(PROS, "fv-c8wq")!;
  const oldText = [old.personaPrompt, ...old.weakenedTactics, ...findFlowVariant("fv-c8wq")!.stages.map((s) => s.summary)].join("\n");
  assert.ok(PROCEDURE_PHRASES.filter((p) => oldText.includes(p)).length >= 3, "대조군(fv-c8wq)에서 절차 문구가 잡혀야 한다");

  assert.ok(prompt.personaPrompt.includes("\"화면 안내대로만 진행하시면 됩니다\"라고만 한다"));
  assert.ok(prompt.personaPrompt.includes("\"지금 어느 화면까지 하셨어요?\""));
  assert.ok(prompt.personaPrompt.includes("조작 방법을 설명하지 않는다"));
  assert.ok(prompt.personaPrompt.includes("나중에 연락드리겠습니다\"처럼 요구 없이 통화를 정리하는 말로 끝내지 않는다"));
  const labels = prompt.weakenedTactics.map(extractTacticLabel);
  for (const label of ["코인 구매·송금 요구", "거래 은행·자산 정보 수집", "창구 확인 차단", "검수 사이트 링크 진행 유도", "진행 상황 확인 재촉", "이체 뒤 추가 송금 요구", "거부 시 위협 격상"]) {
    assert.equal(labels.filter((l) => l === label).length, 1, label);
  }
  assert.equal(labels.includes("보관 지갑 송금 화면 유도"), false, "옛 지갑 번호 입력 화면 유도는 빠졌다");
  // 리포트 분류가 other로 떨어지지 않는다(새 라벨 2종).
  assert.equal(resolveTacticCategory("검수 사이트 링크 진행 유도"), "link_or_install");
  assert.notEqual(resolveTacticCategory("진행 상황 확인 재촉"), "other");
});

test("[§101 S3] 문자 2건(사건 조회 link · 자산 검수 transfer) · 사이트 = 화면 4(본인 확인 → 검수 대상 → 금액 → 이체 확인) · 단계 문면 3", () => {
  const v = findFlowVariant("fv-h3vn")!;
  assert.deepEqual(v.sms.map((s) => [s.purpose, s.smsId, s.required]), [
    ["link", "prosecution-case-link", true],
    ["transfer", "prosecution-asset-site-link", true],
  ]);
  const sms = findInCallSmsItem(PROS, "prosecution-asset-site-link")!;
  assert.equal(sms.fakeLandingId, SITE);
  assert.equal(sms.body.includes("KW-"), false, "지갑 번호는 문자가 아니라 사이트 마지막 화면에만 있다");
  const screen = findMockScreenItem(PROS, SITE)!;
  assert.equal(screen.kind, "credential-form", "새 kind 0");
  assert.equal(screen.entrySurface, "in-call-sms");
  assert.deepEqual(screen.fields, ["성명", "생년월일"]);
  assert.equal(screen.submitLabel, "본인 확인하기");
  assert.deepEqual(
    screen.stepScreens!.map((s) => s.actionLabel),
    ["안전 자산(코인)으로 전환하기", "다음", "보관 지갑으로 이체하기"],
  );
  assert.ok(screen.stepScreens![0]!.items!.every((line) => line.endsWith("검수 대상")), "둘째 화면 = 검수 대상 자산 표시");
  assert.deepEqual(screen.stepScreens![1]!.fields, ["전환 금액"]);
  assert.ok(screen.stepScreens![2]!.bodyLines.some((line) => line.includes("KW-7Q2X-4471")));
  assert.deepEqual(Object.keys(screen.progressMoments!).sort(), [...LANDING_PROGRESS_STEPS].sort());
  assert.deepEqual(sessionReachableLandingIds(PROS, "fv-h3vn"), [SITE, "case-record-view"]);
  // 여러 화면 사이트는 이 항목 하나뿐이다(다른 랜딩은 종전 한 화면 폼).
  assert.deepEqual(
    Object.values(MOCK_SCREENS).flat().filter((i) => i.stepScreens || i.progressMoments).map((i) => i.landingId),
    [SITE],
  );
});

test("[§101 S4] 무해성 — 실존 거래소 · 코인 이름 0 · 지갑 주소 형식 0 · 8자리 이상 숫자 0 · 거래소 조작 문구 0", () => {
  const prompt = resolveSessionScenarioPrompt(PROS, "fv-h3vn")!;
  const sms = findInCallSmsItem(PROS, "prosecution-asset-site-link")!;
  const screen = findMockScreenItem(PROS, SITE)!;
  const text = [
    prompt.personaPrompt,
    ...prompt.weakenedTactics,
    ...findFlowVariant("fv-h3vn")!.stages.map((s) => s.summary),
    sms.body,
    sms.announceInstruction,
    sms.linkAddress ?? "",
    screen.headline,
    ...screen.bodyLines,
    ...(screen.fields ?? []),
    screen.correctAction,
    screen.momentTactic,
    ...screen.stepScreens!.flatMap((s) => [s.headline, ...s.bodyLines, ...(s.items ?? []), ...(s.fields ?? []), s.actionLabel]),
    ...Object.values(screen.progressMoments!).flatMap((m) => [m.momentTactic, m.correctAction]),
  ].join("\n");
  const REAL = ["업비트", "빗썸", "코인원", "코빗", "고팍스", "바이낸스", "비트코인", "이더리움", "테더", "리플", "USDT", "BTC", "ETH", "메타마스크", "애니데스크", "팀뷰어"];
  assert.deepEqual(REAL.filter((w) => text.includes(w)), []);
  assert.equal(/0x[0-9a-fA-F]{6,}|bc1[0-9a-z]{6,}|\b[13][a-km-zA-HJ-NP-Z1-9]{25,}\b|[A-Za-z0-9]{20,}/.test(text), false, "지갑 주소 형식");
  assert.equal(/\d{8,}/.test(text), false, "8자리 이상 연속 숫자");
  // 사이트는 실제 절차 매뉴얼이 아니다 — 거래소 가입 · 원화 입금 · 매수 · 출금 주소 같은 실제 조작 단계가 화면에 없다.
  const screenText = [screen.headline, ...screen.bodyLines, ...screen.stepScreens!.flatMap((s) => [s.headline, ...s.bodyLines, ...(s.items ?? []), s.actionLabel])].join("\n");
  assert.deepEqual(["회원가입", "원화 입금", "매수", "출금 주소", "주소 복사", "거래소 앱"].filter((w) => screenText.includes(w)), []);
});

const msg = (role: "scammer" | "user", turnIndex: number): SmsTimelineMessage => ({ role, turnIndex, createdAtMs: 1000 * (turnIndex + 1) });
const MESSAGES = [0, 1, 2, 3, 4, 5].map((i) => msg(i % 2 === 0 ? "scammer" : "user", i));
const siteDoc = (extra: Partial<SmsTimelineSource>): SmsTimelineSource => ({
  smsId: "prosecution-asset-site-link",
  kind: "account",
  senderLabel: "0000-0000 (자산검수 안내)",
  body: "본문",
  anchorScammerTurn: 2,
  arrivedAtMs: 1,
  linkTappedAtMs: 2,
  fakeLandingId: SITE,
  ...extra,
});

test("[§101 S5] 판정표 — 가장 깊은 단계 1건 · 단계별 문면 · 열고 닫음 = 0건(좋은 대응)", (t) => {
  const catalog = MOCK_SCREENS[PROS]!;
  const screen = findMockScreenItem(PROS, SITE)!;
  const moments = screen.progressMoments!;
  const rows: [string, Partial<SmsTimelineSource>, string | undefined][] = [
    ["링크만 열고 닫음", {}, undefined],
    ["① 본인 확인", { landingIdentityAtMs: 3 }, moments.identity.momentTactic],
    ["② 코인 전환", { landingIdentityAtMs: 3, landingConvertedAtMs: 4 }, moments.converted.momentTactic],
    ["③ 금액 입력", { landingIdentityAtMs: 3, landingConvertedAtMs: 4, landingAmountAtMs: 5 }, moments.amount.momentTactic],
    ["④ 이체 확인", { landingIdentityAtMs: 3, landingConvertedAtMs: 4, landingAmountAtMs: 5, landingSubmittedAtMs: 6 }, screen.momentTactic],
    ["기록 일부 유실(② 없이 ③)", { landingAmountAtMs: 5 }, moments.amount.momentTactic],
  ];
  for (const [label, extra, expected] of rows) {
    const result = promoteSmsLandingSubmits([siteDoc(extra)], [], MESSAGES, 0, catalog);
    t.diagnostic(`[§101 S5] ${label} → ${result.deceivedMoments.map((m) => m.tactic).join(" | ") || "승격 0"}`);
    assert.equal(result.promotedCount, expected ? 1 : 0, label);
    if (expected) {
      const [moment] = result.deceivedMoments;
      assert.equal(moment!.tactic, expected, label);
      assert.equal(moment!.landingId, SITE, "T129 (b) 키");
      assert.equal(moment!.turnIndex, 2, "앵커 = 문자 도착 턴(종전 규칙)");
    }
  }
  // 이체 전에 멈춘 단계 문면은 멈춘 것을 잘한 판단으로 말한다 · 끝까지 간 문면은 신고처를 말한다.
  for (const step of LANDING_PROGRESS_STEPS) assert.ok(moments[step].correctAction.includes("멈춘 것은 잘한 판단입니다"), step);
  assert.ok(screen.correctAction.includes("112") && screen.correctAction.includes("1332"));
  // 분류 — 본인 확인 단계는 개인정보, 전환 · 금액 · 이체는 송금 요구로 묶인다(새 카테고리 0).
  assert.equal(resolveTacticCategory(moments.identity.momentTactic), "personal_info_demand");
  for (const tactic of [moments.converted.momentTactic, moments.amount.momentTactic, screen.momentTactic]) {
    assert.equal(resolveTacticCategory(tactic), "payment_demand", tactic);
  }
  // 한 화면 폼(단계 문면 없음)은 단계 시각을 보지 않는다 — 종전 그대로 제출만 승격.
  const wallet = siteDoc({ smsId: "prosecution-wallet-link", fakeLandingId: "asset-check-wallet", landingIdentityAtMs: 3, landingAmountAtMs: 5 });
  assert.equal(promoteSmsLandingSubmits([wallet], [], MESSAGES, 0, catalog).promotedCount, 0);
  assert.equal(promoteSmsLandingSubmits([{ ...wallet, landingSubmittedAtMs: 6 }], [], MESSAGES, 0, catalog).promotedCount, 1);
});

test("[§101 S6] 기록 계약 — recordInCallSmsEvent가 단계 3값을 받아 문서 시각 필드로 옮긴다 · 랜딩 없는 문서는 거절 · 입력값 필드 0", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/inCallSms/index.ts"), "utf8");
  for (const [event, field] of [
    ["landing_identity", "landingIdentityAt"],
    ["landing_converted", "landingConvertedAt"],
    ["landing_amount", "landingAmountAt"],
    ["landing_submitted", "landingSubmittedAt"],
  ]) {
    assert.ok(src.includes(`${event}: "${field}"`), `${event} → ${field}`);
  }
  assert.ok(src.includes('if (event !== "opened" && event !== "link_tapped" && !snap.get("fakeLandingId"))'), "랜딩 단계 이벤트는 랜딩 문서에서만");
  const types = readFileSync(path.resolve(__dirname, "../../../src/inCallSms/types.ts"), "utf8");
  const request = types.slice(types.indexOf("export type RecordInCallSmsEventRequest"), types.indexOf("export type RecordInCallSmsEventResponse"));
  assert.deepEqual(request.match(/^\s+(\w+):/gm)!.map((s) => s.trim()), ["sessionId:", "smsId:", "event:"], "요청에 입력값을 담을 필드가 없다(AC-045)");
});

// 메인 세션 지시(2026-10-21 — 프로브 1세션 첫 인사에 실존 기관명 "서울중앙지검 금융범죄수사부") — 기관 이름은 OO를 붙인 가상 명칭으로만.
test("[§101 S7] 검찰 · 자산 보호 전 변형 페르소나 — 기관 이름은 'OO…' 가상 명칭 지시 · 옛 '일반명으로만' 문장 0 · 실제 청 이름 꼴 0", async () => {
  const { FLOW_VARIANTS } = await import("../flowVariants");
  const { SCENARIO_PROMPTS } = await import("../index");
  const REAL_OFFICE = /서울중앙지검|중앙지검|[가-힣]{1,6}지방검찰청|[가-힣]{1,6}지청|대검찰청/;
  for (const [scenarioId, fictional] of [
    [PROS, "\"OO지방검찰청\"·\"OO수사본부\"처럼 앞에 OO를 붙인 이름으로만 말한다"],
    ["asset-protection-notice-call", "\"OO자산보호센터\"처럼 앞에 OO를 붙인 이름으로만 말한다"],
  ] as const) {
    const personas = [
      SCENARIO_PROMPTS[scenarioId]!.personaPrompt,
      ...FLOW_VARIANTS.filter((v) => v.scenarioId === scenarioId).flatMap((v) => [
        resolveSessionScenarioPrompt(scenarioId, v.variantId)!.personaPrompt,
        ...v.legs.map((leg) => leg.personaPrompt ?? ""),
      ]),
    ].filter(Boolean);
    assert.ok(personas.length >= 3, scenarioId);
    for (const persona of personas) {
      // §109(DECISIONS #224) — 현행 fv-h3vn만 열람본과 같은 가상 고유명 1벌로 밝힌다(그 밖 기관은 여전히 "OO" — 같은 줄의 뒷문장).
      const namesCaseRecord = persona.includes(`${CASE_RECORD_NAMES.office} ${CASE_RECORD_NAMES.department}`);
      assert.ok(
        persona.includes(fictional) || (scenarioId === PROS && namesCaseRecord && persona.includes('"OO은행"처럼 앞에 OO를 붙인 이름으로만 말한다')),
        `${scenarioId}: 가상 명칭 지시`,
      );
      assert.equal(persona.includes("기관은 일반명으로만 말한다"), false, `${scenarioId}: 옛 문장`);
      assert.equal(REAL_OFFICE.test(maskFictionalInstitutionNames(persona)), false, `${scenarioId}: 실제 청 이름 꼴`);
    }
  }
  // 역검증 — 같은 검사식이 프로브에서 나온 실존 명칭을 잡는다 · 가상 명칭은 통과한다.
  assert.equal(REAL_OFFICE_SAMPLE.test("서울중앙지검 금융범죄수사부의 김철수 수사관입니다"), true);
  assert.equal(REAL_OFFICE_SAMPLE.test("OO지방검찰청 금융수사팀 김철수 수사관입니다"), false);
});
const REAL_OFFICE_SAMPLE = /서울중앙지검|중앙지검|[가-힣]{1,6}지방검찰청|[가-힣]{1,6}지청|대검찰청/;
