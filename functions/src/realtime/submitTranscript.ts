// 실시간 음성 통화 전사 제출 (2026-07-23, finding #1).
//
// 실시간 speech-to-speech(Gemini/ElevenLabs) 대화는 외부 음성 AI 안에서 일어나 `sendMessage`를
// 타지 않으므로, 예전엔 `sessions/{sid}/messages`에 오프닝 1줄만 남고 실제 대화가 기록되지 않았다.
// 그 결과 리포트(analyzeConversation)가 분석할 사용자/사기범 턴이 없어 **무조건 "속지 않음"**으로
// 나왔다(리포트 핵심 기능 무력화, AC-008/009/026).
//
// 이 콜러블은 클라가 통화 중 모아둔 전사 턴을 통화 종료 직전에 한 번에 제출받아, 기존 sendMessage와
// 동일하게 PII 마스킹 후 messages에 append한다. 그러면 endSession → 리포트 생성 경로가 실제 대화를
// 그대로 분석할 수 있다. 클라가 messages를 직접 write하지 못하게 막은 규칙(ADR-0004)을 우회하지
// 않으면서(서버 admin write + 마스킹 강제) 실시간 경로에 리포트를 붙이는 최소 침습 방식이다.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { assertAnonymousChallengeScope, denyAnonymous } from "../shared/anonymousGate";
import { findOpeningToMarkNotSpoken } from "./openingMark";
import { resolveTurnCreatedAtMs } from "./transcriptTiming";
import { prepareTranscriptTurns, readTranscriptRequest, transcriptBatchKey } from "./transcriptRequest";
import type { MessageDoc, SessionDoc } from "../shared/types";
import { messageLegIndex } from "../callLegs/legPlan";
import { findFlowVariant } from "../scenarios/flowVariants";

ensureFirebaseAdminApp();

/**
 * §57.2 (6) 처방 D1 — `atMs`: 참가자 시계 기준 상대 ms(`answeredAtMs` 대비). 부재 = 현행 합성
 * 로직 그대로(무백필 · 과거 클라이언트 무영향). 계산·클램프 규칙은 `transcriptTiming.ts` 참고.
 */
export type TranscriptTurn = { role: "user" | "scammer"; text: string; atMs?: number };
/**
 * §55 D3 — `openingNotSpoken`: 오프닝(`turnIndex:0`) 대사가 참가자에게 **낭독되지 않았는가**를
 * 클라가 알려준다(부재 = `false` = 종전 동작).
 *
 * ⛔ **서버가 "전사를 제출했으니 오프닝은 안 들렸다"로 추론하지 말 것(G351).** Gemini로 시작했다가
 * 폴백으로 강등된 세션에서는 그 행이 실제로 표시·재생된다(`session/play/page.tsx` 폴백 분기 —
 * `consumeOpeningAudioUrl()` 재생 + 메시지 구독이 그 행을 말풍선으로 그린다). 추론하면 참가자가
 * **본 대사를 지운다.** 판별자는 클라 래치 1개뿐이다.
 */
/**
 * §57.2 (6) 처방 D1 — `answeredAtMs`: 참가자가 "받기"를 누른 시각(클라 타임스탬프). 부재 =
 * `session.createdAt`으로 대체(둘 다 없으면 현행 합성 로직 그대로 — G366/G367 참고,
 * `docs/Architecture.md` §57.2 (6)).
 */
/**
 * 전사 재전송(외부 보안 점검 2차) — `batchId`: 제출 1회마다 화면이 새로 만드는 값. 같은 값으로 다시 오면 저장 0(부재 = 서버가
 * 내용 해시로 키를 만든다 — `transcriptRequest.ts` 표).
 */
export type SubmitRealtimeTranscriptRequest = {
  sessionId: string;
  turns: TranscriptTurn[];
  openingNotSpoken?: boolean;
  answeredAtMs?: number;
  batchId?: string;
};
export type SubmitRealtimeTranscriptResponse = { written: number };

export const submitRealtimeTranscript = onCall<
  SubmitRealtimeTranscriptRequest,
  Promise<SubmitRealtimeTranscriptResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  // SEC-07 — 타입 · 허용 값(역할 · null 항목 · 숫자 sessionId)을 세션 read 앞에서 판독한다(어긋나면 invalid-argument · 저장 0).
  const { sessionId, turns, openingNotSpoken, answeredAtMs, batchId } = readTranscriptRequest(request.data);
  if (turns.length === 0) {
    denyAnonymous(request.auth); // T181 C(§69.7) — 익명 + 빈 turns는 read 0회로 거부(AC-085 (b) 예외 2 소멸). 비익명은 아래 그대로.
    return { written: 0 };
  }
  const prepared = prepareTranscriptTurns(turns);

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const messagesRef = sessionRef.collection("messages");
  // 전사 재전송 — 같은 제출이 다시 오면 저장 0(종료된 세션도 막지 않는다 — 통화 종료 직후 제출이 정상 흐름이다).
  const batchRef = sessionRef.collection("transcriptBatches").doc(transcriptBatchKey(batchId, prepared));

  // 소유권 검증 + 기존 메시지 뒤에 이어 붙일 turnIndex 확보를 한 트랜잭션으로 묶는다
  // (sendMessage의 원자적 턴 확보와 동일 원칙). 마스킹 후 write.
  const written = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists) {
      throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
    }
    const session = snap.data() as SessionDoc;
    if (session.uid !== request.auth!.uid) {
      throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
    }
    assertAnonymousChallengeScope(request.auth, session);
    // 트랜잭션 안에서 읽는다 — 같은 제출 두 개가 동시에 와도 한쪽만 표시 문서를 만들고 다른 쪽은 재시도에서 저장 0이 된다.
    const batchSnap = await tx.get(batchRef);
    if (batchSnap.exists) return 0;

    const historySnap = await tx.get(messagesRef.orderBy("turnIndex", "asc"));
    // ⛔ **G350** — 이어 붙일 인덱스는 `historySnap.size`(문서 수) 그대로다. 아래 `notSpoken`
    // 마크는 이 값에 **절대 반영하지 않는다**(반영하면 실시간 앵커 `+1`이 무너진다, G348).
    let nextIndex = historySnap.size;

    // §55 D3 — 클라가 "오프닝이 낭독되지 않았다"고 알려준 세션에서만, 이미 읽어 둔 `historySnap`
    // 안의 오프닝 문서에 마크를 붙인다(**추가 read 0회**, 같은 트랜잭션, 멱등).
    // ⛔ `turnIndex`·`createdAt`·기존 필드는 한 줄도 고치지 않는다(문서를 지우거나 옮기지도 않는다).
    const openingPos = findOpeningToMarkNotSpoken(
      historySnap.docs.map((doc) => doc.data() as MessageDoc),
      openingNotSpoken,
    );
    if (openingPos >= 0) {
      tx.update(historySnap.docs[openingPos].ref, { notSpoken: true });
    }
    const baseTime = Date.now();
    // §57.2 (6) 처방 D1 — 클램프 하한이자 `answeredAtMs` 부재 시 기준점 폴백.
    const sessionCreatedAtMs = session.createdAt.toMillis();
    let count = 0;
    // §142 N3 — 다통화 변형이면 이 전사가 오간 통화 번호(트랜잭션에서 읽은 서버 `relay` 기준 · 부재 = 필드 0).
    const legIndex = messageLegIndex(findFlowVariant(session.flowVariantId), session);

    // §116(사기범 사고 문장 제거) · 마스킹 · 빈 줄 제외는 트랜잭션 앞 `prepareTranscriptTurns`가 끝냈다(종전 규칙 그대로).
    prepared.forEach(({ index: i, role, textMasked: masked, atMs }) => {
      // 전사에는 정확한 write 시각이 없으므로 제출 시각 기준으로 턴 간격을 근사한다(리포트
      // 타임라인 "N초 시점"용 — 실시간 통화는 정밀 턴 타이밍이 없어 근사가 불가피하다). D1 —
      // 클라가 `answeredAtMs`·`turn.atMs`를 실어 보낸 경우 그 값을 우선하고, 부재 시(과거
      // 클라이언트·과거 세션 포함)에는 위 합성 로직과 100% 동일하게 남는다(`transcriptTiming.ts`).
      tx.create(messagesRef.doc(), {
        role,
        textMasked: masked,
        turnIndex: nextIndex,
        createdAt: Timestamp.fromMillis(
          resolveTurnCreatedAtMs({
            index: i,
            atMs,
            answeredAtMs,
            sessionCreatedAtMs,
            baseTimeMs: baseTime,
            nowMs: baseTime,
          }),
        ),
        // T30 추가(§13.1) — 교차채널 타임라인(AC-037)용 채널 표기. 실시간 통화 전사는 항상
        // channel="voice" 단계에서 발생한다(에스컬레이션 세션이든 순수 보이스 세션이든 동일).
        channel: "voice",
        ...(legIndex !== undefined ? { legIndex } : {}),
      } satisfies MessageDoc);
      nextIndex += 1;
      count += 1;
    });

    // answeredAt이 없으면(실시간 경로는 sendMessage를 안 타 미설정) 첫 턴 기준으로 채워, 리포트
    // 타임라인 기점과 세션 시간축이 정합하도록 한다.
    // ⭐ §129.8(N9 확인 중 발견) — §129 D2가 리포트 기준을 `answeredAt`으로 바꾼 뒤, 제출 시각(통화 끝 무렵일 수 있다)을 받은 시각으로 쓰면
    // 리포트 시각이 0초 쪽으로 무너진다. 클라가 "받기" 시각(`answeredAtMs`)을 실었으면 그 값을 쓴다 — 위 턴 시각 합성과 **같은 축**이다
    // (`resolveTurnCreatedAtMs`가 `answeredAtMs + atMs`를 쓴다). 세션 생성 ~ 제출 시각 밖은 막는다. 부재 = 종전(제출 시각).
    if (!session.answeredAt) {
      const clientAnswered =
        typeof answeredAtMs === "number" && Number.isFinite(answeredAtMs)
          ? Math.min(baseTime, Math.max(sessionCreatedAtMs, answeredAtMs))
          : baseTime;
      tx.update(sessionRef, { answeredAt: Timestamp.fromMillis(clientAnswered) });
    }
    // 키 · 줄 수 · 시각만(본문 0).
    tx.create(batchRef, { written: count, createdAt: Timestamp.fromMillis(baseTime) });

    return count;
  });

  return { written };
});
