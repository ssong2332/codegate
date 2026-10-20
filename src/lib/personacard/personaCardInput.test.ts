// §88(docs/Architecture.md §88.4 G629 · UX D-131 · DECISIONS #199) — "이번 훈련 속 내 정보" 입력 쪽.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_PERSONA_CARD_FORM,
  PERSONA_CARD_INVALID_REASON,
  PERSONA_CARD_NOT_APPLICABLE_REASON,
  PERSONA_CARD_SCENARIO_IDS,
  PERSONA_INPUT_COPY,
  PERSONA_REGION_OPTIONS,
  personaCardErrorLine,
  personaCardInputVisible,
  readPersonaCardForm,
} from "./personaCardInput.ts";
import { PERSONA_CARD_COPY, PERSONA_REPORT_COPY } from "./personaCard.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const UX = read("../../../docs/UX.md");
const SERVER_CATALOG = read("../../../functions/src/scenarios/personaCardCatalog.ts");
const SERVER_PUBLIC_META = read("../../../functions/src/scenarios/publicMeta.ts");
const codeOnly = (rel: string) =>
  read(rel)
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line))
    .join("\n");
const NOW_YEAR = 2026;

test("[G629] 입력 · 고지 · 리포트 새 문면 = docs/UX.md D-131 정본(굵게) 글자 그대로", (t) => {
  const texts = [
    ...Object.values(PERSONA_INPUT_COPY),
    PERSONA_CARD_COPY.noticeInput,
    PERSONA_REPORT_COPY.r2FactSelfInput,
    PERSONA_REPORT_COPY.r2FactSender,
    PERSONA_REPORT_COPY.tailSelfInput,
    PERSONA_REPORT_COPY.tailSender,
  ];
  for (const text of texts) assert.ok(UX.includes(`**${text}**`), `UX.md 정본에 없는 문면: ${text}`);
  t.diagnostic(`[G629] 정본 대조 ${texts.length}건 일치`);
  const tampered = PERSONA_INPUT_COPY.sendGuide.replace("보이지 않습니다", "보이지 않아요");
  assert.equal(UX.includes(`**${tampered}**`), false, "[G629 역방향] 한 글자 바꾼 사본이 정본 대조를 통과했다");
});

test("[G629] 시 · 도 선택지 · 대상 시나리오 = 서버 카탈로그(소스 대조)", () => {
  const serverRegions = [...SERVER_CATALOG.matchAll(/\{ name: "([^"]+)", shortNames:/g)].map((m) => m[1]);
  assert.deepEqual([...PERSONA_REGION_OPTIONS], serverRegions);
  // 서버 대상 = 상수 이름 4개 → publicMeta의 ID 문자열.
  const block = /export const PERSONA_CARD_SCENARIOS: readonly string\[\] = \[([\s\S]*?)\];/.exec(SERVER_CATALOG)![1]!;
  const ids = [...block.matchAll(/(\w+_SCENARIO_ID)/g)].map((m) => {
    const id = new RegExp(`export const ${m[1]} = "([^"]+)";`).exec(SERVER_PUBLIC_META)?.[1];
    assert.ok(id, `${m[1]}을 publicMeta에서 못 찾았다`);
    return id;
  });
  assert.deepEqual([...PERSONA_CARD_SCENARIO_IDS].sort(), ids.sort());
});

test("[UX D-131 (1)] 입력 블록 노출 — 대상 4종 × 고급 × 통화형만", () => {
  for (const id of PERSONA_CARD_SCENARIO_IDS) {
    assert.equal(personaCardInputVisible(id, "advanced", undefined), true, id);
    assert.equal(personaCardInputVisible(id, "intermediate", undefined), false, id);
    assert.equal(personaCardInputVisible(id, null, undefined), false, id);
    assert.equal(personaCardInputVisible(id, "advanced", "messenger"), false, id);
  }
  assert.equal(personaCardInputVisible("kidnapping-threat", "advanced", undefined), false);
  assert.equal(personaCardInputVisible(null, "advanced", undefined), false);
});

test("[UX D-131 (3)(4)] 칸 상태 → 원값 — 비면 필드 부재 · 넣은 칸만 · 형식 오류는 진행 안 함", () => {
  assert.deepEqual(readPersonaCardForm(EMPTY_PERSONA_CARD_FORM, NOW_YEAR), { ok: true, input: undefined });
  assert.deepEqual(readPersonaCardForm({ name: "  ", birthYear: "", region: "" }, NOW_YEAR), { ok: true, input: undefined });
  assert.deepEqual(readPersonaCardForm({ name: " 홍길동 ", birthYear: "1962", region: "경기도" }, NOW_YEAR), {
    ok: true,
    input: { name: "홍길동", birthYear: 1962, region: "경기도" },
  });
  assert.deepEqual(readPersonaCardForm({ name: "", birthYear: "1970", region: "" }, NOW_YEAR), { ok: true, input: { birthYear: 1970 } });
  for (const bad of [
    { name: "홍", birthYear: "", region: "" },
    { name: "홍길동1", birthYear: "", region: "" },
    { name: "", birthYear: "62", region: "" },
    { name: "", birthYear: "1919", region: "" },
    { name: "", birthYear: String(NOW_YEAR - 13), region: "" },
    { name: "", birthYear: "", region: "수원시" },
  ]) {
    assert.deepEqual(readPersonaCardForm(bad, NOW_YEAR), { ok: false }, JSON.stringify(bad));
  }
});

test("[UX D-131 (3)] 서버 거부 사유 → 문면 · 다른 사유는 null(기존 오류 처리로)", () => {
  assert.equal(personaCardErrorLine(PERSONA_CARD_INVALID_REASON), PERSONA_INPUT_COPY.invalid);
  assert.equal(personaCardErrorLine(PERSONA_CARD_NOT_APPLICABLE_REASON), PERSONA_INPUT_COPY.notApplicable);
  assert.equal(personaCardErrorLine("difficulty-not-allowed"), null);
  assert.equal(personaCardErrorLine(null), null);
  const server = read("../../../functions/src/session/personaCard.ts");
  assert.ok(server.includes(`PERSONA_CARD_INVALID_REASON = "${PERSONA_CARD_INVALID_REASON}"`));
  assert.ok(server.includes(`PERSONA_CARD_NOT_APPLICABLE_REASON = "${PERSONA_CARD_NOT_APPLICABLE_REASON}"`));
});

test("[배선 · UX D-131 (1)] self = 난이도 화면 · send = 챌린지 만들기 화면이 같은 블록을 그리고, 원값만 보낸다(완성 카드 0)", () => {
  const difficulty = codeOnly("../../app/scenarios/difficulty/page.tsx");
  assert.match(difficulty, /const showPersonaInput = !isSendMode && personaCardInputVisible\(scenarioId, selected, scenario\?\.channel\);/);
  assert.match(difficulty, /<PersonaCardInputFields\s+mode="self"/);
  assert.match(difficulty, /\.\.\.\(personaCardInput \? \{ personaCardInput \} : \{\}\),/);
  const create = codeOnly("../../app/challenge/create/page.tsx");
  assert.match(create, /const showPersonaInput = personaCardInputVisible\(scenarioId, difficultyLevel, scenario\?\.channel\);/);
  assert.match(create, /<PersonaCardInputFields mode="send"/);
  assert.match(create, /\.\.\.\(personaCardInput \? \{ personaCardInput \} : \{\}\),/);
  for (const source of [difficulty, create]) assert.equal(/\bpersonaCard:/.test(source), false, "화면이 완성 카드를 보낸다");
});
