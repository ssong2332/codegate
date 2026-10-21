// T194-b(docs/Architecture.md §84.3 · §84.8 G563 · G565 · G566 · PRD AC-104 (h)) + §88(G626 · G627 · DECISIONS #199) — 훈련용 가상 신상 카드.
// ⭐ §88 — 카드 값은 사용자가 **선택으로** 넣은 원값만으로 만든다(서버 임의 생성 폐지 · 비면 카드 0 · 자가 · 챌린지 모두).
// ⭐ 역방향(AC-104 (h))은 **같은 실행 출력**에 정상 샘플 통과와 나란히 낸다: 각 검사 함수를 실제 값과 오염 사본에 둘 다 돌린다.
// ⛔ 오염은 테스트 안의 사본에서만 한다(실제 소스 · 카탈로그는 건드리지 않는다 — harmlessnessGate.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import {
  PERSONA_CARD_INVALID_REASON,
  PERSONA_CARD_NOT_APPLICABLE_REASON,
  buildPersonaCard,
  personaBirthYearMax,
  personaCardEligible,
  personaCardInputFitsScenario,
  readPersonaCardInput,
  readStoredPersonaCard,
  resolvePersonaCardRequest,
  type PersonaCardEligibilityInput,
} from "../personaCard";
import {
  personaCardKind,
  PERSONA_CARD_INPUT_KEYS_BY_KIND,
  PERSONA_CARD_KIND,
  PERSONA_CARD_LABELS,
  PERSONA_CARD_SCENARIOS,
  PERSONA_CHILD_ACADEMY_OPTIONS,
  PERSONA_CHILD_GRADE_OPTIONS,
  PERSONA_JOB_OPTIONS,
  PERSONA_REGION_POOL,
} from "../../scenarios/personaCardCatalog";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { hasBankPlaceholder } from "../../shared/fictionalBank";
import { replaceRealFinancialNames } from "../../guardrails/realFinancialNames";
import type { DifficultyLevel } from "../../shared/difficulty";
import type { PersonaCardItem } from "../../shared/types";

const SRC = path.resolve(__dirname, "../../../src");
const readSrc = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const LEVELS: readonly DifficultyLevel[] = ["beginner", "intermediate", "advanced"];
/**
 * User 결정의 기대 대상 — 데이터 상수와 **따로** 적는다(상수만 고치면 여기서 걸린다).
 * 2026-10-20 기관형 4종 → §93(2026-10-21 · 사용자 승인 "시나리오 결정 권고안대로 진행") 기관형 8종 + 협박형 2종(카드 배송은 카드사 고급으로 흡수 — 대상 아님).
 */
const EXPECTED_TARGETS = [
  "asset-protection-notice-call",
  "bank-security-verify-scam",
  "card-company-impersonation",
  "courier-customs-scam",
  "institutional-impersonation",
  "kidnapping-threat",
  "loan-refinance-scam",
  "prosecution-cooperation-call",
  "reputation-blackmail-scam",
  "tax-refund-scam",
];
/** §93 — 입력 대상 행(세 종류의 합). 옛 v1 행(bank · card · loan)은 빠진다. */
const INPUT_KEYS = new Set(Object.values(PERSONA_CARD_INPUT_KEYS_BY_KIND).flat());
const NOW_YEAR = 2026;

// ── G563 대상 술어(§88 — 챌린지 축 삭제) ─────────────────────────────────────

function eligibilityViolations(pred: (input: PersonaCardEligibilityInput) => boolean): string[] {
  const out: string[] = [];
  for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
    for (const level of LEVELS) {
      for (const channel of [undefined, "voice", "messenger"] as const) {
        const expected = EXPECTED_TARGETS.includes(scenarioId) && level === "advanced" && channel !== "messenger";
        const actual = pred({ scenarioId, difficultyLevel: level, channel });
        if (actual !== expected) out.push(`${scenarioId}/${level}/${channel ?? "부재"}: ${actual} (기대 ${expected})`);
      }
    }
  }
  return out;
}

test("[G563 · §88 · §93] 대상 술어 진리표 — 전 시나리오 × 3난이도 × {부재 · voice · messenger}에서 10종 × 고급 × 통화만 참(자가 · 챌린지 공통)", (t) => {
  assert.deepEqual([...PERSONA_CARD_SCENARIOS].sort(), EXPECTED_TARGETS, "대상 상수가 User 결정(§93 · 10종)과 다르다");
  // §93 — 종류표는 대상과 1:1(빠진 대상 · 남는 키 0).
  assert.deepEqual(Object.keys(PERSONA_CARD_KIND).sort(), EXPECTED_TARGETS);
  assert.equal(personaCardKind("kidnapping-threat"), "child-threat");
  assert.equal(personaCardKind("reputation-blackmail-scam"), "self-threat");
  assert.equal(personaCardKind("family-accident-deepvoice"), undefined);
  assert.deepEqual(eligibilityViolations(personaCardEligible), []);
  t.diagnostic(`[G563] 진리표 칸 ${Object.keys(SCENARIO_PROMPTS).length * LEVELS.length * 3}개 · 위반 0`);
});

test("[G563 역방향] 난이도를 안 보는 술어 · 메신저를 안 보는 술어 · 가족 사칭을 넣은 술어 · kidnapping을 뺀 술어는 진리표에서 실패한다", (t) => {
  const ignoresLevel = (i: PersonaCardEligibilityInput) => personaCardEligible({ ...i, difficultyLevel: "advanced" });
  const ignoresChannel = (i: PersonaCardEligibilityInput) => personaCardEligible({ ...i, channel: undefined });
  const addsFamily = (i: PersonaCardEligibilityInput) =>
    personaCardEligible(i) || (i.scenarioId === "family-accident-deepvoice" && i.difficultyLevel === "advanced" && i.channel !== "messenger");
  const dropsKidnapping = (i: PersonaCardEligibilityInput) => i.scenarioId !== "kidnapping-threat" && personaCardEligible(i);
  for (const [name, pred] of [
    ["난이도 무시", ignoresLevel],
    ["채널 무시", ignoresChannel],
    ["가족 사칭 포함", addsFamily],
    ["kidnapping 제외(옛 4종 계열)", dropsKidnapping],
  ] as const) {
    const violations = eligibilityViolations(pred);
    assert.ok(violations.length > 0, `${name} 사본이 진리표를 통과했다 — 검사가 무력하다`);
    t.diagnostic(`[G563 역방향] ${name} → 위반 ${violations.length}건(예: ${violations[0]}) — 실패 확인`);
  }
});

// ── G626 입력 검증 ───────────────────────────────────────────────────────────

/** [원값, 기대: 정리된 입력 | "invalid" | undefined(카드 0)] */
const INPUT_CASES: Array<[string, unknown, Record<string, unknown> | "invalid" | undefined]> = [
  ["부재", undefined, undefined],
  ["null", null, undefined],
  ["빈 객체", {}, undefined],
  ["세 칸 모두 빈 값", { name: "", region: "" }, undefined],
  ["이름 공백만", { name: "   " }, undefined],
  ["전부", { name: "홍길동", birthYear: 1962, region: "경기도" }, { name: "홍길동", birthYear: 1962, region: "경기도" }],
  ["이름만 · 앞뒤 공백 · 연속 공백 정리", { name: "  남궁  민수 " }, { name: "남궁 민수" }],
  ["영문 이름", { name: "Kim Minsu" }, { name: "Kim Minsu" }],
  ["이름 2자(하한)", { name: "이산" }, { name: "이산" }],
  ["이름 10자(상한)", { name: "가나다라마바사아자차" }, { name: "가나다라마바사아자차" }],
  ["출생 연도 하한", { birthYear: 1920 }, { birthYear: 1920 }],
  ["출생 연도 상한(올해−14)", { birthYear: NOW_YEAR - 14 }, { birthYear: NOW_YEAR - 14 }],
  ["사는 곳 광역시", { region: "부산광역시" }, { region: "부산광역시" }],
  // §88 후속(UX D-133) — 생일(월 · 일): 둘 다 · 출생 연도와 함께 · 실제 날짜일 때만.
  ["생일 포함", { birthYear: 1965, birthMonth: 3, birthDay: 2 }, { birthYear: 1965, birthMonth: 3, birthDay: 2 }],
  ["생일 null = 넣지 않음", { birthYear: 1965, birthMonth: null, birthDay: null }, { birthYear: 1965 }],
  ["윤년 2월 29일", { birthYear: 1964, birthMonth: 2, birthDay: 29 }, { birthYear: 1964, birthMonth: 2, birthDay: 29 }],
  ["12월 31일(상한)", { birthYear: 1970, birthMonth: 12, birthDay: 31 }, { birthYear: 1970, birthMonth: 12, birthDay: 31 }],
  ["이름 1자", { name: "홍" }, "invalid"],
  ["이름 11자", { name: "가나다라마바사아자차카" }, "invalid"],
  ["이름에 숫자", { name: "홍길동1" }, "invalid"],
  ["이름에 기호", { name: "홍길동!" }, "invalid"],
  ["이름이 문자열 아님", { name: 3 }, "invalid"],
  ["이름에 실존 은행명", { name: "국민은행" }, "invalid"],
  ["출생 연도 하한 밖", { birthYear: 1919 }, "invalid"],
  ["출생 연도 상한 밖", { birthYear: NOW_YEAR - 13 }, "invalid"],
  ["출생 연도 소수", { birthYear: 1962.5 }, "invalid"],
  ["출생 연도 문자열", { birthYear: "1962" }, "invalid"],
  ["사는 곳 목록 밖", { region: "수원시" }, "invalid"],
  ["생일 월만", { birthYear: 1965, birthMonth: 3 }, "invalid"],
  ["생일 일만", { birthYear: 1965, birthDay: 2 }, "invalid"],
  ["연도 없이 월 · 일(OQ-U102 권고안 = 거부)", { birthMonth: 3, birthDay: 2 }, "invalid"],
  ["평년 2월 29일", { birthYear: 1965, birthMonth: 2, birthDay: 29 }, "invalid"],
  ["4월 31일", { birthYear: 1965, birthMonth: 4, birthDay: 31 }, "invalid"],
  ["13월", { birthYear: 1965, birthMonth: 13, birthDay: 1 }, "invalid"],
  ["0일", { birthYear: 1965, birthMonth: 1, birthDay: 0 }, "invalid"],
  ["월 문자열", { birthYear: 1965, birthMonth: "3", birthDay: 2 }, "invalid"],
  ["일 소수", { birthYear: 1965, birthMonth: 3, birthDay: 2.5 }, "invalid"],
  ["사는 곳 옛 가림 형식", { region: "경기도 ○○시" }, "invalid"],
  // §93(UX D-136) — 하는 일 · 자녀 칸(고정 선택지 · 이름 규칙 · 학년/학원 = 자녀 이름 필요). 시나리오 종류 판정은 이 표 밖(조합 테스트).
  ["하는 일", { name: "홍길동", job: "회사원" }, { name: "홍길동", job: "회사원" }],
  ["하는 일만", { job: "프리랜서" }, { job: "프리랜서" }],
  ["하는 일 빈 값", { job: "" }, undefined],
  [
    "자녀 전부",
    { childName: "김민준", childGrade: "초등학교 3학년", childAcademy: "영어학원" },
    { childName: "김민준", childGrade: "초등학교 3학년", childAcademy: "영어학원" },
  ],
  ["자녀 이름만 · 공백 정리", { childName: "  김 지우 " }, { childName: "김 지우" }],
  ["자녀 이름 + 학원", { childName: "지우", childAcademy: "태권도장" }, { childName: "지우", childAcademy: "태권도장" }],
  ["하는 일 목록 밖(실명 회사)", { job: "삼성전자" }, "invalid"],
  ["하는 일 문자열 아님", { job: 1 }, "invalid"],
  ["자녀 이름 1자", { childName: "준" }, "invalid"],
  ["자녀 이름에 숫자", { childName: "민준2" }, "invalid"],
  ["자녀 이름에 실존 은행명", { childName: "신한은행" }, "invalid"],
  ["자녀 학년만(이름 없이)", { childGrade: "중학교 1학년" }, "invalid"],
  ["자녀 학원만(이름 없이)", { childAcademy: "영어학원" }, "invalid"],
  ["자녀 학년 목록 밖", { childName: "김민준", childGrade: "초등학교 7학년" }, "invalid"],
  ["자녀 학원 실명(목록 밖)", { childName: "김민준", childAcademy: "○○어학원" }, "invalid"],
  ["자녀 학원 앞뒤 공백(정확 일치만)", { childName: "김민준", childAcademy: " 영어학원" }, "invalid"],
  ["모르는 키(완성 카드 주입)", { name: "홍길동", items: [] }, "invalid"],
  ["모르는 키(자녀 학교 실명)", { childName: "김민준", childSchool: "○○초등학교" }, "invalid"],
  ["배열", [], "invalid"],
  ["문자열", "홍길동", "invalid"],
];

/** 검증기 위반 목록 — 실제 검증기와 오염 사본에 똑같이 돌린다. */
function inputViolations(reader: (raw: unknown) => ReturnType<typeof readPersonaCardInput>): string[] {
  const out: string[] = [];
  for (const [name, raw, expected] of INPUT_CASES) {
    const result = reader(raw);
    if (expected === "invalid") {
      if (result.ok) out.push(`${name}: 통과했다(거부 기대)`);
    } else if (!result.ok) {
      out.push(`${name}: 거부됐다`);
    } else if (JSON.stringify(result.input) !== JSON.stringify(expected)) {
      out.push(`${name}: ${JSON.stringify(result.input)} (기대 ${JSON.stringify(expected)})`);
    }
  }
  return out;
}

test("[G626] 입력 검증 진리표 — 정상 · 경계 · 빈 값(카드 0) · 거부", (t) => {
  assert.deepEqual(inputViolations((raw) => readPersonaCardInput(raw, NOW_YEAR)), []);
  assert.equal(personaBirthYearMax(NOW_YEAR), NOW_YEAR - 14);
  t.diagnostic(`[G626 정상] ${INPUT_CASES.length}건 기대대로`);
});

test("[G626 역방향] 검증 없이 원값을 그대로 받는 사본 · 길이만 보는 사본은 진리표에서 실패한다", (t) => {
  const passThrough = (raw: unknown) => ({ ok: true as const, input: raw as Record<string, never> | undefined });
  const lengthOnly = (raw: unknown) => {
    const r = raw as { name?: unknown } | undefined;
    if (r && typeof r.name === "string" && r.name.length > 10) return { ok: false as const };
    return readPersonaCardInput(raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw, name: undefined } : raw, NOW_YEAR);
  };
  // §88 후속 — 생일 검사를 빼고(월 · 일을 지우고) 읽는 사본: 월만 · 연도 없이 · 없는 날짜가 통과해야 걸린다.
  const ignoresBirthday = (raw: unknown) =>
    readPersonaCardInput(
      raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw, birthMonth: undefined, birthDay: undefined } : raw,
      NOW_YEAR,
    );
  for (const [name, reader] of [
    ["검증 없음", passThrough],
    ["이름 길이만", lengthOnly],
    ["생일 무시", ignoresBirthday],
  ] as const) {
    const violations = inputViolations(reader);
    assert.ok(violations.length > 0, `${name} 사본이 통과했다 — 검사가 무력하다`);
    t.diagnostic(`[G626 역방향] ${name} → 위반 ${violations.length}건(예: ${violations[0]}) — 실패 확인`);
  }
});

test("[G626] 조합 — 입력 없음 = 카드 0(대상이어도) · 입력 + 대상 = v2 카드 · 입력 + 대상 밖 = not-applicable · 규칙 밖 = invalid", () => {
  const target: PersonaCardEligibilityInput = { scenarioId: "loan-refinance-scam", difficultyLevel: "advanced", channel: undefined };
  assert.deepEqual(resolvePersonaCardRequest(undefined, target, "self", NOW_YEAR), { ok: true, personaCard: undefined });
  assert.deepEqual(resolvePersonaCardRequest({ name: "" }, { ...target, difficultyLevel: "beginner" }, "self", NOW_YEAR), {
    ok: true,
    personaCard: undefined,
  });
  assert.deepEqual(resolvePersonaCardRequest({ name: "홍길동", birthYear: 1962, region: "충청남도" }, target, "sender", NOW_YEAR), {
    ok: true,
    personaCard: {
      v: 2,
      inputBy: "sender",
      items: [
        { key: "name", label: "이름", value: "홍길동" },
        { key: "birthYear", label: "출생 연도", value: "1962년생" },
        { key: "region", label: "사는 곳", value: "충청남도" },
      ],
    },
  });
  assert.deepEqual(resolvePersonaCardRequest({ name: "홍길동" }, { ...target, difficultyLevel: "intermediate" }, "self", NOW_YEAR), {
    ok: false,
    reason: PERSONA_CARD_NOT_APPLICABLE_REASON,
  });
  assert.deepEqual(resolvePersonaCardRequest({ name: "홍길동" }, { ...target, channel: "messenger" }, "self", NOW_YEAR), {
    ok: false,
    reason: PERSONA_CARD_NOT_APPLICABLE_REASON,
  });
  assert.deepEqual(resolvePersonaCardRequest({ name: "홍" }, target, "self", NOW_YEAR), { ok: false, reason: PERSONA_CARD_INVALID_REASON });
  // 넣은 항목만 · 순서 고정(이름 → 출생 연도 → 사는 곳).
  const partial = buildPersonaCard({ input: { region: "제주특별자치도", birthYear: 1970 }, inputBy: "self" })!;
  assert.deepEqual(partial.items.map((i) => i.key), ["birthYear", "region"]);
  assert.equal(buildPersonaCard({ input: {}, inputBy: "self" }), undefined);
  // §88 후속 — 생일이 있으면 출생 연도 행 대신 생년월일 행 1개(자리 = 출생 연도 자리).
  assert.deepEqual(
    resolvePersonaCardRequest({ name: "홍길동", birthYear: 1965, birthMonth: 3, birthDay: 2, region: "경기도" }, target, "self", NOW_YEAR),
    {
      ok: true,
      personaCard: {
        v: 2,
        inputBy: "self",
        items: [
          { key: "name", label: "이름", value: "홍길동" },
          { key: "birthDate", label: "생년월일", value: "1965년 3월 2일생" },
          { key: "region", label: "사는 곳", value: "경기도" },
        ],
      },
    },
  );
  assert.deepEqual(resolvePersonaCardRequest({ birthYear: 1965, birthMonth: 2, birthDay: 30 }, target, "self", NOW_YEAR), {
    ok: false,
    reason: PERSONA_CARD_INVALID_REASON,
  });
});

test("[G626] 저장된 카드 읽기 — v2 모양만 통과(모양 이상 = 카드 0)", () => {
  const card = buildPersonaCard({ input: { name: "홍길동" }, inputBy: "sender" });
  assert.deepEqual(readStoredPersonaCard(card), card);
  assert.equal(readStoredPersonaCard(undefined), undefined);
  assert.equal(readStoredPersonaCard({ v: 1, items: card!.items }), undefined);
  assert.equal(readStoredPersonaCard({ v: 2, inputBy: "other", items: card!.items }), undefined);
  assert.equal(readStoredPersonaCard({ v: 2, inputBy: "sender", items: [] }), undefined);
  assert.equal(readStoredPersonaCard({ v: 2, inputBy: "sender", items: [{ key: "evil", label: "x", value: "y" }] }), undefined);
  // §88 후속 — 옛 카드(출생 연도 행) · 새 카드(생년월일 행) 둘 다 읽는다(하위호환).
  const oldCard = buildPersonaCard({ input: { birthYear: 1962 }, inputBy: "self" });
  const newCard = buildPersonaCard({ input: { birthYear: 1962, birthMonth: 11, birthDay: 5 }, inputBy: "sender" });
  assert.deepEqual(readStoredPersonaCard(oldCard), oldCard);
  assert.deepEqual(readStoredPersonaCard(newCard), newCard);
  assert.deepEqual(newCard!.items.map((i) => i.key), ["birthDate"]);
  // 리뷰 m4 — 프로토타입 키("constructor")도 거부한다.
  assert.equal(readStoredPersonaCard({ v: 2, inputBy: "sender", items: [{ key: "constructor", label: "x", value: "y" }] }), undefined);
});

// ── G565 값 무해화(§88 — 입력이 통과한 값) ─────────────────────────────────────

function cardItemViolations(item: PersonaCardItem): string[] {
  const out: string[] = [];
  if (replaceRealFinancialNames(item.value).replacedCount > 0) out.push(`실존 금융사명: ${item.value}`);
  if (hasBankPlaceholder(item.value)) out.push(`은행 자리표시자 패턴: ${item.value}`);
  if (/\d{5,}/.test(item.value)) out.push(`5자리 이상 숫자열: ${item.value}`);
  if (item.key === "region" && !PERSONA_REGION_POOL.some((r) => r.name === item.value)) out.push(`지역 형식: ${item.value}`);
  if (!INPUT_KEYS.has(item.key)) out.push(`입력 대상 밖 행: ${item.key}`);
  // §93 — 선택지 행은 목록 값만.
  if (item.key === "job" && !PERSONA_JOB_OPTIONS.includes(item.value)) out.push(`하는 일 형식: ${item.value}`);
  if (item.key === "childGrade" && !PERSONA_CHILD_GRADE_OPTIONS.includes(item.value)) out.push(`학년 형식: ${item.value}`);
  if (item.key === "childAcademy" && !PERSONA_CHILD_ACADEMY_OPTIONS.includes(item.value)) out.push(`학원 형식: ${item.value}`);
  if (item.label !== PERSONA_CARD_LABELS[item.key]) out.push(`라벨: ${item.label}`);
  return out;
}

test("[G565 · §88] 입력이 통과한 카드 — 시 · 도 17 × 대표 입력 전부 위반 0 · 시 · 도 목록 자체가 실존 금융사명 · 자리표시자 0", (t) => {
  assert.equal(PERSONA_REGION_POOL.length, 17);
  assert.equal(new Set(PERSONA_REGION_POOL.map((r) => r.name)).size, 17, "시 · 도 중복");
  const failures: string[] = [];
  let cards = 0;
  for (const region of PERSONA_REGION_POOL) {
    assert.equal(replaceRealFinancialNames(region.name).replacedCount, 0, region.name);
    assert.equal(hasBankPlaceholder(region.name), false, region.name);
    for (const [name, birthday] of [
      ["홍길동", {}],
      ["Kim Minsu", { birthMonth: 12, birthDay: 31 }],
      ["남궁 민수", { birthMonth: 2, birthDay: 28 }],
    ] as const) {
      const read = readPersonaCardInput({ name, birthYear: 1962, ...birthday, region: region.name }, NOW_YEAR);
      assert.ok(read.ok && read.input);
      const card = buildPersonaCard({ input: read.input, inputBy: "self" })!;
      cards += 1;
      for (const item of card.items) failures.push(...cardItemViolations(item).map((v) => `${region.name}/${name}: ${v}`));
    }
  }
  // §93 — 선택지 목록 자체 · 협박형 카드(하는 일 × 학년 × 학원 전 조합)도 위반 0.
  for (const option of [...PERSONA_JOB_OPTIONS, ...PERSONA_CHILD_GRADE_OPTIONS, ...PERSONA_CHILD_ACADEMY_OPTIONS]) {
    assert.equal(replaceRealFinancialNames(option).replacedCount, 0, option);
    assert.equal(hasBankPlaceholder(option), false, option);
  }
  for (const job of PERSONA_JOB_OPTIONS) {
    const read = readPersonaCardInput({ name: "홍길동", birthYear: 1962, region: "경기도", job }, NOW_YEAR);
    assert.ok(read.ok && read.input);
    const card = buildPersonaCard({ input: read.input, inputBy: "self" })!;
    cards += 1;
    for (const item of card.items) failures.push(...cardItemViolations(item).map((v) => `${job}: ${v}`));
  }
  for (const childGrade of PERSONA_CHILD_GRADE_OPTIONS) {
    for (const childAcademy of PERSONA_CHILD_ACADEMY_OPTIONS) {
      const read = readPersonaCardInput({ childName: "김민준", childGrade, childAcademy }, NOW_YEAR);
      assert.ok(read.ok && read.input);
      const card = buildPersonaCard({ input: read.input, inputBy: "sender" })!;
      cards += 1;
      for (const item of card.items) failures.push(...cardItemViolations(item).map((v) => `${childGrade}/${childAcademy}: ${v}`));
    }
  }
  assert.deepEqual(failures, []);
  t.diagnostic(`[G565 정상] 카드 ${cards}장 위반 0`);
});

test("[§93] 카드 종류 맞춤 — 대상이어도 그 종류에 없는 칸은 not-applicable · 맞는 칸만이면 카드(순서 고정)", (t) => {
  const at = (scenarioId: string): PersonaCardEligibilityInput => ({ scenarioId, difficultyLevel: "advanced", channel: undefined });
  const NA = { ok: false, reason: PERSONA_CARD_NOT_APPLICABLE_REASON };
  // 판정표 — [시나리오, 원값, 기대(카드 행 키 | "NA")].
  const cases: Array<[string, Record<string, unknown>, string[] | "NA"]> = [
    ["tax-refund-scam", { name: "홍길동", birthYear: 1962 }, ["name", "birthYear"]],
    ["bank-security-verify-scam", { name: "홍길동", birthYear: 1965, birthMonth: 3, birthDay: 2 }, ["name", "birthDate"]],
    ["asset-protection-notice-call", { region: "서울특별시" }, ["region"]],
    ["prosecution-cooperation-call", { name: "홍길동" }, ["name"]],
    ["institutional-impersonation", { name: "홍길동", job: "회사원" }, "NA"],
    ["institutional-impersonation", { childName: "김민준" }, "NA"],
    ["reputation-blackmail-scam", { name: "홍길동", birthYear: 1962, region: "경기도", job: "공무원" }, ["name", "birthYear", "region", "job"]],
    ["reputation-blackmail-scam", { childName: "김민준" }, "NA"],
    ["kidnapping-threat", { childName: "김민준", childGrade: "초등학교 3학년", childAcademy: "영어학원" }, ["childName", "childGrade", "childAcademy"]],
    ["kidnapping-threat", { childName: "김민준", name: "홍길동" }, "NA"],
    ["kidnapping-threat", { region: "경기도" }, "NA"],
    ["kidnapping-threat", { job: "교사" }, "NA"],
  ];
  for (const [scenarioId, raw, expected] of cases) {
    const result = resolvePersonaCardRequest(raw, at(scenarioId), "self", NOW_YEAR);
    if (expected === "NA") assert.deepEqual(result, NA, `${scenarioId} ${JSON.stringify(raw)}`);
    else {
      assert.ok(result.ok && result.personaCard, `${scenarioId} ${JSON.stringify(raw)}`);
      assert.deepEqual(result.personaCard.items.map((i) => i.key), expected, scenarioId);
    }
  }
  // 대상 밖 시나리오 = 거짓(종류 없음) · 협박형 고급 전용 아님 — 중급이면 not-applicable(종류보다 술어가 먼저).
  assert.equal(personaCardInputFitsScenario({ name: "홍길동" }, "family-accident-deepvoice"), false);
  assert.deepEqual(resolvePersonaCardRequest({ childName: "김민준" }, { ...at("kidnapping-threat"), difficultyLevel: "intermediate" }, "self", NOW_YEAR), NA);
  // 역방향 — 종류를 안 보는 사본(대상이면 어떤 칸이든 통과)은 이 판정표에서 걸린다.
  const ignoresKind = (raw: Record<string, unknown>, scenarioId: string) => {
    const read = readPersonaCardInput(raw, NOW_YEAR);
    return read.ok && read.input && personaCardEligible(at(scenarioId)) ? buildPersonaCard({ input: read.input, inputBy: "self" }) : undefined;
  };
  const leaked = cases.filter(([id, raw, exp]) => exp === "NA" && ignoresKind(raw, id) !== undefined);
  assert.ok(leaked.length > 0, "종류를 안 보는 사본이 판정표를 통과했다 — 검사가 무력하다");
  t.diagnostic(`[§93] 판정표 ${cases.length}행 기대대로 · 종류 무시 사본 → 새는 행 ${leaked.length}건(실패 확인)`);
});

test("[G565 역방향] 실존 은행 행 · 목록 밖 지역 · 긴 숫자열 · 입력 대상 밖 행이 든 카드 사본은 실패한다", (t) => {
  const samples: Array<[string, PersonaCardItem]> = [
    ["실존 은행명", { key: "bank", label: "거래 은행", value: "국민은행" }],
    ["목록 밖 지역", { key: "region", label: "사는 곳", value: "경기도 수원시" }],
    ["긴 숫자열", { key: "name", label: "이름", value: "홍길동12345" }],
    ["입력 대상 밖 행", { key: "loan", label: "대출", value: "저축은행 대출 이용 중" }],
  ];
  for (const [name, item] of samples) {
    const violations = cardItemViolations(item);
    assert.ok(violations.length > 0, `${name} 샘플이 통과했다 — 검사가 무력하다`);
    t.diagnostic(`[G565 역방향] ${name} → ${violations.join(" / ")} — 실패 확인`);
  }
});

// ── G627 배선(소스 스캔) ───────────────────────────────────────────────────────

/** 콜러블 핸들러의 `request.data` 구조분해 바인딩 이름(AST). */
function requestBindings(source: string, callableName: string): string[] {
  const file = ts.createSourceFile("index.ts", source, ts.ScriptTarget.ES2020, true);
  const names: string[] = [];
  let found = 0;
  const visit = (node: ts.Node, inside: boolean): void => {
    let within = inside;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === callableName) within = true;
    if (
      within &&
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      /^request\.data\b/.test(node.initializer.getText(file))
    ) {
      found += 1;
      for (const element of node.name.elements) names.push((element.propertyName ?? element.name).getText(file));
    }
    ts.forEachChild(node, (child) => visit(child, within));
  };
  visit(file, false);
  assert.equal(found, 1, `${callableName}의 request.data 구조분해를 정확히 1개 찾아야 한다(찾음 ${found}) — 게이트가 죽었다`);
  return names;
}

/** 요청 바인딩 위반 — 완성 카드(`personaCard`)를 읽거나 원값(`personaCardInput`)을 읽지 않으면 위반. */
function bindingViolations(names: string[]): string[] {
  const out: string[] = [];
  if (names.includes("personaCard")) out.push("요청의 완성 카드(personaCard)를 읽는다");
  if (!names.includes("personaCardInput")) out.push("요청의 원값(personaCardInput)을 읽지 않는다");
  return out;
}

test("[G627] createSession · createChallenge 요청 구조분해 = 원값(personaCardInput) 1 · 완성 카드(personaCard) 0 — 완성 카드를 읽는 사본은 걸린다(AST)", (t) => {
  const session = readSrc("session/index.ts");
  const challenge = readSrc("challenge/index.ts");
  for (const [name, source] of [
    ["createSession", session],
    ["createChallenge", challenge],
  ] as const) {
    const names = requestBindings(source, name);
    assert.deepEqual(bindingViolations(names), [], name);
    t.diagnostic(`[G627 정상] ${name} 요청 구조분해 = {${names.join(", ")}}`);
  }
  const poisoned = session.replace("      personaCardInput,\n    } = request.data ?? {};", "      personaCard,\n    } = request.data ?? {};");
  assert.notEqual(poisoned, session, "오염 사본 생성 실패 — 앵커가 바뀌었다");
  const violations = bindingViolations(requestBindings(poisoned, "createSession"));
  assert.ok(violations.length === 2, violations.join(" / "));
  t.diagnostic(`[G627 역방향] 완성 카드를 읽는 사본 → ${violations.join(" / ")} — 실패 확인`);
});

test("[G627] 검증 위치 — 두 콜러블 모두 조합 함수 1곳 · 첫 Firestore 접근 앞 · 실패는 invalid-argument + reason으로 알린다", () => {
  const session = readSrc("session/index.ts");
  const challenge = readSrc("challenge/index.ts");
  for (const [name, source, inputBy, firestoreMarker] of [
    ["createSession", session, '"self"', "const db = getFirestore();"],
    ["createChallenge", challenge, '"sender"', "const db = getFirestore();"],
  ] as const) {
    const resolveAt = source.indexOf("const personaCardResult = resolvePersonaCardRequest(");
    assert.ok(resolveAt > -1, `${name}: 조합 함수 호출이 없다`);
    assert.equal(source.split("resolvePersonaCardRequest(").length - 1, 1, `${name}: 조합 함수 호출이 정확히 1곳이어야 한다`);
    assert.ok(source.slice(resolveAt, resolveAt + 400).includes(inputBy), `${name}: inputBy = ${inputBy}`);
    const dbAt = source.indexOf(firestoreMarker, source.indexOf(`export const ${name}`));
    assert.ok(dbAt > resolveAt, `${name}: 검증(${resolveAt})이 첫 Firestore(${dbAt})보다 앞이어야 한다`);
    assert.match(source, /throw new HttpsError\("invalid-argument", "[^"]+", \{ reason: personaCardResult\.reason \}\);/, name);
  }
  assert.match(session, /\.\.\.\(personaCard \? \{ personaCard \} : \{\}\),/, "createSession: 카드 없는 세션은 필드 부재");
  assert.match(session, /personaCard: personaCard\?\.items, voiceSelectionSource \}/, "createSession: 오프닝에 같은 카드");
  assert.match(challenge, /\.\.\.\(personaCard \? \{ personaCard \} : \{\}\),/, "createChallenge: 입력 없는 챌린지는 필드 부재");
});

test("[G627] consentChallenge — 챌린지 카드를 오프닝 · 수신자 세션에 같이 넘기고, 소모(같은 트랜잭션) · 폐기 때 챌린지 문서에서 지운다", () => {
  const access = readSrc("challenge/userAccess.ts");
  assert.match(access, /const personaCard = readStoredPersonaCard\(preChallenge\?\.personaCard\);/);
  assert.match(access, /challengeId: resolved\.challengeId, personaCard: personaCard\?\.items, voiceSelectionSource: undefined \}/);
  assert.match(access, /\.\.\.\(personaCard \? \{ personaCard \} : \{\}\),/);
  const txAt = access.indexOf("const claim = await db.runTransaction(");
  const consumeAt = access.indexOf("await markChallengeConsumed(resolved.challengeId, tx);");
  const setAt = access.indexOf("tx.set(sessionRef, sessionDoc);");
  assert.ok(txAt > -1 && consumeAt > txAt && setAt > consumeAt, "소모 · 세션 쓰기가 같은 트랜잭션 안");
  const index = readSrc("challenge/index.ts");
  const consumeFn = index.slice(index.indexOf("export async function markChallengeConsumed("));
  assert.match(consumeFn.slice(0, 900), /personaCard: FieldValue\.delete\(\),/, "소모 쓰기가 카드를 지운다");
  assert.match(index, /update\(\{ status: "deleted", personaCard: FieldValue\.delete\(\) \}\)/, "폐기가 카드를 지운다");
  // 랜딩 응답(수신자 동의 전 화면)에는 카드가 없다.
  const landing = access.slice(access.indexOf("export const getChallengeLanding"), access.indexOf("export const consentChallenge"));
  assert.equal(/personaCard/.test(landing), false, "랜딩이 카드를 다룬다");
});

// ── G566 계정 정보 0 ────────────────────────────────────────────────────────

const ACCOUNT_IDENTIFIERS = /\b(auth|displayName|email|uid)\b/;
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function accountInfoViolations(personaCardSource: string, catalogSource: string): string[] {
  const out: string[] = [];
  const block = /export type BuildPersonaCardInput = \{([\s\S]*?)\n\};/.exec(personaCardSource);
  if (!block) return ["BuildPersonaCardInput 정의를 못 찾았다(게이트가 죽었다)"];
  const keys = [...stripComments(block[1]!).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  if (JSON.stringify(keys) !== JSON.stringify(["input", "inputBy"])) out.push(`매개변수 키: ${keys.join(", ")}`);
  for (const [file, source] of [
    ["personaCard.ts", personaCardSource],
    ["personaCardCatalog.ts", catalogSource],
  ] as const) {
    const hit = ACCOUNT_IDENTIFIERS.exec(stripComments(source));
    if (hit) out.push(`${file}: 계정 식별자 ${hit[1]}`);
  }
  return out;
}

test("[G566 · AC-104 (h) ⓒ] 계정 정보 0 — 조립 매개변수 키 = {input, inputBy} 고정 · 계정 식별자 0 / 표시 이름 매개변수를 더한 사본은 실패한다", (t) => {
  const personaCardSource = readSrc("session/personaCard.ts");
  const catalogSource = readSrc("scenarios/personaCardCatalog.ts");
  assert.deepEqual(accountInfoViolations(personaCardSource, catalogSource), []);
  t.diagnostic("[G566 정상] 매개변수 키 2개 · 계정 식별자 0");
  const poisoned = personaCardSource.replace(
    "export type BuildPersonaCardInput = {\n",
    "export type BuildPersonaCardInput = {\n  displayName: string;\n",
  );
  assert.notEqual(poisoned, personaCardSource, "오염 사본 생성 실패 — 앵커가 바뀌었다");
  const violations = accountInfoViolations(poisoned, catalogSource);
  assert.ok(violations.length >= 2, `표시 이름 사본이 통과했다: ${violations.join(" / ")}`);
  t.diagnostic(`[G566 역방향] 표시 이름 매개변수 사본 → ${violations.join(" / ")} — 실패 확인`);
});
