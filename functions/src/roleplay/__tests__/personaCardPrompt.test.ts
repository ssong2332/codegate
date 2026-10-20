// T194-b(docs/Architecture.md §84.3.4 · §84.8 G568 · G569 · PRD AC-104 (c)(d)) — [미리 확보한 상대 정보] 블록과 호출부 전수.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildPersonaCardBlock,
  buildSystemPrompt,
  PERSONA_CARD_BLOCK_HEAD,
  PERSONA_CARD_BLOCK_TAIL,
  type BuildSystemPromptOptions,
} from "../promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { PERSONA_CARD_SCENARIOS } from "../../scenarios/personaCardCatalog";
import { hasVerifyIntercept } from "../../scenarios/verifyIntercept";
import { buildPersonaCard, personaCardEligible } from "../../session/personaCard";
import type { PersonaCardItem } from "../../shared/types";
import { personaCardPromptValue, PERSONA_LOAN_PROMPT_VALUE } from "../../scenarios/personaCardCatalog";
import { asksIdentityCheck } from "../personaAuthority";
import { isL3Procedural } from "../l3Depth";
import { speakerGenderFor } from "../../realtime/scenarioVoice";
import { FICTIONAL_BANK_NAMES, fictionalOrgNamesFor } from "../../shared/fictionalBank";

const SRC = path.resolve(__dirname, "../../../src");
const readSrc = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

/** 설계 §84.14.4 갱신 정본(글자 그대로 — 상수가 바뀌면 여기서 걸린다). */
const CANON_HEAD =
  "[미리 확보한 상대 정보 — 이 통화에서만]\n너는 통화 전에 상대에 대해 아래 정보를 이미 확보해 두었다. 상대가 스스로 말하기 전에 이 가운데 한두 가지를 네가 먼저, 확인하듯 자연스럽게 꺼내 상대가 '이 사람은 나를 이미 알고 있다'고 느끼게 한다.";
const CANON_TAIL =
  "목록에 없는 이름·나이·금액·금융사·주소는 지어내 말하지 않는다. '사는 곳'은 알고 있다는 확인에만 쓰고, 만날 곳·찾아갈 곳·돈을 건넬 곳을 정하는 데 쓰지 않는다. 이 정보를 어디서 얻었는지는 설명하지 않는다.";

function operationalOpts(scenarioId: string, fictionalBankName: string): BuildSystemPromptOptions {
  const speakerGender = speakerGenderFor(scenarioId);
  return {
    difficultyLevel: "advanced",
    inCallSmsEnabled: true,
    verifyInterceptEnabled: hasVerifyIntercept(scenarioId),
    l3Procedural: isL3Procedural(scenarioId),
    identityCheckAllowed: asksIdentityCheck(scenarioId),
    ...(speakerGender ? { speakerGender } : {}),
    fictionalBankName,
  };
}

test("[G569] 블록 문면 = §84.14.4 갱신 정본(머리 · 꼬리 바이트 동일) · 예외 문장 0 · '목록에 없는' 문장 · 장소 금지 문장 존재", () => {
  assert.equal(PERSONA_CARD_BLOCK_HEAD, CANON_HEAD);
  assert.equal(PERSONA_CARD_BLOCK_TAIL, CANON_TAIL);
  assert.equal(`${PERSONA_CARD_BLOCK_HEAD}\n${PERSONA_CARD_BLOCK_TAIL}`.includes("적용되지 않는다"), false, "예외 문장이 남아 있다(§84.14.4 — 삭제)");
  assert.ok(CANON_TAIL.includes("목록에 없는 이름·나이·금액·금융사·주소는 지어내 말하지 않는다"));
  assert.ok(CANON_TAIL.includes("만날 곳·찾아갈 곳·돈을 건넬 곳을 정하는 데 쓰지 않는다"));
  assert.equal(
    buildPersonaCardBlock([{ key: "name", label: "이름", value: "김영숙" }]),
    `${CANON_HEAD}\n- 이름: 김영숙\n${CANON_TAIL}`,
  );
  assert.equal(buildPersonaCardBlock([]), null, "빈 배열 = 블록 0");
});

test("[G569] 위치 — [진행 강제] · [확인 안내] 뒤 · 난이도 앞 · 가드레일 최후미 불변 · 카드 행이 그대로 실린다(대상 4종 × 세션 은행 8)", (t) => {
  let checked = 0;
  for (const scenarioId of PERSONA_CARD_SCENARIOS) {
    for (const bank of FICTIONAL_BANK_NAMES) {
      // §88 — 카드 값은 사용자 입력이다(대표 입력 — 세 칸 전부).
      const card = buildPersonaCard({ input: { name: "홍길동", birthYear: 1962, region: "경상남도" }, inputBy: "self" })!;
      const prompt = buildSystemPrompt(SCENARIO_PROMPTS[scenarioId], { ...operationalOpts(scenarioId, bank), personaCard: card.items });
      const at = prompt.indexOf(PERSONA_CARD_BLOCK_HEAD);
      assert.ok(at > prompt.indexOf("[진행 강제 — 반드시 지킨다]"), `${scenarioId}: [진행 강제] 뒤`);
      if (hasVerifyIntercept(scenarioId)) assert.ok(at > prompt.indexOf("[확인 안내 — 이 훈련에서만 적용]"), `${scenarioId}: [확인 안내] 뒤`);
      assert.ok(at < prompt.indexOf("[난이도 — 고급: 실제처럼 정교하게]"), `${scenarioId}: 난이도 앞`);
      assert.ok(prompt.endsWith(SCENARIO_PROMPTS[scenarioId].guardrailPreamble), `${scenarioId}: 가드레일 최후미`);
      for (const item of card.items) {
        // §83 — "○○카드"는 조립 끝 applyFictionalBank가 세션 카드사명으로 바꾼다(화면 값은 그대로 — 카탈로그 주석 · 열린 질문).
        // 리뷰 M1 — 블록 값은 프롬프트용 값(대출 = 일반명 · 지역 = 도 이름만).
        const shown = item.key === "card" ? fictionalOrgNamesFor(bank).cardName : personaCardPromptValue(item);
        assert.ok(prompt.includes(`- ${item.label}: ${shown}`), `${scenarioId}/${bank}: 카드 행 "${item.label}: ${shown}"이 없다`);
      }
      // 리뷰 M1 — 블록 구간(머리 ~ 꼬리)에 "○○" 리터럴 0.
      const segment = prompt.slice(at, prompt.indexOf(PERSONA_CARD_BLOCK_TAIL, at) + PERSONA_CARD_BLOCK_TAIL.length);
      assert.ok(segment.startsWith(PERSONA_CARD_BLOCK_HEAD) && segment.endsWith(PERSONA_CARD_BLOCK_TAIL), "블록 구간을 못 잘랐다");
      assert.equal(/[○Oo]{2}/.test(segment), false, `${scenarioId}/${bank}: 블록에 가림 리터럴이 남았다 — ${segment}`);
      checked += 1;
    }
  }
  t.diagnostic(`[G569] 조립 ${checked}건 위치 · 행 확인`);
});

test("[G569] 부재 · 빈 배열이면 조립 결과가 카드 도입 전과 바이트 동일하다(전 시나리오 · 고급 운영 조합)", () => {
  for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
    const opts = operationalOpts(scenarioId, "한결은행");
    const base = buildSystemPrompt(SCENARIO_PROMPTS[scenarioId], opts);
    assert.equal(buildSystemPrompt(SCENARIO_PROMPTS[scenarioId], { ...opts, personaCard: undefined }), base, scenarioId);
    assert.equal(buildSystemPrompt(SCENARIO_PROMPTS[scenarioId], { ...opts, personaCard: [] }), base, scenarioId);
    assert.equal(base.includes(PERSONA_CARD_BLOCK_HEAD), false);
  }
});

/** G569 가드 위반 — 대상 중 asksIdentityCheck가 거짓인(= 이름 단정 금지 규칙이 실리는) 시나리오. */
function nonInstitutionTargets(targets: readonly string[]): string[] {
  return targets.filter((scenarioId) => !asksIdentityCheck(scenarioId));
}

test("[G569 가드 · §84.14.4] PERSONA_CARD_SCENARIOS ⊆ {s | asksIdentityCheck(s)} — kidnapping을 넣은 사본은 실패한다", (t) => {
  assert.deepEqual(nonInstitutionTargets(PERSONA_CARD_SCENARIOS), []);
  assert.equal(personaCardEligible({ scenarioId: "kidnapping-threat", difficultyLevel: "advanced", channel: undefined }), false);
  const poisoned = [...PERSONA_CARD_SCENARIOS, "kidnapping-threat"];
  assert.deepEqual(nonInstitutionTargets(poisoned), ["kidnapping-threat"], "가드가 kidnapping을 잡지 못했다 — 검사가 무력하다");
  t.diagnostic("[G569 가드] 정본 4종 → 위반 0 · kidnapping 추가 사본 → 위반 1(실패 확인)");
});

test("[G568] 호출부 전수 — 프롬프트 조립 3곳이 모두 카드를 넘기고, 값은 세션 문서(또는 방금 만든 서버 값)에서만 온다(소스 스캔)", () => {
  const assemblyCallers = ["roleplay/index.ts", "roleplay/openingLine.ts", "realtime/geminiProvider.ts"];
  for (const file of assemblyCallers) {
    const src = readSrc(file);
    assert.equal((src.match(/buildSystemPrompt\(scenarioPrompt, \{/g) ?? []).length, 1, `${file}: 조립 호출 1곳`);
  }
  assert.match(readSrc("roleplay/index.ts"), /\n\s*personaCard: session\.personaCard\?\.items,\n/, "텍스트 턴");
  assert.match(readSrc("roleplay/openingLine.ts"), /\.\.\.\(personaCard \? \{ personaCard \} : \{\}\),/, "오프닝");
  assert.match(readSrc("realtime/geminiProvider.ts"), /\n\s*personaCard: input\.personaCard,\n/, "Gemini Live 토큰");
  // 오프닝 · Live 토큰의 원천: createSession(방금 만든 서버 값) · createRealtimeCall(세션 문서).
  assert.match(readSrc("session/index.ts"), /\{ fictionalBankName, challengeId: undefined, personaCard: personaCard\?\.items, voiceSelectionSource \}/);
  assert.match(readSrc("realtime/index.ts"), /personaCard: session\.personaCard\?\.items,/);
  // 전수 — 운영 소스(테스트 · 주석 제외)에서 buildSystemPrompt를 부르는 파일은 위 3곳 + 정의 파일뿐이다. 새 조립 지점(S7 · U2 leg 발급
  // 등)이 생기면 여기서 걸린다 — 그 호출부에도 카드를 넘기고 목록에 더할 것.
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") walk(full);
      } else if (entry.name.endsWith(".ts") && stripComments(readFileSync(full, "utf8")).includes("buildSystemPrompt(")) {
        found.push(path.relative(SRC, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(SRC);
  assert.deepEqual(found.sort(), [...assemblyCallers, "roleplay/promptAssembly.ts"].sort());
});

test("[리뷰 M1] 대출 행은 프롬프트에 일반명으로 실린다(가상 이름 0 · '○○' 0) — 블록 생성기를 우회해 화면 값을 그대로 실은 사본은 걸린다", (t) => {
  // §88 — 대출 행은 이제 옛 v1 카드(서버 생성 · 폐지)에만 있다. 배포 직전에 만들어진 세션 문서를 계속 읽으므로 프롬프트 값 규칙은 유지한다.
  const card: { items: PersonaCardItem[] } = {
    items: [
      { key: "name", label: "이름", value: "김영숙" },
      { key: "loan", label: "대출", value: "○○저축은행 대출 이용 중" },
    ],
  };
  const loan = card.items.find((i) => i.key === "loan")!;
  assert.equal(loan.value, "○○저축은행 대출 이용 중", "화면 값은 그대로");
  assert.equal(PERSONA_LOAN_PROMPT_VALUE, "저축은행 대출 이용 중");
  const block = buildPersonaCardBlock(card.items)!;
  assert.ok(block.includes("- 대출: 저축은행 대출 이용 중"));
  assert.equal(block.includes("○○"), false);
  const naive = [PERSONA_CARD_BLOCK_HEAD, ...card.items.map((i) => `- ${i.label}: ${i.value}`), PERSONA_CARD_BLOCK_TAIL].join("\n");
  assert.equal(naive.includes("○○"), true, "역방향 사본이 가림 리터럴을 싣지 않는다 — 검사가 무력하다");
  t.diagnostic("[M1] 정본 블록 '○○' 0 · 화면 값을 그대로 실은 사본 → '○○' 검출(실패 확인)");
});

test("[§88 후속] 생년월일 행은 프롬프트에 \"65년 3월 2일생(1965년)\"으로 실린다(사기범이 줄여 말하는 꼴) · 출생 연도 행은 그대로", () => {
  const card = buildPersonaCard({ input: { name: "홍길동", birthYear: 1965, birthMonth: 3, birthDay: 2 }, inputBy: "self" })!;
  const block = buildPersonaCardBlock(card.items)!;
  assert.ok(block.includes("- 생년월일: 65년 3월 2일생(1965년)"), block);
  assert.equal(block.includes("출생 연도"), false, "생일이 있으면 출생 연도 행은 따로 싣지 않는다");
  assert.equal(personaCardPromptValue({ key: "birthDate", value: "2005년 12월 31일생" }), "05년 12월 31일생(2005년)");
  assert.equal(personaCardPromptValue({ key: "birthYear", value: "1962년생" }), "1962년생");
  // 옛 카드(생일 없음) = 출생 연도 행 그대로.
  const old = buildPersonaCardBlock(buildPersonaCard({ input: { birthYear: 1962 }, inputBy: "self" })!.items)!;
  assert.ok(old.includes("- 출생 연도: 1962년생"), old);
});
