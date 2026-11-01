// §128(7)(2026-10-24 메인 세션 라이브 실측 · UX D-159) — 대화방 링크로 연 모의 화면에서 행동(앱 설치 권한 허용 · 입력 제출)을 마치고 돌아와도
// 사기범이 먼저 반응하지 않았다(참가자가 말해야 반응). 실제 메신저피싱범은 설치 · 입력이 끝나면 바로 다음 요구를 보낸다.
//
// 판정표(`requestScreenActionFollowUp` — 화면이 행동 기록(`recordMockScreenEvent`) 성공 뒤 부른다):
// | # | If | Then |
// |---|---|---|
// | S0 | 세션이 active · 메신저 단계가 아니다 · 그 화면 문서가 없다 · 메신저 링크 표면이 아니다 · 이미 먼저 보냈다(`screenFollowUpAt`) | 저장 0 |
// | S1 | 설치 화면 ∧ 응낙했고 응낙 언급 전(`consentedAt` ∧ `consentAnnouncedAt` 없음) | 응낙 지시로 먼저 보내는 메시지 1건 · `consentAnnouncedAt`도 함께 기록(다음 턴 같은 지시 중복 0) |
// | S2 | 입력 화면 ∧ 제출했다(`submittedAt`) | 제출 확인 지시로 먼저 보내는 메시지 1건 |
// | S3 | 그 밖(열기만 함 등) | 저장 0 |
// | S4 | LLM 실패 · Mock 강등 · 빈 대사 · 생성 중 참가자 메시지가 먼저 저장됨 | 저장 0(다음 참가자 턴의 `sendMessage`가 종전대로 응낙 지시를 싣는다) |
//
// 전화 예고(§128(1) 같은 규칙 — `callAnnouncement.ts`):
// | 응낙 화면 | 지금 전환할 수 있음 | 지시 | 대사가 전화를 예고하면 |
// |---|---|---|---|
// | 설치 뒤 통화가 설계인 항목(지원금 · 택배 — `MESSENGER_INSTALL_WITHOUT_CALL_LANDINGS` 밖) | 예 | 전화 예고형(종전 원문) | 전환(`announced_call`) — 응답 `escalation` |
// | 그 밖 · 제출 | — | 전화 예고 없는 형 | 지금 전환할 수 있으면 전환 · 없으면 예고 문장을 지운다 |
// ⛔ 화면 입력값은 이 요청에 없다(AC-045 — 인자는 세션 id · 화면 id뿐). ⛔ 로그에 대사 0(G170).
import { isAmountComparison, sessionScreenActionOnly } from "./screenAction";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { replaceRealFinancialNames } from "../guardrails/realFinancialNames";
import { completeWithFallback, getLlmClient } from "../llm";
import { resolveSessionScenarioPrompt, routeEndsWithoutAccount } from "../scenarios/flowVariants";
import { resolveFamilyAddressPrompt, sessionFamilyAddress } from "../scenarios/familyAddress";
import {
  findMockScreenItem,
  isBankTransferLanding,
  MESSENGER_INSTALL_WITHOUT_CALL_LANDINGS,
  MOCK_INSTALL_CONSENT_INSTRUCTION,
  MOCK_INSTALL_CONSENT_INSTRUCTION_NO_CALL,
} from "../scenarios/mockScreens";
import { resolveSessionEscalation } from "../scenarios/escalation";
import { PUBLIC_SCENARIOS } from "../scenarios/publicMeta";
import { transitionChannel } from "../session/channelTransition";
import { assertAnonymousChallengeScope } from "../shared/anonymousGate";
import { LLM_TEXT_SECRETS } from "../shared/config";
import { normalizeDifficultyLevel } from "../shared/difficulty";
import { resolveRouteAccountNumber } from "../inCallSms/smsGate";
import { applyFictionalBank, resolveFictionalBankName } from "../shared/fictionalBank";
import type { MessageDoc, MockScreenDoc, SessionDoc } from "../shared/types";
import { resolveSessionSpeakerGender } from "../realtime/scenarioVoice";
import { decideCallAnnouncement } from "./callAnnouncement";
import { extractEscalationSignal } from "./escalationSignal";
import { isL3Procedural } from "./l3Depth";
import { dropPrematureBankTransferChip, extractLinkMarker } from "./linkMarker";
import { dropRepeatedLinkChips } from "./linkChipRepeat";
import { turnsSinceMessengerEntry } from "./messengerReentry";
import { asksIdentityCheck } from "./personaAuthority";
import { buildSystemPrompt, toLlmHistory } from "./promptAssembly";
import { DEMAND_SENTENCE, limitReplySentences, MAX_SCAMMER_REPLY_SENTENCES } from "./replyLength";
import { stripPasswordRequests, stripUnperformedAcknowledgement, userReportedTransfer, userSentPhoto } from "./actionAcknowledgement";
import { fixMessengerCallWording, personaGuardFor } from "./personaGuard";
import { tidyScammerReplyMarkup } from "./replyMarkup";
import { finalizeScammerReplyText } from "./scammerReplyMasking";
import { isEscalationTooEarly } from "./signalConsistency";
import { extractSmsMarker } from "./smsMarker";

ensureFirebaseAdminApp();

/** 먼저 보내는 메시지 머리(턴 지시 앞줄 · 따옴표 대사 예시 0). export — 턴 지시 스캔 게이트 대상. */
export const SCREEN_ACTION_FOLLOW_UP_PREFIX =
  "[화면 행동 뒤 먼저 보내는 메시지] 참가자는 아직 새 메시지를 보내지 않았다. 아래 상황에 대해 네가 먼저 보내는 메시지 한 개(짧은 1~2문장)를 쓴다.";

/** S2 — 입력 화면 제출 뒤(입력값은 너에게 전달되지 않는다). export — 턴 지시 스캔 게이트 대상. */
export const SCREEN_SUBMIT_FOLLOW_UP_INSTRUCTION =
  "(참가자가 방금 네가 보낸 링크 화면에서 입력을 마치고 제출했다. 화면에 무엇을 입력했는지는 너에게 전달되지 않으니 내용을 지어내지 말고, 캐릭터로서 받았다고 짧게 확인한 뒤 다음 요구로 이어가라. 전화를 걸겠다거나 다른 사람이 연락하겠다는 말은 하지 마라.)";

/**
 * A4(실기기 신고 2026-11-01 · 자녀 사칭 — 200만 원 요구에 200원을 보냈는데 "잘 받았어 고마워") — 훈련용 이체 화면(`BANK_TRANSFER_LANDINGS`) 제출은
 * 입력 확인이 아니라 송금이다. 화면이 보낸 요구액 대비 비교(`mockScreens/{id}.amountComparison`)로 문면을 고른다.
 * | # | If | Then |
 * |---|---|---|
 * | T1 | 이체 화면 ∧ 적음(`less`) | `SCREEN_TRANSFER_SHORT_FOLLOW_UP_INSTRUCTION` — 들어온 만큼만 확인 · 모자란 금액 요구 · 다 받았다고 말하지 않음 |
 * | T2 | 이체 화면 ∧ 그 밖(같음 · 많음 · 모름) | `SCREEN_TRANSFER_FOLLOW_UP_INSTRUCTION` — 송금을 받았다고 확인 · 다음 요구 |
 * | T3 | 이체 화면 아님 | `SCREEN_SUBMIT_FOLLOW_UP_INSTRUCTION`(종전) |
 */
export const SCREEN_TRANSFER_SHORT_FOLLOW_UP_INSTRUCTION =
  "(참가자가 방금 네가 보낸 링크의 이체 화면에서 송금을 마쳤지만, 보낸 돈이 네가 요구한 금액보다 적다. 들어온 만큼은 확인됐다고 하되 금액이 모자란다고 분명히 짚고, 모자란 금액을 같은 화면에서 마저 보내 달라고 하라. 다 받았다거나 고맙다고 끝내지 말고, 다른 요구로 넘어가지 마라. 전화를 걸겠다거나 다른 사람이 연락하겠다는 말은 하지 마라.)";
export const SCREEN_TRANSFER_FOLLOW_UP_INSTRUCTION =
  "(참가자가 방금 네가 보낸 링크의 이체 화면에서 송금을 마쳤다. 캐릭터로서 송금을 받았다고 짧게 확인한 뒤 다음 요구로 이어가라. 전화를 걸겠다거나 다른 사람이 연락하겠다는 말은 하지 마라.)";

/** 이력 끝에 붙이는 내부 트리거(화면 비노출 · 참가자 데이터 아님 — `CALL_RETURN_TRIGGER_TURN`과 같은 성격). */
export const SCREEN_ACTION_TRIGGER_TURN = "(참가자가 화면에서 방금 행동을 마치고 대화방으로 돌아왔다. 네가 먼저 보낼 메시지를 써라.)";

export type ScreenFollowUpKind = "consent" | "submit";

/** 판정표 S0~S3(문서 상태만 · 세션 상태는 호출부가 먼저 본다). */
export function decideScreenFollowUp(
  doc: Pick<MockScreenDoc, "kind" | "consentedAt" | "consentAnnouncedAt" | "submittedAt" | "screenFollowUpAt"> | undefined,
  entrySurface: string | undefined,
): ScreenFollowUpKind | undefined {
  if (!doc || entrySurface !== "messenger-link" || doc.screenFollowUpAt) return undefined; // S0
  if (doc.kind === "app-install") return doc.consentedAt && !doc.consentAnnouncedAt ? "consent" : undefined; // S1
  return doc.submittedAt ? "submit" : undefined; // S2 · S3
}

/** 응낙 · 제출에 실을 지시(위 전화 예고 표). */
export function screenFollowUpInstruction(
  kind: ScreenFollowUpKind,
  landingId: string,
  canEscalateNow: boolean,
  // A4 — 이체 화면 제출의 요구액 대비 비교(부재 = 모름).
  amountComparison?: "less" | "equal" | "more",
): string {
  const submitBody = !isBankTransferLanding(landingId)
    ? SCREEN_SUBMIT_FOLLOW_UP_INSTRUCTION // T3
    : amountComparison === "less"
      ? SCREEN_TRANSFER_SHORT_FOLLOW_UP_INSTRUCTION // T1
      : SCREEN_TRANSFER_FOLLOW_UP_INSTRUCTION; // T2
  const body =
    kind === "submit"
      ? submitBody
      : canEscalateNow && !MESSENGER_INSTALL_WITHOUT_CALL_LANDINGS.includes(landingId)
        ? MOCK_INSTALL_CONSENT_INSTRUCTION
        : MOCK_INSTALL_CONSENT_INSTRUCTION_NO_CALL;
  return `${SCREEN_ACTION_FOLLOW_UP_PREFIX}\n${body}`;
}

export type RequestScreenActionFollowUpRequest = { sessionId: string; landingId: string };
export type RequestScreenActionFollowUpResponse = {
  /** 저장한 사기범 메시지의 turnIndex(저장 0이면 없음). */
  turnIndex?: number;
  /** 대사가 전화를 예고했고 전환했다(화면은 "전화가 옵니다" 연출로). */
  escalation?: { toChannel: "voice" };
};

export const requestScreenActionFollowUp = onCall<RequestScreenActionFollowUpRequest, Promise<RequestScreenActionFollowUpResponse>>(
  { secrets: [...LLM_TEXT_SECRETS] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    const { sessionId, landingId } = request.data ?? {};
    if (!sessionId || !landingId) throw new HttpsError("invalid-argument", "sessionId·landingId가 필요합니다.");
    const db = getFirestore();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
    const session = sessionSnap.data() as SessionDoc;
    if (session.uid !== request.auth.uid) throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
    assertAnonymousChallengeScope(request.auth, session);
    if (session.status !== "active" || session.channel !== "messenger") return {}; // S0

    const screenRef = sessionRef.collection("mockScreens").doc(landingId);
    const screenSnap = await screenRef.get();
    const item = findMockScreenItem(session.scenarioId, landingId);
    const kind = decideScreenFollowUp(screenSnap.exists ? (screenSnap.data() as MockScreenDoc) : undefined, item?.entrySurface);
    if (!kind) return {};
    // A4 — 이체 화면 제출이면 요구액 대비 비교(값 밖 = 모름).
    const rawComparison = screenSnap.exists ? (screenSnap.data() as MockScreenDoc).amountComparison : undefined;
    const screenAmountComparison = isAmountComparison(rawComparison) ? rawComparison : undefined;

    const scenarioPrompt = resolveSessionScenarioPrompt(session.scenarioId, session.flowVariantId);
    if (!scenarioPrompt) return {};
    const canEscalateNow =
      resolveSessionEscalation(session, PUBLIC_SCENARIOS) !== undefined &&
      !isEscalationTooEarly(turnsSinceMessengerEntry(session.turnCount, session.channelHistory));
    const messagesRef = sessionRef.collection("messages");
    const historySnap = await messagesRef.orderBy("turnIndex", "asc").get();
    const history = historySnap.docs.map((doc) => doc.data() as MessageDoc);
    const fictionalBankName = resolveFictionalBankName({ sessionId, fictionalBankName: session.fictionalBankName });
    const familyAddress = resolveFamilyAddressPrompt(session.scenarioId, sessionFamilyAddress(session));
    const completion = await completeWithFallback(getLlmClient(), {
      systemPrompt: buildSystemPrompt(scenarioPrompt, {
        difficultyLevel: normalizeDifficultyLevel(session.difficultyLevel),
        l3Procedural: isL3Procedural(session.scenarioId),
        identityCheckAllowed: asksIdentityCheck(session.scenarioId),
        speakerGender: resolveSessionSpeakerGender(session),
        turnInstruction: screenFollowUpInstruction(kind, landingId, canEscalateNow, screenAmountComparison),
        fictionalBankName,
        sessionAccountNumber: resolveRouteAccountNumber(session.scenarioId, session.flowVariantId),
        // §132.19 판정표 A — 결말이 계좌 이체가 아닌 루트는 계좌 예시 · 번호 문장 대신 금지 1문장(호출부 6곳 같은 술어).
        noAccountEnding: routeEndsWithoutAccount(session.scenarioId, session.flowVariantId),
        // 화면 행동만 인정 — [화면 행동 확인](호출부 6곳 같은 술어 · `roleplay/screenAction.ts`).
        screenActionOnly: sessionScreenActionOnly(session.scenarioId, session.flowVariantId),
        personaCard: session.personaCard?.items,
        ...(familyAddress ? { familyAddress } : {}),
      }),
      messages: [...toLlmHistory(history), { role: "user", content: SCREEN_ACTION_TRIGGER_TURN }],
      mockTacticHints: scenarioPrompt.weakenedTactics,
      purpose: "scammer-reply",
      ...(personaGuardFor(session.scenarioId) ? { personaGuard: personaGuardFor(session.scenarioId) } : {}),
    });
    logger.info("[§128] 화면 행동 뒤 먼저 보내는 메시지 생성", {
      sessionId,
      kind,
      servedBy: completion.servedBy ?? (completion.isMock ? "mock" : "unknown"),
      isMock: completion.isMock,
    });
    if (completion.isMock) return {}; // S4 — 문맥 없는 Mock 대사는 저장하지 않는다.

    const { text: linkFreeText, attachments: markerAttachments } = extractLinkMarker(completion.text, session.scenarioId, session);
    // S2 — 이체 화면 칩은 계좌가 대화에 나온 뒤에만(`linkMarker.ts` `dropPrematureBankTransferChip` 표).
    const attachments = dropPrematureBankTransferChip(
      dropRepeatedLinkChips(markerAttachments, linkFreeText, history),
      linkFreeText,
      resolveRouteAccountNumber(session.scenarioId, session.flowVariantId),
      history,
    );
    const { text: smsFreeText } = extractSmsMarker(linkFreeText);
    const { text: signalFreeText, escalate: signalEscalate } = extractEscalationSignal(smsFreeText);
    // §128(1) 같은 규칙 — 신호든 대사든 전화를 예고했으면 지금 전환할 수 있을 때만 전환하고, 아니면 예고 문장을 지운다.
    const announcement = decideCallAnnouncement({ replyText: signalFreeText, signalAccepted: false, canEscalateNow });
    const escalate = canEscalateNow && (signalEscalate || announcement.action === "escalate");
    const announcementFree = announcement.action === "strip" ? announcement.text : signalFreeText;
    const { text: tidyText } = tidyScammerReplyMarkup(announcementFree);
    const { text: realNameFree } = replaceRealFinancialNames(tidyText);
    // §131(12) 판정표 A · §131(11) 판정표 W — 하지 않은 송금 · 사진 확인 문장 삭제 · 대화방 메시지를 통화라고 부르는 말 교정.
    const shaped = limitReplySentences(applyFictionalBank(realNameFree, fictionalBankName), MAX_SCAMMER_REPLY_SENTENCES, DEMAND_SENTENCE).text;
    // A4 — 이체 화면 제출 뒤면 송금은 화면에서 마쳤다(말이 아니라 기록) — 적게 보냈으면 "다 받았다"류는 지시가 막는다.
    const transferDoneOnScreen = kind === "submit" && isBankTransferLanding(landingId);
    const factChecked = fixMessengerCallWording(
      stripUnperformedAcknowledgement(shaped, {
        transferReported: transferDoneOnScreen || userReportedTransfer(history),
        photoSent: userSentPhoto(history),
      }),
    );
    // R9 — 화면에 없는 비밀번호 입력 요구 문장 제거(sendMessage와 같은 판정표 P).
    const text = finalizeScammerReplyText(stripPasswordRequests(factChecked).text).trim();
    if (!text) return {}; // S4

    const turnIndex = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(sessionRef)).data() as SessionDoc | undefined;
      if (!fresh || fresh.status !== "active" || fresh.channel !== "messenger") return undefined;
      const freshScreen = (await tx.get(screenRef)).data() as MockScreenDoc | undefined;
      if (decideScreenFollowUp(freshScreen, item?.entrySurface) !== kind) return undefined; // 다른 요청이 먼저 보냈다
      const freshHistory = await tx.get(messagesRef.orderBy("turnIndex", "asc"));
      if (freshHistory.size !== history.length) return undefined; // S4 — 참가자 메시지가 먼저 저장됐다
      const now = Timestamp.now();
      tx.create(messagesRef.doc(), {
        role: "scammer",
        textMasked: text,
        turnIndex: history.length,
        createdAt: now,
        ...(attachments ? { attachments } : {}),
        channel: "messenger",
      } satisfies MessageDoc);
      tx.update(screenRef, { screenFollowUpAt: now, ...(kind === "consent" ? { consentAnnouncedAt: now } : {}) });
      return history.length;
    });
    if (turnIndex === undefined) return {};
    if (escalate) {
      await transitionChannel(sessionId, "messenger", "voice", "announced_call");
      return { turnIndex, escalation: { toChannel: "voice" } };
    }
    return { turnIndex };
  },
);
