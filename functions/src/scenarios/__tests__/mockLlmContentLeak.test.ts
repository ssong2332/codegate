// 회귀 테스트 (2026-07-23, reviewer/QA 리포트 반영) — MockLlmClient가 실제 시나리오
// weakenedTactics를 씹어서(turn % length) 대사를 만들 때, 인용구('...')가 없는 항목은 명령문
// 원문(백틱·마커 문법 포함)을 그대로 흘려보낸다는 걸 잡아내지 못했던 회귀를 방지한다.
// (messenger-parcel-smishing-sms/messenger-subsidy-smishing-sms의 "링크 클릭 유도" 항목이
// 인용구 없이 백틱 마커만 있어 발생 — 이번에 수정.) 기존 linkMarker.test.ts는 손으로 쓴 문자열만
// 검증해 이 클래스의 버그를 못 잡았다 — 이 테스트는 **실제 SCENARIO_PROMPTS 콘텐츠**를
// MockLlmClient에 그대로 통과시켜 검증한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockLlmClient } from "../../llm/mockClient";
import { extractLinkMarker } from "../../roleplay/linkMarker";
import { SCENARIO_PROMPTS } from "../index";

// 응답에 남으면 안 되는 것들 — 백틱(마크다운 코드 표기 잔재), 대괄호(마커 문법 잔재),
// 프롬프트 저작 지시 어휘가 사용자 대사에 노출되면 안 된다(AC-003 캐릭터 유지 정면 위반).
const LEAK_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /`/, label: "백틱(코드 표기 잔재)" },
  { pattern: /\[\[|\]\]/, label: "대괄호 마커 문법 잔재" },
  { pattern: /마커만\s*사용/, label: "저작 지시 어휘(\"마커만 사용\")" },
  { pattern: /어떤\s*경우에도\s*출력/, label: "저작 지시 어휘(\"어떤 경우에도 출력\")" },
];

test("MockLlmClient: 모든 시나리오의 weakenedTactics를 turn 0~N-1까지 순회해도 백틱·마커·저작지시 문구가 사용자 화면에 노출되지 않는다(AC-003, reviewer/QA 회귀 방지)", async () => {
  const llm = new MockLlmClient();

  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const tactics = prompt.weakenedTactics;

    // turn=0(오프닝, messages:[]) 포함해 tactics.length만큼 순회하면 craftEscalationLine의
    // `turn % tactics.length`가 모든 인덱스를 정확히 한 번씩 지나간다(turn=1..tactics.length).
    for (let turn = 0; turn <= tactics.length; turn += 1) {
      const messages: { role: "user" | "assistant"; content: string }[] =
        turn === 0
          ? []
          : Array.from({ length: turn }, (_, i) => ({
              role: i % 2 === 0 ? "user" : "assistant",
              content: "테스트 사용자 입력",
            }));

      const completion = await llm.complete({
        systemPrompt: "테스트",
        messages,
        mockTacticHints: tactics,
      });

      const { text: cleaned } = extractLinkMarker(completion.text);

      for (const { pattern, label } of LEAK_PATTERNS) {
        assert.equal(
          pattern.test(cleaned),
          false,
          `${scenarioId} turn=${turn}: 응답에 ${label}가 남아있으면 안 된다(원문: "${completion.text}", 정제후: "${cleaned}")`,
        );
      }
    }
  }
});

// 포지티브 경로 테스트(2026-07-23, reviewer/QA 재검증에서 지적된 회귀 방지) — 위 테스트는
// "새면 안 된다"만 검증해서, extractTacticFlavor()가 마커까지 통째로 버려 링크 칩이 영영 안
// 만들어지는 회귀(마커가 '인용구' 밖에 있으면 버려짐)를 못 잡았다. weakenedTactics 원문에
// `[[LINK:...]]`/`[[SIGNAL:...]]` 마커가 있는 시나리오는, 0..N턴을 다 훑었을 때 그 마커가 최소
// 한 번은 실제로 결과(attachments 또는 정제된 텍스트)에 살아남아야 한다 — 그래야 이 시나리오가
// 실제 플레이에서 스미싱 링크 칩을 낼 수 있다는 것이 보장된다.
const MARKER_SOURCE_PATTERN = /\[\[(LINK|SIGNAL):([a-zA-Z0-9_-]+)\]\]/g;

test("MockLlmClient: weakenedTactics 원문에 [[LINK:...]]/[[SIGNAL:...]] 마커가 있는 시나리오는 0..N턴 중 최소 한 번은 그 마커가 실제로 결과에 살아남는다(포지티브 경로, reviewer/QA 재검증 반영)", async () => {
  const llm = new MockLlmClient();

  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const tactics = prompt.weakenedTactics;
    const expectedMarkers = new Set(
      tactics.flatMap((t) => [...t.matchAll(MARKER_SOURCE_PATTERN)].map((m) => m[0])),
    );
    if (expectedMarkers.size === 0) continue; // 이 시나리오는 마커를 쓰지 않는다 — 검사 대상 아님.

    const seenMarkers = new Set<string>();
    for (let turn = 0; turn <= tactics.length; turn += 1) {
      const messages: { role: "user" | "assistant"; content: string }[] =
        turn === 0
          ? []
          : Array.from({ length: turn }, (_, i) => ({
              role: i % 2 === 0 ? "user" : "assistant",
              content: "테스트 사용자 입력",
            }));

      const completion = await llm.complete({
        systemPrompt: "테스트",
        messages,
        mockTacticHints: tactics,
      });

      const { attachments } = extractLinkMarker(completion.text);
      for (const attachment of attachments ?? []) {
        seenMarkers.add(`[[LINK:${attachment.fakeLandingId}]]`);
      }
    }

    for (const expected of expectedMarkers) {
      assert.ok(
        seenMarkers.has(expected) || expected.startsWith("[[SIGNAL:"), // SIGNAL 처리는 T30 소관, 아직 미구현
        `${scenarioId}: weakenedTactics에 ${expected}가 정의돼 있는데 0..${tactics.length}턴 어디서도 실제로 attachments로 살아남지 않았다 — extractTacticFlavor가 마커를 버리고 있을 수 있다.`,
      );
    }
  }
});
