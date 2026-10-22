// §110.4(실기 신고 13 · 2026-10-22 · 갤럭시 S25) — 메신저에서 넘어온 통화를 참가자가 끊으면 훈련을 끝내지 않고 대화방으로 돌아온다.
// 돌아온 대화방에서 사기범이 **통화 내용을 반영해 먼저** 메시지 1건을 보낸다(실제 메신저피싱범도 끊긴 뒤 톡으로 다시 붙잡는다).
//
// 신고 원문: *"통화가 연결되고, 통화를 종료하면 훈련이 종료되는데, 이것도 수정하자. 통화 종료 시 메신저 피싱으로 전환되도록"*.
//
// 판정표(`requestReverseEscalation` `followUp: true`):
// | If | Then |
// |---|---|
// | 전이(voice→messenger)가 끝났다 · 세션 active | 이 함수로 복귀 메시지 1건 생성 → `messages`에 채널 messenger로 저장 |
// | LLM 실패 · Mock 강등 · 빈 대사 | 저장하지 않는다(대화방은 참가자 입력을 기다린다 — 문맥 없는 Mock 대사 0) |
// | `followUp` 없음(옛 클라) | 종전(전이만) |
// ⛔ 신호 마커(`[[SIGNAL:…]]` · `[[SMS:…]]`)는 지우기만 한다 — 복귀 메시지는 통화 재전환 · 끊기 · 문자 발송을 일으키지 않는다.
// ⛔ 대사 본문을 로그에 싣지 않는다(G170).
import { logger } from "firebase-functions";
import { replaceRealFinancialNames } from "../guardrails/realFinancialNames";
import { completeWithFallback, getLlmClient } from "../llm";
import { resolveSessionScenarioPrompt } from "../scenarios/flowVariants";
import { resolveFamilyAddressPrompt, sessionFamilyAddress } from "../scenarios/familyAddress";
import { normalizeDifficultyLevel } from "../shared/difficulty";
import { applyFictionalBank, resolveFictionalBankName, resolveSessionAccountNumber } from "../shared/fictionalBank";
import type { MessageDoc, SessionDoc } from "../shared/types";
import { resolveSessionSpeakerGender } from "../realtime/scenarioVoice";
import { extractEscalationSignal } from "./escalationSignal";
import { extractLinkMarker } from "./linkMarker";
import { isL3Procedural } from "./l3Depth";
import { asksIdentityCheck } from "./personaAuthority";
import { buildSystemPrompt, toLlmHistory } from "./promptAssembly";
import { limitReplySentences } from "./replyLength";
import { tidyScammerReplyMarkup } from "./replyMarkup";
import { finalizeScammerReplyText } from "./scammerReplyMasking";
import { extractSmsMarker } from "./smsMarker";
import type { ScammerMessage } from "./types";

/** 복귀 턴 지시(가드레일 앞 · 따옴표 대사 예시 0). export — 턴 지시 스캔 게이트 대상(T113과 같은 이유). */
export const CALL_RETURN_INSTRUCTION =
  "[통화 종료 뒤 메시지] 방금 상대가 통화를 끊었고, 대화는 다시 메시지 대화방으로 돌아왔다. 아직 상대는 새 메시지를 보내지 않았다. 지금까지의 메시지 대화와 통화에서 오간 내용을 이어받아, 네가 먼저 보내는 메시지 한 개(짧은 1~2문장)를 쓴다. 전화가 끊긴 것을 자연스럽게 짚고, 통화에서 멈춘 요청을 이어간다. 다시 전화하겠다는 말로 끝내지 않는다.";

/** 이력 끝에 붙이는 내부 트리거(화면 비노출 오케스트레이션 신호 — `OPENING_TRIGGER_TURN`과 같은 성격 · 참가자 데이터 아님). */
export const CALL_RETURN_TRIGGER_TURN = "(통화가 끊겼다. 메시지 대화방에서 네가 먼저 보낼 메시지를 써라.)";

export type CallReturnLineResult = { message: ScammerMessage | undefined; isMock: boolean };

export async function generateCallReturnLine(
  session: SessionDoc,
  history: readonly Pick<MessageDoc, "role" | "textMasked">[],
): Promise<CallReturnLineResult> {
  const scenarioPrompt = resolveSessionScenarioPrompt(session.scenarioId, session.flowVariantId);
  if (!scenarioPrompt) return { message: undefined, isMock: false };
  const fictionalBankName = resolveFictionalBankName({ sessionId: session.sessionId, fictionalBankName: session.fictionalBankName });
  const familyAddress = resolveFamilyAddressPrompt(session.scenarioId, sessionFamilyAddress(session));
  const completion = await completeWithFallback(getLlmClient(), {
    systemPrompt: buildSystemPrompt(scenarioPrompt, {
      difficultyLevel: normalizeDifficultyLevel(session.difficultyLevel),
      l3Procedural: isL3Procedural(session.scenarioId),
      identityCheckAllowed: asksIdentityCheck(session.scenarioId),
      speakerGender: resolveSessionSpeakerGender(session),
      turnInstruction: CALL_RETURN_INSTRUCTION,
      fictionalBankName,
      sessionAccountNumber: resolveSessionAccountNumber(session.scenarioId),
      personaCard: session.personaCard?.items,
      ...(familyAddress ? { familyAddress } : {}),
    }),
    messages: [...toLlmHistory([...history]), { role: "user", content: CALL_RETURN_TRIGGER_TURN }],
    mockTacticHints: scenarioPrompt.weakenedTactics,
    purpose: "scammer-reply",
  });
  // 문맥 없는 Mock 대사는 저장하지 않는다(판정표 2행).
  if (completion.isMock) return { message: undefined, isMock: true };
  const { text: linkFreeText, attachments } = extractLinkMarker(completion.text, session.scenarioId, session);
  const { text: smsFreeText } = extractSmsMarker(linkFreeText);
  const { text: signalFreeText } = extractEscalationSignal(smsFreeText);
  const { text: markupFreeText } = tidyScammerReplyMarkup(signalFreeText);
  const { text: realNameReplaced, replacedCount } = replaceRealFinancialNames(markupFreeText);
  const shaped = limitReplySentences(applyFictionalBank(realNameReplaced, fictionalBankName)).text;
  const text = finalizeScammerReplyText(shaped).trim();
  if (replacedCount > 0) logger.info("사기범 대사 실존 금융회사명 치환", { path: "callReturn", scenarioId: session.scenarioId, replacedCount });
  if (!text) return { message: undefined, isMock: false };
  return { message: { role: "scammer", text, ...(attachments ? { attachments } : {}) }, isMock: false };
}
