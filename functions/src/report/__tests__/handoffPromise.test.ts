// ⭐ T191 J-2(2026-10-19 · DECISIONS #161 · PRD AC-097 갱신 고지 ③) — 대면 편취(E4)의 속은 시점 =
// "인출 · 전달 약속에 동의한 순간"이 **리포트 판정에서 실제로 속은 순간으로 잡히는지** 고정한다.
//
// | 이 파일이 고정하는 것 | 근거 |
// |---|---|
// | (1) before 열 = base 판정 — 공유 패턴(`COMPLIANCE_PATTERN` · `RESISTANCE_PATTERN`)이 base(main `9c760eb`)와 바이트 동일 | sha256 |
// | (2) 설계 표본: E4 동의 22 · 거절 17 · E5(셀프 감금 코인) 동의 6 · 거절 6 — before/after를 같은 실행에 나란히 | 역방향 확인 |
// | (3) 판정 조건 ③ — 같은 세션 형태에서 동의 발화는 속은 순간 1건 이상, 거절 · 의심 발화는 0건(나란히) | AC-097 (e) ③ |
// | (4) 문맥 조건 — 사기범이 인출 · 전달 · 코인을 요구하지 않은 턴 뒤에서는 같은 답변도 base와 같다 | 오탐 범위 |
// | (5) 회귀 0 — 17개 시나리오(흐름 변형 수법 포함) 저작 대사 × 기존 테스트 픽스처 답변 전수에서 base와 동일 | 회귀 |
// | (6) 이 갈래가 열리는 시나리오 = 기관 사칭(고급 변형 수법) · 대면 편취 · 셀프 감금 3개뿐 | 범위 |
// | (7) 보류 표본(설계에 쓰지 않은 15+19) — 잡는 수 · 놓치는 답을 **한계로** 고정 | 투명 고지 |
// | (8) reviewer M2 — 5개 시나리오 계열의 수동 작성 상황 설명형 · 요구형 대사 × 유보 · 공손 답변에서 새 오탐 0 | 오탐 범위 |
// | (9) 요구 어형 축소 뒤에도 수동 작성 인출 · 전달 · 코인 요구 대사에서 갈래가 열리는지(재현율 — 한계 고정) | 투명 고지 |
// | (10) QA FAIL 재현 14쌍 + 범용 공손형 12개 — 허용 목록 전환 뒤 base와 동일(범용 "드릴게요"는 이 갈래로 안 열림) | 음성 표본 |
// | (11) 재QA 경계 표본 13개 × 사기범 2발화 — 돈 목적어 · 행위 뒤 갈래의 창 축소 뒤 base와 동일, 지시어 "그거"는 다른 갈래로만 | 음성 · 동일 표본 |
//
// ⚠️ 사기범 대사는 저작 문구(`extractTacticFlavor`)이고 참가자 답변은 **합성 픽스처**다(라이브 전사 아님).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import {
  analyzeConversation,
  COMPLIANCE_PATTERN,
  RESISTANCE_PATTERN,
  type AnalysisMessage,
} from "../analyzeConversation";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { FLOW_VARIANTS } from "../../scenarios/flowVariants";
import { extractTacticFlavor } from "../../scenarios/tacticFlavor";

const SESSION_START_MS = 1_000_000;
const ASSET_PROTECTION = "asset-protection-notice-call";
const PROSECUTION = "prosecution-cooperation-call";

/** 저작 대사 그대로 — 대면 편취 "인출·전달 요구" · 셀프 감금 "코인 구매·송금 요구"의 flavor. */
const E4_DEMAND = extractTacticFlavor(
  SCENARIO_PROMPTS[ASSET_PROTECTION].weakenedTactics.find((t) => t.startsWith("인출·전달 요구")) ?? "",
);
const E5_DEMAND = extractTacticFlavor(
  SCENARIO_PROMPTS[PROSECUTION].weakenedTactics.find((t) => t.startsWith("코인 구매·송금 요구")) ?? "",
);
/** 요구가 없는 턴(같은 대면 편취 시나리오의 본인 확인 대사). */
const NON_DEMAND = extractTacticFlavor(
  SCENARIO_PROMPTS[ASSET_PROTECTION].weakenedTactics.find((t) => t.startsWith("본인확인 정보 직접 요구")) ?? "",
);

/** (1) base 판정(`resisted || !complied` → 속지 않음)을 답변 한 개로. 공유 패턴이 base와 같다는 것은 아래 sha256이 보증한다. */
const baseDeceived = (answer: string) => !RESISTANCE_PATTERN.test(answer) && COMPLIANCE_PATTERN.test(answer);

/** 실제 경로와 같은 짝 — scammer(turn 2k) ↔ user(turn 2k+1). */
function pairSession(scammerLine: string, answer: string): AnalysisMessage[] {
  return [
    { role: "scammer", textMasked: scammerLine, turnIndex: 0, createdAtMs: SESSION_START_MS + 5_000 },
    { role: "user", textMasked: answer, turnIndex: 1, createdAtMs: SESSION_START_MS + 15_000 },
  ];
}
const nowDeceived = (scammerLine: string, answer: string, tactics: string[] = []) =>
  analyzeConversation(pairSession(scammerLine, answer), SESSION_START_MS, tactics).wasDeceived;

const E4_AGREE = [
  "네 찾아 둘게요", "수표로 인출할게요", "직원분께 드릴게요", "맡기면 되죠?", "그렇게 할게요",
  "내일 오전에 찾아 놓을게요", "수표로 찾아 둘게요", "인출해서 맡길게요", "알겠습니다, 은행 가서 찾아올게요",
  "현금으로 뽑아 둘게요", "네, 오늘 안에 인출하겠습니다", "찾아서 직원분한테 전달할게요", "맡길게요",
  "네 보관해 주세요, 찾아 놓겠습니다", "돈 찾아서 드리면 되는 거죠?", "전액 다 찾아 놓을게요",
  "직원분 오시면 드리겠습니다", "네 그럼 은행 다녀올게요", "알겠어요, 찾아 둘게요", "네네 넘겨 드릴게요",
  "오후에 출금해서 준비해 둘게요", "직원한테 건네 드리면 되죠?",
] as const;
const E4_REFUSE = [
  "인출은 안 할게요", "은행에 먼저 물어볼게요", "가족이랑 상의할게요", "그건 못 하겠어요", "왜 찾아야 하죠?",
  "은행 가서 직접 물어볼게요", "못 찾아요", "돈은 안 찾을 거예요", "직원한테 맡길 생각 없어요",
  "금감원에 직접 전화해서 확인할게요", "그런 절차는 처음 들어요, 안 맡길게요", "생각해 보고 말씀드릴게요",
  "지금은 못 드려요", "수표로 찾으면 안 될 것 같아요", "일단 끊고 다시 전화할게요", "그 돈은 안 드릴 거예요",
  "맡기라는 게 이상해요",
] as const;
const E5_AGREE = [
  "코인 사서 보낼게요", "네 코인으로 바꿔 둘게요", "지정된 곳으로 옮길게요", "가상자산으로 사서 옮겨 놓겠습니다",
  "코인 구매할게요", "바꿔서 보내 드릴게요",
] as const;
const E5_REFUSE = [
  "코인은 안 살게요", "코인으로 바꾸라는 건 이상해요", "그건 못 사요", "검찰에 직접 확인해 볼게요",
  "왜 코인으로 바꿔야 하죠?", "가족한테 먼저 물어볼게요",
] as const;

/**
 * ⚠️ base에서 이미 "속음"이던 거절 · 유보 답변(이 변경 밖 — base `말씀\s*드릴게` 항목). 이 갈래가 만든 오탐이
 * 아니라 공유 `COMPLIANCE_PATTERN`의 기존 오탐이며, 그 패턴은 되감기와 공유돼 이번 범위에서 고치지 않는다.
 */
const PRE_EXISTING_BASE_FALSE_POSITIVES = ["생각해 보고 말씀드릴게요"];

// ── (1) before 열 = base ─────────────────────────────────────────────────────────────────────

test("[T191 J-2] 공유 판정 패턴(COMPLIANCE_PATTERN · RESISTANCE_PATTERN)은 base(main 9c760eb)와 바이트 동일하다 — before 열이 base 판정이다", () => {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  assert.equal(sha(COMPLIANCE_PATTERN.source), "cb4e925f6f9385ba5098a35a58be61c8f11ecd8b40b939fc3cb50b146fc97567");
  assert.equal(sha(RESISTANCE_PATTERN.source), "d5b51b7b53e3bb6c0c8b7390c729c5ee23e6517b0f1350a327a4d57ecea968b9");
});

// ── (2) 설계 표본 before/after ───────────────────────────────────────────────────────────────

const SAMPLE_GROUPS = [
  { name: "E4 동의", demand: E4_DEMAND, answers: E4_AGREE, expected: true },
  { name: "E4 거절", demand: E4_DEMAND, answers: E4_REFUSE, expected: false },
  { name: "E5 동의", demand: E5_DEMAND, answers: E5_AGREE, expected: true },
  { name: "E5 거절", demand: E5_DEMAND, answers: E5_REFUSE, expected: false },
] as const;

test("[T191 J-2 · 역방향 확인] 인출·전달·코인 약속 동의는 before(base)가 놓치고 after가 잡는다 — 거절·유보는 after가 새로 잡는 것 0건", (t) => {
  const summary: string[] = [];
  for (const group of SAMPLE_GROUPS) {
    let before = 0;
    let after = 0;
    for (const answer of group.answers) {
      const b = baseDeceived(answer);
      const a = nowDeceived(group.demand, answer);
      before += b ? 1 : 0;
      after += a ? 1 : 0;
      t.diagnostic(`| ${group.name} | ${answer} | 기대=${group.expected ? "속음" : "안속음"} | before=${b ? "속음" : "안속음"} | after=${a ? "속음" : "안속음"} |`);
      if (group.expected) {
        assert.equal(a, true, `${group.name}: 동의 답변이 속은 순간으로 잡히지 않는다 — ${answer}`);
      } else {
        // 새 갈래는 거절 · 유보를 하나도 새로 잡지 않는다(base 기존 오탐은 아래 목록과 정확히 같아야 한다).
        assert.equal(a, b, `${group.name}: 이 변경이 거절 · 유보 답변의 판정을 바꿨다 — ${answer}`);
        assert.equal(a, PRE_EXISTING_BASE_FALSE_POSITIVES.includes(answer), `${group.name}: 기존 오탐 목록과 다르다 — ${answer}`);
      }
    }
    summary.push(`${group.name} 속음 before ${before}/${group.answers.length} → after ${after}/${group.answers.length}`);
  }
  for (const line of summary) t.diagnostic(line);
  assert.deepEqual(summary, [
    "E4 동의 속음 before 3/22 → after 22/22",
    "E4 거절 속음 before 1/17 → after 1/17",
    "E5 동의 속음 before 1/6 → after 6/6",
    "E5 거절 속음 before 0/6 → after 0/6",
  ]);
});

// ── (3) 판정 조건 ③ — 실제 세션 형태에서 나란히 ─────────────────────────────────────────────────

function e4Session(decisiveAnswer: string): AnalysisMessage[] {
  const lines: [AnalysisMessage["role"], string][] = [
    ["scammer", NON_DEMAND],
    ["user", "네? 무슨 일이시죠?"],
    ["scammer", E4_DEMAND],
    ["user", decisiveAnswer],
  ];
  return lines.map(([role, textMasked], turnIndex) => ({
    role,
    textMasked,
    turnIndex,
    createdAtMs: SESSION_START_MS + turnIndex * 10_000,
  }));
}

test("[T191 J-2 · AC-097 (e) ③] 같은 대면 편취 세션에서 인출·전달 동의는 속은 순간 1건 이상, 거절·의심은 0건 — 같은 실행에 나란히", (t) => {
  const tactics = SCENARIO_PROMPTS[ASSET_PROTECTION].weakenedTactics;
  const agree = ["수표로 찾아 둘게요", "인출해서 맡길게요", "직원분께 드릴게요"];
  const refuse = ["은행 가서 직접 물어볼게요", "못 찾아요"];
  for (const answer of [...agree, ...refuse]) {
    const result = analyzeConversation(e4Session(answer), SESSION_START_MS, tactics);
    t.diagnostic(`${answer} → 속은 순간 ${result.deceivedMoments.length}건 ${JSON.stringify(result.deceivedMoments.map((m) => [m.turnIndex, m.tactic]))}`);
    if (agree.includes(answer)) {
      assert.ok(result.deceivedMoments.length >= 1, `동의 발화가 속은 순간으로 기록되지 않았다 — ${answer}`);
      assert.equal(result.deceivedMoments[0].turnIndex, 3);
      // AC-083 — 속은 순간의 수법이 시도된 수법 목록에 있다(리포트 자기모순 금지).
      assert.equal(result.deceivedMoments[0].tactic, "인출·전달 요구");
      assert.ok(result.tacticsUsed.includes(result.deceivedMoments[0].tactic));
    } else {
      assert.equal(result.deceivedMoments.length, 0, `거절 · 의심 발화가 속은 순간으로 기록됐다 — ${answer}`);
      assert.equal(result.wasDeceived, false);
    }
  }
});

// ── (4) 문맥 조건 ───────────────────────────────────────────────────────────────────────────

test("[T191 J-2] 사기범이 인출·전달·코인을 요구하지 않은 턴 뒤에서는 같은 동의 답변도 base 판정 그대로다", () => {
  for (const answer of [...E4_AGREE, ...E5_AGREE]) {
    assert.equal(nowDeceived(NON_DEMAND, answer), baseDeceived(answer), `요구 없는 턴에서 판정이 바뀌었다 — ${answer}`);
  }
  // 대표 사례: base가 놓치는 "드릴게요"는 요구 없는 턴 뒤에서 여전히 속은 순간이 아니다.
  assert.equal(nowDeceived(NON_DEMAND, "직원분께 드릴게요"), false);
  assert.equal(nowDeceived(E4_DEMAND, "직원분께 드릴게요"), true);
});

// ── (5)(6) 전 시나리오 회귀 · 열리는 범위 ──────────────────────────────────────────────────────

/** 시나리오별 저작 대사 = 원본 수법 + 흐름 변형 수법(변형 전용 수법 포함)의 flavor. */
function authoredLinesByScenario(): Map<string, string[]> {
  const byScenario = new Map<string, Set<string>>();
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    byScenario.set(scenarioId, new Set(prompt.weakenedTactics));
  }
  for (const variant of FLOW_VARIANTS) {
    for (const tactic of variant.tactics) byScenario.get(variant.scenarioId)?.add(tactic);
  }
  return new Map([...byScenario].map(([id, tactics]) => [id, [...tactics].map(extractTacticFlavor)]));
}

/** 기존 리포트 · 되감기 테스트 픽스처의 참가자 답변(소스에서 문자열 리터럴로 읽는다 — 이 파일은 제외). */
function existingFixtureAnswers(): string[] {
  const answers = new Set<string>();
  for (const dir of ["src/report/__tests__", "src/rewind/__tests__"]) {
    for (const file of readdirSync(dir)) {
      if (file === "handoffPromise.test.ts") continue;
      const source = readFileSync(`${dir}/${file}`, "utf8");
      for (const match of source.matchAll(/role:\s*"user"[^}]*?textMasked:\s*"([^"]+)"/g)) answers.add(match[1]);
      if (file === "verdictRegression.test.ts") {
        for (const match of source.matchAll(/^\s*"([^"\n]{2,80})",?\s*$/gm)) answers.add(match[1]);
      }
    }
  }
  return [...answers];
}

test("[T191 J-2 · 회귀 0] 17개 시나리오 저작 대사 × 기존 테스트 픽스처 답변 전수에서 판정이 base와 같다", (t) => {
  const answers = existingFixtureAnswers();
  const lines = authoredLinesByScenario();
  assert.equal(lines.size, 17, "시나리오 수가 바뀌었다 — 이 회귀 표본을 다시 확인할 것");
  assert.ok(answers.length >= 30, `픽스처 답변 추출이 비정상적으로 적다: ${answers.length}`);
  const changed: string[] = [];
  let pairs = 0;
  for (const [scenarioId, scenarioLines] of lines) {
    for (const line of scenarioLines) {
      for (const answer of answers) {
        pairs += 1;
        if (nowDeceived(line, answer) !== baseDeceived(answer)) changed.push(`${scenarioId} | ${line} | ${answer}`);
      }
    }
  }
  t.diagnostic(`비교 ${pairs}쌍(시나리오 ${lines.size} · 답변 ${answers.length}) · 판정이 바뀐 쌍 ${changed.length}`);
  // 사용자 결정 2026-10-21 ①(DECISIONS #204 — 말보다 행동): 의심 · 신고를 말하면서도 잔액 · 숫자를 넘긴 아래 두 답만 바뀐다(안 속음 → 속음).
  // 그 밖의 답변 · 쌍은 여전히 base와 같아야 한다.
  const DECISION_1_ANSWERS = [
    "300만원 정도 있는데 의심스러워서 확인하고 다시 전화드릴게요", // 잔액 고지(H2)
    "048231 이요 근데 경찰에 신고할게요", // 생년월일을 물은 대사 뒤 숫자 6자리(H2 · V2)
  ];
  const changedAnswers = new Set(changed.map((entry) => entry.split(" | ").at(-1)));
  assert.deepEqual([...changedAnswers].sort(), [...DECISION_1_ANSWERS].sort());
  for (const answer of DECISION_1_ANSWERS) assert.equal(baseDeceived(answer), false, "결정 ① 답변은 base에서 안 속음이었다");
});

// 2026-10-21 — 기관 사칭 고급이 현금 전달 요구(인출·전달) 대신 인증번호 → 안전계좌 링크 이체 화면으로 바뀌어 목록에서 빠졌다.
// §124(DECISIONS #239) — 다중 루트 1a의 말로 끝나는 결말(기관 사칭 현금 예탁 · 금 구매, 대환대출 현금 상환, 카드 배송 대출금 전달)이 이 갈래를 다시 연다.
test("[T191 J-2 · §124] 인출·전달 약속 갈래가 열리는 저작 대사 = 대면 편취 · 셀프 감금 + 1a 말로 끝나는 결말 3종", () => {
  const opened = new Set<string>();
  for (const [scenarioId, scenarioLines] of authoredLinesByScenario()) {
    // "드릴게요"는 base가 놓치고 이 갈래만 잡는 답 — 열리는지의 탐침으로 쓴다.
    if (scenarioLines.some((line) => nowDeceived(line, "직원분께 드릴게요"))) opened.add(scenarioId);
  }
  assert.deepEqual([...opened].sort(), [ASSET_PROTECTION, PROSECUTION, "card-delivery-call", "institutional-impersonation", "loan-refinance-scam"].sort());
});

// ── (7) 보류 표본 — 한계 고정 ─────────────────────────────────────────────────────────────────

test("[T191 J-2 · 한계] 설계에 쓰지 않은 보류 표본 — 동의 11/15(놓치는 4개 고정) · 거절·공손 오탐 0/19", (t) => {
  const heldOutAgree = [
    "네 알아서 찾아다 놓을게요", "수표 열 장으로 뽑아 놓겠습니다", "직원분이 오시면 그분께 맡기겠습니다",
    "그럼 지금 바로 은행 갈게요", "현금으로 준비해 둘게요", "네, 전부 인출해 놓을게요", "직원한테 넘겨 드리면 되는 거죠?",
    "찾아서 그분 드리면 되죠", "오늘 중으로 출금하겠습니다", "코인으로 바꿔 놓을게요", "사서 지정된 곳에 넣어 둘게요",
    "네 그렇게 하겠습니다", "저축 깨서 찾아 올게요", "수표로 받아 둘게요", "말씀대로 다 맡기겠습니다",
  ];
  const heldOutRefuse = [
    "은행원이 이상하게 볼 것 같아서 못 찾겠어요", "찾으러 갈 시간이 없어요", "그건 좀 생각해 볼게요",
    "제가 왜 돈을 찾아야 하는데요", "남편 오면 같이 얘기해 볼게요", "현금은 집에 두지 않아요",
    "인출 같은 건 하지 말라고 들었어요", "직원을 집에 들이는 건 싫어요", "코인은 해 본 적이 없어서 못 하겠어요",
    "일단 112에 물어보고요", "전 그런 거 안 해요", "돈 찾는 건 내일 은행 직원이랑 상담하고 할게요",
    "수표는 못 드리겠어요", "드릴 돈이 없어요", "맡기는 건 좀 아닌 것 같아요",
    // reviewer 권고(2026-10-19) — 문의 · 회신 · 부탁 · 감사 계열(1차 구현에서는 "부탁드리겠" · "감사드리겠"이 열렸다).
    "은행에 문의드릴게요", "그럼 제가 회신 드릴게요", "네 잘 부탁드리겠습니다", "감사드리겠습니다",
  ];
  const missed = heldOutAgree.filter((answer) => !nowDeceived(E4_DEMAND, answer));
  const falsePositives = heldOutRefuse.filter((answer) => nowDeceived(E4_DEMAND, answer));
  t.diagnostic(`보류 동의 base ${heldOutAgree.filter(baseDeceived).length}/15 → after ${15 - missed.length}/15 · 놓침 ${JSON.stringify(missed)}`);
  t.diagnostic(`보류 거절 오탐 base ${heldOutRefuse.filter(baseDeceived).length}/${heldOutRefuse.length} → after ${falsePositives.length}/${heldOutRefuse.length}`);
  assert.deepEqual(missed, [
    "네 알아서 찾아다 놓을게요",
    "그럼 지금 바로 은행 갈게요",
    "사서 지정된 곳에 넣어 둘게요",
    "수표로 받아 둘게요",
  ]);
  assert.deepEqual(falsePositives, []);
});

// ── (8) reviewer M2 — 수동 작성 LLM형 대사 × 유보 · 공손 답변 ────────────────────────────────────
// ⚠️ 아래 대사는 **수동 작성**이다(실제 LLM 출력 아님). 저작 대사 전수 대조((5)(6))가 못 덮는 "상황 설명형"
// (출금 시도 · 보관 중 · 전달해 드리겠습니다)과 인출 · 전달이 아닌 "요구형"을 계열마다 4개 이상 넣었다.

const LLM_STYLE_LINES: Record<string, string[]> = {
  "은행 보안 사칭": [
    "고객님 계좌에서 출금하려는 시도가 있어 계좌를 보호해야 합니다.",
    "방금 해외에서 출금하신 내역이 있으신가요?",
    "현재 출금이 진행 중이라 몇 분 안에 결정하셔야 해요.",
    "보안 점검이 끝날 때까지 계좌 정보는 저희가 보관 중입니다.",
    "가까운 현금인출기에서 이상 거래가 확인됐습니다.",
    "보안 앱을 설치해 주셔야 합니다.",
  ],
  "환급 사칭": [
    "환급금은 현금지급기에서 바로 수령 가능합니다.",
    "환급 신청서는 담당자에게 전달해 드리겠습니다.",
    "서류는 저희가 보관하고 있으니 걱정 마세요.",
    "가까운 인출기로 가시면 순서를 불러 드릴게요.",
    "환급 신청서를 작성해 주세요.",
  ],
  "대출 사기": [
    "기존 대출금은 저희가 대신 상환해 드리고 서류는 보관해 드립니다.",
    "심사 결과는 담당자에게 전달해 드리겠습니다.",
    "대출금은 통장으로 바로 출금하실 수 있습니다.",
    "보증보험료는 현금으로 내시는 분도 있습니다.",
    "기존 대출을 먼저 상환하셔야 합니다.",
  ],
  "택배 · 통관": [
    "택배가 보관 중입니다, 주소 확인이 필요합니다.",
    "보관 중입니다.",
    "통관 서류는 세관 담당자에게 전달해 드리겠습니다.",
    "물품이 창고에 보관돼 있어 재배송 신청이 필요합니다.",
    "관세는 현금으로도 납부하실 수 있습니다.",
    "주소를 다시 입력해 주세요.",
  ],
  "기관 사칭": [
    "고객님 명의 통장에서 인출 내역이 확인됐습니다.",
    "사건 기록은 검찰에 전달해 드리겠습니다.",
    "담당자에게 전달해 드리겠습니다.",
    "증거 자료는 저희가 보관하고 있습니다.",
    "혹시 최근 현금을 출금하신 적 있으세요?",
    "코인 투자 사기 피해가 많아서 확인차 연락드렸습니다.",
    "성함과 생년월일을 불러 주세요.",
  ],
};
const POLITE_HOLD_ANSWERS = [
  "은행에 문의드릴게요", "그럼 제가 회신 드릴게요", "네 잘 부탁드리겠습니다", "네 찾아 드릴게요", "감사드리겠습니다",
  "말씀드릴게요 잠깐만요", "상담 신청 드릴게요", "나중에 인사 드릴게요", "팀장님께 보고 드리겠습니다",
  "하나만 여쭤 드릴게요", "잠깐만요", "알려 주셔서 감사합니다", "답변 드릴게요", "네 연락 기다리겠습니다",
];

test("[T191 J-2 · reviewer M2] 수동 작성 상황 설명형·요구형 대사 × 유보·공손 답변 — 이 갈래가 새로 잡는 쌍 0", (t) => {
  const changed: string[] = [];
  let pairs = 0;
  let baseCount = 0;
  for (const [family, lines] of Object.entries(LLM_STYLE_LINES)) {
    assert.ok(lines.length >= 4, `${family}: 대사 4개 이상`);
    for (const line of lines) {
      for (const answer of POLITE_HOLD_ANSWERS) {
        pairs += 1;
        if (baseDeceived(answer)) baseCount += 1;
        if (nowDeceived(line, answer) !== baseDeceived(answer)) changed.push(`${family} | ${line} | ${answer}`);
      }
    }
  }
  t.diagnostic(`비교 ${pairs}쌍 · base에서 이미 속음 ${baseCount}쌍(공유 패턴의 기존 판정 — 범위 밖) · 이 갈래가 바꾼 쌍 ${changed.length}`);
  assert.deepEqual(changed, []);
  // reviewer 재현 3건 — 1차 구현에서 열렸던 조합을 이름으로 고정한다.
  assert.equal(nowDeceived("고객님 계좌에서 출금하려는 시도가 있어 계좌를 보호해야 합니다.", "은행에 문의드릴게요"), false);
  assert.equal(nowDeceived("고객님 계좌에서 출금하려는 시도가 있어 계좌를 보호해야 합니다.", "그럼 제가 회신 드릴게요"), false);
  assert.equal(nowDeceived("담당자에게 전달해 드리겠습니다.", "네 잘 부탁드리겠습니다"), false);
  assert.equal(nowDeceived("보관 중입니다.", "네 찾아 드릴게요"), false);
});

// ── (9) 요구 어형 재현율 — 한계 고정 ──────────────────────────────────────────────────────────

test("[T191 J-2 · 한계] 수동 작성 인출·전달·코인 요구 대사에서 갈래가 열린다 — 14/15(놓치는 1개 고정)", (t) => {
  const demands = [
    "오늘 중으로 예금을 전액 인출해 두셔야 합니다.", "수표로 찾아 두시면 직원이 받으러 갑니다.",
    "현금으로 찾아서 저희 직원에게 맡기시면 됩니다.", "자산은 저희가 안전하게 보관해야 합니다.",
    "찾으신 돈은 담당 직원에게 전달해 주세요.", "은행에서 돈을 뽑아 오셔야 합니다.",
    "돈을 찾으시면 직원분께 건네주시면 됩니다.", "예금을 해지해서 현금으로 준비해 주세요.",
    "출금하셔서 보관 조치를 받으셔야 합니다.", "직원이 댁으로 받으러 가겠습니다.",
    "코인으로 바꿔 지정된 곳으로 옮겨 두셔야 합니다.", "가상자산을 구매해서 보내 주셔야 합니다.",
    "거래소에서 코인을 사서 송금하세요.", "자산을 코인으로 전환해 두셔야 합니다.",
    "코인 사셔서 저희가 알려 드리는 곳으로 보내세요.",
  ];
  // "드릴게요"는 base가 놓치고 이 갈래만 잡는 답 — 열리는지의 탐침.
  const closed = demands.filter((line) => !nowDeceived(line, "직원분께 드릴게요"));
  t.diagnostic(`요구형 대사 열림 ${demands.length - closed.length}/${demands.length} · 닫힘 ${JSON.stringify(closed)}`);
  assert.deepEqual(closed, ["은행에서 돈을 뽑아 오셔야 합니다."]);
});

// ── (10) QA FAIL(2026-10-19) 음성 표본 — 허용 목록 전환 ─────────────────────────────────────────
// 1 · 2차는 범용 "드릴게 · 드리겠"을 받고 앞말 제외 목록으로 막아 아래 답변이 샜다. 이제 약속 어형은 허용 목록이라
// 인출 · 보관 · 전달 · 코인 동사 · 돈 목적어 · 받는 사람이 없으면 열리지 않는다.

const QA_FAIL_SCAMMER_LINES = [
  "오늘 안에 보관 조치가 안 되면 계좌가 동결될 수 있습니다.", // asset-protection 저작 대사(상황 설명 — 게이트도 닫혀야 한다)
  "현금으로 인출해 주세요.", // 요구형(게이트는 열린다 — 답변 쪽 허용 목록이 막아야 한다)
];
const QA_FAIL_ANSWERS = ["제가 설명드리겠습니다", "안내드릴게요", "도와드릴게요", "대답해 드릴게요", "설명해 드릴게요", "연결해 드릴게요", "3분 드릴게요"];
const GENERIC_POLITE_ANSWERS = [
  "말씀 잘 들었습니다, 제가 정리해 드릴게요", "자료 보내 드리겠습니다", "제가 알려 드릴게요", "시간 좀 드릴게요",
  "연락처 남겨 드릴게요", "제가 해 드릴게요", "잠시만 기다려 드릴게요", "답장 드리겠습니다", "그럼 제가 할게요",
  "네 드릴게요", "네 드리겠습니다", "정리해서 말씀드리겠습니다",
];

test("[T191 J-2 · QA FAIL 음성 표본] 재현 14쌍 + 범용 공손형 12개 × 사기범 2발화 — 판정이 base와 같다", (t) => {
  const changed: string[] = [];
  for (const line of QA_FAIL_SCAMMER_LINES) {
    for (const answer of [...QA_FAIL_ANSWERS, ...GENERIC_POLITE_ANSWERS]) {
      if (nowDeceived(line, answer) !== baseDeceived(answer)) changed.push(`${line} | ${answer}`);
    }
  }
  const pairs = QA_FAIL_SCAMMER_LINES.length * (QA_FAIL_ANSWERS.length + GENERIC_POLITE_ANSWERS.length);
  t.diagnostic(`QA 재현 ${QA_FAIL_SCAMMER_LINES.length * QA_FAIL_ANSWERS.length}쌍 + 범용 ${QA_FAIL_SCAMMER_LINES.length * GENERIC_POLITE_ANSWERS.length}쌍 = ${pairs}쌍 · 바뀐 쌍 ${changed.length}`);
  assert.deepEqual(changed, []);
  // QA 재현 7개는 base에서도 속지 않음 — 즉 after도 전부 속지 않음.
  for (const line of QA_FAIL_SCAMMER_LINES) {
    for (const answer of QA_FAIL_ANSWERS) assert.equal(nowDeceived(line, answer), false, `${line} | ${answer}`);
  }
});

test("[T191 J-2 · QA 독립 동의 표본] '네 수표로 바꿔서 챙겨 둘게요'는 잡힌다 — ⚠️ '챙겨 둘게'는 이 표본을 본 뒤 돈 목적어 · 행위 뒤 갈래에만 넣었다(과적합 고지)", () => {
  assert.equal(nowDeceived(E4_DEMAND, "네 수표로 바꿔서 챙겨 둘게요"), true);
  // 단독 "챙겨 둘게요"는 허용 목록 밖이다(돈 목적어 · 행위 없음).
  assert.equal(nowDeceived(E4_DEMAND, "서류 챙겨 둘게요"), baseDeceived("서류 챙겨 둘게요"));
});

// ── (11) 재QA(2026-10-19) 경계 표본 — 돈 목적어 · 행위 뒤 갈래의 창 축소 ───────────────────────────
// 3차까지는 돈 목적어 · 행위 뒤 12자 창에 다른 명사가 끼어도 열렸다("코인 사진은 찍어서 보내 드릴게요").
// 이제 돈 목적어 + 조사? + 부사? (+ 받는 사람?) **바로 뒤**의 동사만 연다. 지시어 "그거 · 그걸"은 돈 목적어에서 뺐다.

const BOUNDARY_SCAMMER_LINES = ["현금으로 인출해 주세요.", E4_DEMAND];
const BOUNDARY_ANSWERS = [
  "그거 말고 다른 걸로 설명드릴게요", "코인 사진은 찍어서 보내 드릴게요", // 재QA 오탐 재현 2종
  "돈 얘기는 제가 정리해서 드릴게요", "현금영수증은 나중에 보내 드릴게요", "수표 얘기는 은행에 물어보고 다시 드릴게요",
  "담당자님께 인사 드릴게요", "직원분께 인사드리겠습니다", "기사님께 길 설명 드리겠습니다", "그분께 연락처 드릴게요",
  "돈 문제는 제가 알아서 처리해서 알려 드릴게요", "예금 통장 사본을 보낼게요", "수표 번호는 불러 드릴게요",
  "전액 얼마인지 말씀드릴게요",
];

test("[T191 J-2 · 재QA 경계 표본] 13개 × 사기범 2발화 — 이 갈래가 바꾼 쌍 0(base에서 이미 속음인 답은 공유 패턴 몫)", (t) => {
  const changed: string[] = [];
  for (const line of BOUNDARY_SCAMMER_LINES) {
    for (const answer of BOUNDARY_ANSWERS) {
      if (nowDeceived(line, answer) !== baseDeceived(answer)) changed.push(`${line} | ${answer}`);
    }
  }
  const baseTrue = BOUNDARY_ANSWERS.filter(baseDeceived);
  t.diagnostic(`경계 ${BOUNDARY_SCAMMER_LINES.length * BOUNDARY_ANSWERS.length}쌍 · 바뀐 쌍 ${changed.length} · base에서 이미 속음 ${JSON.stringify(baseTrue)}`);
  assert.deepEqual(changed, []);
  // 재QA 오탐 2종은 이름으로 고정한다(base도 속지 않음).
  for (const line of BOUNDARY_SCAMMER_LINES) {
    assert.equal(nowDeceived(line, "그거 말고 다른 걸로 설명드릴게요"), false);
    assert.equal(nowDeceived(line, "코인 사진은 찍어서 보내 드릴게요"), false);
  }
});

test("[T191 J-2] 지시어 '그거 · 그걸'을 돈 목적어에서 뺀 뒤에도 행위 동사가 있으면 다른 갈래로 잡힌다", () => {
  assert.equal(nowDeceived(E4_DEMAND, "그거 찾아 둘게요"), true); // 두다 · 놓다 · 오다 갈래
  assert.equal(nowDeceived(E4_DEMAND, "그걸 맡길게요"), true); // 넘기는 동사 단독 갈래
  assert.equal(nowDeceived(E4_DEMAND, "그거 드릴게요"), baseDeceived("그거 드릴게요")); // 지시어 + 범용 동사는 안 열린다
});
