// 2026-11-07 Edge 재시험(자녀 사칭 초급 "다른 명의 계좌 요구" · 대환대출 판 34 "선상환 송금 요구" — 하지 않은 수법이 목록에 오름) —
// 수법 문구 키를 그 시나리오의 **설정 문구**와 구별하는 데 쓰는 글(`analyzeConversation` `buildTacticMatchers` 표 "설정 문구 구별").
// | 넣는 것 | 이유 |
// |---|---|
// | 원본 시나리오 페르소나(변형 합성 전) | 사기범이 매 판 꺼내는 기본 사연("폰이 고장 나서")이 수법 인용구 앞머리와 겹친다. 변형 합성본은 수법 줄을 함께 실어 넣지 않는다 |
// | 그 시나리오 통화 중 문자 본문 전부 | 사기범이 문자 제목을 그대로 말한다("저금리 전환") |
// ⛔ 판정(속음 · 순간 · turnIndex)에는 쓰지 않는다 — 수법 이름 추정 키의 길이만 바꾼다.
import { resolveSessionScenarioPrompt } from "../scenarios/flowVariants";
import { IN_CALL_SMS } from "../scenarios/inCallSms";

export function buildTacticPremiseText(scenarioId: string): string {
  const persona = resolveSessionScenarioPrompt(scenarioId)?.personaPrompt ?? "";
  const smsBodies = (IN_CALL_SMS[scenarioId] ?? []).map((item) => item.body);
  return [persona, ...smsBodies].join("\n");
}
