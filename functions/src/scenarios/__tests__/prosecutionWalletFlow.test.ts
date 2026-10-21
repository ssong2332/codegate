// §95(2026-10-21 사용자 실기 신고 — 검찰 수사 협조 × 고급) — "코인 전환 · 이체 절차 설명이 약하다" · "검수 수일 뒤 연락으로 흐지부지 끝난다".
// 새 변형 fv-c8wq가 그 두 결함을 데이터 · 조립 산출물 층에서 닫는지 고정한다(모델 행동 자체는 실 키 프로브 — docs/research/prosecution-crypto-tactics-2026-10.md).
//
// | # | 무엇을 보나 | 기대 |
// |---|---|---|
// | P1 | 배정 풀 · 은퇴 | 고급 자가 풀 = [fv-c8wq] · fv-p4hz는 은퇴(내용 무변경 — 옛 세션 해석) |
// | P2 | 흐름 끝단 | 거래소 코인 전환 → 보관 지갑 송금 화면 → 송금 뒤 추가 요구 → 거부 시 위협 격상 단계가 순서대로 있다 |
// | P3 | 흐지부지 차단 | 페르소나 · 단계가 "나중에 연락"으로 정리하지 말라고 말한다 |
// | P4 | 문자 · 화면 | 사건 조회(link) + 보관 지갑(transfer · 이체형 credential-form) 2건 · 도달 랜딩 2건 |
// | P5 | 무해성 | 실존 거래소 · 코인 이름 0 · 지갑 주소 형식(0x · bc1 · 긴 영숫자) 0 · 8자리+ 숫자 0 |
// | P6 | 리포트 판정 | 보관 지갑 화면 제출 = payment_demand 승격 · 새 단계 말 응답(약속 · 이행 보고)이 속음 · 거절은 안 속음 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { findFlowVariant, listFlowVariants, resolveSessionScenarioPrompt } from "../flowVariants";
import { assignablePool } from "../variantPool";
import { findInCallSmsItem } from "../inCallSms";
import { findMockScreenItem } from "../mockScreens";
import { sessionReachableLandingIds } from "../reachability";
import { extractTacticLabel } from "../tacticFlavor";
import { PROSECUTION_CASE_LINK_PERSONA } from "../prosecutionCooperationCall.prompt";
import { resolveTacticCategory } from "../../report/tacticCategory";
import { analyzeConversation, type AnalysisMessage } from "../../report/analyzeConversation";

const PROS = "prosecution-cooperation-call";

test("[§95 P1] 검찰 고급 새 세션 풀 = fv-c8wq · fv-p4hz는 은퇴(내용 무변경 — 사건 조회 문자 1건 · 원래 페르소나)", () => {
  assert.deepEqual(listFlowVariants(PROS, "advanced").map((v) => v.variantId), ["fv-c8wq"]);
  assert.deepEqual(assignablePool(PROS, "advanced").map((v) => v.variantId), ["fv-c8wq"]);
  const old = findFlowVariant("fv-p4hz")!;
  assert.equal(old.retired, true);
  assert.deepEqual(old.sms.map((s) => s.smsId), ["prosecution-case-link"]);
  assert.equal(old.legs[0]!.personaPrompt, PROSECUTION_CASE_LINK_PERSONA);
  assert.deepEqual(sessionReachableLandingIds(PROS, "fv-p4hz"), ["case-record-view"]);
});

test("[§95 P2 · P3] 흐름 끝단 — 코인 전환 → 보관 지갑 송금 화면 → 송금 뒤 추가 요구 → 거부 시 격상 · '나중에 연락' 정리 금지", () => {
  const v = findFlowVariant("fv-c8wq")!;
  const stages = v.stages.map((s) => s.summary);
  const at = (needle: string) => stages.findIndex((s) => s.includes(needle));
  const order = [at("사건 조회 링크"), at("OO거래소 계좌로 옮겨 코인으로"), at("보관 지갑 안내의 링크 화면"), at("추가로 바꿔 보내라고"), at("위협을 올리고")];
  assert.ok(order.every((i) => i >= 0), `단계 누락: ${JSON.stringify(order)}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "단계 순서");
  const prompt = resolveSessionScenarioPrompt(PROS, "fv-c8wq")!;
  assert.ok(prompt.personaPrompt.includes("나중에 연락드리겠습니다\"처럼 요구 없이 통화를 정리하는 말로 끝내지 않는다"));
  assert.ok(prompt.personaPrompt.includes("[이번 통화의 흐름]"));
  assert.ok(stages.some((s) => s.includes("검수 기간이나 나중에 연락하겠다는 말로 통화를 정리하지 않는다")));
  const labels = prompt.weakenedTactics.map(extractTacticLabel);
  for (const label of ["코인 구매·송금 요구", "거래 은행·자산 정보 수집", "창구 확인 차단", "보관 지갑 송금 화면 유도", "송금 뒤 추가 송금 요구", "거부 시 위협 격상"]) {
    assert.equal(labels.filter((l) => l === label).length, 1, label);
  }
  assert.equal(labels.includes("수사 서류 언급"), true, "사건 조회 문면 1벌 유지");
  // 옛 "지어내 불러 주지도 않는다"(절차 설명 자체를 막던 줄)는 새 페르소나에 없고, 단계 재촉 줄이 대신한다.
  assert.equal(prompt.personaPrompt.includes("- 코인 거래소·지갑 주소·코인 종류는 실제 것을 쓰지 않고, 지어내 불러 주지도 않는다."), false);
  assert.ok(prompt.personaPrompt.includes("순서를 한 단계씩 짚어 재촉하되"));
});

test("[§95 P4] 문자 2건(사건 조회 link · 보관 지갑 transfer) · 도달 랜딩 2건 · 보관 지갑 화면은 이체형 credential-form", () => {
  const v = findFlowVariant("fv-c8wq")!;
  assert.deepEqual(v.sms.map((s) => [s.purpose, s.smsId, s.required]), [
    ["link", "prosecution-case-link", true],
    ["transfer", "prosecution-wallet-link", true],
  ]);
  assert.ok(v.sms[1]!.notBeforeUserTurns > v.sms[0]!.notBeforeUserTurns, "보관 지갑 문자는 사건 조회 뒤");
  const sms = findInCallSmsItem(PROS, "prosecution-wallet-link")!;
  assert.equal(sms.kind, "account");
  assert.equal(sms.fakeLandingId, "asset-check-wallet");
  const screen = findMockScreenItem(PROS, "asset-check-wallet")!;
  assert.equal(screen.kind, "credential-form");
  assert.equal(screen.entrySurface, "in-call-sms");
  assert.deepEqual(screen.fields, ["보관 지갑 번호", "전송 금액"]);
  assert.deepEqual(sessionReachableLandingIds(PROS, "fv-c8wq").sort(), ["asset-check-wallet", "case-record-view"]);
});

test("[§95 P5] 무해성 — 실존 거래소 · 코인 이름 0 · 지갑 주소 형식 0 · 8자리 이상 숫자 0(프롬프트 · 문자 · 화면 전부)", () => {
  const prompt = resolveSessionScenarioPrompt(PROS, "fv-c8wq")!;
  const sms = findInCallSmsItem(PROS, "prosecution-wallet-link")!;
  const screen = findMockScreenItem(PROS, "asset-check-wallet")!;
  const text = [
    prompt.personaPrompt,
    ...prompt.weakenedTactics,
    ...findFlowVariant("fv-c8wq")!.stages.map((s) => s.summary),
    sms.body,
    sms.announceInstruction,
    sms.linkAddress ?? "",
    screen.headline,
    ...screen.bodyLines,
    ...(screen.fields ?? []),
    screen.correctAction,
  ].join("\n");
  const REAL = ["업비트", "빗썸", "코인원", "코빗", "고팍스", "바이낸스", "비트코인", "이더리움", "테더", "리플", "USDT", "BTC", "ETH", "메타마스크", "애니데스크", "팀뷰어"];
  assert.deepEqual(REAL.filter((w) => text.includes(w)), []);
  assert.equal(/0x[0-9a-fA-F]{6,}|bc1[0-9a-z]{6,}|\b[13][a-km-zA-HJ-NP-Z1-9]{25,}\b|[A-Za-z0-9]{20,}/.test(text), false, "지갑 주소 형식");
  assert.equal(/\d{8,}/.test(text), false, "8자리 이상 연속 숫자");
  // 역검증 — 같은 검사식이 실제 주소 형식 · 거래소 이름을 잡는다.
  assert.equal(/0x[0-9a-fA-F]{6,}/.test("0x71C7656EC7ab88b098defB751B7401B5f6d8976F"), true);
  assert.ok(REAL.some((w) => `${text} 업비트`.includes(w)));
});

const msg = (role: "scammer" | "user", textMasked: string, turnIndex: number): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: 1000 * (turnIndex + 1),
});

test("[§95 P6] 리포트 판정 — 보관 지갑 화면 승격 = payment_demand · 새 단계 말 응답은 속음 · 거절 · 유보는 안 속음", (t) => {
  assert.equal(resolveTacticCategory(findMockScreenItem(PROS, "asset-check-wallet")!.momentTactic), "payment_demand");
  const tactics = resolveSessionScenarioPrompt(PROS, "fv-c8wq")!.weakenedTactics;
  const demands = [
    "예금을 OO거래소 계좌로 옮기셔서 코인으로 바꾸셔야 합니다. 바로 진행하시죠.",
    "바꾸신 코인은 문자로 보내 드린 보관 지갑 화면에서 지갑 번호와 금액 넣고 전송해 주십시오.",
    "확인됐습니다. 그런데 적금도 같은 자금 흐름에 걸려 있습니다. 적금 해지해서 코인으로 바꿔 추가로 보내 주셔야 합니다.",
    "대출 가능액까지 검수 대상입니다. 대출 받으셔서 코인으로 바꿔 보관 지갑으로 옮겨 주십시오.",
  ];
  const agree = ["거래소 가입할게요", "보관 지갑으로 전송할게요", "전송했어요", "방금 보냈습니다", "적금 해지할게요", "대출 받아 볼게요", "지금 바꾸고 있어요", "다 옮겼어요"];
  const refuse = ["코인은 안 살게요", "검찰이 왜 코인을 사라고 해요? 사기 같아요", "가족이랑 상의해 볼게요", "적금은 못 깨요", "더는 못 보내요", "끊고 직접 확인할게요"];
  const judge = (s: string, u: string) => analyzeConversation([msg("scammer", s, 0), msg("user", u, 1)], 0, tactics).wasDeceived;
  let hit = 0;
  let false_ = 0;
  for (const s of demands) {
    for (const u of agree) if (judge(s, u)) hit += 1;
    for (const u of refuse) if (judge(s, u)) false_ += 1;
  }
  t.diagnostic(`[§95 P6] 동의 ${hit}/${demands.length * agree.length} 속음 · 거절 오판 ${false_}/${demands.length * refuse.length}`);
  assert.equal(hit, demands.length * agree.length);
  assert.equal(false_, 0);
  // 문맥 조건 유지 — 요구가 없는 사기범 대사 뒤의 같은 말은 새 갈래로 열리지 않는다.
  assert.equal(judge("지금 계신 곳이 조용한 곳인가요?", "다 옮겼어요"), false);
  assert.equal(judge("거래소 가입하신 적 있으세요?", "가입할게요"), false);
});
