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
import { resolveRouteAccountNumber } from "../inCallSms/smsGate";
import { applyFictionalBank, resolveFictionalBankName } from "../shared/fictionalBank";
import type { MessageDoc, SessionDoc } from "../shared/types";
import { resolveSessionSpeakerGender } from "../realtime/scenarioVoice";
import { extractEscalationSignal } from "./escalationSignal";
import { extractLinkMarker } from "./linkMarker";
import { isL3Procedural } from "./l3Depth";
import { asksIdentityCheck } from "./personaAuthority";
import { splitSentences } from "./callAnnouncement";
import { buildSystemPrompt, toLlmHistory } from "./promptAssembly";
import { limitReplySentences } from "./replyLength";
import { tidyScammerReplyMarkup } from "./replyMarkup";
import { finalizeScammerReplyText } from "./scammerReplyMasking";
import { extractSmsMarker } from "./smsMarker";
import type { ScammerMessage } from "./types";

/** 복귀 턴 지시(가드레일 앞 · 따옴표 대사 예시 0). export — 턴 지시 스캔 게이트 대상(T113과 같은 이유). */
export const CALL_RETURN_INSTRUCTION =
  "[통화 종료 뒤 메시지] 방금 상대가 통화를 끊었고, 대화는 다시 메시지 대화방으로 돌아왔다. 아직 상대는 새 메시지를 보내지 않았다. 지금까지의 메시지 대화와 통화에서 오간 내용을 이어받아, 네가 먼저 보내는 메시지 한 개(짧은 1~2문장)를 쓴다. 전화가 끊긴 것을 자연스럽게 짚고, 통화에서 멈춘 요청을 이어간다. 다시 전화하겠다는 말로 끝내지 않는다.";

/**
 * §112 — 사기범(네 쪽)이 통화를 끊고 대화방으로 돌아온 경우(끊기 종류 give_up · unspecified — `session/callReturn.ts` 판정표).
 * 통화로는 막혔으니 메시지로 한 번 더 붙잡는다. export — 턴 지시 스캔 게이트 대상.
 * §131(2)(메인 세션 라이브 확인 2026-10-24 — 자녀 사칭 카톡 고급 · 사기범이 "나 끊을게"라며 끊은 뒤 대화방에서 *"아까 통화가 끊겼어ㅠㅠ 전화 상태가
 * 안 좋았나 봐"*) — 종전 지시가 "끊긴 것을 짚으며(전화 상태가 안 좋았다는 식으로)"라 저절로 끊긴 것처럼 둘러대게 했다. 네가 끊은 사실과 맞게 바꾼다.
 */
export const CALL_RETURN_AFTER_SCAMMER_HANGUP_INSTRUCTION =
  "[네가 통화를 끊은 뒤 메시지] 방금 네 쪽에서 통화를 끊었고, 대화는 다시 메시지 대화방으로 돌아왔다. 아직 상대는 새 메시지를 보내지 않았다. 통화는 네가 직접 끊은 것이다 — 통화가 저절로 끊겼다거나 전화 상태 · 연결이 안 좋았다고 둘러대지 않는다. 급하게 끊은 것을 짧게 사과하거나 오래 통화할 수 없었던 네 사정을 대며 메시지로 이어서 하자고 하고, 통화에서 멈춘 요청을 한 번 더 짧게(1~2문장) 이어간다. 다시 전화하겠다는 말로 끝내지 않는다.";

export type CallReturnBy = "user" | "scammer";

/** 이력 끝에 붙이는 내부 트리거(화면 비노출 오케스트레이션 신호 — `OPENING_TRIGGER_TURN`과 같은 성격 · 참가자 데이터 아님). */
export const CALL_RETURN_TRIGGER_TURN = "(통화가 끊겼다. 메시지 대화방에서 네가 먼저 보낼 메시지를 써라.)";
/** §131(2) — 사기범이 끊은 경우의 트리거("끊겼다"는 저절로 끊긴 것처럼 읽혀 위 지시와 어긋난다). */
export const CALL_RETURN_AFTER_SCAMMER_HANGUP_TRIGGER_TURN = "(네가 통화를 끊었다. 메시지 대화방에서 네가 먼저 보낼 메시지를 써라.)";

/**
 * §131(2) — 사기범이 끊은 경우 복귀 메시지에서 **저절로 끊긴 것처럼 말하는 문장**을 지운다(지시가 새도 남지 않게).
 * | If | Then |
 * |---|---|
 * | `by === "user"` | 무변경(참가자가 끊었으니 "끊겼네"는 사실이다) |
 * | 문장에 `끊겼 · 끊어졌 · 끊긴 · 전화/통화/연결/신호 (상태가) 안 좋` | 그 문장을 지운다 |
 * | 지우고 남는 문장이 없다 | 빈 문자열 → 저장 0(위 판정표 "빈 대사" 행) |
 */
const SELF_DROPPED_CALL = /끊겼|끊어졌|끊긴|(?:전화|통화|연결|신호)\s*(?:상태)?\s*(?:가|이)?\s*(?:많이\s*|좀\s*)?안\s*좋/;
export function stripSelfDroppedCallSentences(text: string, by: CallReturnBy): string {
  if (by === "user") return text;
  return splitSentences(text)
    .filter((sentence) => !SELF_DROPPED_CALL.test(sentence))
    .join(" ");
}

export type CallReturnLineResult = { message: ScammerMessage | undefined; isMock: boolean };

export async function generateCallReturnLine(
  session: SessionDoc,
  history: readonly Pick<MessageDoc, "role" | "textMasked">[],
  by: CallReturnBy = "user",
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
      turnInstruction: by === "scammer" ? CALL_RETURN_AFTER_SCAMMER_HANGUP_INSTRUCTION : CALL_RETURN_INSTRUCTION,
      fictionalBankName,
      sessionAccountNumber: resolveRouteAccountNumber(session.scenarioId, session.flowVariantId),
      personaCard: session.personaCard?.items,
      ...(familyAddress ? { familyAddress } : {}),
    }),
    messages: [
      ...toLlmHistory([...history]),
      { role: "user", content: by === "scammer" ? CALL_RETURN_AFTER_SCAMMER_HANGUP_TRIGGER_TURN : CALL_RETURN_TRIGGER_TURN },
    ],
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
  const text = stripSelfDroppedCallSentences(finalizeScammerReplyText(shaped), by).trim();
  if (replacedCount > 0) logger.info("사기범 대사 실존 금융회사명 치환", { path: "callReturn", scenarioId: session.scenarioId, replacedCount });
  if (!text) return { message: undefined, isMock: false };
  return { message: { role: "scammer", text, ...(attachments ? { attachments } : {}) }, isMock: false };
}
