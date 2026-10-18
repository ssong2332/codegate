// 릴레이 새 화자 첫마디 — T191 릴레이 설계 + PRD AC-098 갱신 고지 1(OQ-U73 판정 ⓐ: 새 화자 첫마디 1회는
// 오프닝과 같은 예외 · 교대 1회당 정확히 1발화 · 자기소개와 앞 사건 이어받기까지 · **새 요구 금지**).
//
// 텍스트 폴백 경로의 첫마디 생성(`startRelayLeg` mode "text")과 실시간 경로의 첫마디 트리거(새 Live 연결 직후
// `relayGreeting` 큐 턴)가 **같은 지시 원천**을 쓴다 — 두 경로의 첫마디 규칙이 갈라지지 않게(AC-101 (e)).
// 생성 파이프라인은 `openingLine.ts`와 같다(어댑터 · Mock 강등 · 실존 금융사명 치환 · 문장 상한).
import { logger } from "firebase-functions";
import { replaceRealFinancialNames } from "../guardrails/realFinancialNames";
import { completeWithFallback, getLlmClient } from "../llm";
import { resolveSessionScenarioPrompt } from "../scenarios/flowVariants";
import { hasInCallSms } from "../scenarios/inCallSms";
import { isL3Procedural } from "./l3Depth";
import { asksIdentityCheck } from "./personaAuthority";
import { buildSystemPrompt } from "./promptAssembly";
import { limitReplySentences } from "./replyLength";
import { finalizeScammerReplyText } from "./scammerReplyMasking";
import type { DifficultyLevel } from "../shared/difficulty";
import type { OpeningLineResult } from "./openingLine";

/** 폴백 첫마디 생성용 턴 지시(인용 예시 문장 0 — S1 §3.4). */
export const RELAY_GREETING_TURN_INSTRUCTION =
  "[연결 첫마디] 방금 앞 담당자에게서 통화를 넘겨받아 연결됐다. 상대가 아직 말하지 않았어도 네가 먼저 1~2문장으로 소속과 직함을 밝히고, 앞 담당자에게서 넘겨받았다고 말하며 앞 상황을 이어받아라. 이 첫마디에는 새 요구를 하지 않는다.";

/** 실시간 첫마디 트리거(새 Live 연결 직후 `relayGreeting` 텍스트 턴 1회 — 전사에 기록하지 않는다). */
export const RELAY_GREETING_LIVE_TRIGGER =
  "(전화가 방금 넘겨져 연결됐다. 상대가 아직 말하지 않았어도 네가 먼저 1~2문장으로 소속과 직함을 밝히고, 앞 담당자에게서 넘겨받았다고 말하며 앞 상황을 이어받아라. 이 첫마디에는 새 요구를 하지 않는다.)";

export async function generateRelayGreeting(input: {
  scenarioId: string;
  difficultyLevel?: DifficultyLevel;
  flowVariantId: string;
  legIndex: number;
  handoff: string;
  speakerGender: "male" | "female";
}): Promise<OpeningLineResult> {
  const scenarioPrompt = resolveSessionScenarioPrompt(input.scenarioId, input.flowVariantId, {
    legIndex: input.legIndex,
    handoff: input.handoff,
    transferVia: "marker",
  });
  if (!scenarioPrompt) throw new Error(`시나리오 프롬프트가 없습니다: ${input.scenarioId}`);
  const completion = await completeWithFallback(getLlmClient(), {
    systemPrompt: buildSystemPrompt(scenarioPrompt, {
      difficultyLevel: input.difficultyLevel,
      inCallSmsEnabled: hasInCallSms(input.scenarioId),
      l3Procedural: isL3Procedural(input.scenarioId),
      identityCheckAllowed: asksIdentityCheck(input.scenarioId),
      speakerGender: input.speakerGender,
      turnInstruction: RELAY_GREETING_TURN_INSTRUCTION,
    }),
    messages: [],
    mockTacticHints: scenarioPrompt.weakenedTactics,
  });
  const { text: realNameFreeText, replacedCount } = replaceRealFinancialNames(completion.text);
  const lengthLimited = limitReplySentences(realNameFreeText);
  if (replacedCount > 0 || lengthLimited.trimmed) {
    logger.info("릴레이 첫마디 손질", {
      scenarioId: input.scenarioId,
      replacedCount,
      trimmed: lengthLimited.trimmed,
    });
  }
  return {
    message: { role: "scammer", text: finalizeScammerReplyText(lengthLimited.text) },
    isMock: completion.isMock,
  };
}
