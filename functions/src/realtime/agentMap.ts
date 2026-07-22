// scenarioId → ElevenLabs agentId 매핑 (2026-07-22, 실시간 음성 대화 전환).
//
// ADR-0004에 따라 시나리오 페르소나 프롬프트는 클라이언트로 내려보내지 않는다. ElevenLabs
// 오버라이드는 클라가 전송하는 값이므로 프롬프트를 그 경로로 넘기면 브라우저에 노출된다.
// 대신 **시나리오별 에이전트를 ElevenLabs 대시보드/API로 미리 만들어 프롬프트를 그쪽에 저장**하고,
// 서버는 여기 매핑으로 agentId만 고른다.
//
// 각 에이전트를 만들 때 넣을 프롬프트 원문은 이미 이 저장소에 있다 —
// `functions/src/scenarios/*.prompt.ts`의 personaPrompt + weakenedTactics + guardrailPreamble을
// `roleplay/promptAssembly.buildSystemPrompt()`로 조립한 문자열을 그대로 쓴다(동일 문자열을 두 곳에
// 손으로 옮겨 적어 드리프트가 나지 않도록, 조립 함수를 재사용해 출력해서 붙여넣을 것).
//
// 환경변수 형식(functions/.env 또는 배포 시크릿):
//   ELEVENLABS_AGENT_IDS=family-accident-deepvoice:agent_xxx,tax-refund-scam:agent_yyy
// 쉼표로 구분한 `scenarioId:agentId` 목록. 미설정이거나 해당 시나리오가 목록에 없으면 실시간 대화를
// 쓸 수 없다는 뜻이라, 호출부는 Mock(텍스트 폴백)으로 자동 강등한다 — 조용한 실패 금지 원칙에 따라
// 그 사실을 응답의 isMock으로 클라에 명시한다.

/** `a:1,b:2` 형태 문자열을 파싱한다. 공백/빈 항목은 무시하고, 형식이 잘못된 항목은 건너뛴다. */
export function parseAgentMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const map: Record<string, string> = {};
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex <= 0) continue;
    const scenarioId = trimmed.slice(0, separatorIndex).trim();
    const agentId = trimmed.slice(separatorIndex + 1).trim();
    if (!scenarioId || !agentId) continue;
    map[scenarioId] = agentId;
  }
  return map;
}

/** 매핑에서 scenarioId에 해당하는 agentId를 찾는다. 없으면 undefined(→ 호출부가 Mock 강등). */
export function resolveAgentId(
  raw: string | undefined,
  scenarioId: string,
): string | undefined {
  return parseAgentMap(raw)[scenarioId];
}
