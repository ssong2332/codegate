// 릴레이 leg 시작 콜러블 — T191 릴레이 설계(Architecture T191 절 "서버 — 신규 콜러블 startRelayLeg" ·
// ADR-0020 · DECISIONS #138 · #139). PRD AC-101 (a)(b)(d)(e)(f)(i).
//
// 하는 일(모드 3개 — 판정 함수는 `relayTransfer.checkRelayAdvance` **하나**):
//   - `check` : 실시간 `transfer_call` 도구 호출 시점의 하한 확인. **쓰기 0**. 결과 문면(서버 소유)만 돌려준다.
//   - `live`  : 교대 실행 — 델타 전사를 `submitRealtimeTranscript`와 **같은 코어**(`appendMaskedTranscriptTurns`)로
//               마스킹 append → 같은 트랜잭션에서 `relay.legIndex` · `relay.legStartTurnIndex` 갱신(G496) →
//               저장본으로 인계 블록 → 다음 leg 페르소나 · 다른 음성으로 새 Live 토큰.
//   - `text`  : 같은 트랜잭션 + (새 leg 첫마디가 아직 없으면) 텍스트 첫마디 1회 생성 · 저장(토큰 없음) — 텍스트 폴백의
//               교대(sendMessage가 이미 leg를 올린 뒤의 멱등 호출) · 실시간 연결 실패 뒤 강등(C-7 ①)에서 쓴다.
//
// ⛔ 설계 금지 X2 — 인계 블록은 서버 마스킹 저장본 + 변형 데이터로만 만들고, **응답에 싣지 않는다**.
//    응답은 토큰 · 모델명 · leg 순번 · 화자 표기(`callerLabel` = UX C-6 speakerLabel) · 도구 이름뿐이다.
// ⛔ 클론 음성(`voiceId`)을 쓰지 않는다(AC-101 (b) · G494) — Gemini 프리셋만.
// ⭐ 같은 `toLegIndex` 재요청 = 멱등(델타를 다시 쓰지 않고 토큰만 새로 — 재시도 시 전사 중복 0).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { assertAnonymousChallengeScope } from "../shared/anonymousGate";
import { GEMINI_API_KEY, LLM_TEXT_SECRETS } from "../shared/config";
import { generateRelayGreeting, RELAY_GREETING_LIVE_TRIGGER } from "../roleplay/relayGreeting";
import { normalizeDifficultyLevel } from "../shared/difficulty";
import { findFlowVariant, isRelayVariant, relaySpeakerLabel, type FlowVariant } from "../scenarios/flowVariants";
import { findVerifyInterceptItem } from "../scenarios/verifyIntercept";
import type { MessageDoc, SessionDoc } from "../shared/types";
import { GeminiRealtimeProvider } from "./geminiProvider";
import type { LiveToolNames } from "./liveTools";
import { buildRelayHandoff } from "./relayHandoff";
import {
  checkRelayAdvance,
  countLegUserTurns,
  RELAY_TOOL_ACCEPTED_GUIDANCE,
  RELAY_TOOL_NOT_YET_GUIDANCE,
  type RelayAdvanceRejectReason,
  type RelayVerifyState,
} from "./relayTransfer";
import {
  appendMaskedTranscriptTurns,
  countMaskedUserTurns,
  MAX_TRANSCRIPT_TURNS,
  type TranscriptTurn,
} from "./transcriptAppend";

ensureFirebaseAdminApp();

export type StartRelayLegMode = "check" | "live" | "text";

export type StartRelayLegRequest = {
  sessionId: string;
  /** 넘겨받을 leg(1-기반 아님 — 0번이 첫 화자). 지금 leg + 1이어야 한다(같은 값 = 멱등 재발급). */
  toLegIndex: number;
  /** 마지막 제출 이후 전사 델타(실시간 경로 · 클라 버퍼). 부재 = []. */
  turns?: TranscriptTurn[];
  answeredAtMs?: number;
  openingNotSpoken?: boolean;
  /** 부재 = "live". */
  mode?: StartRelayLegMode;
  /**
   * T191 S7(DECISIONS #140) — "verifyDesk" = 릴레이 흐름의 확인 창구를 **다른 목소리 새 연결**로(leg는 그대로 ·
   * `toLegIndex` = 지금 leg · mode "live"만). 부재 = "relay"(교대).
   */
  purpose?: "relay" | "verifyDesk";
};

export type StartRelayLegResponse = {
  mode: StartRelayLegMode;
  /** check 전용 — 허락 여부와 모델에 돌려줄 서버 소유 문면. */
  allowed?: boolean;
  guidance?: string;
  /** live · text — 교대 뒤 지금 leg와 화자 표기(UX 계약 C-6 speakerLabel). */
  legIndex?: number;
  callerLabel?: string;
  /** live 전용 — 새 Live 토큰(새 leg 페르소나 · 인계 · 다른 음성이 서버에 고정돼 있다). */
  geminiToken?: string;
  geminiModel?: string;
  liveTools?: LiveToolNames;
  /**
   * live 전용 — 새 연결 직후 클라가 `relayGreeting` 큐 턴으로 1회 보내는 첫마디 트리거(서버 소유 문면 ·
   * 전사 미기록). AC-098 갱신 고지 1(OQ-U73 ⓐ) — 새 화자 첫마디 1회 예외.
   */
  greetingTrigger?: string;
  /** text 전용 — 이번 호출이 새 leg 첫마디를 저장했는가 · 그 첫마디가 Mock 강등이었는가. */
  greeted?: boolean;
  isMock?: boolean;
  /** 이번 호출로 실제로 저장한 전사 수(멱등 재요청이면 0). */
  written?: number;
};

type LegContext = {
  session: SessionDoc;
  variant: FlowVariant;
  currentLegIndex: number;
  legStartTurnIndex: number[];
};

function assertRequest(data: Partial<StartRelayLegRequest> | undefined): Required<
  Pick<StartRelayLegRequest, "sessionId" | "toLegIndex" | "mode">
> & { turns: TranscriptTurn[] } {
  const sessionId = data?.sessionId;
  const toLegIndex = data?.toLegIndex;
  const mode = data?.mode ?? "live";
  const turns = data?.turns ?? [];
  if (typeof sessionId !== "string" || !sessionId) {
    throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
  }
  const minLeg = data?.purpose === "verifyDesk" ? 0 : 1;
  if (typeof toLegIndex !== "number" || !Number.isInteger(toLegIndex) || toLegIndex < minLeg) {
    throw new HttpsError("invalid-argument", "toLegIndex가 올바르지 않습니다.");
  }
  if (mode !== "check" && mode !== "live" && mode !== "text") {
    throw new HttpsError("invalid-argument", "mode가 올바르지 않습니다.");
  }
  if (!Array.isArray(turns) || turns.length > MAX_TRANSCRIPT_TURNS) {
    throw new HttpsError("invalid-argument", "제출 가능한 턴 수를 초과했습니다.");
  }
  return { sessionId, toLegIndex, mode, turns };
}

/** 활성 · 릴레이 변형 검증(세 모드 공통 — 소유 · 익명 범위는 핸들러 본문의 `contextOf`가 먼저 본다). */
function legContextOf(session: SessionDoc): LegContext {
  // ⚠️ T192(사기범 먼저 끊기) 병합 뒤 연결할 자리 — Architecture §79.18 ④: 세션에 끊기 표식(scammerHangup — 필드 이름은
  // T192 정본)이 있으면 여기서 failed-precondition으로 거부한다. T192가 이 트리에 없어 지금은 검사하지 않는다(가정 구현 0).
  if (session.status !== "active") {
    throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
  }
  const variant = findFlowVariant(session.flowVariantId);
  if (!isRelayVariant(variant) || variant.scenarioId !== session.scenarioId) {
    throw new HttpsError("failed-precondition", "이 세션에는 교대할 담당자가 없습니다.", { reason: "not-relay" });
  }
  const currentLegIndex = session.relay?.legIndex ?? 0;
  const legStartTurnIndex = session.relay?.legStartTurnIndex ?? [0];
  return { session, variant, currentLegIndex, legStartTurnIndex };
}

function verifyStateOf(snap: FirebaseFirestore.DocumentSnapshot | undefined): RelayVerifyState | undefined {
  if (!snap?.exists) return undefined;
  return { announced: Boolean(snap.get("announcedAt")), placed: Boolean(snap.get("placedAt")) };
}

function rejectAdvance(reason: RelayAdvanceRejectReason): never {
  throw new HttpsError("failed-precondition", "지금은 담당자를 바꿀 수 없습니다.", { reason });
}

export const startRelayLeg = onCall<StartRelayLegRequest, Promise<StartRelayLegResponse>>(
  // 실시간 토큰(Gemini 키) + 폴백 첫마디(텍스트 LLM 3단 — Gemini 2키 · Groq) — LLM_TEXT_SECRETS가 둘 다 덮는다.
  { secrets: [...LLM_TEXT_SECRETS] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    const auth = request.auth;
    const { sessionId, toLegIndex, mode, turns } = assertRequest(request.data);
    const db = getFirestore();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const messagesRef = sessionRef.collection("messages");
    // 소유 · 익명 범위(T176 §68.3 "session" 클래스 — 다른 세션 콜러블과 같은 순서) → 활성 · 릴레이 변형.
    const contextOf = (session: SessionDoc | undefined): LegContext => {
      if (!session) throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
      if (session.uid !== auth.uid) throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
      assertAnonymousChallengeScope(auth, session);
      return legContextOf(session);
    };

    // ── check: 쓰기 0 ────────────────────────────────────────────────────────
    if (mode === "check") {
      const ctx = contextOf((await sessionRef.get()).data() as SessionDoc | undefined);
      const historySnap = await messagesRef.orderBy("turnIndex", "asc").get();
      const verifyItem = findVerifyInterceptItem(ctx.session.scenarioId);
      const verify = verifyItem
        ? verifyStateOf(await sessionRef.collection("verifyIntercept").doc(verifyItem.offerId).get())
        : undefined;
      const check = checkRelayAdvance({
        variant: ctx.variant,
        currentLegIndex: ctx.currentLegIndex,
        toLegIndex,
        userTurnsInLeg: countLegUserTurns(
          historySnap.docs.map((d) => d.data() as MessageDoc),
          ctx.legStartTurnIndex[ctx.currentLegIndex] ?? 0,
          countMaskedUserTurns(turns),
        ),
        ...(verify ? { verify } : {}),
      });
      logger.info("startRelayLeg check", {
        scenarioId: ctx.session.scenarioId,
        toLegIndex,
        allowed: check.ok,
        ...(check.ok ? {} : { reason: check.reason }),
      });
      return {
        mode,
        allowed: check.ok,
        guidance: check.ok ? RELAY_TOOL_ACCEPTED_GUIDANCE : RELAY_TOOL_NOT_YET_GUIDANCE,
      };
    }

    // ── verifyDesk(#140): 확인 창구 다른 목소리 새 연결 — 확인 창구로 이미 연결(placed)된 릴레이 세션만 ──────
    if (request.data.purpose === "verifyDesk") {
      if (mode !== "live") throw new HttpsError("invalid-argument", "mode가 올바르지 않습니다.");
      return await startVerifyDeskLeg({ db, sessionRef, messagesRef, contextOf, toLegIndex, turns, request: request.data, sessionId });
    }

    // ── live · text: 델타 마스킹 append + 경계 기록(같은 트랜잭션 — G496) ────────────
    const committed = await db.runTransaction(async (tx) => {
      const ctx = contextOf((await tx.get(sessionRef)).data() as SessionDoc | undefined);
      const historySnap = await tx.get(messagesRef.orderBy("turnIndex", "asc"));
      const history = historySnap.docs.map((d) => d.data() as MessageDoc);
      // 같은 값 재요청 = 멱등(이미 교대됨) — 델타를 다시 쓰지 않는다.
      if (toLegIndex === ctx.currentLegIndex) {
        return { ctx, messages: history, legStart: ctx.legStartTurnIndex[toLegIndex] ?? history.length, written: 0 };
      }
      const verifyItem = findVerifyInterceptItem(ctx.session.scenarioId);
      const verify = verifyItem
        ? verifyStateOf(await tx.get(sessionRef.collection("verifyIntercept").doc(verifyItem.offerId)))
        : undefined;
      const check = checkRelayAdvance({
        variant: ctx.variant,
        currentLegIndex: ctx.currentLegIndex,
        toLegIndex,
        userTurnsInLeg: countLegUserTurns(
          history,
          ctx.legStartTurnIndex[ctx.currentLegIndex] ?? 0,
          countMaskedUserTurns(turns),
        ),
        ...(verify ? { verify } : {}),
      });
      if (!check.ok) rejectAdvance(check.reason);
      // 델타는 **넘겨주는 leg**의 발화다(마지막 넘김 대사 포함) — 화자 표기는 그 leg 것(0번이면 부재).
      const fromLabel = relaySpeakerLabel(ctx.variant, ctx.currentLegIndex);
      const appended = appendMaskedTranscriptTurns(tx, {
        sessionRef,
        messagesRef,
        historyDocs: historySnap.docs,
        session: ctx.session,
        turns,
        ...(request.data.openingNotSpoken !== undefined ? { openingNotSpoken: request.data.openingNotSpoken } : {}),
        ...(typeof request.data.answeredAtMs === "number" ? { answeredAtMs: request.data.answeredAtMs } : {}),
        ...(fromLabel ? { scammerSpeakerLabel: fromLabel } : {}),
        nowMs: Date.now(),
      });
      const legStartTurnIndex = [...ctx.legStartTurnIndex.slice(0, ctx.currentLegIndex + 1), appended.nextIndex];
      tx.update(sessionRef, { relay: { legIndex: toLegIndex, legStartTurnIndex } });
      return { ctx, messages: [...history, ...appended.written], legStart: appended.nextIndex, written: appended.count };
    });

    const { ctx } = committed;
    const callerLabel = ctx.variant.legs[toLegIndex]?.callerLabel ?? "";
    logger.info("startRelayLeg advanced", {
      scenarioId: ctx.session.scenarioId,
      mode,
      legIndex: toLegIndex,
      written: committed.written,
    });
    // 인계 블록 — 경계 이전 저장본만(방금 append한 델타 포함). 도착한 문자는 문서 id만 읽는다.
    let deliveredSmsIds: string[] = [];
    try {
      deliveredSmsIds = (await sessionRef.collection("inCallSms").get()).docs.map((d) => d.id);
    } catch {
      // 조회 실패는 인계 블록의 문자 줄만 "없음"으로 만든다(교대를 막지 않는다 — P-4).
    }
    const handoff = buildRelayHandoff({
      variant: ctx.variant,
      fromLegIndex: toLegIndex - 1,
      maskedMessages: committed.messages.filter((m) => m.turnIndex < committed.legStart),
      deliveredSmsIds,
    });

    if (mode === "text") {
      const greeting = await writeTextGreetingIfMissing({
        db,
        sessionRef,
        messagesRef,
        ctx,
        toLegIndex,
        legStart: committed.legStart,
        messages: committed.messages,
        handoff,
      });
      return { mode, legIndex: toLegIndex, callerLabel, written: committed.written, ...greeting };
    }

    let geminiKey = "";
    try {
      geminiKey = GEMINI_API_KEY.value();
    } catch {
      geminiKey = "";
    }
    if (!geminiKey || geminiKey.startsWith("YOUR_")) {
      // 서버는 이미 leg를 올렸다 — 클라는 텍스트 폴백으로 같은 leg에서 잇는다(C-7 ①).
      throw new HttpsError("unavailable", "실시간 연결을 준비하지 못했습니다.", { reason: "no-live", legIndex: toLegIndex });
    }
    try {
      const credentials = await new GeminiRealtimeProvider(geminiKey).createCallCredentials({
        sessionId,
        scenarioId: ctx.session.scenarioId,
        voiceId: "",
        difficultyLevel: normalizeDifficultyLevel(ctx.session.difficultyLevel),
        ...(ctx.session.flowVariantId ? { flowVariantId: ctx.session.flowVariantId } : {}),
        relayLeg: { legIndex: toLegIndex, handoff },
      });
      return {
        mode,
        legIndex: toLegIndex,
        callerLabel,
        geminiToken: credentials.geminiToken,
        geminiModel: credentials.geminiModel,
        ...(credentials.liveTools ? { liveTools: credentials.liveTools } : {}),
        greetingTrigger: RELAY_GREETING_LIVE_TRIGGER,
        written: committed.written,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("unavailable", "실시간 연결을 준비하지 못했습니다.", { reason: "token-failed", legIndex: toLegIndex });
    }
  },
);

/**
 * 텍스트 폴백의 새 화자 첫마디(OQ-U73 ⓐ — 교대 1회당 정확히 1발화). 새 leg 경계 뒤에 사기범 줄이 이미 있으면
 * 생성하지 않는다(재시도 · 중복 호출 멱등 — LLM 비용 0). 저장은 트랜잭션 안에서 다시 확인한다.
 */
async function writeTextGreetingIfMissing(input: {
  db: FirebaseFirestore.Firestore;
  sessionRef: FirebaseFirestore.DocumentReference;
  messagesRef: FirebaseFirestore.CollectionReference;
  ctx: LegContext;
  toLegIndex: number;
  legStart: number;
  messages: readonly MessageDoc[];
  handoff: string;
}): Promise<{ greeted: boolean; isMock?: boolean }> {
  const { ctx, toLegIndex, legStart } = input;
  const greetedAlready = (msgs: readonly MessageDoc[], start: number) =>
    msgs.some((m) => m.role === "scammer" && m.turnIndex >= start);
  if (greetedAlready(input.messages, legStart)) return { greeted: false };
  const leg = ctx.variant.legs[toLegIndex];
  if (!leg || !ctx.session.flowVariantId) return { greeted: false };
  const result = await generateRelayGreeting({
    scenarioId: ctx.session.scenarioId,
    difficultyLevel: normalizeDifficultyLevel(ctx.session.difficultyLevel),
    flowVariantId: ctx.session.flowVariantId,
    legIndex: toLegIndex,
    handoff: input.handoff,
    speakerGender: leg.speakerGender,
  });
  const greeted = await input.db.runTransaction(async (tx) => {
    const fresh = (await tx.get(input.sessionRef)).data() as SessionDoc | undefined;
    if (!fresh || fresh.status !== "active" || (fresh.relay?.legIndex ?? 0) !== toLegIndex) return false;
    const history = (await tx.get(input.messagesRef.orderBy("turnIndex", "asc"))).docs.map((d) => d.data() as MessageDoc);
    const start = fresh.relay?.legStartTurnIndex?.[toLegIndex] ?? history.length;
    if (greetedAlready(history, start)) return false;
    tx.create(input.messagesRef.doc(), {
      role: "scammer",
      textMasked: result.message.text,
      turnIndex: history.length,
      createdAt: Timestamp.now(),
      ...(fresh.channel ? { channel: fresh.channel } : {}),
      speakerLabel: leg.callerLabel,
    } satisfies MessageDoc);
    return true;
  });
  return { greeted, isMock: result.isMock };
}

/**
 * DECISIONS #140(User) — 릴레이가 있는 흐름에서만 확인 창구 상대를 **다른 목소리**로 바꾼다(릴레이 없는 6종은 현행 같은
 * 소켓 유지). 확인 창구 연결(placedAt)이 이미 서버에 기록된 세션만 받는다. 델타 append(지금 leg 표기) → 멱등 표지
 * `relay.verifyDeskTurnIndex` → 저장본 인계 블록 → leg 음성 전부와 다른 음성 · 교대 도구 없는 새 토큰.
 * 첫마디 트리거 = 카탈로그 `reconnectInstruction`(서버 소유 · 같은 소켓 경로가 쓰던 문면 그대로).
 */
async function startVerifyDeskLeg(input: {
  db: FirebaseFirestore.Firestore;
  sessionRef: FirebaseFirestore.DocumentReference;
  messagesRef: FirebaseFirestore.CollectionReference;
  contextOf: (session: SessionDoc | undefined) => LegContext;
  toLegIndex: number;
  turns: TranscriptTurn[];
  request: StartRelayLegRequest;
  sessionId: string;
}): Promise<StartRelayLegResponse> {
  const { sessionRef, messagesRef } = input;
  const committed = await input.db.runTransaction(async (tx) => {
    const ctx = input.contextOf((await tx.get(sessionRef)).data() as SessionDoc | undefined);
    if (input.toLegIndex !== ctx.currentLegIndex) rejectAdvance("leg-mismatch");
    const verifyItem = findVerifyInterceptItem(ctx.session.scenarioId);
    const verifySnap = verifyItem ? await tx.get(sessionRef.collection("verifyIntercept").doc(verifyItem.offerId)) : undefined;
    const historySnap = await tx.get(messagesRef.orderBy("turnIndex", "asc"));
    const history = historySnap.docs.map((d) => d.data() as MessageDoc);
    if (!verifyItem || !verifyStateOf(verifySnap)?.placed) {
      throw new HttpsError("failed-precondition", "확인 창구 연결 전입니다.", { reason: "verify-not-placed" });
    }
    if (typeof ctx.session.relay?.verifyDeskTurnIndex === "number") {
      return { ctx, verifyItem, messages: history, written: 0 };
    }
    const label = relaySpeakerLabel(ctx.variant, ctx.currentLegIndex);
    const appended = appendMaskedTranscriptTurns(tx, {
      sessionRef,
      messagesRef,
      historyDocs: historySnap.docs,
      session: ctx.session,
      turns: input.turns,
      ...(input.request.openingNotSpoken !== undefined ? { openingNotSpoken: input.request.openingNotSpoken } : {}),
      ...(typeof input.request.answeredAtMs === "number" ? { answeredAtMs: input.request.answeredAtMs } : {}),
      ...(label ? { scammerSpeakerLabel: label } : {}),
      nowMs: Date.now(),
    });
    tx.update(sessionRef, {
      relay: {
        legIndex: ctx.currentLegIndex,
        legStartTurnIndex: ctx.legStartTurnIndex,
        verifyDeskTurnIndex: appended.nextIndex,
      },
    });
    return { ctx, verifyItem, messages: [...history, ...appended.written], written: appended.count };
  });
  const { ctx, verifyItem } = committed;
  const handoff = buildRelayHandoff({
    variant: ctx.variant,
    fromLegIndex: ctx.currentLegIndex,
    maskedMessages: committed.messages,
  });
  let geminiKey = "";
  try {
    geminiKey = GEMINI_API_KEY.value();
  } catch {
    geminiKey = "";
  }
  if (!geminiKey || geminiKey.startsWith("YOUR_")) {
    throw new HttpsError("unavailable", "실시간 연결을 준비하지 못했습니다.", { reason: "no-live" });
  }
  try {
    const credentials = await new GeminiRealtimeProvider(geminiKey).createCallCredentials({
      sessionId: input.sessionId,
      scenarioId: ctx.session.scenarioId,
      voiceId: "",
      difficultyLevel: normalizeDifficultyLevel(ctx.session.difficultyLevel),
      ...(ctx.session.flowVariantId ? { flowVariantId: ctx.session.flowVariantId } : {}),
      relayLeg: { legIndex: ctx.currentLegIndex, handoff, verifyDesk: true },
    });
    logger.info("startRelayLeg verifyDesk", { scenarioId: ctx.session.scenarioId, legIndex: ctx.currentLegIndex });
    return {
      mode: "live",
      legIndex: ctx.currentLegIndex,
      callerLabel: ctx.variant.legs[ctx.currentLegIndex]?.callerLabel ?? "",
      geminiToken: credentials.geminiToken,
      geminiModel: credentials.geminiModel,
      ...(credentials.liveTools ? { liveTools: credentials.liveTools } : {}),
      greetingTrigger: verifyItem.reconnectInstruction,
      written: committed.written,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("unavailable", "실시간 연결을 준비하지 못했습니다.", { reason: "token-failed" });
  }
}
