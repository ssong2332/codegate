// 세션 오프닝 사기범 대사 생성 — createSession(functions/src/session)이 호출하는 트랙 A 내부 계약
// (Architecture.md §4 "유일한 크로스트랙 의존 2건" 중 하나, 같은 트랙 내부라 조율 불필요).
// index.ts(sendMessage, onCall + firebase-admin 의존)와 분리해둔 이유: 이 파일은 Firestore/admin
// 초기화가 전혀 필요 없는 순수 조합(LLM 어댑터 호출)이라 node:test에서 admin 앱 부트스트랩 없이도
// 바로 단위 테스트할 수 있다.
import { HttpsError } from "firebase-functions/v2/https";
import { maskPII } from "../guardrails";
import { completeWithFallback, getLlmClient } from "../llm";
import { SCENARIO_PROMPTS } from "../scenarios";
import { extractLinkMarker } from "./linkMarker";
import { buildSystemPrompt } from "./promptAssembly";
import type { ScammerMessage } from "./types";

export type OpeningLineResult = {
  message: ScammerMessage;
  /** 실제로 이 호출에서 Mock으로 생성됐는지(isMock을 ScammerMessage에 직접 얹지 않는 이유는
   * 아래 참고). createSession/consentChallenge는 이 값을 그대로 응답 isMock에 반영해야 한다 —
   * 아래 "왜 별도 함수를 없앴는지" 참고. */
  isMock: boolean;
};

/**
 * LLM 호출 지점은 반드시 functions/src/llm 어댑터(getLlmClient())를 통한다(T7 태스크 지시).
 *
 * 사용자 실측 신고(2026-07-24, 라이브 검증 중 직접 재현) — 이 함수를 completeWithFallback 없이
 * `llm.complete()`로 직접 호출했더니, Gemini 무료 티어 쿼터 초과(RESOURCE_EXHAUSTED, 하루 한도
 * 20건 — 실측)만으로 createSession/consentChallenge 호출 자체가 통째로 실패해 세션 생성이 아예
 * 안 됐다. sendMessage(reviewer 리뷰 Major #1)와 정확히 같은 부류의 문제를 오프닝 대사 생성에서도
 * 겪은 것 — 여기는 아직 Firestore write 이전이라 데이터 오염 위험은 없지만("T43 재검토"에서 이
 * 비대칭이 안전하다고 판단한 근거), 사용자 관점에서는 "세션 시작 자체가 안 되는" 완전한 기능
 * 장애다. completeWithFallback으로 감싸 Mock 강등으로 항상 세션이 시작되게 한다.
 *
 * **반환 타입을 `ScammerMessage`에서 `{message, isMock}`로 바꾼 이유(같은 실측에서 함께 발견)**:
 * 예전엔 호출부(createSession/consentChallenge)가 `isUsingMockLlm()`(= `getLlmClient().
 * providerName==="mock"`, 팩토리가 애초에 Mock을 고를지만 확인)을 이 함수와 **별도로** 호출해
 * 응답의 isMock을 정했다. completeWithFallback 도입 후, "팩토리가 Gemini를 고름"과 "이번 호출이
 * 실제로 Mock으로 강등됨(쿼터 초과 등)"이 서로 다른 사실이 됐다 — 팩토리는 Gemini를 고르고도
 * 이번 호출만 폴백될 수 있다. 그 경우 `isUsingMockLlm()`은 여전히 false를 반환해 실제로는 Mock이
 * 생성한 오프닝 대사에 `isMock:false`(거짓 표기, PRD Risks가 명시적으로 금지하는 "근거 없는 실
 * LLM 표기")가 붙는 정합성 버그가 났다. 이 함수가 직접 관측한 `completion.isMock`을 그대로
 * 돌려주는 것만이 유일하게 정확한 정보다.
 */
export async function generateOpeningLine(scenarioId: string): Promise<OpeningLineResult> {
  const scenarioPrompt = SCENARIO_PROMPTS[scenarioId];
  if (!scenarioPrompt) {
    throw new HttpsError("invalid-argument", `존재하지 않는 scenarioId입니다: ${scenarioId}`);
  }

  const completion = await completeWithFallback(getLlmClient(), {
    systemPrompt: buildSystemPrompt(scenarioPrompt),
    messages: [], // 오프닝 대사에는 아직 사용자 입력이 없다.
    mockTacticHints: scenarioPrompt.weakenedTactics,
  });

  // 메신저 확장(T29) — 스미싱 링크 마커([[LINK:id]])를 텍스트에서 제거하고 attachments로 변환한다
  // (§13.2 sentinel 패턴 재사용, linkMarker.ts 근거 참고). 마스킹 전/후 순서는 무관(마커는 PII가
  // 아니다) — 여기서는 마커 제거를 먼저 해 마스킹이 이미 정돈된 텍스트만 보게 한다.
  const { text: linkFreeText, attachments } = extractLinkMarker(completion.text);
  return {
    message: {
      role: "scammer",
      text: maskPII(linkFreeText),
      ...(attachments ? { attachments } : {}),
    },
    isMock: completion.isMock,
  };
}
