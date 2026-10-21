import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADVANCED_ONLY_NOT_CHALLENGEABLE_LINE,
  ADVANCED_ONLY_NOT_CHALLENGEABLE_REASON,
  ADVANCED_ONLY_GROUP_TITLE,
  ADVANCED_ONLY_LINE,
  ADVANCED_ONLY_TAG,
  DIFFICULTY_NOT_ALLOWED_REASON,
  PRE_SESSION_BURDEN_NOTICE,
  partitionScenarioList,
  readFunctionsErrorReason,
  resolveListedScenarioId,
  SCENARIO_MERGED_LINE,
  SCENARIO_MERGED_REASON,
  selectableDifficultyLevels,
  ADVANCED_SELF_NOTICE,
  ADVANCED_SEND_NOTICE,
  DEFAULT_DIFFICULTY_LEVEL,
  DIFFICULTY_LABEL,
  DIFFICULTY_LEVELS,
  DIFFICULTY_SELF_DESCRIPTION,
  DIFFICULTY_SEND_DESCRIPTION,
  RECOMMENDED_DIFFICULTY_LEVEL,
  SCENARIO_TRAIT_LABEL,
  formatDifficultyLabel,
  isDifficultyLevel,
  normalizeDifficultyLevel,
  // node --experimental-strip-types로 컴파일 없이 직접 실행하므로 확장자를 명시한다
  // (src/lib/challenge/mapChallengeItems.test.ts 등 기존 테스트와 동일 관례).
} from "./index.ts";

// T72 · docs/UX.md UX-029/P-22 · docs/PRD.md AC-064/065/066/067.

test("[AC-064/P-22] 3단계 어휘는 초급/중급/고급 하나로 고정된다(전 구간 동일 라벨의 유일한 원천)", () => {
  assert.deepEqual([...DIFFICULTY_LEVELS], ["beginner", "intermediate", "advanced"]);
  assert.deepEqual(DIFFICULTY_LABEL, {
    beginner: "초급",
    intermediate: "중급",
    advanced: "고급",
  });
  // 모든 단계가 라벨·요약·self/send 설명을 빠짐없이 갖는다(화면이 값을 즉석에서 지어내지 않게).
  for (const level of DIFFICULTY_LEVELS) {
    assert.ok(DIFFICULTY_LABEL[level]);
    assert.ok(DIFFICULTY_SELF_DESCRIPTION[level]);
    assert.ok(DIFFICULTY_SEND_DESCRIPTION[level]);
    assert.ok(formatDifficultyLabel(level).startsWith(DIFFICULTY_LABEL[level]));
  }
});

test("[AC-064] 기본 강조는 중급이고, 폴백 기본값도 중급이다(서버 normalizeDifficultyLevel과 동일)", () => {
  assert.equal(RECOMMENDED_DIFFICULTY_LEVEL, "intermediate");
  assert.equal(DEFAULT_DIFFICULTY_LEVEL, "intermediate");
  assert.equal(normalizeDifficultyLevel(undefined), "intermediate");
  assert.equal(normalizeDifficultyLevel("hard"), "intermediate");
  assert.equal(normalizeDifficultyLevel("advanced"), "advanced");
  assert.equal(isDifficultyLevel("beginner"), true);
  assert.equal(isDifficultyLevel("expert"), false);
});

test("[AC-065] 고급 고지는 '겁주기'가 아니라 '언제든 멈출 수 있다'(AC-006)를 함께 알린다", () => {
  assert.ok(ADVANCED_SELF_NOTICE.includes("강한 압박"));
  assert.ok(
    ADVANCED_SELF_NOTICE.includes("훈련 종료"),
    "고급 고지에 상시 종료 컨트롤 안내가 포함돼야 한다(난이도가 안전장치를 약화하지 않음을 문면으로도 유지)",
  );
  // 발신(send) 고지도 동의·중단 가능성을 함께 알린다(AC-040 취지의 발신 측 대응).
  assert.ok(ADVANCED_SEND_NOTICE.includes("강한 압박"));
  assert.ok(ADVANCED_SEND_NOTICE.includes("동의"));
});

test("[AC-067] '난이도'라는 단어는 사용자가 고르는 3단계에만 쓴다 — 시나리오 고정 문자열은 '성향'으로 부른다", () => {
  assert.equal(SCENARIO_TRAIT_LABEL, "이 시나리오의 성향");
  assert.ok(
    !SCENARIO_TRAIT_LABEL.includes("난이도"),
    "시나리오 메타 라벨에 '난이도'가 들어가면 한 화면에서 같은 단어가 두 뜻으로 쓰인다",
  );
});

// ── T191 S5 — 고급 전용 시나리오 화면 규칙(PRD AC-097 · UX D-104 · D-106 · D-107 · 계약 C-1/C-2/C-9) ──

test("[T191 S5 · D-104] 고급 전용이면 고급 카드 1장만, 아니면 3단계 전부(AC-064 원문 — 기존 시나리오 무변경)", () => {
  assert.deepEqual([...selectableDifficultyLevels({ advancedOnly: true })], ["advanced"]);
  assert.deepEqual([...selectableDifficultyLevels({})], ["beginner", "intermediate", "advanced"]);
});

test("[T191 S5 · D-104 · D-107] 목록 분할 — 본인 체험은 기존 순서 무변경 + 고급 전용 묶음 · 지인에게 보내기는 고급 전용 0건", () => {
  const entries = [
    ["a", {}],
    ["x", { advancedOnly: true as const }],
    ["b", {}],
  ] as const;
  const self = partitionScenarioList(entries, "self");
  assert.deepEqual(self.regular.map(([id]) => id), ["a", "b"]);
  assert.deepEqual(self.advancedOnly.map(([id]) => id), ["x"]);
  const send = partitionScenarioList(entries, "send");
  assert.deepEqual(send.regular.map(([id]) => id), ["a", "b"]);
  assert.deepEqual(send.advancedOnly, [], "send 목록에 고급 전용이 섞이면 D-107 위반");
});

test("[T191 S5 · C-2] 서버 거부 사유 읽기 — details.reason만 신뢰하고 형식이 다르면 null · 사유 코드는 서버 리터럴과 같다", () => {
  assert.equal(readFunctionsErrorReason({ code: "functions/failed-precondition", details: { reason: "difficulty-not-allowed" } }), "difficulty-not-allowed");
  for (const bad of [null, undefined, "x", {}, { details: null }, { details: { reason: 3 } }]) {
    assert.equal(readFunctionsErrorReason(bad), null);
  }
  // 서버 → 클라 연결 증거(G428 관례): 서버 소스의 리터럴을 읽어 클라 상수와 대조한다(손으로 쓴 값 대조 금지).
  const serverSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../functions/src/session/difficultyAllowance.ts"),
    "utf8",
  );
  const literal = serverSource.match(/export const DIFFICULTY_NOT_ALLOWED_REASON = "([^"]+)"/)?.[1];
  assert.ok(literal, "서버 리터럴을 못 찾았다 — 조용한 건너뜀 금지");
  assert.equal(DIFFICULTY_NOT_ALLOWED_REASON, literal);
});

test("[T191 S5 · D-106] 셀프 감금 부담 고지는 정본 문면 그대로 · 경고 표현 · 수법 예고 0", () => {
  assert.equal(
    PRE_SESSION_BURDEN_NOTICE,
    "이 시나리오는 수사와 처벌을 앞세운 압박이 오래 이어져 다른 훈련보다 마음이 무거울 수 있습니다. 힘들면 언제든 '훈련 종료'로 바로 멈출 수 있고, 끝나면 무엇이 있었는지 모두 알려 드립니다.",
  );
  assert.equal(/혼자|고립|감금|가상자산|코인|⚠/.test(PRE_SESSION_BURDEN_NOTICE), false);
  assert.equal(ADVANCED_ONLY_LINE, "이 시나리오는 고급으로만 훈련할 수 있습니다.");
  assert.equal(ADVANCED_ONLY_GROUP_TITLE, "고급에서만 할 수 있는 훈련");
  assert.equal(ADVANCED_ONLY_TAG, "고급 전용");
});

test("[T191 S5 · 화면 배선] UX-029는 카드를 selectableDifficultyLevels로 그리고 부담 고지 · 거부 1줄을 쓰며, UX-017은 partitionScenarioList를 쓴다", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const difficulty = strip(fs.readFileSync(path.join(root, "src/app/scenarios/difficulty/page.tsx"), "utf8"));
  assert.ok(difficulty.includes("selectableDifficultyLevels(scenario).map("));
  assert.ok(difficulty.includes("{PRE_SESSION_BURDEN_NOTICE}"));
  assert.ok(difficulty.includes("=== DIFFICULTY_NOT_ALLOWED_REASON"));
  assert.equal(difficulty.includes("DIFFICULTY_LEVELS.map("), false, "고급 전용에서도 3장을 그리는 옛 경로가 남았다");
  const list = strip(fs.readFileSync(path.join(root, "src/app/scenarios/voice/ScenarioListView.tsx"), "utf8"));
  assert.ok(list.includes("partitionScenarioList("));
  assert.ok(list.includes("{ADVANCED_ONLY_GROUP_TITLE}"));
});

test("[T191 S5 · D-107 · m6] UX-019는 고급 전용 챌린지 거부를 클론 미완료와 구분해 전용 1줄로 보인다 · 사유 코드는 서버 리터럴과 같다", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const server = fs.readFileSync(path.join(root, "functions/src/challenge/index.ts"), "utf8");
  assert.ok(server.includes(`reason: "${ADVANCED_ONLY_NOT_CHALLENGEABLE_REASON}"`), "서버 리터럴과 클라 상수가 다르다");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const page = strip(fs.readFileSync(path.join(root, "src/app/challenge/create/page.tsx"), "utf8"));
  const branch = page.indexOf("reason === ADVANCED_ONLY_NOT_CHALLENGEABLE_REASON");
  const cloneFallback = page.indexOf('setState("error-clone")');
  assert.ok(branch > 0 && branch < cloneFallback, "고급 전용 분기가 클론 미완료 분기보다 먼저여야 한다");
  assert.ok(page.includes("{ADVANCED_ONLY_NOT_CHALLENGEABLE_LINE}"));
  assert.match(ADVANCED_ONLY_NOT_CHALLENGEABLE_LINE, /챌린지를 지원하지 않습니다/);
});

// ── §92(docs/Architecture.md · DECISIONS #206 · UX D-135) — 카드 배송 흡수 · 우선순위 낮음 2종 ─────────────────────────────

test("[§92 · D-135] 목록 분할 — 합쳐진 시나리오는 어느 묶음에도 없고, 우선순위 낮음은 일반 묶음 맨 뒤(안정 정렬 — 나머지 순서 무변경)", () => {
  const entries = [
    ["a", {}],
    ["low1", { lowPriority: true as const }],
    ["b", {}],
    ["merged", { advancedOnly: true as const, mergedInto: "a" }],
    ["low2", { lowPriority: true as const }],
    ["x", { advancedOnly: true as const }],
    ["c", {}],
  ] as const;
  const self = partitionScenarioList(entries, "self");
  assert.deepEqual(self.regular.map(([id]) => id), ["a", "b", "c", "low1", "low2"]);
  assert.deepEqual(self.advancedOnly.map(([id]) => id), ["x"]);
  const send = partitionScenarioList(entries, "send");
  assert.deepEqual(send.regular.map(([id]) => id), ["a", "b", "c", "low1", "low2"]);
  assert.deepEqual(send.advancedOnly, []);
  assert.equal(resolveListedScenarioId("merged", { mergedInto: "a" }), "a");
  assert.equal(resolveListedScenarioId("b", {}), "b");
  assert.equal(resolveListedScenarioId("ghost", undefined), "ghost");
});

test("[§92 · D-135] 실제 카탈로그 — 카드 배송 항목은 남고(제목 조회) 카드사로 합쳐지며, 우선순위 낮음은 환급금 · 택배 통관 2종뿐", () => {
  // `src/content/scenarios`는 확장자 없는 import라 이 러너(strip-types)로 직접 로드할 수 없다 — 소스 리터럴로 대조한다.
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../content/scenarios");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
  const merged = files.filter((f) => /^  mergedInto: "/m.test(read(f)));
  assert.deepEqual(merged, ["cardDeliveryCall.ts"]);
  assert.ok(read("cardDeliveryCall.ts").includes('mergedInto: "card-company-impersonation"'));
  assert.ok(read("cardDeliveryCall.ts").includes('title: "카드 배송 안내 전화"'), "옛 리포트 · 아카이브 제목 조회가 남는다");
  const low = files.filter((f) => /^  lowPriority: true,/m.test(read(f))).sort();
  assert.deepEqual(low, ["courierCustomsScam.ts", "taxRefundScam.ts"]);
});

test("[§92 · D-135] 병합 거부 사유 코드는 서버 리터럴과 같고, UX-029 · UX-017이 1줄 안내 · 프리셋 치환을 쓴다", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const serverSource = fs.readFileSync(path.join(root, "functions/src/session/mergedScenario.ts"), "utf8");
  const literal = serverSource.match(/export const SCENARIO_MERGED_REASON = "([^"]+)"/)?.[1];
  assert.ok(literal, "서버 리터럴을 못 찾았다 — 조용한 건너뜀 금지");
  assert.equal(SCENARIO_MERGED_REASON, literal);
  assert.equal(/카드|배송|카드사/.test(SCENARIO_MERGED_LINE), false, "안내 1줄에 시나리오 이름 · 흐름 0");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const difficulty = strip(fs.readFileSync(path.join(root, "src/app/scenarios/difficulty/page.tsx"), "utf8"));
  assert.ok(difficulty.includes("=== SCENARIO_MERGED_REASON"));
  const list = strip(fs.readFileSync(path.join(root, "src/app/scenarios/voice/ScenarioListView.tsx"), "utf8"));
  assert.ok(list.includes("resolveListedScenarioId(rawPreset, scenarios[rawPreset])"));
});
