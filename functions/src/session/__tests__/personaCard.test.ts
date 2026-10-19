// T194-b(docs/Architecture.md §84.3 · §84.8 G563 · G564 · G565 · G566 · PRD AC-104 (h) ⓐ~ⓓ) — 훈련용 가상 신상 카드.
// ⭐ 역방향(AC-104 (h))은 **같은 실행 출력**에 정상 샘플 통과와 나란히 낸다: 각 검사 함수를 실제 값과 오염 사본에 둘 다 돌린다.
// ⛔ 오염은 테스트 안의 사본에서만 한다(실제 소스 · 카탈로그는 건드리지 않는다 — harmlessnessGate.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import {
  buildPersonaCard,
  personaCardEligible,
  pickPersonaCardBank,
  resolveSessionPersonaCard,
  type PersonaCardEligibilityInput,
} from "../personaCard";
import {
  PERSONA_CARD_FIXED_VALUES,
  PERSONA_CARD_LABELS,
  PERSONA_CARD_ROWS,
  PERSONA_CARD_SCENARIOS,
  PERSONA_NAME_POOL,
  PERSONA_REGION_MASK_SUFFIX,
  PERSONA_REGION_POOL,
} from "../../scenarios/personaCardCatalog";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { FICTIONAL_BANK_NAMES, hasBankPlaceholder } from "../../shared/fictionalBank";
import { replaceRealFinancialNames } from "../../guardrails/realFinancialNames";
import type { DifficultyLevel } from "../../shared/difficulty";
import type { PersonaCardItem } from "../../shared/types";

const SRC = path.resolve(__dirname, "../../../src");
const readSrc = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const LEVELS: readonly DifficultyLevel[] = ["beginner", "intermediate", "advanced"];
/** User 결정(2026-10-20)의 기대 대상 — 데이터 상수와 **따로** 적는다(상수만 고치면 여기서 걸린다). */
const EXPECTED_TARGETS = [
  "card-company-impersonation",
  "courier-customs-scam",
  "institutional-impersonation",
  "loan-refinance-scam",
];

type SessionKind = "self-voice" | "self-messenger" | "challenge";
function eligibilityInput(scenarioId: string, difficultyLevel: DifficultyLevel, kind: SessionKind): PersonaCardEligibilityInput {
  return {
    scenarioId,
    difficultyLevel,
    challengeId: kind === "challenge" ? "ch-1" : undefined,
    channel: kind === "self-messenger" ? "messenger" : undefined,
  };
}

/** G563 진리표 위반 목록 — 술어를 인자로 받아 실제 술어와 오염 사본에 똑같이 돌린다. */
function eligibilityViolations(pred: (input: PersonaCardEligibilityInput) => boolean): string[] {
  const out: string[] = [];
  for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
    for (const level of LEVELS) {
      for (const kind of ["self-voice", "self-messenger", "challenge"] as const) {
        const expected = EXPECTED_TARGETS.includes(scenarioId) && level === "advanced" && kind === "self-voice";
        const actual = pred(eligibilityInput(scenarioId, level, kind));
        if (actual !== expected) out.push(`${scenarioId}/${level}/${kind}: ${actual} (기대 ${expected})`);
      }
    }
  }
  return out;
}

test("[G563] 대상 술어 진리표 — 전 시나리오 × 3난이도 × {자가 통화 · 자가 메신저 · 챌린지}에서 4종 × 고급 × 자가 통화만 참", (t) => {
  assert.deepEqual([...PERSONA_CARD_SCENARIOS].sort(), EXPECTED_TARGETS, "대상 상수가 User 결정(2026-10-20 · 4종)과 다르다");
  assert.equal(PERSONA_CARD_SCENARIOS.includes("kidnapping-threat"), false, "kidnapping-threat는 대상에서 빠졌다(User 결정)");
  assert.deepEqual(eligibilityViolations(personaCardEligible), []);
  const cells = Object.keys(SCENARIO_PROMPTS).length * LEVELS.length * 3;
  t.diagnostic(`[G563] 진리표 칸 ${cells}개 · 참 ${EXPECTED_TARGETS.length}개`);
});

test("[G563 역방향 · AC-104 (h) ⓓ] 대상 밖에 카드가 붙는 사본 — 난이도를 안 보는 술어 · 챌린지를 안 보는 술어 · kidnapping을 넣은 술어는 진리표에서 실패한다", (t) => {
  const ignoresLevel = (i: PersonaCardEligibilityInput) => personaCardEligible({ ...i, difficultyLevel: "advanced" });
  const ignoresChallenge = (i: PersonaCardEligibilityInput) => personaCardEligible({ ...i, challengeId: undefined });
  const addsKidnapping = (i: PersonaCardEligibilityInput) =>
    personaCardEligible(i) || (i.scenarioId === "kidnapping-threat" && i.difficultyLevel === "advanced" && !i.challengeId && !i.channel);
  for (const [name, pred] of [
    ["난이도 무시", ignoresLevel],
    ["챌린지 무시", ignoresChallenge],
    ["kidnapping 포함", addsKidnapping],
  ] as const) {
    const violations = eligibilityViolations(pred);
    assert.ok(violations.length > 0, `${name} 사본이 진리표를 통과했다 — 검사가 무력하다`);
    t.diagnostic(`[G563 역방향] ${name} → 위반 ${violations.length}건(예: ${violations[0]}) — 실패 확인`);
  }
  t.diagnostic(`[G563 정상] 실제 술어 → 위반 ${eligibilityViolations(personaCardEligible).length}건`);
});

test("[G563] createSession 조합 — 술어가 참일 때만 카드가 생기고, 생성이 throw하면 필드 부재로 진행한다(UF-014 Failure (a))", () => {
  const build = { sessionId: "s-1", scenarioId: "institutional-impersonation", fictionalBankName: "한결은행" };
  assert.ok(resolveSessionPersonaCard(eligibilityInput("institutional-impersonation", "advanced", "self-voice"), build));
  assert.equal(resolveSessionPersonaCard(eligibilityInput("institutional-impersonation", "intermediate", "self-voice"), build), undefined);
  assert.equal(resolveSessionPersonaCard(eligibilityInput("institutional-impersonation", "advanced", "challenge"), build), undefined);
  const throwing = () => {
    throw new Error("boom");
  };
  assert.equal(
    resolveSessionPersonaCard(eligibilityInput("institutional-impersonation", "advanced", "self-voice"), build, throwing),
    undefined,
  );
});

test("[G563 배선] createSession은 조합 함수 1곳에서 자가 세션(challengeId: undefined)으로 평가하고 대상일 때만 필드를 쓴다 · 챌린지 경로는 카드를 만들지 않는다(소스 스캔)", () => {
  const session = readSrc("session/index.ts");
  assert.match(
    session,
    /const personaCard = resolveSessionPersonaCard\(\n\s*\{ scenarioId, difficultyLevel: resolvedDifficultyLevel, challengeId: undefined, channel \},\n\s*\{ sessionId: sessionRef\.id, scenarioId, fictionalBankName \},\n\s*\);/,
  );
  assert.match(session, /\.\.\.\(personaCard \? \{ personaCard \} : \{\}\),/, "대상 밖 세션은 필드 부재여야 한다");
  // 카드 생성(시드 = sessionRef.id)은 오프닝 호출보다 앞이고, sessionRef 확정은 그보다 앞이다.
  const refAt = session.indexOf("let sessionRef = db.collection(\"sessions\").doc();");
  const cardAt = session.indexOf("const personaCard = resolveSessionPersonaCard(");
  const openingAt = session.indexOf("await generateOpeningLine(");
  assert.ok(refAt > -1 && cardAt > refAt && openingAt > cardAt, `순서: sessionRef(${refAt}) → 카드(${cardAt}) → 오프닝(${openingAt})`);
  const challenge = readSrc("challenge/userAccess.ts");
  assert.equal(/resolveSessionPersonaCard|buildPersonaCard/.test(challenge), false, "챌린지 수신자 경로가 카드를 만든다");
  assert.match(challenge, /personaCard: undefined \}/, "챌린지 오프닝은 카드 없음을 명시로 넘긴다");
});

// ── G564 클라 입력 경로 0 ────────────────────────────────────────────────────

/** createSession 핸들러의 `request.data` 구조분해 바인딩 이름(AST). */
function createSessionRequestBindings(source: string): string[] {
  const file = ts.createSourceFile("index.ts", source, ts.ScriptTarget.ES2020, true);
  const names: string[] = [];
  let found = 0;
  const visit = (node: ts.Node, inCreateSession: boolean): void => {
    let inside = inCreateSession;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "createSession") inside = true;
    if (
      inside &&
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      /^request\.data\b/.test(node.initializer.getText(file))
    ) {
      found += 1;
      for (const element of node.name.elements) names.push((element.propertyName ?? element.name).getText(file));
    }
    ts.forEachChild(node, (child) => visit(child, inside));
  };
  visit(file, false);
  assert.equal(found, 1, `createSession의 request.data 구조분해를 정확히 1개 찾아야 한다(찾음 ${found}) — 게이트가 죽었다`);
  return names;
}

test("[G564 · AC-104 (h) ⓐ] createSession 요청 구조분해에 카드 필드가 없다(AST) — 요청에 카드를 실은 사본은 걸린다", (t) => {
  const source = readSrc("session/index.ts");
  const names = createSessionRequestBindings(source);
  assert.ok(names.includes("scenarioId") && names.includes("difficultyLevel"), `파싱 확인: ${names.join(", ")}`);
  assert.equal(names.includes("personaCard"), false, "createSession이 요청의 personaCard를 읽는다");
  t.diagnostic(`[G564 정상] 요청 구조분해 = {${names.join(", ")}} — personaCard 없음`);
  const poisoned = source.replace("      difficultyLevel,\n    } = request.data ?? {};", "      difficultyLevel,\n      personaCard,\n    } = request.data ?? {};");
  assert.notEqual(poisoned, source, "오염 사본 생성 실패 — 앵커가 바뀌었다");
  assert.equal(createSessionRequestBindings(poisoned).includes("personaCard"), true);
  t.diagnostic("[G564 역방향] 요청 구조분해에 personaCard를 더한 사본 → 검출됨(실패 확인)");
});

test("[G564] 저장값 = 서버 빌더 값 — 조합 함수에는 요청 값이 들어갈 자리가 없고, 같은 입력이면 같은 카드다", () => {
  const eligibility = eligibilityInput("loan-refinance-scam", "advanced", "self-voice");
  const build = { sessionId: "sess-abc", scenarioId: "loan-refinance-scam", fictionalBankName: "다온은행" };
  // 클라가 실어 보낸 것처럼 보이는 값을 섞어도(구조적 타이핑의 잉여 속성) 결과는 서버 빌더 값 그대로다.
  const clientSent = { ...build, personaCard: { v: 1, items: [{ key: "name", label: "이름", value: "주입값" }] } };
  assert.deepEqual(resolveSessionPersonaCard(eligibility, clientSent), buildPersonaCard(build));
  assert.deepEqual(buildPersonaCard(build), buildPersonaCard(build), "결정적이어야 한다(같은 sessionId → 같은 카드)");
});

// ── G565 값 풀 무해화 ───────────────────────────────────────────────────────

const REGION_FORMAT = new RegExp(`^(${PERSONA_REGION_POOL.map((r) => r.name).join("|")}) ○○시$`);

/** 카드 항목 1개의 금지 위반(G565) — 실제 카드와 오염 사본에 똑같이 돌린다. */
function cardItemViolations(item: PersonaCardItem, sessionBank: string): string[] {
  const out: string[] = [];
  if (replaceRealFinancialNames(item.value).replacedCount > 0) out.push(`실존 금융사명: ${item.value}`);
  if (hasBankPlaceholder(item.value)) out.push(`은행 자리표시자 패턴: ${item.value}`);
  if (/\d{5,}/.test(item.value)) out.push(`5자리 이상 숫자열: ${item.value}`);
  if (item.key === "region" && !REGION_FORMAT.test(item.value)) out.push(`지역 형식: ${item.value}`);
  if (item.key === "bank" && item.value === sessionBank) out.push(`카드 은행 = 세션 은행: ${item.value}`);
  if (item.key === "bank" && !FICTIONAL_BANK_NAMES.includes(item.value)) out.push(`가상 은행 목록 밖: ${item.value}`);
  if (item.label !== PERSONA_CARD_LABELS[item.key]) out.push(`라벨: ${item.label}`);
  return out;
}

const SEED_SAMPLES = Array.from({ length: 64 }, (_, i) => `seed-${i}-${(i * 2654435761) >>> 0}`);

test("[G565] 카드 값 무해화 — 전 대상 시나리오 × 세션 은행 8 × 시드 64: 실존 금융사명 0 · 은행 자리표시자 불일치 · 5자리 이상 숫자열 0 · 지역 형식 · 카드 은행 ≠ 세션 은행", (t) => {
  let cards = 0;
  const failures: string[] = [];
  for (const scenarioId of PERSONA_CARD_SCENARIOS) {
    for (const sessionBank of FICTIONAL_BANK_NAMES) {
      for (const sessionId of SEED_SAMPLES) {
        const card = buildPersonaCard({ sessionId, scenarioId, fictionalBankName: sessionBank })!;
        cards += 1;
        assert.equal(card.v, 1);
        assert.deepEqual(card.items.map((i) => i.key), PERSONA_CARD_ROWS[scenarioId]);
        assert.ok(card.items.length >= 3 && card.items.length <= 5, "항목 3~5행(D-119)");
        for (const item of card.items) failures.push(...cardItemViolations(item, sessionBank).map((v) => `${scenarioId}/${sessionBank}/${sessionId}: ${v}`));
      }
    }
  }
  assert.deepEqual(failures, []);
  t.diagnostic(`[G565 정상] 카드 ${cards}장 위반 0`);
});

test("[G565] 값 풀 자체 — 이름 3자 8개 이상 · 지역 8개(시 · 군 · 구 이하 실제 지명 0) · 가림 고정값 · 출생 연도 범위 · 풀 전체가 실존 금융사명 · 은행 자리표시자 0", () => {
  assert.ok(PERSONA_NAME_POOL.length >= 8);
  for (const name of PERSONA_NAME_POOL) assert.match(name, /^[가-힣]{3}$/, name);
  assert.equal(new Set(PERSONA_NAME_POOL).size, PERSONA_NAME_POOL.length, "이름 중복");
  assert.equal(PERSONA_REGION_POOL.length, 8);
  for (const region of PERSONA_REGION_POOL) assert.match(region.name, /(도|특별자치도)$/, `광역 도 이름만: ${region.name}`);
  assert.equal(PERSONA_REGION_MASK_SUFFIX, "○○시");
  const pool = [
    ...PERSONA_NAME_POOL,
    ...PERSONA_REGION_POOL.map((r) => `${r.name} ${PERSONA_REGION_MASK_SUFFIX}`),
    ...Object.values(PERSONA_CARD_FIXED_VALUES),
  ];
  for (const value of pool) {
    assert.equal(replaceRealFinancialNames(value).replacedCount, 0, value);
    assert.equal(hasBankPlaceholder(value), false, value);
  }
  // 출생 연도는 1955~1975 · 연도만.
  const years = new Set(SEED_SAMPLES.map((sid) => buildPersonaCard({ sessionId: sid, scenarioId: "courier-customs-scam", fictionalBankName: "한결은행" })!.items.find((i) => i.key === "birthYear")!.value));
  for (const year of years) {
    const m = /^(\d{4})년생$/.exec(year);
    assert.ok(m && Number(m[1]) >= 1955 && Number(m[1]) <= 1975, year);
  }
});

test("[G565 역방향 · AC-104 (h) ⓑ] 실존 은행명 · 세션 은행과 같은 은행 · 실제 시 이름 · 긴 숫자열이 든 카드 사본은 실패한다", (t) => {
  const samples: Array<[string, PersonaCardItem]> = [
    ["실존 은행명", { key: "bank", label: "거래 은행", value: "국민은행" }],
    ["세션 은행과 같음", { key: "bank", label: "거래 은행", value: "한결은행" }],
    ["실제 시 이름", { key: "region", label: "사는 곳", value: "경기도 수원시" }],
    ["긴 숫자열", { key: "loan", label: "대출", value: "대출 12345678원" }],
    ["은행 자리표시자", { key: "loan", label: "대출", value: "○○은행 대출 이용 중" }],
  ];
  for (const [name, item] of samples) {
    const violations = cardItemViolations(item, "한결은행");
    assert.ok(violations.length > 0, `${name} 샘플이 통과했다 — 검사가 무력하다`);
    t.diagnostic(`[G565 역방향] ${name} → ${violations.join(" / ")} — 실패 확인`);
  }
  const normal = buildPersonaCard({ sessionId: "s", scenarioId: "loan-refinance-scam", fictionalBankName: "한결은행" })!;
  t.diagnostic(`[G565 정상] ${normal.items.map((i) => `${i.label}: ${i.value}`).join(" · ")} → 위반 ${normal.items.flatMap((i) => cardItemViolations(i, "한결은행")).length}건`);
});

test("[G565] 카드 은행 선택 — 세션 은행 8개 × 시드 mod 7 전 조합에서 다르고, 7개 다른 은행에 고르게 퍼진다", () => {
  for (const sessionBank of FICTIONAL_BANK_NAMES) {
    const seen = new Set<string>();
    for (let seed = 0; seed < 7; seed += 1) {
      const bank = pickPersonaCardBank(sessionBank, seed);
      assert.notEqual(bank, sessionBank);
      seen.add(bank);
    }
    assert.equal(seen.size, 7, `${sessionBank}: 다른 은행 7개를 모두 고를 수 있어야 한다`);
  }
  assert.ok(FICTIONAL_BANK_NAMES.includes(pickPersonaCardBank("목록밖은행", 3)), "목록 밖 세션 은행이어도 가상 은행 목록 안에서 고른다");
});

// ── G566 계정 정보 0 ────────────────────────────────────────────────────────

const ACCOUNT_IDENTIFIERS = /\b(auth|displayName|email|uid)\b/;
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
/** G566 위반 — `BuildPersonaCardInput` 키 고정 + 계정 식별자 0. 실제 소스와 오염 사본에 똑같이 돌린다. */
function accountInfoViolations(personaCardSource: string, catalogSource: string): string[] {
  const out: string[] = [];
  const block = /export type BuildPersonaCardInput = \{([\s\S]*?)\n\};/.exec(personaCardSource);
  if (!block) return ["BuildPersonaCardInput 정의를 못 찾았다(게이트가 죽었다)"];
  const keys = [...stripComments(block[1]!).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  if (JSON.stringify(keys) !== JSON.stringify(["sessionId", "scenarioId", "fictionalBankName"])) out.push(`매개변수 키: ${keys.join(", ")}`);
  for (const [file, source] of [
    ["personaCard.ts", personaCardSource],
    ["personaCardCatalog.ts", catalogSource],
  ] as const) {
    const hit = ACCOUNT_IDENTIFIERS.exec(stripComments(source));
    if (hit) out.push(`${file}: 계정 식별자 ${hit[1]}`);
  }
  return out;
}

test("[G566 · AC-104 (h) ⓒ] 계정 정보 0 — 빌더 매개변수 키 = {sessionId, scenarioId, fictionalBankName} 고정 · 계정 식별자 0 / 표시 이름 매개변수를 더한 사본은 실패한다", (t) => {
  const personaCardSource = readSrc("session/personaCard.ts");
  const catalogSource = readSrc("scenarios/personaCardCatalog.ts");
  assert.deepEqual(accountInfoViolations(personaCardSource, catalogSource), []);
  t.diagnostic("[G566 정상] 매개변수 키 3개 · 계정 식별자 0");
  const poisoned = personaCardSource.replace(
    "export type BuildPersonaCardInput = {\n",
    "export type BuildPersonaCardInput = {\n  displayName: string;\n",
  );
  assert.notEqual(poisoned, personaCardSource, "오염 사본 생성 실패 — 앵커가 바뀌었다");
  const violations = accountInfoViolations(poisoned, catalogSource);
  assert.ok(violations.length >= 2, `표시 이름 사본이 통과했다: ${violations.join(" / ")}`);
  t.diagnostic(`[G566 역방향] 표시 이름 매개변수 사본 → ${violations.join(" / ")} — 실패 확인`);
});
