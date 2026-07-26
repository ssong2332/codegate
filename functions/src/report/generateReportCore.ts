// 리포트 생성 핵심 로직 (Track A, T9). API.md `generateReport` 1:1. AC-008/AC-009/AC-026.
//
// `generateReport` onCall(클라 인증·소유권 검증 후 호출)과 `triggerReportGeneration`(endSession/
// sendMessage의 limit_reached 자동종료 경로가 이미 소유권을 검증한 뒤 서버 내부에서 호출, API.md
// generateReport 계약의 "또는 endSession 후 서버 내부 호출") 양쪽이 이 함수 하나를 공통으로
// 쓴다 — 로직 중복 없이 단일 지점化(T8이 triggerReportGeneration에 적용한 것과 같은 원칙).
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { SCENARIO_PROMPTS } from "../scenarios";
import { normalizeDifficultyLevel } from "../shared/difficulty";
import type {
  InCallSmsDoc,
  MessageDoc,
  ReportDoc,
  SessionDoc,
  VerifyInterceptDoc,
} from "../shared/types";
import { analyzeConversation, buildPreventionAdvice, type AnalysisMessage } from "./analyzeConversation";
import { computeDefenseGrade } from "./computeDefenseGrade";
import { buildSmsTimeline, type SmsTimelineSource } from "./smsTimeline";
import { applyVerifyIntercept, type VerifyTimelineSource } from "./verifyTimeline";
import type { GenerateReportResponse } from "./types";

export async function generateReportForSession(sessionId: string): Promise<GenerateReportResponse> {
  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
  }
  const session = sessionSnap.data() as SessionDoc;
  if (session.status !== "ended") {
    throw new HttpsError("failed-precondition", "세션이 아직 종료되지 않았습니다.");
  }

  // reportId = sessionId(Database.md "PK(=sessionId 권장)", AC-007 "정확히 1개 리포트"와 자연
  // 정합). 이미 생성된 리포트가 있으면 재계산하지 않고 그대로 반환한다(멱등 처리 — 클라
  // 직접 호출과 endSession/sendMessage 내부 트리거 양쪽에서 호출될 수 있으므로 중복 생성 방지).
  const reportRef = db.collection("reports").doc(sessionId);
  const existingReport = await reportRef.get();
  if (existingReport.exists) {
    return { reportId: sessionId };
  }

  // ① 마스킹된 messages만 입력(원문·실제 운영정보 배제, AC-005/013 — MessageDoc.textMasked는
  // 이미 저장 전 maskPII를 거친 값이다, T11 실구현 전까지는 passthrough).
  const messagesSnap = await sessionRef.collection("messages").orderBy("turnIndex", "asc").get();
  const messages: AnalysisMessage[] = messagesSnap.docs.map((doc) => {
    const data = doc.data() as MessageDoc;
    return {
      role: data.role,
      textMasked: data.textMasked,
      turnIndex: data.turnIndex,
      createdAtMs: data.createdAt.toMillis(),
    };
  });

  const scenarioPrompt = SCENARIO_PROMPTS[session.scenarioId];
  const weakenedTactics = scenarioPrompt?.weakenedTactics ?? [];

  // ② 대화 로그 규칙 기반 분석(analyzeConversation.ts 참고 — Mock 단계 한계 고지 포함) →
  // deceivedMoments/tacticsUsed/wasDeceived 산출.
  //
  // ⚠️ T72(§15.3.5) — **난이도는 판정에 입력되지 않는다.** analyzeConversation/buildPreventionAdvice/
  // computeDefenseGrade의 시그니처는 무변경이다. 판정 기준이 난이도마다 달라지면 실패 아카이브의
  // 누적 비교("이 수법에 3번 넘어갔습니다")가 서로 다른 잣대의 합이 되어 무의미해지기 때문이다.
  // 난이도는 아래 리포트 문서에 **표기 전용**으로만 역정규화된다(P-22).
  const analysis = analyzeConversation(messages, session.createdAt.toMillis(), weakenedTactics);
  const preventionAdvice = buildPreventionAdvice(analysis.tacticsUsed, analysis.wasDeceived);

  // ②-b 통화 중 문자 이벤트 스냅샷(T89, §15.1.5, AC-059) — `sessions/{sid}/inCallSms`를 **1회 추가
  // read**해 표시 전용 배열로 역정규화한다. 이 화면 데이터가 리포트 문서 안에 있으면 리플레이·리포트
  // 화면이 **이미 읽고 있는 reports/{sid} 하나만으로** 타임라인을 그린다(서브컬렉션 추가 조회·신규
  // firestore.rules 경로 불요 — §15.4.1 아카이브 역정규화와 동형).
  //
  // ⚠️ **판정 무변경이 이 배치의 전부다**(§15.6 G3/G22): 위 analyzeConversation은 이미 끝났고 이
  // 배열은 그 **입력이 아니라 산출 뒤에 나란히 얹히는 값**이다. 문자가 N건이든 0건이든
  // wasDeceived·deceivedMoments·tacticsUsed·preventionAdvice는 완전히 동일하다(회귀 테스트로 고정).
  // 문자를 messages에 끼워 넣었다면 scammer(i)↔user(i+1) 짝짓기가 어긋나 판정이 손상됐을 것이다(G3).
  const smsSnap = await sessionRef.collection("inCallSms").orderBy("arrivedAt", "asc").get();
  const smsSources: SmsTimelineSource[] = smsSnap.docs.map((doc) => {
    const data = doc.data() as InCallSmsDoc;
    return {
      smsId: data.smsId ?? doc.id,
      kind: data.kind,
      senderLabel: data.senderLabel,
      body: data.body,
      ...(data.linkDisplayText ? { linkDisplayText: data.linkDisplayText } : {}),
      ...(data.anchorScammerTurn !== undefined
        ? { anchorScammerTurn: data.anchorScammerTurn }
        : {}),
      arrivedAtMs: data.arrivedAt?.toMillis?.() ?? 0,
      ...(data.openedAt ? { openedAtMs: data.openedAt.toMillis() } : {}),
      ...(data.linkTappedAt ? { linkTappedAtMs: data.linkTappedAt.toMillis() } : {}),
    };
  });
  const smsTimeline = buildSmsTimeline(smsSources, messages, session.createdAt.toMillis());

  // ②-c 확인 시도 무력화 스냅샷 + **기존 순간 주석**(T83, §16.3, ADR-0009, AC-071) —
  // `sessions/{sid}/verifyIntercept`를 **1회 추가 read**한다(위 문자 수집과 같은 지점).
  //
  // ⚠️ **순간을 새로 만들지 않는다는 것이 이 배치의 전부다**(ADR-0009): 확인 무력화의 응낙은
  // 참가자의 **대화 발화**라 위 analyzeConversation이 **이미 순간으로 잡았다**. 여기서는 그
  // 산출물에 `afterVerifyReconnect` 주석을 얹고 `tactic`·`tacticCategory`·`correctAction`만
  // 덮어쓴다 — 순간 **개수**·`turnIndex`·`timeLabel`·`wasDeceived`는 한 건도 바뀌지 않으므로
  // 되감기 진입 조건(AC-062)·방어등급(AC-010/011)·아카이브 항목 수(AC-068)·딥링크 인덱스가
  // **정의상** 흔들릴 수 없다. 순간을 하나 더 만들었다면 같은 응낙이 두 번 계상됐을 것이다(G16).
  const verifySnap = await sessionRef.collection("verifyIntercept").orderBy("offeredAt", "asc").get();
  const verifySources: VerifyTimelineSource[] = verifySnap.docs.map((doc) => {
    const data = doc.data() as VerifyInterceptDoc;
    return {
      offerId: data.offerId ?? doc.id,
      deskLabel: data.deskLabel,
      displayNumber: data.displayNumber,
      ...(data.offerAnchorScammerTurn !== undefined
        ? { offerAnchorScammerTurn: data.offerAnchorScammerTurn }
        : {}),
      offeredAtMs: data.offeredAt?.toMillis?.() ?? 0,
      ...(data.placedAt ? { placedAtMs: data.placedAt.toMillis() } : {}),
      ...(data.reconnectAnchorScammerTurn !== undefined
        ? { reconnectAnchorScammerTurn: data.reconnectAnchorScammerTurn }
        : {}),
    };
  });
  const verify = applyVerifyIntercept(
    verifySources,
    analysis.deceivedMoments,
    messages,
    session.createdAt.toMillis(),
  );

  // ③ 실패 아카이브(UX-030, T74)용 세션 메타 역정규화 — Architecture.md §15.4.1/§15.6 G8.
  // 아카이브는 리포트만 페이지 조회해 카드를 그리므로(별도 컬렉션 없음), 카드에 필요한 세션 메타가
  // 리포트에 없으면 항목 수만큼 세션을 추가 read해야 한다(N+1). 여기서는 session을 이미 읽었으므로
  // 추가 비용이 없다. **옵셔널 필드는 값이 있을 때만 넣는다** — Firestore는 `undefined` 필드 write를
  // 거부하고(Database.md Migration Policy의 "부재로 하위호환"과도 정합), §14.8.3의 "값이 없으면
  // 셀 자체가 비는" store-nothing 방어와 같은 형태다.
  const reportDoc: ReportDoc = {
    reportId: sessionId,
    sessionId,
    uid: session.uid,
    wasDeceived: analysis.wasDeceived,
    // T83 — 주석이 얹힌 배열이지만 **개수·turnIndex·timeLabel은 analysis.deceivedMoments와
    // 동일**하다(확인 문서가 0건이면 같은 값 그대로다 — 회귀 테스트로 고정).
    deceivedMoments: verify.deceivedMoments,
    tacticsUsed: analysis.tacticsUsed,
    preventionAdvice,
    // T72(§15.3.2/§15.4.1) — 세션에서 역정규화(표기 전용). 리포트·리플레이·실패 아카이브가 세션
    // 문서를 추가로 read하지 않고 같은 라벨을 그릴 수 있게 한다(P-22).
    difficultyLevel: normalizeDifficultyLevel(session.difficultyLevel),
    createdAt: Timestamp.now(),
    scenarioId: session.scenarioId,
    channel: session.channel ?? "voice",
    // ⚠️ AC-069 2차 방어(§15.4.3) — 2인 챌린지 체험 세션 리포트에 소속 표식을 남긴다. 사용자1의
    // 아카이브 쿼리에는 uid 격리로 애초에 들어오지 않지만(1차 방어), 이 표식이 있으면 아카이브가
    // 한 번 더 걸러 낸다. 챌린지 세션이 아니면 필드를 아예 만들지 않는다.
    ...(session.challengeId ? { challengeId: session.challengeId } : {}),
    // T89(§15.1.5) — 문자가 0건이면 필드 자체를 만들지 않는다(부재→빈 배열 취급, 무백필). 위
    // 멱등 early-return 덕에 이 스냅샷은 **최초 리포트 생성 시 1회만** 기록된다(AC-007 무변경).
    ...(smsTimeline.length > 0 ? { smsTimeline } : {}),
    // T83(§16.3.1) — 확인 안내가 0건이면 필드 자체를 만들지 않는다(부재→빈 배열 취급, 무백필).
    // 위 멱등 early-return 덕에 이 스냅샷·주석은 **최초 리포트 생성 시 1회만** 기록된다(AC-007
    // 무변경 — 생성 이후 이 문서를 update하지 않는다, §15.6 G13과 동일 규칙).
    ...(verify.verifyTimeline.length > 0 ? { verifyTimeline: verify.verifyTimeline } : {}),
  };
  await reportRef.set(reportDoc);

  // P1(AC-010/AC-011, T13) — 방어 등급/세션 횟수 갱신. Database.md `users/{uid}.defenseGrade`·
  // `.sessionCount`(둘 다 옵셔널 P1 필드)에 반영한다. 새 리포트가 정확히 1회 write될 때만 이
  // 지점을 지나므로(위 멱등 early-return 참고) 등급이 세션마다 정확히 1번씩만 재계산된다.
  // UX.md UX-010 Failure("산정 실패 시 생략, 비차단")대로 실패해도 리포트 생성 자체는 막지 않는다
  // — 등급 산정식 자체는 computeDefenseGrade.ts 참고(OQ-5 미확정 임시값 v1).
  try {
    await updateDefenseGrade(db, session.uid);
  } catch (err) {
    logger.error("방어 등급 갱신 실패(비차단 — 리포트는 정상 생성됨, T13/AC-010/AC-011)", {
      sessionId,
      uid: session.uid,
      err,
    });
  }

  return { reportId: sessionId };
}

/** uid의 누적 reports를 다시 읽어 등급을 재계산하고 users/{uid}에 merge write한다. `reports`는
 * uid 단일 필드 동등 조건 쿼리라 Firestore 자동 인덱스로 충분하다(Database.md 인덱스 표 변경 불요). */
async function updateDefenseGrade(db: FirebaseFirestore.Firestore, uid: string): Promise<void> {
  const reportsSnap = await db.collection("reports").where("uid", "==", uid).get();
  const results = reportsSnap.docs.map((doc) => ({ wasDeceived: Boolean((doc.data() as ReportDoc).wasDeceived) }));
  const { defenseGrade, sessionCount } = computeDefenseGrade(results);
  await db.collection("users").doc(uid).set({ defenseGrade, sessionCount }, { merge: true });
}
