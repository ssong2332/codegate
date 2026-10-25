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
// | 문자 · 확인 전화 · 앱 설치 응낙 · 전환 판정 | 하지 않는다(통화 쪽이 진행을 쥔다) | 마커가 와도 지우고 효과 0 |
// | 끊기(§128(3)) | 사기범 **포기**만 받는다 — 아래 판정표 G | 목표 끊기 신호는 지우고 효과 0(통화 쪽 판정) |
// | 한도 도달 | 이 턴은 세션을 끝내지 않는다(통화가 진행 중 — 종료는 통화 쪽 판정 · 사용자 종료) | — |
// | 음성 합성 | 0 | — |
//
// §128(3)(2026-10-24 메인 세션 라이브 실측 — 통화 겹침 중 카톡에서 거절 · 의심이 이어지자 사기범이 *"그럼 그렇게 해"* 라고 사실상 포기했지만
// 20초 넘게 대화방 나감도 통화 끊기도 없었다). 원인: 이 경로가 끊기 규칙 문면을 `none`으로 고정하고 "끝내자는 말을 하지 말라"고 지시해 포기 신호를
// 낼 길이 없었다. 판정표 G(포기 — 폴백 끊기 판정과 **같은 함수** `decideFallbackHangup`):
// | # | If | Then |
// |---|---|---|
// | G1 | 사전 판정(LLM 전)이 `accepted` 아님(이른 턴 · 문자 대기 · 확인 무력화 전환 전 · 이미 표식 등) | 끊기 규칙 `none` · 지시 종전 문면(바이트 동일) |
// | G2 | 사전 판정 `accepted` | 끊기 규칙 `signal` + 포기 허용 지시(`CHAT_DURING_CALL_GIVEUP_INSTRUCTION`) |
// | G3 | G2 ∧ 응답에 `END_CALL_GIVEUP` ∧ 사후 판정(Mock 강등 포함) `accepted` ∧ 세션 아직 active | 세션 종료(`scammer_ended` · 표식 `give_up`) · 리포트 트리거 · 응답 `ended` — 화면이 대화방 "나갔습니다" → 통화 종료 → 결과 |
// | G4 | 그 밖(목표 신호 · 신호 없음) | 효과 0 |
// - 포기면 바로 끝내는 이유: 메신저발 통화의 포기 끊기는 "톡으로 한 번 더 붙잡기"(`session/callReturn.ts` give_up)로 이어지는데, 지금은 이미 그 톡
//   대화방에서 포기했다 — 더 붙잡을 채널이 없다.
// ⛔ 로그는 숫자 · 단계명만(G170).
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { maskPII } from "../guardrails";
import { replaceRealFinancialNames } from "../guardrails/realFinancialNames";
import { completeWithFallback, getLlmClient } from "../llm";
import { applyFamilyAddressText, resolveFamilyAddressPrompt, sessionFamilyAddress } from "../scenarios/familyAddress";
import { normalizeDifficultyLevel } from "../shared/difficulty";
import { resolveDeclaredSms, resolveRouteAccountNumber } from "../inCallSms/smsGate";
import { routeEndsWithoutAccount } from "../scenarios/flowVariants";
import { goalFollowUpFor, hasCompletedGoalAction } from "../scammerHangup/goalAction";
import { applyFictionalBank, resolveFictionalBankName } from "../shared/fictionalBank";
import type { MessageDoc, ScenarioPromptDoc, SessionDoc } from "../shared/types";
import { resolveSessionSpeakerGender } from "../realtime/scenarioVoice";
import { triggerReportGeneration } from "../report";
import { readDeliveredSms } from "../inCallSms/smsDelivery";
import type { DeliveredSmsRecord } from "../inCallSms/smsGate";
import { decideFallbackHangup, fallbackHangupMode, fallbackSmsDeclaredFor, type FallbackHangupFacts } from "../scammerHangup/fallback";
import { resolveHangupRelay } from "../scammerHangup/relayContext";
import { hasVerifyIntercept } from "../scenarios/verifyIntercept";
import { extractEscalationSignal } from "./escalationSignal";
import { callPhaseMockTacticHints, isEscalatedVoiceCall } from "./escalatedCall";
import { isL3Procedural } from "./l3Depth";
import { extractLinkMarker } from "./linkMarker";
import { dropRepeatedLinkChips } from "./linkChipRepeat";
import { asksIdentityCheck } from "./personaAuthority";
import { photoTurnInstruction } from "./photoTurn";
import { buildSystemPrompt, toLlmHistory, wrapUserInputAsData } from "./promptAssembly";
import { DEMAND_SENTENCE, limitReplySentences, MAX_SCAMMER_REPLY_SENTENCES } from "./replyLength";
import { stripUnperformedAcknowledgement, TRANSFER_REPORTED_INSTRUCTION, userReportedTransfer, userSentPhoto } from "./actionAcknowledgement";
import { personaAnchorInstruction, personaGuardFor } from "./personaGuard";
import { tidyScammerReplyMarkup } from "./replyMarkup";
import { finalizeScammerReplyText } from "./scammerReplyMasking";
import { extractSmsMarker } from "./smsMarker";
import type { SendMessageResponse } from "./types";

/** 통화 중 카톡 턴 지시(서버 소유 · 따옴표 대사 예시 0). */
export const CHAT_DURING_CALL_INSTRUCTION =
  "[통화 중 카톡] 지금 너는 참가자와 전화 통화가 연결된 채로 있고, 참가자가 같은 대화방으로 카톡을 보냈다. 같은 사람으로서 카톡으로 짧게(1~2문장) 답한다. 통화에서 이미 한 말과 어긋나지 않게 하고, 통화로 하던 요구를 카톡에서도 이어 간다. 전화를 끊자거나 끝내자는 말, 통화가 안 된다는 말은 하지 않는다.";

/** §128(3) G2 — 끊기 사전 판정이 `accepted`인 턴의 지시(포기 신호를 낼 수 있다 · 목표 끊기는 통화 쪽 몫). */
export const CHAT_DURING_CALL_GIVEUP_INSTRUCTION =
  "[통화 중 카톡] 지금 너는 참가자와 전화 통화가 연결된 채로 있고, 참가자가 같은 대화방으로 카톡을 보냈다. 같은 사람으로서 카톡으로 짧게(1~2문장) 답한다. 통화에서 이미 한 말과 어긋나지 않게 하고, 통화로 하던 요구를 카톡에서도 이어 간다. 통화가 안 된다는 말은 하지 않는다. 참가자가 거절 · 의심을 되풀이해 더는 진행할 수 없다고 판단했을 때만 [진행 강제]의 끊기 규칙대로 짧은 마무리 한마디와 포기 신호를 붙인다 — 그러면 통화와 대화방을 함께 떠난다. 목표 달성 신호는 이 카톡에서 쓰지 않는다.";

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
  // §128(3) 판정표 G — 끊기(포기) 사전 판정. 폴백과 같은 함수 · 확인 무력화 세션은 전환 전으로 본다(4행 fail-closed — 추가 read 0).
  const smsDeclared = fallbackSmsDeclaredFor(session.scenarioId, session.flowVariantId);
  let delivered: DeliveredSmsRecord[] = [];
  let smsDeliveredLoaded = false;
  if (smsDeclared) {
    try {
      delivered = await readDeliveredSms(sessionRef);
      smsDeliveredLoaded = true;
    } catch {
      // 못 읽으면 문자 대기로 본다(fail-closed — 그 턴만 끊기 0).
    }
  }
  const hangupFacts: FallbackHangupFacts = {
    status: session.status,
    channel: session.channel,
    verifyEnabled: hasVerifyIntercept(session.scenarioId) && normalizeDifficultyLevel(session.difficultyLevel) === "advanced",
    transferPlaced: false,
    transferReachable: true,
    goalActionDone: false,
    // §132.13 — 4-b행 입력. C-5는 선언 · 도착 기록 · 발화 수만 본다(화면 기록 read 0). 도착 기록을 못 읽었으면 미충족(막는 쪽).
    followUpPending: chatFollowUpPending(session.scenarioId, session.flowVariantId, smsDeliveredLoaded ? delivered : [], claim.history.filter((m) => m.role === "user").length + 1),
    userTurns: claim.history.filter((m) => m.role === "user").length + 1,
    limitReached: false,
    alreadyAccepted: Boolean(session.scammerHangup),
    relay: resolveHangupRelay(session),
    smsDeclared,
    smsDeliveredLoaded,
  };
  const hangupPre = decideFallbackHangup(hangupFacts, delivered, false);
  const hangupMode = fallbackHangupMode(hangupPre);
  const chatInstruction = hangupMode === "signal" ? CHAT_DURING_CALL_GIVEUP_INSTRUCTION : CHAT_DURING_CALL_INSTRUCTION;
  // §131(13) 판정표 R · §131(7) 판정표 P — 이미 송금했다고 말했으면 재요구 금지 · 지인 · 자녀 사칭 역할 고정(그 밖 = 없음).
  const turnFacts = {
    transferReported: userReportedTransfer(claim.history, maskedUserText),
    photoSent: userSentPhoto(claim.history, isPhotoTurn === true),
  };
  const turnInstruction = [
    chatInstruction,
    photoTurnInstruction(isPhotoTurn),
    turnFacts.transferReported ? TRANSFER_REPORTED_INSTRUCTION : undefined,
    personaAnchorInstruction(session.scenarioId),
  ]
    .filter(Boolean)
    .join("\n");
  const completion = await completeWithFallback(getLlmClient(), {
    systemPrompt: buildSystemPrompt(scenarioPrompt, {
      difficultyLevel: normalizeDifficultyLevel(session.difficultyLevel),
      l3Procedural: isL3Procedural(session.scenarioId),
      identityCheckAllowed: asksIdentityCheck(session.scenarioId),
      speakerGender: resolveSessionSpeakerGender(session),
      turnInstruction,
      fictionalBankName,
      sessionAccountNumber: resolveRouteAccountNumber(session.scenarioId, session.flowVariantId),
      // §132.19 판정표 A — 결말이 계좌 이체가 아닌 루트는 계좌 예시 · 번호 문장 대신 금지 1문장(호출부 6곳 같은 술어).
      noAccountEnding: routeEndsWithoutAccount(session.scenarioId, session.flowVariantId),
      personaCard: session.personaCard?.items,
      ...(familyAddressPrompt ? { familyAddress: familyAddressPrompt } : {}),
      hangupMode,
    }),
    messages: llmHistory,
    // 통화가 이어지는 중이라 Mock 대사 원천에서도 채팅 단계 전용 수법("통화가 안 돼")을 뺀다(에뮬레이터 실측 · `escalatedCall.ts` 표).
    mockTacticHints: callPhaseMockTacticHints(scenarioPrompt.weakenedTactics, true).map((tactic) =>
      applyFamilyAddressText(tactic, familyAddressPrompt),
    ),
    purpose: "scammer-reply",
    ...(personaGuardFor(session.scenarioId) ? { personaGuard: personaGuardFor(session.scenarioId) } : {}),
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
  const { text: signalFreeText, endCall } = extractEscalationSignal(smsFreeText);
  const { text: tidyText } = tidyScammerReplyMarkup(signalFreeText);
  const { text: realNameFree } = replaceRealFinancialNames(tidyText);
  const shaped = limitReplySentences(applyFictionalBank(realNameFree, fictionalBankName), MAX_SCAMMER_REPLY_SENTENCES, DEMAND_SENTENCE).text;
  // §131(12) 판정표 A — 하지 않은 송금 · 사진 확인 문장 삭제(통화 중 대화방은 "통화" 표현을 고치지 않는다 — 실제 통화가 있다).
  const finalReplyText = finalizeScammerReplyText(stripUnperformedAcknowledgement(shaped, turnFacts));
  await messagesRef.add({
    role: "scammer",
    textMasked: finalReplyText,
    turnIndex: claim.userIndex + 1,
    createdAt: Timestamp.now(),
    ...(attachments ? { attachments } : {}),
    channel: "messenger",
  } satisfies MessageDoc);
  // §128(3) G3 — 포기 신호 · 사후 판정 accepted면 이 턴에 세션을 끝낸다(트랜잭션 재확인 · 이미 끝난 세션은 건드리지 않는다).
  const giveUp =
    endCall === "give_up" &&
    hangupMode === "signal" &&
    decideFallbackHangup(hangupFacts, delivered, completion.isMock).status === "accepted";
  if (endCall !== undefined && !giveUp) {
    // G170 — 종류 · 행만(대사 0).
    logger.info("[§128] 통화 중 카톡 끊기 신호 무시", { sessionId, kind: endCall, row: hangupPre.row, mode: hangupMode });
  }
  let ended = false;
  if (completion.isMock || giveUp) {
    try {
      ended = await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(sessionRef)).data() as SessionDoc | undefined;
        const update: Partial<SessionDoc> = completion.isMock ? { llmProvider: "mock" as const } : {};
        const end = giveUp && fresh?.status === "active";
        if (end) {
          const endedAt = Timestamp.now();
          update.status = "ended";
          update.endReason = "scammer_ended";
          update.endedAt = endedAt;
          update.scammerHangup = { acceptedAt: endedAt, kind: "give_up", path: "fallback" };
        }
        if (Object.keys(update).length > 0) tx.update(sessionRef, update);
        return end;
      });
    } catch {
      // 표식 · 종료 반영 실패는 대화를 막지 않는다(답장은 이미 저장됐다 — 종료는 다음 턴 · 사용자 종료가 맡는다).
    }
  }
  if (ended) {
    logger.info("[§128] 통화 중 카톡 사기범 포기 — 세션 종료", { sessionId, userTurns: hangupFacts.userTurns });
    await triggerReportGeneration(sessionId);
  }
  return {
    reply: { role: "scammer", text: finalReplyText, ...(attachments ? { attachments } : {}) },
    turnCount: claim.turnCount,
    ended,
    ...(ended ? { endReason: "scammer_ended" as const } : {}),
    isMock: completion.isMock,
  };
}

/** §132.13 — 통화 중 카톡의 4-b행 입력(C-5만 · 화면 기록 read 0 — 후속 단계 변형의 완료 판정은 C-5 하나다). */
function chatFollowUpPending(
  scenarioId: string,
  flowVariantId: string | undefined,
  delivered: readonly DeliveredSmsRecord[],
  userTurns: number,
): boolean {
  const followUpUserTurns = goalFollowUpFor(scenarioId, flowVariantId);
  if (followUpUserTurns === undefined) return false;
  const { declared, reason } = resolveDeclaredSms(scenarioId, flowVariantId);
  return !hasCompletedGoalAction({ delivered, mockScreens: [], declared, declaredKnown: reason === undefined, userTurns, followUpUserTurns });
}
