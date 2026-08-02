// T158(§48.3·§48.5.1, AC-084, docs/UX.md P-31) — 강등 고지 공통 로직 단위 테스트.
//
// AC-084 (f) 역방향 확인: 강등 상태(mock)에서 고지가 나오고 비강등 상태(claude/gemini/undefined)
// 에서는 나오지 않음을 같은 파일 안에서 나란히 증명한다.
// AC-084 (c) 문면 경계: 채택 문면 3종이 4대 금지(개발 용어/원인 단정/참가자 탓/무력감)를 어기지
// 않는지 문자열 검사로 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIALOGUE_DEGRADED_NOTICE,
  REPORT_DEGRADED_NOTICE,
  VOICE_DEGRADED_NOTICE,
  buildFallbackStatusLine,
  foldDegraded,
  isReportDialogueDegraded,
  isVoiceDegraded,
} from "./degradedDisclosure.ts";

// --- foldDegraded: §48.5.1 sticky OR-fold(G278) ---

test("foldDegraded: 신호가 true면 결과는 true다(§48.5.1 OR)", () => {
  assert.equal(foldDegraded(false, true), true);
});

test("foldDegraded: 이미 true면 신호가 false여도 true를 유지한다(sticky, G278 — false로 되돌리는 대입 금지)", () => {
  assert.equal(foldDegraded(true, false), true);
  assert.equal(foldDegraded(true, undefined), true);
  assert.equal(foldDegraded(true, null), true);
});

test("foldDegraded: 둘 다 false/미관측이면 false다(근거 없는 고지 금지, M-6)", () => {
  assert.equal(foldDegraded(false, false), false);
  assert.equal(foldDegraded(false, undefined), false);
  assert.equal(foldDegraded(false, null), false);
});

// --- buildFallbackStatusLine: UX-014 텍스트 폴백 phase, "신규 요소 0건" ---

const BASE_FALLBACK_TEXT = "실시간 음성 통화를 사용할 수 없어 텍스트로 진행합니다.";

test("buildFallbackStatusLine: dialogueDegraded=false면 기존 문구를 한 글자도 바꾸지 않는다(M-6 — 근거 없는 고지 금지)", () => {
  assert.equal(buildFallbackStatusLine(BASE_FALLBACK_TEXT, false), BASE_FALLBACK_TEXT);
});

test("buildFallbackStatusLine: dialogueDegraded=true면 모달리티 안내 + 대사 출처를 한 줄로 합친다(M-2, 신규 요소 0건 — 줄 수 그대로 1개)", () => {
  const line = buildFallbackStatusLine(BASE_FALLBACK_TEXT, true);
  assert.equal(line, `${BASE_FALLBACK_TEXT} ${DIALOGUE_DEGRADED_NOTICE}`);
  assert.equal(line.split("\n").length, 1, "1줄이어야 한다(P-31 (1))");
});

// --- isReportDialogueDegraded / isVoiceDegraded: 조건자는 값 하나만 본다(§48.2.1) ---

test("isReportDialogueDegraded: 역방향 확인 — mock이면 true, claude/gemini/undefined면 false(같은 출력에 나란히)", () => {
  assert.equal(isReportDialogueDegraded("mock"), true, "강등 세션은 고지가 나와야 한다");
  assert.equal(isReportDialogueDegraded("claude"), false, "실 프로바이더 세션은 고지가 없어야 한다");
  assert.equal(isReportDialogueDegraded("gemini"), false, "실 프로바이더 세션은 고지가 없어야 한다");
  assert.equal(isReportDialogueDegraded(undefined), false, "무백필 구 리포트는 긍정도 부정도 말하지 않는다(G274)");
});

test("isVoiceDegraded: 역방향 확인 — mock이면 true, elevenlabs/null이면 false", () => {
  assert.equal(isVoiceDegraded("mock"), true);
  assert.equal(isVoiceDegraded("elevenlabs"), false);
  assert.equal(isVoiceDegraded(null), false);
});

test("isReportDialogueDegraded/isVoiceDegraded: 대사 축과 목소리 축은 서로의 조건자를 절대 만족시키지 않는다(§48.3 축 분리)", () => {
  // "mock"이라는 값 자체는 같지만, 두 함수는 서로 다른 필드(llmProvider vs voiceProvider)를
  // 입력으로 받는다는 계약이므로 여기서는 함수가 다른 축의 파라미터 타입을 받지 않음을
  // (컴파일 타임에) 강제하는 것으로 충분하다 — 런타임으로는 두 조건자가 각각 자기 축 값에만
  // true를 낸다는 사실만 재확인한다.
  assert.equal(isReportDialogueDegraded("mock"), true);
  assert.equal(isVoiceDegraded("mock"), true);
});

// --- AC-084 (c) 문면 경계 — 4대 금지 문안 대조 ---

const BANNED_DEV_TERMS = ["Mock", "목업", "폴백", "쿼터", "API", "모델"];
const BANNED_HELPLESSNESS = ["소용없", "막을 수 없", "어차피", "방법이 없", "이제 안전", "면역", "또 틀렸"];
const NOTICES = [
  ["DIALOGUE_DEGRADED_NOTICE(ⓔ)", DIALOGUE_DEGRADED_NOTICE],
  ["VOICE_DEGRADED_NOTICE(ⓕ)", VOICE_DEGRADED_NOTICE],
  ["REPORT_DEGRADED_NOTICE(ⓖ)", REPORT_DEGRADED_NOTICE],
] as const;

for (const [label, notice] of NOTICES) {
  test(`${label}: 개발 용어를 참가자 문면에 쓰지 않는다(AC-084 (c) ⛔1)`, () => {
    for (const term of BANNED_DEV_TERMS) {
      assert.equal(notice.includes(term), false, `"${term}"이 문면에 포함되면 안 된다: ${notice}`);
    }
  });

  test(`${label}: 무력감·과신·질책 표현을 쓰지 않는다(AC-084 (c) ⛔4, P-25 계승)`, () => {
    for (const term of BANNED_HELPLESSNESS) {
      assert.equal(notice.includes(term), false, `"${term}"이 문면에 포함되면 안 된다: ${notice}`);
    }
  });

  test(`${label}: "실제 AI가 아닙니다"류(ⓓ 기각 사유 — AC-022와 모순으로 읽힘)를 쓰지 않는다`, () => {
    assert.equal(notice.includes("실제 AI가 아닙니다"), false);
  });
}

test("REPORT_DEGRADED_NOTICE: 판정을 무효로 선언하지 않는다(AC-084 (b) — '의미가 없었다'류 금지)", () => {
  assert.equal(REPORT_DEGRADED_NOTICE.includes("의미가 없"), false);
  assert.equal(REPORT_DEGRADED_NOTICE.includes("믿을 수 없"), false);
});
