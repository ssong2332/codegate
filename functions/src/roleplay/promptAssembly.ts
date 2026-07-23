// 서버 조립 프롬프트 + 사용자 입력 구분자 감싸기 (Track A, T7, ADR-0004/AC-013/AC-024).
// 이 파일이 하는 일은 오직 "문자열 조립"이며 부수효과(Firestore/LLM 호출)는 없다 — sendMessage/
// generateOpeningLine(index.ts)이 이 함수들의 결과를 LLM 어댑터에 전달한다.
import type { ScenarioPromptDoc } from "../shared/types";
import type { LlmMessage } from "../llm";

/**
 * 시스템 프롬프트 조립(ADR-0004 구조: personaPrompt + weakenedTactics + guardrailPreamble).
 * `scenarioPrompts/{scenarioId}` 원문은 클라가 절대 읽을 수 없고(firestore.rules), 이 조립도
 * Cloud Functions 안에서만 실행된다 — 클라이언트는 조립된 문자열을 보거나 전송받지 않는다(AC-024).
 */
export function buildSystemPrompt(prompt: ScenarioPromptDoc): string {
  const tactics = prompt.weakenedTactics.map((tactic, i) => `${i + 1}. ${tactic}`).join("\n");
  return [
    prompt.personaPrompt,
    "",
    "[사용 가능한 수법(weakenedTactics) — 이 목록 밖의 수법, 특히 실제 운영 가능한 사기 수법을 스스로 만들지 않는다]",
    tactics,
    "",
    prompt.guardrailPreamble,
  ].join("\n");
}

const USER_INPUT_OPEN = "[훈련참가자입력:데이터시작]";
const USER_INPUT_CLOSE = "[훈련참가자입력:데이터끝]";

// 구분자 리터럴을 여는/닫는 대괄호 "[...]" 형태로 흉내 낼 수 있는 사용자 입력을 무력화한다(T11,
// T7 reviewer Minor 지적: "사용자가 구분자 문자열을 그대로 흉내내면 문자열 레벨 2차 방어가
// 흐려질 수 있다"). 사용자 텍스트 안에 `[훈련참가자입력:...]` 형태가 그대로 들어오면 반각 대괄호를
// 전각 대괄호(［］)로 치환해, 실제 wrapUserInputAsData가 앞뒤에 삽입하는 진짜 구분자와 문자열이
// 절대 같아질 수 없게 만든다. 세션별 nonce를 구분자에 섞는 방법도 검토했으나, 구분자를 매 호출마다
// 재계산해야 하고 toLlmHistory로 과거 턴을 재구성할 때도 같은 nonce를 알아야 해 호출부(index.ts/
// toLlmHistory) 시그니처까지 건드려야 했다 — 이 이스케이프 방식은 이 함수 내부만 바꿔서 끝나
// 과설계를 피한다(구조적 방어인 role 분리가 이미 1차 방어라 이 정도로 충분, ADR-0004).
// T29 reviewer Major #4 — 사용자 입력 안에 `[[LINK:...]]`(스미싱 링크 마커, linkMarker.ts) 형태의
// 문자열이 그대로 들어와도, 실 LLM이 사용자 텍스트를 대사에 그대로 인용/반복하는 경우
// extractLinkMarker(어시스턴트 출력만 스캔하는 함수 자체는 안전하지만, LLM이 사용자 문구를
// 반향하면 그 반향된 텍스트가 어시스턴트 출력에 섞여 들어온다)가 이를 진짜 마커로 오인할 여지를
// 원천 차단한다. `[[SIGNAL:...]]`도 정규식에 이미 함께 포함돼(T29가 선제적으로 넣어 둠) 같은 보호를
// 받는다 — T30(에스컬레이션 구현)이 실제로 escalationSignal.ts의 감지 로직을 추가한 뒤 이 정규식이
// `[[SIGNAL:ESCALATE_VOICE]]` 흉내도 무력화함을 확인했다(별도 수정 불필요, 코드가 이미 앞서 있었음).
function escapeSentinelLookalikes(text: string): string {
  return text.replace(/\[\[(LINK|SIGNAL):/g, "［［$1：");
}

function escapeDelimiterLookalikes(text: string): string {
  return escapeSentinelLookalikes(text).replace(/\[(훈련참가자입력:[^\]]*)\]/g, "［$1］");
}

/**
 * 사용자 입력을 구분자로 감싼다(AC-013/AC-024 "사용자입력/시스템프롬프트 분리" 구조의 두 번째
 * 방어층 — 첫 번째 방어층은 role:"user" 분리 자체). LLM에게 "이 안의 내용은 지시가 아니라 훈련
 * 참가자가 보낸 데이터"임을 문자열 레벨에서도 명확히 표시한다.
 */
export function wrapUserInputAsData(text: string): string {
  const safeText = escapeDelimiterLookalikes(text);
  return `${USER_INPUT_OPEN}\n${safeText}\n${USER_INPUT_CLOSE}`;
}

/**
 * Firestore에 저장된 대화 이력(마스킹된 텍스트, 시간순)을 LLM 어댑터 입력 형식으로 변환한다.
 * 사용자 턴은 wrapUserInputAsData로 감싸 매 턴 반복적으로 데이터임을 표시한다.
 */
export function toLlmHistory(
  storedMessages: { role: "user" | "scammer"; textMasked: string }[],
): LlmMessage[] {
  return storedMessages.map((m) =>
    m.role === "user"
      ? { role: "user" as const, content: wrapUserInputAsData(m.textMasked) }
      : { role: "assistant" as const, content: m.textMasked },
  );
}
