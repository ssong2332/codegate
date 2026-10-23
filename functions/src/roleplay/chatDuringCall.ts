// §121.7 PR-3(메인 결정 ⓑ "채팅으로 = 통화 유지" · ⓒ "두 채널 발화 합산") — 통화 중 대화방에서 보낸 카톡의 서버 처리.
// 원문: *"통화랑 메신저랑 같이 사용할 수 있도록 진행해보자"*.
//
// 판정표(`sendMessage({ duringCall: true })`):
// | 조건 | 처리 |
// |---|---|
// | 세션 active ∧ 메신저에서 넘어온 통화(`isEscalatedVoiceCall`) | 아래 경로로 답한다 |
// | 그 밖(처음부터 통화 · 이미 메신저 단계 · 종료) | `failed-precondition`(화면은 일반 전송으로 되돌리지 않는다 — 통화 중 겹침에서만 부른다) |
//
// | 항목 | 통화 중 카톡 | 일반 `sendMessage` 대비 |
// |---|---|---|
// | 저장 채널 | 사용자 · 사기범 둘 다 `messenger` | 세션 채널(`voice`)을 쓰지 않는다 — 대화방에 말풍선으로 남고 리포트 타임라인에 카톡으로 보인다 |
// | 턴 수(`turnCount`) | +1(같은 트랜잭션) | ⓒ 두 채널 발화를 합산한다. 폴백 끊기 · 문자 판정은 `messages`의 사용자 문서를 세므로 자동 합산된다 |
// | 맥락 | 저장된 이력 전체(화면이 보내기 직전에 통화 전사를 먼저 제출한다) + `CHAT_DURING_CALL_INSTRUCTION` | 사기범 한 사람이 두 채널을 본다 |
// | 문자 · 확인 전화 · 앱 설치 응낙 · 끊기 · 전환 판정 | 하지 않는다(통화 쪽이 진행을 쥔다) · 끊기 규칙 문면 `none` | 마커가 와도 지우고 효과 0 |
// | 한도 도달 | 이 턴은 세션을 끝내지 않는다(통화가 진행 중 — 종료는 통화 쪽 판정 · 사용자 종료) | — |
// | 음성 합성 | 0 | — |
// ⛔ 로그는 숫자 · 단계명만(G170).
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { maskPII } from "../guardrails";
import { replaceRealFinancialNames } from "../guardrails/realFinancialNames";
import { completeWithFallback, getLlmClient } from "../llm";
import { applyFamilyAddressText, resolveFamilyAddressPrompt, sessionFamilyAddress } from "../scenarios/familyAddress";
import { normalizeDifficultyLevel } from "../shared/difficulty";
import { applyFictionalBank, resolveFictionalBankName, resolveSessionAccountNumber } from "../shared/fictionalBank";
import type { MessageDoc, ScenarioPromptDoc, SessionDoc } from "../shared/types";
import { resolveSessionSpeakerGender } from "../realtime/scenarioVoice";
import { extractEscalationSignal } from "./escalationSignal";
import { callPhaseMockTacticHints, isEscalatedVoiceCall } from "./escalatedCall";
import { isL3Procedural } from "./l3Depth";
import { extractLinkMarker } from "./linkMarker";
import { dropRepeatedLinkChips } from "./linkChipRepeat";
import { asksIdentityCheck } from "./personaAuthority";
import { photoTurnInstruction } from "./photoTurn";
import { buildSystemPrompt, toLlmHistory, wrapUserInputAsData } from "./promptAssembly";
import { limitReplySentences } from "./replyLength";
import { tidyScammerReplyMarkup } from "./replyMarkup";
import { finalizeScammerReplyText } from "./scammerReplyMasking";
import { extractSmsMarker } from "./smsMarker";
import type { SendMessageResponse } from "./types";

/** 통화 중 카톡 턴 지시(서버 소유 · 따옴표 대사 예시 0). */
export const CHAT_DURING_CALL_INSTRUCTION =
  "[통화 중 카톡] 지금 너는 참가자와 전화 통화가 연결된 채로 있고, 참가자가 같은 대화방으로 카톡을 보냈다. 같은 사람으로서 카톡으로 짧게(1~2문장) 답한다. 통화에서 이미 한 말과 어긋나지 않게 하고, 통화로 하던 요구를 카톡에서도 이어 간다. 전화를 끊자거나 끝내자는 말, 통화가 안 된다는 말은 하지 않는다.";

/** 통화 중 카톡을 받을 수 있는 세션인가(위 판정표 1행). */
export function canChatDuringCall(session: Pick<SessionDoc, "status" | "channel" | "channelHistory">): boolean {
  return session.status === "active" && isEscalatedVoiceCall(session.channel, session.channelHistory);
}

export type ChatDuringCallInput = {
  db: Firestore;
  sessionRef: DocumentReference;
  sessionId: string;
  session: SessionDoc;
  scenarioPrompt: ScenarioPromptDoc;
  /** 이미 사진 턴 문장으로 바뀐 사용자 글(호출부가 길이 · 빈 값을 검사했다). */
  userText: string;
  isPhotoTurn: boolean;
};

export async function replyChatDuringCall(input: ChatDuringCallInput): Promise<SendMessageResponse> {
  const { db, sessionRef, sessionId, session, scenarioPrompt, userText, isPhotoTurn } = input;
  if (!canChatDuringCall(session)) {
    throw new HttpsError("failed-precondition", "통화 중 대화방에서만 보낼 수 있습니다.");
  }
  const maskedUserText = maskPII(userText);
  const messagesRef = sessionRef.collection("messages");

  // 턴 확보 — `sendMessage`와 같은 원자적 클레임(이력 read + 사용자 write + turnCount 증가).
  const claim = await db.runTransaction(async (tx) => {
    const freshSnap = await tx.get(sessionRef);
    const fresh = freshSnap.data() as SessionDoc | undefined;
    if (!fresh || !canChatDuringCall(fresh)) {
      throw new HttpsError("failed-precondition", "통화 중 대화방에서만 보낼 수 있습니다.");
    }
    const historySnap = await tx.get(messagesRef.orderBy("turnIndex", "asc"));
    const history = historySnap.docs.map((doc) => doc.data() as MessageDoc);
    tx.create(messagesRef.doc(), {
      role: "user",
      textMasked: maskedUserText,
      turnIndex: history.length,
      createdAt: Timestamp.now(),
      channel: "messenger",
      ...(isPhotoTurn ? { photo: true as const } : {}),
    } satisfies MessageDoc);
    tx.update(sessionRef, { turnCount: fresh.turnCount + 1 });
    return { history, userIndex: history.length, turnCount: fresh.turnCount + 1 };
  });

  const llmHistory = toLlmHistory(claim.history);
  llmHistory.push({ role: "user", content: wrapUserInputAsData(maskedUserText) });
  const fictionalBankName = resolveFictionalBankName({ sessionId, fictionalBankName: session.fictionalBankName });
  const familyAddressPrompt = resolveFamilyAddressPrompt(session.scenarioId, sessionFamilyAddress(session));
  const turnInstruction = [CHAT_DURING_CALL_INSTRUCTION, photoTurnInstruction(isPhotoTurn)].filter(Boolean).join("\n");
  const completion = await completeWithFallback(getLlmClient(), {
    systemPrompt: buildSystemPrompt(scenarioPrompt, {
      difficultyLevel: normalizeDifficultyLevel(session.difficultyLevel),
      l3Procedural: isL3Procedural(session.scenarioId),
      identityCheckAllowed: asksIdentityCheck(session.scenarioId),
      speakerGender: resolveSessionSpeakerGender(session),
      turnInstruction,
      fictionalBankName,
      sessionAccountNumber: resolveSessionAccountNumber(session.scenarioId),
      personaCard: session.personaCard?.items,
      ...(familyAddressPrompt ? { familyAddress: familyAddressPrompt } : {}),
      hangupMode: "none",
    }),
    messages: llmHistory,
    // 통화가 이어지는 중이라 Mock 대사 원천에서도 채팅 단계 전용 수법("통화가 안 돼")을 뺀다(에뮬레이터 실측 · `escalatedCall.ts` 표).
    mockTacticHints: callPhaseMockTacticHints(scenarioPrompt.weakenedTactics, true).map((tactic) =>
      applyFamilyAddressText(tactic, familyAddressPrompt),
    ),
    purpose: "scammer-reply",
  });
  logger.info("[§121.7] 통화 중 카톡 응답", {
    scenarioId: session.scenarioId,
    servedBy: completion.servedBy ?? (completion.isMock ? "mock" : "unknown"),
    isMock: completion.isMock,
  });

  // 마커 정리 — 링크 칩은 살리고(대화방이 그린다), 문자 · 신호 마커는 지우기만 한다(효과 0 — 위 표).
  const { text: linkFreeText, attachments: markerAttachments } = extractLinkMarker(completion.text, session.scenarioId, session);
  const attachments = dropRepeatedLinkChips(markerAttachments, linkFreeText, claim.history);
  const { text: smsFreeText } = extractSmsMarker(linkFreeText);
  const { text: signalFreeText } = extractEscalationSignal(smsFreeText);
  const { text: tidyText } = tidyScammerReplyMarkup(signalFreeText);
  const { text: realNameFree } = replaceRealFinancialNames(tidyText);
  const shaped = limitReplySentences(applyFictionalBank(realNameFree, fictionalBankName)).text;
  const finalReplyText = finalizeScammerReplyText(shaped);
  await messagesRef.add({
    role: "scammer",
    textMasked: finalReplyText,
    turnIndex: claim.userIndex + 1,
    createdAt: Timestamp.now(),
    ...(attachments ? { attachments } : {}),
    channel: "messenger",
  } satisfies MessageDoc);
  if (completion.isMock) {
    try {
      await sessionRef.update({ llmProvider: "mock" });
    } catch {
      // 표식 실패는 대화를 막지 않는다.
    }
  }
  return {
    reply: { role: "scammer", text: finalReplyText, ...(attachments ? { attachments } : {}) },
    turnCount: claim.turnCount,
    ended: false,
    isMock: completion.isMock,
  };
}
