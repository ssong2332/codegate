"use client";

// UX-018 사후 리플레이 해설 (Track A, T33, AC-038) — D-18: UX-008(요약 리포트)의 확장이 아니라
// 별도 화면. 대화(transcript)를 시간순으로 되짚으며 각 사기 신호 시점(deceivedMoments)에 주석을
// 붙인다. 기존 T9 인프라(reports/{sessionId}, sessions/{sessionId}/messages)만 read하고 신규
// Firestore write·신규 분석 로직은 도입하지 않는다(UX.md UX-018 Architect Handoff
// "신규 데이터 모델·신규 분석 파이프라인을 도입하지 않는다").
//
// Entry: report/page.tsx(UX-008)의 "대화 되짚어보기(리플레이 해설)" → `/report/replay?sessionId=...`.
// Data Operations(UX-018): "Read(transcript·리포트 분석) — 신규 write 없음(리포트는 UX-007/UX-008
// 경로에서 이미 생성)". report/page.tsx는 재시도 가능성 때문에 generateReport(콜러블)를 호출한 뒤
// read하지만, 이 화면은 UX.md가 명시적으로 "신규 write 없음"이라 못박아 두어(리포트 생성 책임은
// UX-008 소관) reports/{sessionId}를 순수 read만 한다 — UX.md가 AGENTS.md Document Priority상
// Tasks.md보다 상위 문서라 이 지점만 판단 근거로 우선했다(문서 간 판단 근거 명시).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDoc, getDocs, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { scenarios } from "@/content/scenarios";
import { setChallengeResultSharing } from "@/lib/api";
import { getChallengeToken } from "@/lib/recording";
import { Badge, Button, LoadingStatus } from "@/components/ui";
import {
  buildReplayTimeline,
  getAnnotatedTurnIndexes,
  hasVerifyTransfer,
  type ReplayDeceivedMomentSource,
  type ReplayMockScreenSource,
  type ReplaySmsSource,
  type ReplayTimelineItem,
  type ReplayVerifySource,
} from "@/lib/replay/buildReplayTimeline";
import { resolveRewindEntry } from "@/lib/rewind/rewindEntry";
import { resolveMockScreenCopy } from "@/lib/report/mockScreenTimelineCopy";
import { displayTactic, formatMomentLabel, replayMomentNote } from "@/lib/report/reportSummaryCopy";
import { readRiskSignals, riskSignalCopy, RISK_SIGNAL_HEADING, type RiskSignalView } from "@/lib/report/riskSignalCopy";
import {
  countReplaySignalCards,
  replayNavEmptyText,
  TACTICS_NOT_FOUND_TEXT,
} from "@/lib/report/reportTacticsCopy";
import {
  PERSONA_REPLAY_NOTE,
  personaReplayAnchor,
  readPersonaBlock,
  readReplaySenderPersona,
  type ReplaySenderPersonaView,
} from "@/lib/personacard/personaCard";

type ReportSummary = {
  wasDeceived: boolean;
  tacticsUsed: string[];
  createdAt: Timestamp | null;
};

// T37(UF-005 2인 사용자2, UX-018 "결과 공유 동의") — session.challengeId가 있을 때만 채워진다.
type ChallengeContext = { challengeId: string; displayName: string };

type PageState = "no-session" | "loading" | "error" | "loaded";

export default function ReplayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  // T74(UX-030 → UX-018 "그때 대화 보기") — 실패 아카이브가 특정 순간을 지목해 들어온다. 값은
  // 리포트 `deceivedMoments` 배열의 인덱스이고, 주석이 달린 턴 목록과 순서가 같다(둘 다
  // turnIndex 오름차순). 없거나 범위를 벗어나면 그냥 처음부터 보여준다(직접 URL 진입 대비).
  const momentParam = searchParams.get("moment");
  const [state, setState] = useState<PageState>(sessionId ? "loading" : "no-session");
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [timeline, setTimeline] = useState<ReplayTimelineItem[]>([]);
  // D-61 — 모의 화면 항목의 표시 문구는 **같은 순간에 승격된 `deceivedMoment`가 있는가**로 갈린다
  // (`consented` 한 필드로 이분하지 않는다). 타임라인의 `annotation`에서 역산하지 않고 원본 배열을
  // 그대로 들고 있는 이유: 주석 매칭은 **메시지 항목에만** 걸려(§15.6 G17) 앵커 미해결 등에서
  // 근거가 조용히 달라진다 — 판정 근거는 서버가 준 배열 하나로 고정한다.
  const [deceivedMoments, setDeceivedMoments] = useState<ReplayDeceivedMomentSource[]>([]);
  const [scenarioTitle, setScenarioTitle] = useState<string | null>(null);
  const [callerLabel, setCallerLabel] = useState<string>("상대방");
  // T194-b(UX-018 v1.38 ① · §84.3.7) — 사기범이 카드 값을 처음 말한 줄의 turnIndex(리포트 `personaBlock` 앵커 · 기록 없으면 null).
  const [personaAnchor, setPersonaAnchor] = useState<number | null>(null);
  // 사용자 결정 2026-10-21 ② — 위험 신호(참가자 줄 turnIndex → 항목). 부재 = 빈 배열.
  const [riskSignals, setRiskSignals] = useState<RiskSignalView[]>([]);
  // UX D-133 (5) — 챌린지 수신 세션 + 보낸 분이 넣은 카드일 때만(통화 뒤라 숨길 이유가 없다 · 카드 없으면 null).
  const [senderPersona, setSenderPersona] = useState<ReplaySenderPersonaView | null>(null);
  // 스텝 내비게이션(P-13) — 주석이 달린 항목 중 현재 위치(-1=아직 이동 안 함).
  const [stepPos, setStepPos] = useState(-1);
  const [stepAnnounce, setStepAnnounce] = useState("");
  const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  // T74 — 아카이브(UX-030)에서 `?moment=`로 지목해 들어온 순간으로 딱 한 번 이동하기 위한 래치.
  const deepLinkAppliedRef = useRef(false);

  // T37(UF-005 2인 사용자2 · UX-018 "결과 공유 동의") — challenge가 non-null이면 이 세션은
  // consentChallenge로 만들어진 챌린지 체험 세션이다(session.challengeId 존재).
  const [challenge, setChallenge] = useState<ChallengeContext | null>(null);
  // setChallengeResultSharing({token, share})는 평문 토큰이 필요하다(§14.4) — 동의 시점
  // (challenge/join)에만 알던 값을 탭 범위로 들고 다닌 것을 여기서 읽는다(pendingSession.ts
  // setChallengeToken 주석 참고). 이 탭에서 그 동의 흐름을 거치지 않고(예: 새 탭에서 이 URL을
  // 직접 열어) 도달했다면 값이 없을 수 있다 — 그 경우는 아래에서 버튼 대신 안내만 보여준다.
  const [challengeToken] = useState<string | null>(() => getChallengeToken());
  const [shareState, setShareState] = useState<"idle" | "saving" | "shared" | "declined" | "error">(
    "idle",
  );

  // 네트워크 호출 자체는 setState를 하지 않는 순수 헬퍼로 분리(report/page.tsx·session/end/page.tsx와
  // 동일한 react-hooks/set-state-in-effect 회피 관례).
  const fetchReplay = useCallback(async (sid: string) => {
    const sessionSnap = await getDoc(doc(db, "sessions", sid));
    const sessionData = sessionSnap.data();
    if (!sessionData) throw new Error("session-not-found");

    const reportSnap = await getDoc(doc(db, "reports", sid));
    const reportData = reportSnap.data();
    if (!reportData) throw new Error("report-not-found");

    const messagesSnap = await getDocs(
      query(collection(db, "sessions", sid, "messages"), orderBy("turnIndex", "asc")),
    );
    const messages = messagesSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        role: data.role as "scammer" | "user",
        textMasked: data.textMasked as string,
        turnIndex: data.turnIndex as number,
        channel: data.channel as "voice" | "messenger" | undefined,
        // §55 D3 — 낭독되지 않은 문서 표시를 그대로 넘긴다(제외 판단은 순수 함수가 한다).
        ...(data.notSpoken === true ? { notSpoken: true as const } : {}),
      };
    });

    const deceivedMoments = Array.isArray(reportData.deceivedMoments)
      ? (reportData.deceivedMoments as (ReplayDeceivedMomentSource | null)[]).filter(
          (m): m is ReplayDeceivedMomentSource => m !== null,
        )
      : [];

    // T89(§15.1.5, AC-059) — 문자 이벤트는 **리포트 문서 안의 표시 전용 스냅샷**에서 온다.
    // sessions/{sid}/inCallSms를 이 화면이 직접 구독하지 않는 이유: 앵커 해석이 messages를 봐야
    // 가능해 화면마다 해석 로직이 갈라지기 때문이다(§15.1.5 (1) 기각 사유 3행). 부재→빈 배열.
    const smsTimeline = Array.isArray(reportData.smsTimeline)
      ? (reportData.smsTimeline as ReplaySmsSource[])
      : [];

    // T83(§16.3.5, AC-071/AC-038) — 확인 시도도 같은 리포트 스냅샷에서 온다(부재→빈 배열).
    const verifyTimeline = Array.isArray(reportData.verifyTimeline)
      ? (reportData.verifyTimeline as ReplayVerifySource[])
      : [];

    // T84(§15.9.5 e-4, AC-072/AC-073) — 모의 화면 항목도 같은 리포트 스냅샷에서 온다(부재→빈
    // 배열). 3단계 결합 세션은 세 단계가 **하나의 시간축에 병합**돼 표시된다(기존 AC-037 규칙의
    // 연장 — 신규 규칙 없음).
    const mockScreenTimeline = Array.isArray(reportData.mockScreenTimeline)
      ? (reportData.mockScreenTimeline as ReplayMockScreenSource[])
      : [];

    const scenarioId = sessionData.scenarioId as string | undefined;
    const scenario = scenarioId ? scenarios[scenarioId] : undefined;

    const challengeId = sessionData.challengeId as string | undefined;
    const challengeContext: ChallengeContext | null = challengeId
      ? {
          challengeId,
          displayName: (sessionData.challengeCreatorDisplayName as string | undefined) ?? "상대방",
        }
      : null;

    return {
      summary: {
        wasDeceived: Boolean(reportData.wasDeceived),
        tacticsUsed: Array.isArray(reportData.tacticsUsed) ? (reportData.tacticsUsed as string[]) : [],
        createdAt: reportData.createdAt instanceof Timestamp ? reportData.createdAt : null,
      } satisfies ReportSummary,
      timeline: buildReplayTimeline(
        messages,
        deceivedMoments,
        smsTimeline,
        verifyTimeline,
        mockScreenTimeline,
      ),
      deceivedMoments,
      scenarioTitle: scenario?.title ?? null,
      callerLabel: scenario?.callerLabel ?? "상대방",
      challenge: challengeContext,
      personaAnchor: personaReplayAnchor(readPersonaBlock(reportData.personaBlock)),
      riskSignals: readRiskSignals(reportData.riskSignals),
      senderPersona: readReplaySenderPersona(sessionData.personaCard, challengeContext !== null),
    };
  }, []);

  // 마운트 시 effect 안의 인라인 IIFE와 재시도 클릭 핸들러가 각자 결과에 따라 setState한다
  // (report/page.tsx·session/end/page.tsx와 동일한 react-hooks/set-state-in-effect 회피 관례 —
  // effect 안에서 이름 있는 함수를 통해 setState를 호출하면 정적 분석이 "동기 setState"로 오탐한다).
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchReplay(sessionId);
        if (cancelled) return;
        setReport(result.summary);
        setTimeline(result.timeline);
        setDeceivedMoments(result.deceivedMoments);
        setScenarioTitle(result.scenarioTitle);
        setCallerLabel(result.callerLabel);
        setChallenge(result.challenge);
        setPersonaAnchor(result.personaAnchor);
        setRiskSignals(result.riskSignals);
        setSenderPersona(result.senderPersona);
        setStepPos(-1);
        setState("loaded");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, fetchReplay]);

  // T37 — 결과 공유 동의/거부. share=false도 명시 기록한다(§14.1 부재=미동의와 구분되는 "명시적
  // 아니오", userAccess.ts 주석 참고). 실패해도 리플레이 열람 자체는 막지 않는다(비차단).
  const handleShareResult = async (share: boolean) => {
    if (!challengeToken || shareState === "saving") return;
    setShareState("saving");
    try {
      await setChallengeResultSharing({ token: challengeToken, share });
      setShareState(share ? "shared" : "declined");
    } catch {
      setShareState("error");
    }
  };

  const annotatedTurnIndexes = getAnnotatedTurnIndexes(timeline);
  // T189(UX-008 v1.31 (2)) — 타임라인이 말풍선 주석 밖에 그리는 "여기가 신호였어요" 카드 수.
  // 모의 화면 판정은 렌더(ReplayMockScreenItem)와 같은 함수·같은 deceivedMoments로 한다.
  // T194-b — "상대가 먼저 꺼낸 내 정보" 주석도 같은 소제목 카드라 함께 센다(렌더하는 카드 = 세는 카드 · TB 용어 정의 (2)).
  // 그 앵커 줄이 타임라인의 사기범 메시지일 때만 그려지므로 같은 조건으로 센다.
  const personaNoteRendered =
    personaAnchor !== null &&
    timeline.some((t) => t.kind === "message" && t.role === "scammer" && t.turnIndex === personaAnchor);
  const signalCardCount =
    countReplaySignalCards(timeline, (mockScreen) => resolveMockScreenCopy(mockScreen, deceivedMoments, "replay")) +
    (personaNoteRendered ? 1 : 0);

  // T70(UX-028 진입점, AC-062/AC-042) — 이 화면은 2인 사용자2의 **강제 해설 단계 그 자체**이므로
  // 여기서부터는 되감기를 선택 단계로 노출해도 강제 순서를 앞지르지 않는다(afterForcedReplay).
  // reportId는 기존 관례대로 sessionId와 같다(이 화면이 이미 reports/{sessionId}를 읽고 있다).
  const rewindEntry = resolveRewindEntry({
    reportStatus: state === "loaded" ? "ready" : "pending",
    deceivedMomentCount: annotatedTurnIndexes.length,
    isChallengeSession: challenge !== null,
    afterForcedReplay: true,
  });
  const goToRewind = (momentIndex: number) => {
    if (!sessionId) return;
    router.push(`/report/rewind?reportId=${encodeURIComponent(sessionId)}&moment=${momentIndex}`);
  };
  const hasMultipleChannels =
    new Set(
      timeline
        .filter((item) => item.kind === "message")
        .map((item) => (item.kind === "message" ? (item.channel ?? "voice") : "voice")),
    ).size > 1;

  const goToStep = (nextPos: number) => {
    if (nextPos < 0 || nextPos >= annotatedTurnIndexes.length) return;
    setStepPos(nextPos);
    const turnIndex = annotatedTurnIndexes[nextPos];
    const el = itemRefs.current.get(turnIndex);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
    // ⚠️ 문자 항목은 앵커 메시지와 turnIndex가 같으므로(§15.1.5 (4)) 반드시 메시지로 좁혀서
    // 찾는다 — 좁히지 않으면 스텝 안내가 문자 항목을 잡아 주석 문구가 비어 버린다(G17 동류).
    const item = timeline.find((t) => t.kind === "message" && t.turnIndex === turnIndex);
    if (item?.kind === "message" && item.annotation) {
      setStepAnnounce(
        `${nextPos + 1}번째 신호 / 총 ${annotatedTurnIndexes.length}개. ${formatMomentLabel(item.annotation.timeLabel)}: ${displayTactic(item.annotation.tactic) ?? "상대의 요구"}에 응함.`,
      );
    }
  };
  // T74 — 아카이브에서 지목해 들어온 순간으로 한 번만 이동한다(사용자가 이후 직접 스텝을 옮기면
  // 다시 끌어당기지 않도록 ref로 1회 실행을 고정한다). 목록이 렌더된 뒤여야 itemRefs가 채워져
  // 있으므로 로드 effect가 아니라 별도 effect이고, 의존성 배열 없이 매 렌더 후 실행하되 래치가
  // 실제 동작을 1회로 막는다(goToStep이 항상 최신 클로저라 stale 참조가 생기지 않는다).
  useEffect(() => {
    if (state !== "loaded" || deepLinkAppliedRef.current) return;
    const index = Number(momentParam);
    if (momentParam === null || !Number.isInteger(index)) return;
    if (index < 0 || index >= annotatedTurnIndexes.length) return;
    deepLinkAppliedRef.current = true;
    // 스크롤·포커스는 목록 노드가 실제로 배치된 다음 프레임에 해야 정확하다. 같은 콜백에서
    // 스텝 위치도 함께 옮겨 "신호 N / M" 표시와 어긋나지 않게 한다(effect 본문에서 동기 setState를
    // 하지 않는 관례도 함께 지킨다 — react-hooks/set-state-in-effect).
    const frame = requestAnimationFrame(() => goToStep(index));
    return () => cancelAnimationFrame(frame);
    // goToStep은 매 렌더 재생성되지만 위 래치(deepLinkAppliedRef)가 실제 이동을 1회로 고정한다.
    // 의존성에 넣으면 매 렌더마다 effect가 재실행되며 cleanup이 예약된 프레임을 취소해 이동 자체가
    // 일어나지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, momentParam, annotatedTurnIndexes.length]);

  const handleRetry = () => {
    if (!sessionId) return;
    setState("loading");
    fetchReplay(sessionId)
      .then((result) => {
        setReport(result.summary);
        setTimeline(result.timeline);
        setDeceivedMoments(result.deceivedMoments);
        setScenarioTitle(result.scenarioTitle);
        setCallerLabel(result.callerLabel);
        setChallenge(result.challenge);
        setPersonaAnchor(result.personaAnchor);
        setRiskSignals(result.riskSignals);
        setSenderPersona(result.senderPersona);
        setStepPos(-1);
        setState("loaded");
      })
      .catch(() => setState("error"));
  };

  const handleGoToReport = () => {
    if (!sessionId) return;
    router.push(`/report?sessionId=${encodeURIComponent(sessionId)}`);
  };

  const handleGoHome = () => router.push("/");

  if (state === "no-session") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 bg-page p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-lg text-danger">
          <span aria-hidden="true">⚠</span>
          <span>되짚어볼 대화를 찾을 세션 정보가 없습니다. 처음 화면으로 돌아가 다시 시작해 주세요.</span>
        </p>
        <button
          type="button"
          onClick={handleGoHome}
          className="min-h-[48px] rounded-[8px] border border-line-strong px-6 py-3 text-lg font-bold text-ink hover:bg-white"
        >
          처음으로
        </button>
      </main>
    );
  }

  if (state === "loading") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 bg-page p-8 text-center">
        <LoadingStatus label="대화 되짚어보기를 준비하는 중입니다" />
      </main>
    );
  }

  if (state === "error" || !report) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 bg-page p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-lg text-danger">
          <span aria-hidden="true">⚠</span>
          <span>대화 되짚어보기를 불러오지 못했습니다. 다시 시도해 주세요.</span>
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="min-h-[48px] rounded-[8px] bg-brand px-6 py-3 text-lg font-bold text-white"
        >
          다시 시도
        </button>
      </main>
    );
  }

  const dateLabel = report.createdAt
    ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
        report.createdAt.toDate(),
      )
    : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col bg-page pb-8">
      <div className="px-5 pt-[22px]">
        <p className="text-[15px] font-semibold text-ink-sub">
          {[dateLabel, scenarioTitle].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1.5 text-[24px] font-bold leading-[1.35] text-ink">대화 되짚어보기</p>
        <p className="mt-1 text-lg leading-relaxed text-ink-sub">
          대화를 처음부터 순서대로 다시 보며, 사기 신호가 있었던 지점을 확인해 보세요.
        </p>
      </div>

      {/* Empty(AC-009 정합): 한 번도 속지 않은 경우 그 사실을 명시하고 시도된 수법을 나열한다.
          "면역됨/이제 안전"류 과신 표현은 쓰지 않는다(PRD Risk, P-8 "개선 영역" 프레임). */}
      {!report.wasDeceived && (
        <div className="mx-5 mt-4 rounded-[8px] border border-line bg-white p-[18px]">
          <p role="status" className="text-lg font-semibold text-brand">
            이번 대화에서는 한 번도 속지 않았습니다.
          </p>
          <p className="mt-1.5 text-lg leading-relaxed text-ink-sub">
            사기 수법은 계속 진화하므로, 오늘 시도된 수법을 다시 확인하고 대화 흐름 속에서 어떻게
            대응했는지 아래에서 되짚어 보세요. 이건 한 번에 끝나는 게 아니라 계속 유지해야 할 개선
            영역입니다.
          </p>
          <p className="mt-3 text-base font-semibold text-ink">시도된 수법</p>
          {report.tacticsUsed.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {report.tacticsUsed.map((tactic) => (
                <Badge key={tactic} variant="neutral">
                  {tactic}
                </Badge>
              ))}
            </div>
          ) : (
            // TB-7(UX-008 v1.31) — 리포트 TB-4와 같은 문장. role 없음(상자 첫 줄이 이미 status).
            <p className="mt-1.5 text-lg leading-relaxed text-ink-sub">{TACTICS_NOT_FOUND_TEXT}</p>
          )}
        </div>
      )}

      {/* UX D-133 (5) — 받는 사람에게 발신자가 넣은 카드 블록(챌린지 수신 세션 · `inputBy: "sender"` 카드만). 문면은 리포트 정본 재사용
          (`readReplaySenderPersona`) · 새 색 0 · 되감기 버튼 0(속은 순간이 아니다). */}
      {senderPersona && (
        <section
          aria-labelledby="replay-sender-persona-title"
          className="mx-5 mt-4 flex flex-col gap-2.5 rounded-[8px] border border-line bg-white p-[18px]"
        >
          <h2 id="replay-sender-persona-title" className="text-lg font-bold text-ink">
            {senderPersona.title}
          </h2>
          <p className="text-lg leading-relaxed text-ink">{senderPersona.fact}</p>
          <dl className="flex flex-col gap-1.5 rounded-[8px] bg-page p-3">
            {senderPersona.rows.map((row) => (
              <div key={row.label} className="flex flex-wrap gap-x-2">
                <dt className="text-lg text-ink-sub">{row.label}</dt>
                <dd className="break-words text-lg font-semibold text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-base leading-relaxed text-ink-sub">{senderPersona.tail}</p>
        </section>
      )}

      {/* 스텝 내비게이션(P-13) — 신호로 점프 + 순차 스크롤 병행. 큰 터치 타겟. */}
      <div className="mx-5 mt-4 flex items-center justify-between gap-2 rounded-[8px] border border-line bg-white px-4 py-3">
        {annotatedTurnIndexes.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => goToStep(stepPos - 1)}
              disabled={stepPos <= 0}
              className="min-h-[48px] min-w-[96px] rounded-[8px] border border-line-strong px-4 text-lg font-bold text-ink disabled:opacity-40"
            >
              ◂ 이전 신호
            </button>
            <p className="text-base font-semibold text-ink-sub" aria-hidden="true">
              신호 {stepPos + 1 > 0 ? stepPos + 1 : "-"} / {annotatedTurnIndexes.length}
            </p>
            <button
              type="button"
              onClick={() => goToStep(stepPos + 1)}
              disabled={stepPos >= annotatedTurnIndexes.length - 1}
              className="min-h-[48px] min-w-[96px] rounded-[8px] border border-line-strong px-4 text-lg font-bold text-ink disabled:opacity-40"
            >
              다음 신호 ▸
            </button>
          </>
        ) : (
          // Failure(UX-018): 이동할 속은 순간이 없으면 침묵하지 않고 명시한다 — 문면은 TB-9a~d
          // (UX-008 v1.31). 한 문단 두 문장, role="status" 유지.
          <p className="text-lg text-ink-sub" role="status">
            {replayNavEmptyText(report.wasDeceived, signalCardCount)}
          </p>
        )}
      </div>
      {/* aria-live: 스텝 이동 시 스크린리더에 현재 신호를 알린다(P-13). */}
      <p aria-live="polite" className="sr-only">
        {stepAnnounce}
      </p>

      {/* 대화 타임라인 — 디자인 시스템 "8 · 채팅 말풍선"(상대=좌측+아바타+흰 버블, 나=우측+teal
          버블) 그대로. 스크린리더가 항상 대화 순서(DOM 순서)대로 읽는다. */}
      <ol className="mx-5 mt-4 flex flex-col gap-3">
        {timeline.map((item) => {
          // T89(§15.1.5 (5)) — 문자 항목은 **기존 사기범 말풍선 형식 그대로** 그리고, 이벤트는
          // **기존 주석 카드(role="note")** 그대로 쓴다. 신규 컴포넌트·신규 색·신규 표기 형식 0건
          // (UX-008 v1.11 "신규 표기 형식 없음"). 되감기 버튼은 달지 않는다 — 되감기 대상은
          // deceivedMoments이고 문자 순간에는 대응하는 사기범 대사가 없다(§15.1.5 (5) 근거 4).
          if (item.kind === "sms") {
            return <ReplaySmsItem key={item.id} sms={item.sms} />;
          }
          // T83(§16.3.5) — 확인 항목도 **기존 주석 카드 형식 그대로** 쓴다(신규 표기 형식 0건).
          // 되감기 버튼은 달지 않는다(대상은 deceivedMoments뿐 — 주석된 순간에는 원래대로 달린다).
          if (item.kind === "verify") {
            return <ReplayVerifyItem key={item.id} verify={item.verify} />;
          }
          // T84(§15.9.5 e-4) — 모의 화면 항목도 **기존 주석 카드 형식 그대로** 쓴다. 되감기 버튼은
          // 달지 않는다(승격된 순간에는 그 사기범 말풍선에 원래대로 달린다 — 중복 카드 금지).
          if (item.kind === "mockScreen") {
            return (
              <ReplayMockScreenItem
                key={item.id}
                mockScreen={item.mockScreen}
                deceivedMoments={deceivedMoments}
              />
            );
          }
          const channelBadgeLabel = (item.channel ?? "voice") === "messenger" ? "메신저" : "통화";
          return (
            <li
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.turnIndex, el);
                else itemRefs.current.delete(item.turnIndex);
              }}
              tabIndex={-1}
              className="outline-none"
            >
              {item.role === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%]">
                    <div className="rounded-[8px] rounded-br-[4px] bg-brand px-4 py-3">
                      <p className="text-[17px] leading-[1.55] text-white">{item.textMasked}</p>
                    </div>
                    <p className="mr-1 mt-1 flex items-center justify-end gap-1.5 text-[13px] text-ink-sub">
                      나
                      {hasMultipleChannels && <Badge variant="neutral">{channelBadgeLabel}</Badge>}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex max-w-[85%] items-end gap-2">
                  <div
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-avatar-bg"
                  >
                    <div className="h-[14px] w-[14px] rounded-full bg-avatar-fg" />
                  </div>
                  <div>
                    <p className="mb-1 ml-1 flex items-center gap-1.5 text-[13px] text-ink-sub">
                      {callerLabel} <span className="font-semibold text-caution">(사칭)</span>
                      {hasMultipleChannels && <Badge variant="neutral">{channelBadgeLabel}</Badge>}
                    </p>
                    <div
                      className={`rounded-[8px] rounded-bl-[4px] px-4 py-3 ${
                        item.annotation
                          ? "border-[1.5px] border-caution/50 bg-caution-tint"
                          : "border border-line bg-white"
                      }`}
                    >
                      <p className="whitespace-pre-line text-[17px] leading-[1.55] text-ink">{item.textMasked}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 신호 주석 — mockup의 "⚠️ 여기가 신호였어요" / "이렇게 대응했어야" 2단 카드
                  그대로(색만이 아니라 라벨 텍스트로도 이중 표기, P-13 Accessibility). */}
              {item.annotation && (
                <div
                  role="note"
                  className={`mt-2 rounded-[8px] border border-caution/30 bg-caution-tint p-3.5 ${
                    item.role === "user" ? "" : "ml-10"
                  }`}
                >
                  <p className="mb-1.5 text-[15px] font-bold text-caution">⚠️ 여기가 신호였어요</p>
                  <p className="text-[15px] leading-[1.6] text-ink">
                    {/* 리포트 검수(2026-10-22) — 주석은 대개 내 답 말풍선에 달린다: 내 말을 수법으로 부르지 않고 응한 순간으로 부른다. */}
                    {replayMomentNote(item.annotation.timeLabel, item.annotation.tactic)}
                  </p>
                  <div className="my-2.5 h-px bg-caution/20" />
                  <p className="mb-1.5 text-[15px] font-bold text-brand">이렇게 대응했어야</p>
                  <p className="text-[15px] leading-[1.6] text-ink">{item.annotation.correctAction}</p>
                  {/* T70(UX-028) — "읽는 복기"에서 "다시 해보기"로 이어지는 지점(UX-018 Entry).
                      순간 인덱스는 리포트 deceivedMoments 순서(=turnIndex 오름차순)와 같다. */}
                  {rewindEntry === "available" && (
                    <button
                      type="button"
                      onClick={() => goToRewind(annotatedTurnIndexes.indexOf(item.turnIndex))}
                      className="mt-3 min-h-[48px] w-full rounded-[8px] border border-brand bg-white px-4 text-lg font-semibold text-brand"
                    >
                      이 순간 다시 해보기
                    </button>
                  )}
                </div>
              )}
              {/* T194-b(UX-018 v1.38 ①) — R-1(기록 있음) 세션에서만 사기범이 카드 값을 처음 말한 줄에 기존 주석 형식으로 단다.
                  기록이 없으면(R-2) 주석 0(근거 없는 지목 금지). 속은 순간이 아니므로 되감기 버튼 0(D-51). */}
              {item.role === "scammer" && item.turnIndex === personaAnchor && (
                <div role="note" className="ml-10 mt-2 rounded-[8px] border border-caution/30 bg-caution-tint p-3.5">
                  <p className="mb-1.5 text-[15px] font-bold text-caution">⚠️ 여기가 신호였어요</p>
                  <p className="text-[15px] leading-[1.6] text-ink">{PERSONA_REPLAY_NOTE}.</p>
                </div>
              )}
              {/* 사용자 결정 2026-10-21 ② — 속음은 아니지만 위험했던 참가자 줄. 소제목이 속은 순간 카드와 달라 카드 수(`countSignalCards`)에
                  들지 않고, 속은 순간이 아니므로 되감기 버튼 0(D-51). */}
              {item.role === "user" &&
                riskSignals
                  .filter((signal) => signal.turnIndex === item.turnIndex)
                  .map((signal) => {
                    const copy = riskSignalCopy(signal.kind);
                    return (
                      <div
                        key={signal.kind}
                        role="note"
                        className="mt-2 rounded-[8px] border border-caution/30 bg-caution-tint p-3.5"
                      >
                        <p className="mb-1.5 text-[15px] font-bold text-caution">{RISK_SIGNAL_HEADING}</p>
                        <p className="text-[15px] leading-[1.6] text-ink">
                          {formatMomentLabel(signal.timeLabel)}: {copy.title}
                        </p>
                        <p className="mt-1 text-[15px] leading-[1.6] text-ink-sub">{copy.explanation}</p>
                      </div>
                    );
                  })}
            </li>
          );
        })}
      </ol>

      {/* 하단 고정 안내 — mockup(리포트 화면.dc.html) 고정 문구. "면역됐다" 류 과신 표현 대신
          "이번에 놓쳤을 수 있는 부분"으로 프레이밍한다(README "3. 리포트 화면" 명시 요구사항). */}
      <div className="mx-5 mt-4 rounded-[8px] bg-neutral-tint px-4 py-3">
        <p className="text-[15px] leading-[1.6] text-ink-sub">
          한 번의 훈련으로 끝이 아니에요. 이번에 놓쳤을 수 있는 부분은 다음 훈련에서 다시 연습할 수
          있어요.
        </p>
      </div>

      {/* T37(UF-005 step5, UX-018 "결과 공유 동의", AC-043) — 챌린지 체험 세션에서만 노출된다.
          challenges/{}는 클라 직접 read가 전면 거부라(firestore.rules) 사용자2는 자기 이전 선택을
          되읽을 방법이 없다 — 그래서 서버 상태와 동기화된 "토글"이 아니라 액션 버튼 쌍 + 이번
          세션 동안의 로컬 확인 표시로 구현한다(1회성 결정이라도 여러 번 바꿔 누를 수는 있다). */}
      {challenge && (
        <div className="mx-5 mt-4 flex flex-col gap-3 rounded-[8px] border border-line bg-white p-[18px]">
          <p className="text-lg font-semibold text-ink">
            이 결과를 {challenge.displayName}님과 공유하시겠어요?
          </p>
          <p className="text-base leading-relaxed text-ink-sub">
            {/* 리포트 검수(2026-10-22) — 내부 요구사항 번호("(AC-043)")가 화면에 그대로 나오던 것을 뺐다. */}
            동의하면 완료 여부만 {challenge.displayName}님에게 전달됩니다. 대화 내용은 전달되지
            않습니다.
          </p>

          {!challengeToken ? (
            <p role="status" className="text-base text-ink-sub">
              결과 공유 동의는 이 훈련을 진행한 브라우저 탭에서만 가능합니다.
            </p>
          ) : shareState === "shared" ? (
            <p role="status" className="text-base font-semibold text-brand">
              공유하기로 했습니다.
            </p>
          ) : shareState === "declined" ? (
            <p role="status" className="text-base font-semibold text-ink-sub">
              공유하지 않기로 했습니다.
            </p>
          ) : (
            <div className="flex gap-3">
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleShareResult(true)}
                disabled={shareState === "saving"}
                className="flex-1"
              >
                공유합니다
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleShareResult(false)}
                disabled={shareState === "saving"}
                className="flex-1"
              >
                공유하지 않습니다
              </Button>
            </div>
          )}
          {shareState === "error" && (
            <p role="alert" className="flex items-center gap-2 text-base text-danger">
              <span aria-hidden="true">⚠</span>
              <span>저장에 실패했습니다. 다시 시도해 주세요.</span>
            </p>
          )}
        </div>
      )}

      <div className="mx-5 mt-5 flex flex-col gap-2.5">
        {/* UX-028(즉시 되감기) 진입점 — 속은 순간이 1건 이상일 때만(D-40). 2인 사용자2도 이
            화면(강제 해설)을 지난 뒤이므로 여기서는 노출한다(AC-042 순서 유지). */}
        {rewindEntry === "available" && (
          <Button type="button" variant="primary" onClick={() => goToRewind(0)}>
            그 순간 다시 해보기
          </Button>
        )}
        {/* UX-007/UX-018 Exit(2인 변형) — 챌린지 세션은 UX-008(리포트, UF-002 전용)로 돌아가는
            경로를 제공하지 않는다. "(선택)결과 공유 동의 → 종료"만 남긴다. */}
        {!challenge && (
          <Button type="button" variant="secondary" onClick={handleGoToReport}>
            요약 리포트로 돌아가기
          </Button>
        )}
        <button
          type="button"
          onClick={handleGoHome}
          className="min-h-[48px] rounded-[8px] px-6 py-3 text-lg font-semibold text-ink-sub"
        >
          처음으로
        </button>
      </div>
    </main>
  );
}

/**
 * T89(§15.1.5 (5)) — 통화 중 도착한 문자 1건 + 그 문자에서 일어난 일들.
 *
 * **기존 표기 형식만 재사용한다**: 문자 자체는 사기범 말풍선(좌측 아바타 + 흰 버블), 이벤트는
 * 주석 카드(`role="note"`, "⚠️ 여기가 신호였어요 / 이렇게 대응했어야")다. `correctAction`이 없는
 * 이벤트는 **같은 카드의 하단 블록만 생략**한다(카드 자체는 동일).
 *
 * ⚠️ 여기서 하지 않는 것: 링크를 **컨트롤로 렌더하지 않는다**(`linkDisplayText`는 표시용 텍스트일
 * 뿐이고 스냅샷에 `fakeLandingId`가 아예 없어 가짜 랜딩 재진입 자체가 불가능하다 — §15.6 G19,
 * UX-018은 Read-only 열람 화면). 되감기 버튼도 달지 않는다(§15.1.5 (5) 근거 4).
 */
function ReplaySmsItem({ sms }: { sms: ReplaySmsSource }) {
  return (
    <li className="outline-none">
      <div className="flex max-w-[85%] items-end gap-2">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-avatar-bg text-base text-avatar-fg"
        >
          ✉
        </div>
        <div>
          <p className="mb-1 ml-1 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-sub">
            {sms.senderLabel}
            <Badge variant="neutral">문자</Badge>
            {/* AC-022/032 계승 — 사후 화면에서도 모의 문자임을 표기한다. */}
            <span className="rounded-full bg-ai-tint px-2 py-0.5 text-[13px] font-semibold text-ai-ink">
              AI 훈련용 모의 문자
            </span>
          </p>
          <div className="rounded-[8px] rounded-bl-[4px] border border-line bg-white px-4 py-3">
            <p className="whitespace-pre-line text-[17px] leading-[1.55] text-ink">
              {sms.body}
            </p>
            {sms.linkDisplayText && (
              <p className="mt-2 text-[15px] text-ink-sub">
                <span className="font-semibold">문자 속 링크 표기: </span>
                {sms.linkDisplayText}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 앵커 미해결 고지(§15.1.5 (4) 규칙 3) — 조용히 버리지 않고 위치를 모른다는 사실을 알린다. */}
      {!sms.anchorResolved && (
        <p className="ml-10 mt-1.5 text-[15px] text-ink-sub" role="status">
          이 문자가 대화 중 어느 시점에 도착했는지는 확인하지 못했습니다.
        </p>
      )}

      {sms.events.map((event) => (
        <div
          key={event.event}
          role="note"
          className="ml-10 mt-2 rounded-[8px] border border-caution/30 bg-caution-tint p-3.5"
        >
          <p className="mb-1.5 text-[15px] font-bold text-caution">⚠️ 여기가 신호였어요</p>
          <p className="text-[15px] leading-[1.6] text-ink">
            {sms.timeLabel ? `${formatMomentLabel(sms.timeLabel)}: ` : ""}
            {event.what}
          </p>
          {event.correctAction && (
            <>
              <div className="my-2.5 h-px bg-caution/20" />
              <p className="mb-1.5 text-[15px] font-bold text-brand">이렇게 대응했어야</p>
              <p className="text-[15px] leading-[1.6] text-ink">{event.correctAction}</p>
            </>
          )}
        </div>
      ))}
    </li>
  );
}

/**
 * T83(§16.3.5, AC-071/AC-038) — 확인 시도 항목. **기존 P-13 주석 카드 형식 그대로**이며 신규
 * 컴포넌트·신규 색·신규 표기 형식이 없다.
 *
 * ⚠️ **P-25 톤**: 결과 상황 한 줄 → **유효 대처**(서버 상수) 순서다. 가로채기의 수단·작동 원리는
 * 여기서도 설명하지 않는다(AC-005 불변). 번호는 텍스트로만 나오고 재발신·복사 컨트롤이 없다.
 */
function ReplayVerifyItem({ verify }: { verify: ReplayVerifySource }) {
  return (
    <li className="outline-none">
      <div className="flex max-w-[85%] items-end gap-2">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-avatar-bg text-base text-avatar-fg"
        >
          ✆
        </div>
        <div>
          <p className="mb-1 ml-1 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-sub">
            {verify.deskLabel}
            <Badge variant="neutral">확인 시도</Badge>
            <span className="rounded-full bg-ai-tint px-2 py-0.5 text-[13px] font-semibold text-ai-ink">
              AI 훈련용 모의 창구
            </span>
          </p>
          {/* ⭐ T110(§22.3) — `displayNumber`는 **과거 리포트에만** 있다(무백필). 값이 있으면 그때
              실제로 본 그대로 보여주고(정직), 호 전환 모델의 신규 리포트에서는 이 줄이 아예 없다. */}
          <div className="rounded-[8px] rounded-bl-[4px] border border-line bg-white px-4 py-3">
            {/* ⭐⭐ §38.6 S2 — 종전에는 이 줄이 `displayNumber` 유무로만 갈라져 **참가자가 전환을
                요청한 적 없는 세션에서도** *"통화를 넘겼습니다"* 를 단언했다(기록 무결성 위반).
                판정은 `hasVerifyTransfer` 하나가 소유하고 화면은 새로 판정하지 않는다. */}
            <p className="text-[17px] leading-[1.55] text-ink">
              {verify.displayNumber !== undefined ? (
                <>
                  안내받은 번호: <span className="font-mono">{verify.displayNumber}</span>
                </>
              ) : hasVerifyTransfer(verify) ? (
                <>상대가 {verify.deskLabel}로 통화를 넘겼습니다.</>
              ) : (
                <>상대가 {verify.deskLabel}로 연결해 주겠다고 했습니다.</>
              )}
            </p>
          </div>
        </div>
      </div>

      {!verify.anchorResolved && (
        <p className="ml-10 mt-1.5 text-[15px] text-ink-sub" role="status">
          이 안내가 대화 중 어느 시점에 있었는지는 확인하지 못했습니다.
        </p>
      )}

      {verify.events.map((event) => (
        <div
          key={event.event}
          role="note"
          className="ml-10 mt-2 rounded-[8px] border border-caution/30 bg-caution-tint p-3.5"
        >
          <p className="mb-1.5 text-[15px] font-bold text-caution">⚠️ 여기가 신호였어요</p>
          <p className="text-[15px] leading-[1.6] text-ink">
            {(event.event === "verify_reconnected" ? verify.reconnectTimeLabel : verify.timeLabel)
              ? `${formatMomentLabel((event.event === "verify_reconnected" ? verify.reconnectTimeLabel : verify.timeLabel) ?? "")}: `
              : ""}
            {event.what}
          </p>
          {event.correctAction && (
            <>
              <div className="my-2.5 h-px bg-caution/20" />
              <p className="mb-1.5 text-[15px] font-bold text-brand">이렇게 하시면 됩니다</p>
              <p className="text-[15px] leading-[1.6] text-ink">{event.correctAction}</p>
            </>
          )}
        </div>
      ))}
    </li>
  );
}

/**
 * T84(§15.9.5 e-4, AC-072/AC-073) — 모의 화면 항목. **기존 P-13 주석 카드 형식 그대로**이며 신규
 * 컴포넌트·신규 색·신규 표기 형식이 없다.
 *
 * ⚠️ **중복 카드 금지(§15.9.5 e-4)**: `consented === true`면 같은 순간이 `deceivedMoments`에도
 * 있어 **바로 그 사기범 말풍선에 주석이 이미 달린다** — 여기서 교육 문구를 다시 내지 않는다.
 * ⚠️ **되감기 버튼을 달지 않는다** — 대상은 `deceivedMoments`뿐이고, 승격된 순간에는 원래대로
 * 그 말풍선에 달린다. 목업 재진입 컨트롤도 없다(스냅샷에 `fakeLandingId`가 아예 없다).
 *
 * ⭐ **D-61 / P-29 (8)** — 문구는 `consented` 한 필드로 이분하지 않는다. 폼을 **제출한** 참가자도
 * `consented:false`라(T123/AC-080은 `submittedAt`을 별도 축으로 신설했다) 그 값만 보고
 * *"응하지 않았습니다"* 를 그리면 **속은 참가자에게 거짓을 말한다**. 판정 규칙은 리포트(UX-008)와
 * 한 벌이며 `@/lib/report/mockScreenTimelineCopy`가 소유한다.
 */
function ReplayMockScreenItem({
  mockScreen,
  deceivedMoments,
}: {
  mockScreen: ReplayMockScreenSource;
  deceivedMoments: readonly ReplayDeceivedMomentSource[];
}) {
  const what =
    mockScreen.kind === "app-install"
      ? "앱 설치 안내 화면이 표시됐습니다."
      : "본인확인 입력 화면이 표시됐습니다.";
  // D-51 ③의 칭찬 문구는 **분기 "다"에서만** 나온다 — 살아 있되 제출 항목으로 새지 않는다.
  const copy = resolveMockScreenCopy(mockScreen, deceivedMoments, "replay");
  return (
    <li className="outline-none">
      <div className="flex max-w-[85%] items-end gap-2">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-avatar-bg text-base text-avatar-fg"
        >
          ▣
        </div>
        <div>
          <p className="mb-1 ml-1 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-sub">
            <Badge variant="neutral">모의 화면</Badge>
            <span className="rounded-full bg-ai-tint px-2 py-0.5 text-[13px] font-semibold text-ai-ink">
              AI 훈련용 모의 화면
            </span>
          </p>
          <div className="rounded-[8px] rounded-bl-[4px] border border-line bg-white px-4 py-3">
            <p className="text-[17px] leading-[1.55] text-ink">
              {mockScreen.timeLabel ? `${formatMomentLabel(mockScreen.timeLabel)}: ` : ""}
              {what}
            </p>
          </div>
        </div>
      </div>

      {!mockScreen.anchorResolved && (
        <p className="ml-10 mt-1.5 text-[15px] text-ink-sub" role="status">
          이 화면이 대화 중 어느 시점에 표시됐는지는 확인하지 못했습니다.
        </p>
      )}

      <div role="note" className="ml-10 mt-2 rounded-[8px] border border-caution/30 bg-caution-tint p-3.5">
        {copy.heading && (
          <p
            className={
              copy.tone === "praise"
                ? "mb-1.5 text-[15px] font-bold text-brand"
                : "mb-1.5 text-[15px] font-bold text-caution"
            }
          >
            {copy.heading}
          </p>
        )}
        <p className="text-[15px] leading-[1.6] text-ink">{copy.text}</p>
      </div>
    </li>
  );
}
