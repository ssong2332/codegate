// 세션 오프닝 사기범 대사 생성 — createSession(functions/src/session)이 호출하는 트랙 A 내부 계약
// (Architecture.md §4 "유일한 크로스트랙 의존 2건" 중 하나, 같은 트랙 내부라 조율 불필요).
// index.ts(sendMessage, onCall + firebase-admin 의존)와 분리해둔 이유: 이 파일은 Firestore/admin
// 초기화가 전혀 필요 없는 순수 조합(LLM 어댑터 호출)이라 node:test에서 admin 앱 부트스트랩 없이도
// 바로 단위 테스트할 수 있다.
import { HttpsError } from "firebase-functions/v2/https";
import { maskPII } from "../guardrails";
import { getLlmClient } from "../llm";
import { SCENARIO_PROMPTS } from "../scenarios";
import { extractLinkMarker } from "./linkMarker";
import { buildSystemPrompt } from "./promptAssembly";
import type { ScammerMessage } from "./types";

/**
 * LLM 호출 지점은 반드시 functions/src/llm 어댑터(getLlmClient())를 통한다(T7 태스크 지시).
 */
export async function generateOpeningLine(scenarioId: string): Promise<ScammerMessage> {
  const scenarioPrompt = SCENARIO_PROMPTS[scenarioId];
  if (!scenarioPrompt) {
    throw new HttpsError("invalid-argument", `존재하지 않는 scenarioId입니다: ${scenarioId}`);
  }

  const llm = getLlmClient();
  const completion = await llm.complete({
    systemPrompt: buildSystemPrompt(scenarioPrompt),
    messages: [], // 오프닝 대사에는 아직 사용자 입력이 없다.
    mockTacticHints: scenarioPrompt.weakenedTactics,
  });

  // 메신저 확장(T29) — 스미싱 링크 마커([[LINK:id]])를 텍스트에서 제거하고 attachments로 변환한다
  // (§13.2 sentinel 패턴 재사용, linkMarker.ts 근거 참고). 마스킹 전/후 순서는 무관(마커는 PII가
  // 아니다) — 여기서는 마커 제거를 먼저 해 마스킹이 이미 정돈된 텍스트만 보게 한다.
  const { text: linkFreeText, attachments } = extractLinkMarker(completion.text);
  return {
    role: "scammer",
    text: maskPII(linkFreeText),
    ...(attachments ? { attachments } : {}),
  };
}

/** generateOpeningLine이 Mock LLM으로 생성됐는지 createSession이 알 수 있도록 하는 보조 함수.
 * (isMock을 ScammerMessage에 직접 얹지 않는 이유: ScammerMessage는 messages 서브컬렉션 role/text
 * 계약과도 겹치는 형태라 필드를 늘리지 않고, createSession이 별도로 getLlmClient().providerName을
 * 확인하도록 한다.) */
export function isUsingMockLlm(): boolean {
  return getLlmClient().providerName === "mock";
}
