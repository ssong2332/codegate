// 서버 조립 프롬프트 + 사용자 입력 구분자 감싸기 (Track A, T7, ADR-0004/AC-013/AC-024).
// 이 파일이 하는 일은 오직 "문자열 조립"이며 부수효과(Firestore/LLM 호출)는 없다 — sendMessage/
// generateOpeningLine(index.ts)이 이 함수들의 결과를 LLM 어댑터에 전달한다.
import type { ScenarioPromptDoc } from "../shared/types";
import type { LlmMessage } from "../llm";

// 사용자 신고(2026-07-25) — "사람과 대화한다는 느낌이 안 든다", "대화가 자연스럽지 않다",
// "시나리오대로 유도하되 사용자의 말을 파악해서 흘러가야 한다". 기존 프롬프트는 페르소나(누구인가)와
// 수법 목록(무엇을 하는가)만 있고 **대화하는 방식**(어떻게 주고받는가)에 대한 지침이 전혀 없었다 —
// 그래서 LLM이 사용자가 무슨 말을 하든 다음 수법을 낭독하듯 이어가는 독백형 대사가 나왔다.
//
// 모든 시나리오(보이스 9종·메신저 4종)와 모든 경로(Gemini Live 실시간·sendMessage 텍스트·오프닝)가
// 이 함수 하나를 공유하므로 여기에 한 번만 넣는다 — 13개 프롬프트 파일을 각각 고치지 않는다.
//
// 짧은 턴을 강제하는 것은 자연스러움만이 아니라 **체감 지연**과도 직결된다(사용자의 같은 메시지에
// 포함된 "내가 말하고 ai가 말하는 데 걸리는 시간이 길다"). 실시간 음성 경로에서 모델이 긴 응답을
// 계획하면 첫 오디오가 나오기까지 그만큼 오래 걸리기 때문이다. 다만 이 항목은 서버측 모델 추론
// 시간 자체를 줄이는 것이 아니라 생성량을 줄여 간접적으로 앞당기는 것이라, 실제 단축폭은 라이브
// 측정이 필요하다(추정).
const CONVERSATION_STYLE = `[대화 방식 — 반드시 지킨다]
- **상대의 말에 먼저 반응한다.** 상대가 방금 한 말(질문·의심·거절·감정)을 그대로 흘려보내지 말고, 그 내용을 짚어 한 마디로 받아친 다음에 네 용건으로 넘어간다. 상대가 무슨 말을 하든 준비된 다음 수법을 순서대로 읊는 식으로 진행하지 않는다.
- **한 번에 짧게 말한다.** 실제 통화처럼 한 번에 1~3문장까지만 말하고 상대에게 차례를 넘긴다. 여러 수법을 한 번에 몰아서 늘어놓지 않는다 — 수법은 대화가 이어지는 동안 상대의 반응에 맞춰 하나씩 꺼낸다.
- **말투는 글이 아니라 말이다.** 문어체 문장이나 낭독조 안내문이 아니라, 실제로 입으로 하는 구어체로 말한다. 상대가 되묻거나 말을 끊으면 자연스럽게 받아준다.
- **시나리오의 목적지는 유지하되 경로는 상대에 맞춘다.** 상대가 순순히 따라오면 다음 단계로 빨리 넘어가고, 의심하거나 저항하면 그 의심 자체를 먼저 다루면서(해명·되묻기·압박) 목적지로 되돌린다. 상대의 말을 무시한 채 원래 대본으로 되돌아가지 않는다.`;

/**
 * 시스템 프롬프트 조립(ADR-0004 구조: personaPrompt + weakenedTactics + 대화 방식 + guardrailPreamble).
 * `scenarioPrompts/{scenarioId}` 원문은 클라가 절대 읽을 수 없고(firestore.rules), 이 조립도
 * Cloud Functions 안에서만 실행된다 — 클라이언트는 조립된 문자열을 보거나 전송받지 않는다(AC-024).
 *
 * guardrailPreamble은 항상 **맨 마지막**에 둔다(기존 순서 유지) — 안전 지침이 뒤에 올수록 모델이
 * 앞선 지침보다 우선해 따르는 경향이 있어, 새로 추가한 대화 방식 블록도 그 앞에 넣는다.
 */
export function buildSystemPrompt(prompt: ScenarioPromptDoc): string {
  const tactics = prompt.weakenedTactics.map((tactic, i) => `${i + 1}. ${tactic}`).join("\n");
  return [
    prompt.personaPrompt,
    "",
    "[사용 가능한 수법(weakenedTactics) — 이 목록 밖의 수법, 특히 실제 운영 가능한 사기 수법을 스스로 만들지 않는다]",
    tactics,
    "",
    CONVERSATION_STYLE,
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
