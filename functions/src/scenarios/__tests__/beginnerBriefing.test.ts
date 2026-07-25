import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBeginnerBriefingSignals } from "../beginnerBriefing";
import { SCENARIO_PROMPTS } from "../index";

// T72 · Architecture.md §15.3.4 · UX-029/D-43 · AC-066(초급 힌트는 세션 시작 전 브리핑만) ·
// ADR-0004(페르소나·대사 예시·가드레일 원문은 절대 클라로 나가지 않는다).

test("buildBeginnerBriefingSignals(): 'label — 설명' 형식에서 라벨만 뽑는다(설명부 미노출)", () => {
  const signals = buildBeginnerBriefingSignals([
    "긴급성 조성 — '지금 바로 처리하지 않으면 계좌가 정지된다'고 재촉한다.",
    "확인 절차 차단 — '다른 사람에게 말하면 수사에 지장이 있다'고 막는다.",
  ]);

  assert.deepEqual(signals, ["긴급성 조성", "확인 절차 차단"]);
});

test("buildBeginnerBriefingSignals(): 인용구(캐릭터 대사)·설명부를 절대 포함하지 않는다(ADR-0004)", () => {
  const signals = buildBeginnerBriefingSignals([
    "개인정보 직접 요구 — '주민등록번호 뒷자리를 불러 주세요'라고 요구한다. [[LINK:fake-1]]",
  ]);

  assert.deepEqual(signals, ["개인정보 직접 요구"]);
  for (const signal of signals) {
    assert.ok(!signal.includes("'"), "인용구(대사 예시)가 섞이면 안 된다");
    assert.ok(!signal.includes("[["), "구조화 마커가 섞이면 안 된다");
    assert.ok(!signal.includes("—"), "설명부 구분자가 남으면 안 된다");
  }
});

test("buildBeginnerBriefingSignals(): 같은 라벨은 한 번만, 순서는 원본 유지", () => {
  const signals = buildBeginnerBriefingSignals([
    "긴급성 조성 — 첫 번째 설명.",
    "안심 유도 — 두 번째 설명.",
    "긴급성 조성 — 세 번째 설명(같은 라벨).",
  ]);

  assert.deepEqual(signals, ["긴급성 조성", "안심 유도"]);
});

test("buildBeginnerBriefingSignals(): 실제 시나리오 콘텐츠에서도 라벨만 나오고 최소 1건은 있다", () => {
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const signals = buildBeginnerBriefingSignals(prompt.weakenedTactics);
    assert.ok(signals.length > 0, `${scenarioId}: 브리핑 신호가 최소 1건은 나와야 한다`);
    for (const signal of signals) {
      assert.ok(
        !signal.includes("'"),
        `${scenarioId}: 인용구(대사 예시)가 클라로 나가면 안 된다 — "${signal}"`,
      );
      assert.ok(
        signal.length <= 40,
        `${scenarioId}: 라벨이 아니라 설명부가 통째로 새어나온 것으로 보인다 — "${signal}"`,
      );
    }
    // 페르소나·가드레일 원문이 섞이지 않았음을 구조적으로 재확인한다.
    const joined = signals.join(" ");
    assert.ok(!joined.includes(prompt.personaPrompt.slice(0, 20)));
    assert.ok(!joined.includes(prompt.guardrailPreamble.slice(0, 20)));
  }
});
