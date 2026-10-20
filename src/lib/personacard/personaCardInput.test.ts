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
  personaRevealScroll,
  readPersonaCardForm,
  PERSONA_BIRTH_DAY_OPTIONS,
  PERSONA_BIRTH_MONTH_OPTIONS,
  PERSONA_REVEAL_SCROLL_MARGIN_PX,
  type PersonaCardForm,
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
/** 칸 일부만 적은 폼(나머지 = 빈 칸). */
const form = (partial: Partial<PersonaCardForm>): PersonaCardForm => ({ ...EMPTY_PERSONA_CARD_FORM, ...partial });

test("[G629] 입력 · 고지 · 리포트 새 문면 = docs/UX.md D-131 · D-133 정본(굵게) 글자 그대로", (t) => {
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
  assert.deepEqual(readPersonaCardForm(form({ name: "  " }), NOW_YEAR), { ok: true, input: undefined });
  assert.deepEqual(readPersonaCardForm(form({ name: " 홍길동 ", birthYear: "1962", region: "경기도" }), NOW_YEAR), {
    ok: true,
    input: { name: "홍길동", birthYear: 1962, region: "경기도" },
  });
  assert.deepEqual(readPersonaCardForm(form({ birthYear: "1970" }), NOW_YEAR), { ok: true, input: { birthYear: 1970 } });
  for (const bad of [
    form({ name: "홍" }),
    form({ name: "홍길동1" }),
    form({ birthYear: "62" }),
    form({ birthYear: "1919" }),
    form({ birthYear: String(NOW_YEAR - 13) }),
    form({ region: "수원시" }),
  ]) {
    assert.deepEqual(readPersonaCardForm(bad, NOW_YEAR), { ok: false }, JSON.stringify(bad));
  }
});

test("[UX D-133 (2)] 생일(월 · 일) — 둘 다 · 출생 연도와 함께 · 실제 날짜만 · 비우면 연도만(서버 G626 진리표와 같은 규칙)", () => {
  assert.deepEqual(readPersonaCardForm(form({ birthYear: "1965", birthMonth: "3", birthDay: "2" }), NOW_YEAR), {
    ok: true,
    input: { birthYear: 1965, birthMonth: 3, birthDay: 2 },
  });
  assert.deepEqual(readPersonaCardForm(form({ birthYear: "1964", birthMonth: "2", birthDay: "29" }), NOW_YEAR), {
    ok: true,
    input: { birthYear: 1964, birthMonth: 2, birthDay: 29 },
  });
  assert.deepEqual(readPersonaCardForm(form({ birthYear: "1965" }), NOW_YEAR), { ok: true, input: { birthYear: 1965 } });
  for (const bad of [
    form({ birthYear: "1965", birthMonth: "3" }), // 월만
    form({ birthYear: "1965", birthDay: "2" }), // 일만
    form({ birthMonth: "3", birthDay: "2" }), // 연도 없이(OQ-U102 권고안 = 거부)
    form({ birthYear: "1965", birthMonth: "2", birthDay: "29" }), // 평년
    form({ birthYear: "1965", birthMonth: "4", birthDay: "31" }),
    form({ birthYear: "1965", birthMonth: "13", birthDay: "1" }),
  ]) {
    assert.deepEqual(readPersonaCardForm(bad, NOW_YEAR), { ok: false }, JSON.stringify(bad));
  }
  assert.deepEqual([...PERSONA_BIRTH_MONTH_OPTIONS], Array.from({ length: 12 }, (_, i) => i + 1));
  assert.deepEqual([...PERSONA_BIRTH_DAY_OPTIONS], Array.from({ length: 31 }, (_, i) => i + 1));
  // 서버 검증기도 같은 원값 이름을 받는다(소스 대조 — 클라만 이름을 바꾸면 서버가 "모르는 키"로 거부한다).
  const server = read("../../../functions/src/session/personaCard.ts");
  assert.ok(server.includes("const { name, birthYear, birthMonth, birthDay, region, ...rest } = raw as Record<string, unknown>;"));
});

test("[UX D-133 (3)] 가상 값 권고 — 개인정보 안내가 \"실제 정보 대신 가상의 값을 넣어 주세요\"로 시작한다", () => {
  assert.ok(PERSONA_INPUT_COPY.privacy.startsWith("실제 정보 대신 가상의 값을 넣어 주세요."));
});

test("[UX D-133 (1)] 펼칠 때 자동 스크롤 — 화면 밖이면 스크롤(reduced-motion = 즉시) · 이미 다 보이면 움직이지 않는다", () => {
  assert.equal(personaRevealScroll({ top: 900, bottom: 1500 }, 800, false), "smooth");
  assert.equal(personaRevealScroll({ top: 900, bottom: 1500 }, 800, true), "auto");
  assert.equal(personaRevealScroll({ top: 400, bottom: 900 }, 800, false), "smooth"); // 아래가 잘림
  assert.equal(personaRevealScroll({ top: -50, bottom: 600 }, 800, false), "smooth"); // 위가 잘림
  assert.equal(personaRevealScroll({ top: 100, bottom: 700 }, 800, false), null);
});

test("[배선 · UX D-133 (1)] 입력 블록 — 나타날 때 1회 스크롤 · 포커스 이동 0 · 제목만 낭독 · 버튼 잠금(끝까지 스크롤) 방식 0", () => {
  const component = codeOnly("../../components/PersonaCardInputFields.tsx");
  assert.match(component, /const behavior = personaRevealScroll\(section\.getBoundingClientRect\(\), window\.innerHeight, reducedMotion\);/);
  assert.match(component, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(component, /section\.scrollIntoView\(\{ behavior, block: "start" \}\)/);
  assert.match(component, /\}, \[\]\);/, "나타날 때 1회(의존성 빈 배열)");
  assert.match(component, /<p aria-live="polite" className="sr-only">\s*\{announced \? title : ""\}/);
  assert.equal(/\.focus\(/.test(component), false, "포커스를 옮기면 어르신 기기에서 키보드가 바로 뜬다");
  assert.equal(/autoFocus/.test(component), false, "autoFocus 0");
  assert.ok(component.includes("scroll-mt-28"), "위 여백 클래스");
  assert.equal(PERSONA_REVEAL_SCROLL_MARGIN_PX, 28 * 4, "scroll-mt-28(7rem = 112px)과 상수가 같아야 한다");
  for (const page of ["../../app/scenarios/difficulty/page.tsx", "../../app/challenge/create/page.tsx"]) {
    const source = codeOnly(page);
    assert.equal(/onScroll|scrolledToBottom|reachedBottom/.test(source), false, `${page}: 끝까지 스크롤해야 버튼이 켜지는 방식은 쓰지 않는다`);
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
