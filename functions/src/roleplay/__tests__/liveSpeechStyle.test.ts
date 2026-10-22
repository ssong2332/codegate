// §90(docs/Architecture.md) — [말투 — 실시간 음성 통화] 블록: Live 토큰 경로 한정 · 페르소나 분기 · 이름 날조 금지 · 기존 규칙과의 정합.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { buildLiveSpeechStyleBlock, buildSystemPrompt, PERSONA_CARD_BLOCK_HEAD, LANGUAGE_RULE, LIVE_NO_IDLE_RULE } from "../promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { asksIdentityCheck } from "../personaAuthority";
import { SESSION_MARKER_WORDS } from "../../scenarios/__tests__/sessionMarkerWords";
import type { DifficultyLevel } from "../../shared/difficulty";

const SRC = path.resolve(__dirname, "../../../src");
const LEVELS: DifficultyLevel[] = ["beginner", "intermediate", "advanced"];
const TITLE = "[말투 — 실시간 음성 통화]";
const INSTITUTION = buildLiveSpeechStyleBlock(true);
const OTHER = buildLiveSpeechStyleBlock(false);

test("§90 회귀 0 — liveSpeechStyle 부재 · false는 전 시나리오 × 3난이도에서 조립 결과가 바이트 동일하고 블록이 없다", () => {
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    for (const difficultyLevel of LEVELS) {
      const identityCheckAllowed = asksIdentityCheck(id);
      const base = buildSystemPrompt(prompt, { difficultyLevel, identityCheckAllowed });
      assert.equal(buildSystemPrompt(prompt, { difficultyLevel, identityCheckAllowed, liveSpeechStyle: false }), base, `${id}/${difficultyLevel}`);
      assert.ok(!base.includes(TITLE), `${id}/${difficultyLevel}: 부재면 블록 0`);
    }
  }
});

test("§90 — true면 [대화 방식] 바로 뒤 · [언어] 앞에 들어가고 가드레일 최후미는 그대로다", () => {
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const identityCheckAllowed = asksIdentityCheck(id);
    const live = buildSystemPrompt(prompt, { difficultyLevel: "advanced", identityCheckAllowed, liveSpeechStyle: true });
    const block = identityCheckAllowed ? INSTITUTION : OTHER;
    assert.equal(live.split(TITLE).length - 1, 1, `${id}: 블록 1회`);
    assert.ok(live.includes(`${block}\n\n${LANGUAGE_RULE}`), `${id}: [언어] 바로 앞`);
    assert.ok(live.indexOf("[대화 방식") < live.indexOf(TITLE), `${id}: [대화 방식] 뒤`);
    assert.ok(live.trimEnd().endsWith(prompt.guardrailPreamble.trimEnd()), `${id}: 가드레일 최후미`);
    // 블록만 뺀 나머지는 종전과 같다. §104 — Live(끊기 슬롯 NONE)에만 붙는 "대기 말로 시간을 끌지 않는다" 1항도 함께 뺀다(정확히 1회).
    assert.equal(live.split(LIVE_NO_IDLE_RULE).length - 1, 1, `${id}: §104 Live 1항 1회`);
    assert.equal(
      live.replace(`${block}\n\n`, "").replace(`\n${LIVE_NO_IDLE_RULE}`, ""),
      buildSystemPrompt(prompt, { difficultyLevel: "advanced", identityCheckAllowed }),
      `${id}: 블록 외 변화 0`,
    );
  }
});

test("§90 — 연령 · 사무실 톤은 기관 담당자(institution)에게만, 가족 · 지인 · 협박범은 페르소나를 따른다", () => {
  assert.ok(INSTITUTION.includes("40대") && INSTITUTION.includes("사무실"));
  assert.ok(!OTHER.includes("40대") && !OTHER.includes("사무실") && !OTHER.includes("바쁜"));
  assert.ok(OTHER.includes("위 페르소나 설명을 그대로 따른다"));
  for (const block of [INSTITUTION, OTHER]) {
    assert.ok(block.includes("감정(다급함 포함)이 위 페르소나 설명이나 [화자]에 정해져 있으면 그것이 이 말투 항목보다 우선한다"), "페르소나 · 화자 우선(감정 · 다급함 포함 — 리뷰 m1)");
    assert.ok(block.includes("최대 1개"), "추임새 상한");
  }
});

test("§90 — 이름 날조 금지: [미리 확보한 상대 정보] 블록 이름과 정합하고, 부재 시 처리가 페르소나별로 갈린다", () => {
  const cardTitle = PERSONA_CARD_BLOCK_HEAD.split("\n")[0];
  assert.equal(cardTitle, "[미리 확보한 상대 정보 — 이 통화에서만]", "가리키는 블록 이름 = 실제 카드 블록 제목(리뷰 m2)");
  for (const block of [INSTITUTION, OTHER]) {
    assert.ok(block.includes(`신상은 ${cardTitle}에 적혀 있거나 상대가 이 통화에서 직접 말한 것만 쓴다`), "상대가 말한 이름은 되읽을 수 있다(리뷰 M1 — IDENTITY_CHECK_HANDLING_TRUE 되읽기와 정합)");
    assert.ok(block.includes("그 밖의 이름은 지어내 부르지 않는다"));
  }
  assert.ok(INSTITUTION.includes("상대에게 물어 확인한다"));
  assert.ok(OTHER.includes("상황에 맞는 호칭으로 부른다") && !OTHER.includes("물어 확인한다"), "지인 · 협박범은 이름을 묻지 않는다");
});

test("§90 — 받아 적는 숫자는 [진행 강제]의 '또박또박' 규칙을 따르게 해 충돌하지 않는다", () => {
  const live = buildSystemPrompt(SCENARIO_PROMPTS["tax-refund-scam"], { liveSpeechStyle: true });
  assert.ok(INSTITUTION.includes("[진행 강제]의 규칙대로 또박또박 부른다"));
  assert.ok(live.includes("숫자는 실제처럼 들리는 형식으로 또박또박 부른다"), "[진행 강제] 숫자 규칙 원문 유지");
  assert.ok(live.includes("[진행 강제"), "가리키는 블록이 실제로 있다");
  assert.ok(live.includes("1~3문장"), "[대화 방식] 턴 길이 규칙 유지");
});

test("§90 — 블록 문면에 세션 중 표식 낱말이 없다(G446)", () => {
  for (const block of [INSTITUTION, OTHER]) {
    for (const word of SESSION_MARKER_WORDS) assert.ok(!block.includes(word), `표식 낱말 "${word}"`);
  }
});

test("§90 — 신상 카드와 함께 와도 두 블록이 공존한다", () => {
  const live = buildSystemPrompt(SCENARIO_PROMPTS["institutional-impersonation"], {
    difficultyLevel: "advanced",
    liveSpeechStyle: true,
    personaCard: [{ key: "name", label: "이름", value: "홍길동" }],
  });
  assert.ok(live.includes(TITLE) && live.includes(PERSONA_CARD_BLOCK_HEAD.split("\n")[0]));
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : walk(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

test("§90 경로 한정 — liveSpeechStyle을 넘기는 운영 호출부는 realtime/geminiProvider.ts 1곳뿐이다", () => {
  const users = walk(SRC)
    .filter((file) => !file.endsWith(path.join("roleplay", "promptAssembly.ts")))
    .filter((file) => readFileSync(file, "utf8").includes("liveSpeechStyle"))
    .map((file) => path.relative(SRC, file).split(path.sep).join("/"));
  assert.deepEqual(users, ["realtime/geminiProvider.ts"]);
  assert.ok(readFileSync(path.join(SRC, "realtime/geminiProvider.ts"), "utf8").includes("liveSpeechStyle: true"));
});
