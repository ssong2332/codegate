import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBeginnerBriefingSignals } from "../beginnerBriefing";
import { SCENARIO_PROMPTS } from "../index";
import { FLOW_VARIANTS, beginnerBriefingLabels, listFlowVariants } from "../flowVariants";
import { PUBLIC_SCENARIOS, isAdvancedOnlyScenario } from "../publicMeta";
import { extractTacticLabel } from "../tacticFlavor";

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

// ── T191 S5 — 브리핑 = 그 시나리오 초급 변형 전부의 수법 라벨 교집합(UX 계약 C-3 · D-108 · PRD AC-096 (e)) ──
// 설계: T191 흐름 변형 설계(Architecture T191 절 "브리핑" 행 · 게이트 표 "브리핑 교집합"). ⚠️ 같은 절의 게이트
// 표 문면 "초급 변형 시나리오당 정확히 1(트립와이어)"은 첫 판 안이고, 같은 절 본문이 *"C-3이 더 넓어 대체됐다"*
// 고 적었다 — 이 테스트는 본문(교집합 규칙)을 따른다(설계 문서 내부 차이 — 보고 대상).

/** 라벨 ⊆ 변형 수법 라벨인가 — 브리핑이 배정 변형 밖 신호를 예고하지 않는다(AC-096 (e)). */
function outsideVariant(labels: string[], variantTactics: string[]): string[] {
  const own = variantTactics.map(extractTacticLabel);
  return labels.filter((label) => !own.includes(label));
}

test("[T191 S5 브리핑 교집합] 기존 14종은 브리핑 라벨이 비지 않고, 초급 변형 **전부**의 수법 라벨 안에 있다", (t) => {
  const counts: string[] = [];
  for (const id of Object.keys(PUBLIC_SCENARIOS).filter((x) => !isAdvancedOnlyScenario(x))) {
    const labels = beginnerBriefingLabels(id);
    counts.push(`${id}=${labels.length}`);
    assert.ok(labels.length > 0, `${id}: 브리핑 교집합이 비었다(OQ-U72 — 화면이 진입을 숨긴다)`);
    for (const v of listFlowVariants(id, "beginner")) {
      assert.deepEqual(outsideVariant(labels, v.tactics), [], `${id}: 브리핑 라벨이 초급 변형 ${v.variantId} 밖이다`);
    }
    // 인용구 · 설명부가 새지 않는다(ADR-0004 — 기존 라벨 검사와 같은 기준).
    for (const label of labels) assert.ok(!label.includes("'") && !label.includes("—") && label.length <= 40, `${id}: ${label}`);
  }
  t.diagnostic(`브리핑 라벨 수: ${counts.join(" · ")}`);
});

test("[T191 S5 브리핑 교집합] 고급 전용 3종은 브리핑 대상이 아니다(초급 변형 0 → 빈 배열)", () => {
  for (const id of Object.keys(PUBLIC_SCENARIOS).filter(isAdvancedOnlyScenario)) {
    assert.deepEqual(beginnerBriefingLabels(id), [], id);
  }
});

test("[T191 S5 브리핑 교집합 · 역방향 ⓓ] 초급 변형이 2벌이면 공통 라벨만 · 변형 밖 라벨을 섞은 샘플은 ⊆ 검사에 걸린다", (t) => {
  // 데이터에는 초급 변형이 시나리오당 1벌이라, 2벌 상황은 교집합 함수의 규칙으로 직접 확인한다.
  const [a] = listFlowVariants("card-company-impersonation", "beginner");
  const b = { ...a, tactics: a.tactics.slice(1) }; // 첫 수법을 뺀 가상의 두 번째 초급 변형(테스트 안에서만)
  const firstLabel = extractTacticLabel(a.tactics[0]);
  const intersection = buildIntersection([a.tactics, b.tactics]);
  assert.equal(intersection.includes(firstLabel), false, "한 변형에만 있는 라벨은 교집합에서 빠진다");
  // 역방향 ⓓ — 정상 브리핑 vs 변형 밖 라벨을 섞은 브리핑.
  const normal = beginnerBriefingLabels("card-company-impersonation");
  const tainted = [...normal, "확인 시도 무력화"];
  t.diagnostic(`정상 밖 라벨 ${JSON.stringify(outsideVariant(normal, a.tactics))} / 오염 샘플 밖 라벨 ${JSON.stringify(outsideVariant(tainted, a.tactics))}`);
  assert.deepEqual(outsideVariant(normal, a.tactics), []);
  assert.deepEqual(outsideVariant(tainted, a.tactics), ["확인 시도 무력화"]);
  assert.ok(FLOW_VARIANTS.length > 0);
});

/** beginnerBriefingLabels와 같은 규칙(첫 목록 순서 유지 · 모든 목록에 있는 라벨만)을 임의 입력에 적용한다. */
function buildIntersection(lists: string[][]): string[] {
  const sets = lists.map((l) => l.map(extractTacticLabel));
  return [...new Set(sets[0])].filter((label) => sets.every((set) => set.includes(label)));
}
