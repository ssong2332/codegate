"use client";

// UX-008 취약점 리포트 (Track A, T9, AC-008/AC-009/AC-026)
//
// Entry: UX-007(session/end/page.tsx)의 "리포트 보기"가 `/report?sessionId=...`로 이동시킨다.
// generateReport 콜러블(functions/src/report/index.ts)을 이 화면에서 직접 호출한다 — endSession이
// 내부적으로 부르는 triggerReportGeneration은 실패를 조용히 흡수하므로(세션 종료 응답을 막지 않기
// 위해, functions/src/report/index.ts 참고), 리포트 생성이 실패했을 가능성까지 이 화면에서 다시
// 시도할 수 있어야 UX-008의 "Error: 리포트 생성 실패 → 재시도" 상태가 실제로 의미를 가진다.
// generateReportForSession은 멱등이라(reports/{sessionId} 존재 시 재계산 없이 그대로 반환) 여러 번
// 호출해도 안전하다.
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateReport } from "@/lib/api";
import {
  DIFFICULTY_LABEL,
  normalizeDifficultyLevel,
  type DifficultyLevel,
} from "@/lib/difficulty";
import { scenarios } from "@/content/scenarios";
import { Badge, Button } from "@/components/ui";
import { resolveRewindEntry } from "@/lib/rewind/rewindEntry";
import { buildStageNotice, type ReportStage } from "@/lib/report/stageNotice";
import { resolveMockScreenCopy } from "@/lib/report/mockScreenTimelineCopy";

type DeceivedMoment = {
  turnIndex: number;
  timeLabel: string;
  tactic: string;
  correctAction: string;
};

// T89(§15.1.5, AC-059) — 리포트 문서 안의 **표시 전용** 문자 이벤트 스냅샷. 서버가 이미 최종 표시
// 순서로 정렬해 내려주므로 화면은 순서를 재해석하지 않는다(§15.1.5 (6)).
type SmsTimelineEntry = {
  smsId: string;
  kind: "account" | "link" | "otp";
  senderLabel: string;
  body: string;
  linkDisplayText?: string;
  anchorTurnIndex: number;
  anchorResolved: boolean;
  timeLabel?: string;
  events: { event: string; what: string; correctAction?: string }[];
};

// T83(§16.3.1, AC-071) — 확인 시도 무력화의 **표시 전용** 스냅샷. 서버가 최종 표시 순서로 정렬해
// 내려주므로 화면은 순서를 재해석하지 않는다. `displayNumber`는 **텍스트로만** 렌더한다 — 링크·
// 복사 버튼·재발신 컨트롤을 만들지 않는다(사후 화면에 신규 상호작용 표면 0건, §16.3.1/AC-019).
type VerifyTimelineEntry = {
  offerId: string;
  deskLabel: string;
  /** ⭐ T110(§22.3) — 옵셔널. **신규 리포트에는 없다**(호 전환 모델). 과거 리포트만 값을 갖는다. */
  displayNumber?: string;
  anchorTurnIndex: number;
  anchorResolved: boolean;
  timeLabel?: string;
  reconnectTimeLabel?: string;
  outcome: "offered_not_placed" | "placed_not_complied" | "placed_and_complied";
  events: { event: string; what: string; correctAction?: string }[];
};

// T84(§15.9.5 e-4, AC-072/AC-073) — 모의 화면 상호작용의 **표시 전용** 스냅샷. 화면 콘텐츠 원문
// (headline/bodyLines/consentLabel)이 이 타입에 **없다** — 사후 화면이 목업을 재구성·재진입할 수
// 있게 되면 안 되기 때문이다(§15.6 G19 동형 취지).
type MockScreenTimelineEntry = {
  landingId: string;
  kind: "credential-form" | "app-install";
  anchorTurnIndex: number;
  anchorResolved: boolean;
  timeLabel?: string;
  /** true면 같은 순간이 `deceivedMoments`에도 있다 — 교육 문구는 그쪽이 전담한다(중복 카드 금지). */
  consented: boolean;
};

type ReportData = {
  reportId: string;
  wasDeceived: boolean;
  deceivedMoments: DeceivedMoment[];
  tacticsUsed: string[];
  preventionAdvice: string[];
  // 부재→빈 배열(무백필). 문자가 없던 세션·T89 이전 리포트는 기존과 완전히 동일하게 그려진다.
  smsTimeline: SmsTimelineEntry[];
  // 부재→빈 배열(무백필). D-51 ①/⑤(속은 순간 0건 + 확인 시도 있음)에서도 이 배열은 존재한다.
  verifyTimeline: VerifyTimelineEntry[];
  // T84 — 부재→빈 배열(무백필). `stages`는 **의도된 단계가 2개 이상일 때만** 서버가 만든다.
  mockScreenTimeline: MockScreenTimelineEntry[];
  stages: ReportStage[];
  // T72(P-22 / AC-064) — 리포트에 역정규화된 표기 전용 값. 난이도는 판정에 영향을 주지 않으며
  // (§15.3.5) 여기서도 "어떤 강도로 훈련했는가"를 알려주는 라벨로만 쓴다.
  difficultyLevel: DifficultyLevel;
  createdAt: Timestamp | null;
};

type PageState = "no-session" | "loading" | "error" | "loaded";

export default function ReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const [state, setState] = useState<PageState>(sessionId ? "loading" : "no-session");
  const [report, setReport] = useState<ReportData | null>(null);
  const [scenarioTitle, setScenarioTitle] = useState<string | null>(null);
  // T70(UX-028 진입점 조건) — 2인 챌린지 체험 세션이면 되감기는 강제 해설(UX-018) 이후 단계로만
  // 노출된다(AC-042). 아래 세션 조회 effect가 함께 채운다.
  const [isChallengeSession, setIsChallengeSession] = useState(false);
  const [expandedSection, setExpandedSection] = useState<
    "timeline" | "tactics" | "advice" | null
  >(null);

  // 네트워크 호출 자체는 setState를 하지 않는 순수 헬퍼로 분리하고(session/end/page.tsx와 동일
  // 패턴), 마운트 시 effect 안의 인라인 IIFE와 재시도 클릭 핸들러가 각자 결과에 따라 setState한다
  // (react-hooks/set-state-in-effect 규칙 — effect 안에서 이름 있는 함수를 통해 setState를
  // 호출하면 정적 분석이 "동기 setState"로 오탐하므로, effect 쪽은 인라인 IIFE로 둔다).
  const fetchReport = useCallback(async (sid: string): Promise<ReportData | null> => {
    const { reportId } = await generateReport({ sessionId: sid });
    const snapshot = await getDoc(doc(db, "reports", reportId));
    const data = snapshot.data();
    if (!data) return null;
    return {
      reportId,
      wasDeceived: Boolean(data.wasDeceived),
      deceivedMoments: Array.isArray(data.deceivedMoments) ? (data.deceivedMoments as DeceivedMoment[]) : [],
      tacticsUsed: Array.isArray(data.tacticsUsed) ? (data.tacticsUsed as string[]) : [],
      preventionAdvice: Array.isArray(data.preventionAdvice) ? (data.preventionAdvice as string[]) : [],
      smsTimeline: Array.isArray(data.smsTimeline) ? (data.smsTimeline as SmsTimelineEntry[]) : [],
      verifyTimeline: Array.isArray(data.verifyTimeline)
        ? (data.verifyTimeline as VerifyTimelineEntry[])
        : [],
      mockScreenTimeline: Array.isArray(data.mockScreenTimeline)
        ? (data.mockScreenTimeline as MockScreenTimelineEntry[])
        : [],
      stages: Array.isArray(data.stages) ? (data.stages as ReportStage[]) : [],
      difficultyLevel: normalizeDifficultyLevel(data.difficultyLevel),
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchReport(sessionId);
        if (cancelled) return;
        if (!data) {
          setState("error");
          return;
        }
        setReport(data);
        setState("loaded");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, fetchReport]);

  // 화면 상단 요약 카드에 쓸 시나리오 제목(장식용) — 조회 실패해도 리포트 본체와 무관하게
  // 조용히 생략한다(비차단, UX.md Interaction Pattern P-4와 동일 원칙).
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await getDoc(doc(db, "sessions", sessionId));
        const scenarioId = snapshot.data()?.scenarioId as string | undefined;
        const title = scenarioId ? scenarios[scenarioId]?.title : undefined;
        if (cancelled) return;
        if (title) setScenarioTitle(title);
        if (snapshot.data()?.challengeId) setIsChallengeSession(true);
      } catch {
        // 장식용 조회 실패는 무시 — 리포트 표시를 막지 않는다.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleRetry = () => {
    if (!sessionId) return;
    setState("loading");
    fetchReport(sessionId)
      .then((data) => {
        if (!data) {
          setState("error");
          return;
        }
        setReport(data);
        setState("loaded");
      })
      .catch(() => setState("error"));
  };

  const handleGoHome = () => {
    router.push("/");
  };

  if (state === "no-session") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>리포트를 찾을 세션 정보가 없습니다. 처음 화면으로 돌아가 다시 시작해 주세요.</span>
        </p>
        <button
          type="button"
          onClick={handleGoHome}
          className="min-h-[48px] rounded-xl border border-[#C9C2B6] px-6 py-3 text-lg font-bold text-[#22303A] hover:bg-white"
        >
          처음으로
        </button>
      </main>
    );
  }

  if (state === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p className="flex items-center gap-2 text-lg text-[#22303A]" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
          />
          취약점 리포트를 준비하는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "error" || !report) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>리포트 생성에 실패했습니다. 다시 시도해 주세요.</span>
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="min-h-[48px] rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white"
        >
          다시 시도
        </button>
      </main>
    );
  }

  // 화면 10(취약점 리포트) — claude.ai/design 옵션 탐색 1g "요약 우선 접이식"으로 교체(1i에서 변경,
  // 사용자 요청). 문서 자체가 1g를 "선택하신 밀도 방향"으로 표시해 둔 안이다. 상단 요약 카드 3항목
  // (개선 영역/잘 대처함/다음에 할 것) + 하단 아코디언 3개(타임라인/시도된 수법/대처법)로 구성한다.
  //
  // 데이터 근거(지어내지 않음): "잘 대처함" 항목은 리포트 스키마에 세부 저항 행동(mockup의 "목소리가
  // 이상하다며 되물었다" 같은 문장)이 없어 그 자리에 wasDeceived===false라는 실제로 검증된 사실만
  // 쓴다. "다음에 할 것"은 preventionAdvice[0]을 그대로 쓴다(없는 조언을 창작하지 않음).
  const firstDeceivedMoment = report.deceivedMoments[0] ?? null;
  const dateLabel = report.createdAt
    ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
        report.createdAt.toDate(),
      )
    : null;

  const toggleSection = (section: "timeline" | "tactics" | "advice") => {
    setExpandedSection((current) => (current === section ? null : section));
  };

  // T70(UX-028 즉시 되감기 진입점, AC-062/D-39/D-40) — 속은 순간이 1건 이상일 때만 노출한다.
  // 이 화면은 리포트가 이미 로드된 상태에서만 여기까지 오므로 reportStatus는 "ready"다.
  const rewindEntry = resolveRewindEntry({
    reportStatus: "ready",
    deceivedMomentCount: report.deceivedMoments.length,
    isChallengeSession,
    afterForcedReplay: false,
  });
  // T84 — 의도된 단계가 2개 미만이면 null이라 기존 단일 표면 리포트는 한 글자도 바뀌지 않는다.
  const stageNotice = buildStageNotice(report.stages);
  const goToRewind = (momentIndex: number) => {
    router.push(
      `/report/rewind?reportId=${encodeURIComponent(report.reportId)}&moment=${momentIndex}`,
    );
  };

  // T89(§15.1.5 (5), AC-059) — 속은 순간(키 `turnIndex`)과 문자 이벤트(키 `anchorTurnIndex`)를
  // **같은 키로 정렬해 한 목록**으로 낸다. 값이 같으면 문자를 뒤에 둔다(리플레이 병합 규칙과 동일).
  //
  // ⚠️ `momentIndex`는 **원본 `deceivedMoments` 배열의 인덱스**를 그대로 들고 다닌다 — 병합 목록의
  // 위치가 아니다. 되감기 딥링크(`/report/rewind?moment=`)가 그 인덱스로 순간을 찾으므로, 문자가
  // 섞인 순서를 넘기면 엉뚱한 순간이 열린다(리플레이 쪽 §15.6 G16과 같은 함정).
  const timelineEntries = [
    ...report.deceivedMoments.map((moment, momentIndex) => ({
      sortKey: [moment.turnIndex, 0, momentIndex] as const,
      kind: "moment" as const,
      moment,
      momentIndex,
    })),
    ...report.smsTimeline.map((sms, seq) => ({
      sortKey: [sms.anchorTurnIndex, 1, seq] as const,
      kind: "sms" as const,
      sms,
    })),
    // T83(§16.3.5) — 확인 항목은 같은 축에 kindRank 2로 얹는다(메시지 0 < 문자 1 < 확인 2).
    // ⚠️ 되감기 버튼을 달지 않는다 — 되감기 대상은 여전히 `deceivedMoments`뿐이다. 다만 **주석된
    // 순간**에는 원래대로 달리고(그 순간은 진짜 deceivedMoment다) 덮어쓴 correctAction을 쓴다.
    ...report.verifyTimeline.map((verify, seq) => ({
      sortKey: [verify.anchorTurnIndex, 2, seq] as const,
      kind: "verify" as const,
      verify,
    })),
    // T84 — 모의 화면 항목은 같은 축에 **kindRank 3**으로 얹는다(순간 0 < 문자 1 < 확인 2 < 모의
    // 화면 3). ⚠️ §15.9.5 e-2 (5)는 "kindRank 2"라고 적었지만 그 절은 T79(확인 항목)와 **병렬
    // 작성**돼 rank 2가 이미 쓰이는 것을 몰랐다 — 의도(메시지·문자 **뒤**에 온다)는 그대로 지키고
    // 번호만 3으로 내린다. 두 종류는 시나리오가 겹치지 않아 같은 앵커에서 만나지 않는다.
    // ⚠️ 되감기 버튼을 달지 않는다 — **응낙 순간에는 승격된 `deceivedMoments` 카드**에 원래대로
    // 달리고(그 순간이 진짜 속은 순간이다), 이 항목은 사실 1줄만 낸다(중복 카드 금지, e-4).
    ...report.mockScreenTimeline.map((mockScreen, seq) => ({
      sortKey: [mockScreen.anchorTurnIndex, 3, seq] as const,
      kind: "mockScreen" as const,
      mockScreen,
    })),
  ].sort(
    (a, b) =>
      a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || a.sortKey[2] - b.sortKey[2],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col bg-[#FAF8F5] pb-8">
      <div className="px-5 pt-[22px]">
        {/* T72(P-22) — 선택(UX-029)·세션 셸과 **같은 3단계 어휘**로 표기한다. 표기 전용이며
            아래 판정(속은 시점·수법·조언)은 난이도와 무관하게 같은 잣대로 산출됐다(§15.3.5). */}
        <p className="text-[13px] font-semibold text-[#6B655C]">
          {[dateLabel, scenarioTitle, `난이도 ${DIFFICULTY_LABEL[report.difficultyLevel]}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-1.5 text-[24px] font-bold leading-[1.35] text-[#22303A]">
          이번 훈련에서
          <br />
          확인된 것
        </p>
        {/* T84(§15.9.5 e-3, OQ-U24 판정) — 여러 표면으로 이어지는 세션의 **구조 고지 1줄**.
            ⚠️ 세션 중에는 단계 카운터를 두지 않는다(D-50) — 단계 구분은 **종료 후 리포트에서만**
            드러나며, 이 줄이 그 예외 안이다. 미도달 단계는 아래 타임라인에 **빈 항목으로 그리지
            않고**, 데이터(`stages`)에만 `reached:false`로 남는다. */}
        {stageNotice && (
          <p className="mt-2 text-base leading-relaxed text-[#6B655C]">{stageNotice}</p>
        )}
      </div>

      {/* AC-009: 한 번도 속지 않은 경우 이를 명시(요약 카드 상단, 색이 아닌 텍스트로). */}
      {!report.wasDeceived && (
        <p role="status" className="mx-5 mt-4 text-base font-semibold text-[#0E6B62]">
          이번 훈련에서는 속지 않았습니다. 아래는 시도된 수법입니다.
        </p>
      )}

      {/* 요약 카드 — 개선 영역 / 잘 대처함 / 다음에 할 것, 3항목. */}
      <div
        className={`mx-5 flex flex-col gap-3.5 rounded-2xl border border-[#E2DDD3] bg-white p-[18px] ${
          report.wasDeceived ? "mt-4" : "mt-3"
        }`}
      >
        {/* AC-008/AC-026: 속았다면 첫 순간을 요약에도 명시적으로("N초 시점" 텍스트) 반영. */}
        {report.wasDeceived && firstDeceivedMoment && (
          <>
            <div className="flex items-start gap-2.5">
              <svg width="20" height="20" viewBox="0 0 16 16" className="mt-0.5 shrink-0" aria-hidden="true">
                <path d="M8 1 L15 14 H1 Z" fill="#B96A1B" />
              </svg>
              <div>
                <p className="text-lg font-bold text-[#22303A]">
                  개선 영역 · {firstDeceivedMoment.tactic}
                </p>
                <p className="mt-0.5 text-base leading-relaxed text-[#6B655C]">
                  {firstDeceivedMoment.timeLabel}에 속았습니다. {firstDeceivedMoment.correctAction}
                </p>
              </div>
            </div>
            <div className="h-px bg-[#EFEBE3]" />
          </>
        )}

        <div className="flex items-start gap-2.5">
          {report.wasDeceived ? (
            <svg width="20" height="20" viewBox="0 0 16 16" className="mt-0.5 shrink-0" aria-hidden="true">
              <path d="M8 1 L15 14 H1 Z" fill="#B96A1B" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 16 16" className="mt-0.5 shrink-0" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="#0E6B62" />
            </svg>
          )}
          <div>
            <p className="text-lg font-bold text-[#22303A]">
              {report.wasDeceived ? "개선 영역 · 요구에 응함" : "잘 대처함 · 요구에 응하지 않음"}
            </p>
            <p className="mt-0.5 text-base leading-relaxed text-[#6B655C]">
              {report.wasDeceived
                ? "훈련 중 상대의 요구에 응한 순간이 있었습니다. 아래 타임라인에서 자세히 볼 수 있습니다."
                : "이번 훈련에서는 상대의 요구에 응하지 않았습니다."}
            </p>
          </div>
        </div>
        <div className="h-px bg-[#EFEBE3]" />

        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-[#0E6B62] text-xs font-extrabold text-white"
          >
            ✓
          </span>
          <div>
            <p className="text-lg font-bold text-[#22303A]">다음에 해볼 것</p>
            <p className="mt-0.5 text-base leading-relaxed text-[#6B655C]">
              {report.preventionAdvice[0] ?? "다음에는 상대의 신원을 먼저 확인해 보세요."}
            </p>
          </div>
        </div>
      </div>

      {/* 아코디언 3종 — 타임라인/시도된 수법/대처법을 접어서 밀도를 낮춘다. */}
      <div className="mx-5 mt-3.5 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => toggleSection("timeline")}
          aria-expanded={expandedSection === "timeline"}
          className="flex min-h-[56px] items-center justify-between rounded-2xl border border-[#E2DDD3] bg-white px-[18px] text-lg font-semibold text-[#22303A]"
        >
          속은 시점 타임라인 보기
          <span aria-hidden="true" className="text-[#6B655C]">
            {expandedSection === "timeline" ? "▴" : "▾"}
          </span>
        </button>
        {expandedSection === "timeline" && (
          <section aria-label="속은 시점 타임라인" className="flex flex-col gap-3 px-1">
            {/* ⚠️ §15.6 G18 — 이 조건을 `report.wasDeceived`로 두면 **안 속은 세션의 문자 이벤트가
                통째로 사라진다**(AC-059 미충족). 속은 순간이 0건이어도 문자 이벤트가 있으면 목록을
                낸다. 판정은 그대로다 — 문자는 wasDeceived를 뒤집지 않는다(§15.6 G22). */}
            {report.deceivedMoments.length === 0 && (
              <p className="rounded-2xl border border-[#E2DDD3] bg-white p-4 text-base text-[#6B655C]">
                속은 시점이 없습니다 — 이번 훈련에서는 한 번도 속지 않았습니다.
                {report.smsTimeline.length > 0 &&
                  " 아래는 훈련 중 도착한 문자에서 있었던 일입니다."}
                {/* T83(§16.6 G30) — 속은 순간 0건 + 확인 시도 있음(D-51 ①/⑤)에서 이 안내가 없으면
                    항목이 왜 있는지 설명되지 않는다. 판정은 그대로다(확인 시도는 wasDeceived를
                    뒤집지 않는다 — 걸었지만 응하지 않은 것은 **잘 대응한 지점**이다, D-51 ⑤). */}
                {report.verifyTimeline.length > 0 &&
                  " 아래는 훈련 중 있었던 확인 시도입니다."}
                {/* T84(G18 동류) — 설치 화면을 열었다가 **응하지 않고 닫은** 세션(D-51 ③)이 정확히
                    이 상태다. 여기서 안내하지 않으면 항목이 왜 있는지 설명되지 않는다. 판정은
                    그대로다 — 화면이 뜬 것만으로는 속은 순간이 아니다(AC-062 보호). */}
                {report.mockScreenTimeline.length > 0 &&
                  " 아래는 훈련 중 표시된 모의 화면입니다."}
              </p>
            )}
            {timelineEntries.length > 0 && (
              <ol className="flex flex-col gap-3">
                {timelineEntries.map((entry) =>
                  entry.kind === "moment" ? (
                    <li
                      key={`moment-${entry.moment.turnIndex}-${entry.moment.timeLabel}`}
                      className="rounded-2xl border border-[#B96A1B]/30 bg-[#FBF3E8] p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-[#B96A1B]">
                          <span aria-hidden="true">⚠ </span>
                          {entry.moment.timeLabel}에 속았습니다
                        </p>
                        <Badge variant="caution">{entry.moment.tactic}</Badge>
                      </div>
                      <p className="mt-2 text-base text-[#22303A]">
                        <span className="font-semibold">이렇게 했어야 해요: </span>
                        {entry.moment.correctAction}
                      </p>
                      {/* UX-008 v1.11 — 타임라인 항목마다 "이 순간"을 직접 지목해 되감을 수 있게 한다
                          (UX.md UX-008 갱신 문면, D-39). */}
                      {rewindEntry === "available" && (
                        <button
                          type="button"
                          onClick={() => goToRewind(entry.momentIndex)}
                          className="mt-3 min-h-[48px] w-full rounded-xl border border-[#0E6B62] bg-white px-4 text-base font-semibold text-[#0E6B62]"
                        >
                          이 순간 다시 해보기
                        </button>
                      )}
                    </li>
                  ) : entry.kind === "sms" ? (
                    <ReportSmsTimelineItem key={`sms-${entry.sms.smsId}`} sms={entry.sms} />
                  ) : entry.kind === "verify" ? (
                    // ⭐ §38.6 S3 — 한 문서가 오퍼 항목 + 전환 항목으로 갈라지므로 `offerId`만으로는
                    // key가 중복된다. 정렬 키의 seq(= 서버가 준 배열 순서)를 붙여 유일하게 만든다.
                    <ReportVerifyTimelineItem
                      key={`verify-${entry.verify.offerId}-${entry.sortKey[2]}`}
                      verify={entry.verify}
                    />
                  ) : (
                    <ReportMockScreenTimelineItem
                      key={`mock-${entry.mockScreen.landingId}`}
                      mockScreen={entry.mockScreen}
                      deceivedMoments={report.deceivedMoments}
                    />
                  ),
                )}
              </ol>
            )}
          </section>
        )}

        <button
          type="button"
          onClick={() => toggleSection("tactics")}
          aria-expanded={expandedSection === "tactics"}
          className="flex min-h-[56px] items-center justify-between rounded-2xl border border-[#E2DDD3] bg-white px-[18px] text-lg font-semibold text-[#22303A]"
        >
          시도된 수법 {report.tacticsUsed.length}가지
          <span aria-hidden="true" className="text-[#6B655C]">
            {expandedSection === "tactics" ? "▴" : "▾"}
          </span>
        </button>
        {expandedSection === "tactics" && (
          <section aria-label="시도된 수법" className="px-1">
            {report.tacticsUsed.length > 0 ? (
              <div className="flex flex-wrap gap-2 rounded-2xl border border-[#E2DDD3] bg-white p-4">
                {report.tacticsUsed.map((tactic) => (
                  <Badge key={tactic} variant="neutral">
                    {tactic}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-[#E2DDD3] bg-white p-4 text-base text-[#6B655C]">
                식별된 수법이 없습니다.
              </p>
            )}
          </section>
        )}

        <button
          type="button"
          onClick={() => toggleSection("advice")}
          aria-expanded={expandedSection === "advice"}
          className="flex min-h-[56px] items-center justify-between rounded-2xl border border-[#E2DDD3] bg-white px-[18px] text-lg font-semibold text-[#22303A]"
        >
          상황별 대처법
          <span aria-hidden="true" className="text-[#6B655C]">
            {expandedSection === "advice" ? "▴" : "▾"}
          </span>
        </button>
        {expandedSection === "advice" && (
          <section aria-label="개선 영역과 예방 조언" className="flex flex-col gap-2 px-1">
            {report.preventionAdvice.map((advice) => (
              <div
                key={advice}
                className="flex items-start gap-2.5 rounded-xl border border-[#E2DDD3] bg-white p-4"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" className="mt-0.5 shrink-0" aria-hidden="true">
                  <path d="M8 1 L15 14 H1 Z" fill="#B96A1B" />
                </svg>
                <p className="text-base leading-relaxed text-[#6B655C]">{advice}</p>
              </div>
            ))}
          </section>
        )}
      </div>

      <div className="mx-5 mt-4 flex flex-col gap-2.5">
        {/* UX-028(즉시 되감기) 진입점 — 속은 순간이 1건 이상일 때만 노출한다(D-40: 안 속았으면
            띄우지 않고 리플레이 해설만 권한다). 2인 사용자2는 강제 해설 이후 화면에서만 보인다
            (AC-042, resolveRewindEntry). */}
        {rewindEntry === "available" && (
          <Button type="button" variant="primary" onClick={() => goToRewind(0)}>
            그 순간 다시 해보기
          </Button>
        )}
        {/* UX-018(리플레이 해설) 진입점 — UX.md UX-008 Primary Actions "대화 되짚어보기(리플레이
            해설)" → UX-018(T33, AC-038). 요약(무엇을·언제)과 별도 화면(D-18)이라 링크만 연결한다. */}
        {sessionId && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(`/report/replay?sessionId=${encodeURIComponent(sessionId)}`)}
          >
            대화 되짚어보기(리플레이 해설)
          </Button>
        )}
        {/* UX-030(실패 아카이브) 진입점 — UX.md UX-008 v1.11 갱신(D-44). 이번 세션이 아니라
            **누적된 과거 전체**의 속은 순간을 보는 동선이라, 이번 세션에서 안 속았어도 노출한다
            (그 경우 아카이브가 빈 상태 2종으로 스스로 구분해 안내한다, AC-068). */}
        <Button type="button" variant="secondary" onClick={() => router.push("/report/archive")}>
          내가 속았던 순간 모아보기
        </Button>
        <Button type="button" variant="primary" onClick={() => router.push("/scenarios")}>
          다른 시나리오 훈련하기
        </Button>
        {/* mockup의 "가족에게 리포트 공유"는 이 빌드 스코프에 없는 기능(OQ-15 미확정 — 자녀의 부모
            리포트 열람은 open, PRD "발표 내러티브 강조는 확정했으나 빌드 스코프는 별개") — 실제로
            동작하지 않는 버튼을 두는 대신, 이미 구현·검증된 히스토리 화면(T15)으로 대체했다. */}
        <Button type="button" variant="secondary" onClick={() => router.push("/history")}>
          히스토리 보기
        </Button>
        <button
          type="button"
          onClick={handleGoHome}
          className="min-h-[48px] rounded-2xl px-6 py-3 text-base font-semibold text-[#6B655C]"
        >
          처음으로
        </button>
      </div>
    </main>
  );
}

/**
 * T89(§15.1.5 (5)) — 타임라인 아코디언 안의 문자 이벤트 항목.
 *
 * **기존 "속은 순간" 카드와 같은 형식**(시각 라벨 + 배지 + "이렇게 했어야 해요:" 줄)을 그대로 쓰고
 * 문구만 바꾼다. 신규 컴포넌트 스타일·신규 색·신규 표기 형식은 만들지 않는다(UX-008 v1.11
 * "신규 표기 형식 없음"). 이벤트 1건 = 카드 1장이므로 여러 이벤트는 같은 li 안에 이어 그린다.
 *
 * ⚠️ **되감기 버튼을 달지 않는다** — 되감기 대상은 `deceivedMoments`이고, 문자 순간에는 판정이
 * 전제하는 "그 순간의 사기범 대사"가 없다(§15.1.5 (5) 근거 4). 링크도 컨트롤로 렌더하지 않는다
 * (스냅샷에 `fakeLandingId`가 아예 없어 재진입 경로가 구조적으로 존재하지 않는다, §15.6 G19).
 */
function ReportSmsTimelineItem({ sms }: { sms: SmsTimelineEntry }) {
  return (
    <li className="flex flex-col gap-3">
      {sms.events.map((event) => (
        <div
          key={event.event}
          className="rounded-2xl border border-[#B96A1B]/30 bg-[#FBF3E8] p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-[#B96A1B]">
              <span aria-hidden="true">⚠ </span>
              {sms.timeLabel ? `${sms.timeLabel}: ` : ""}
              {event.what}
            </p>
            <Badge variant="neutral">문자</Badge>
          </div>
          {/* 도착한 문자 원문 — 어떤 문자였는지 확인할 수 있어야 학습이 성립한다(모의 표식 유지). */}
          {event.event === "sms_received" && (
            <p className="mt-2 whitespace-pre-line rounded-xl bg-white/70 p-3 text-base text-[#22303A]">
              {sms.body}
              {sms.linkDisplayText && (
                <span className="mt-1 block text-sm text-[#6B655C]">
                  문자 속 링크 표기: {sms.linkDisplayText}
                </span>
              )}
            </p>
          )}
          {event.correctAction && (
            <p className="mt-2 text-base text-[#22303A]">
              <span className="font-semibold">이렇게 했어야 해요: </span>
              {event.correctAction}
            </p>
          )}
          {/* 앵커 미해결(§15.1.5 (4) 규칙 3) — 조용히 버리지 않고 정직하게 고지한다(P-4). */}
          {!sms.anchorResolved && event.event === "sms_received" && (
            <p className="mt-2 text-sm text-[#6B655C]">
              이 문자가 대화 중 어느 시점에 도착했는지는 확인하지 못했습니다.
            </p>
          )}
        </div>
      ))}
    </li>
  );
}

/**
 * T83(§16.3.5, AC-071) — 확인 시도 항목. **기존 문자 항목과 같은 카드 형식**을 쓴다(신규 표기
 * 형식·신규 컴포넌트 0건, UX-008 v1.12 노트).
 *
 * ⚠️ **P-25 톤(무력감 방지)**: `correctAction`(유효 대처)이 **먼저·크게**, 결과 상황 서술은 그
 * 위 한 줄, 구조 설명은 하지 않는다. "소용없다"·"막을 수 없다"류 표현이 이 화면 어디에도 없다 —
 * 문구는 전부 서버 상수에서 오고 금지 표현 테스트가 그것을 고정한다.
 * ⚠️ **되감기 버튼을 달지 않는다** — 되감기 대상은 `deceivedMoments`뿐이다. 확인 시도 자체는
 * 순간이 아니며(D-51 ①/⑤는 속은 순간이 아니다), 응낙 순간에는 **주석된 순간 카드**에 원래대로
 * 버튼이 달린다.
 * ⚠️ `displayNumber`는 **텍스트로만** 렌더한다 — 링크·복사·재발신 컨트롤을 만들지 않는다(AC-019).
 */
/**
 * T84(§15.9.5 e-4, AC-072/AC-073) — 모의 화면 항목. **기존 문자·확인 항목과 같은 카드 형식**을
 * 쓴다(신규 표기 형식·신규 컴포넌트 스타일 0건).
 *
 * ⚠️ **중복 카드 금지 규칙(§15.9.5 e-4)**: `consented === true`인 항목은 같은 순간이
 * `deceivedMoments`에도 있으므로 **교육 문구(`correctAction`)를 여기서 다시 내지 않는다** —
 * 그쪽 카드가 전담하고 여기서는 "설치 안내 화면이 표시됐습니다" 수준의 사실 1줄만 낸다.
 * ⚠️ **되감기 버튼을 달지 않는다** — 되감기 대상은 `deceivedMoments`이고, 응낙 순간에는 승격된
 * 그 카드에 원래대로 버튼이 달린다.
 * ⚠️ 화면 콘텐츠 원문(headline/bodyLines/consentLabel)·목업 재진입 컨트롤이 **스냅샷에 아예
 * 없어서** 여기서 그릴 수도 없다(구조적 금지, §15.6 G19 동형).
 *
 * ⭐ **D-61 / P-29 (8)** — 문구는 `consented` 한 필드로 이분하지 않는다. 제출은 했는데
 * `consented:false`인 항목이 실제로 생기므로(T123/AC-080), 그 값 하나로 *"응하지 않았습니다"* 를
 * 그리면 **속은 참가자에게 리포트가 거짓을 말한다** — 위쪽의 승격된 속은 시점 카드와 정면으로
 * 모순된다. 판정은 `deceivedMoments`와의 대조로만 하고 그 규칙은
 * `@/lib/report/mockScreenTimelineCopy`가 리플레이(UX-018)와 **공유**한다.
 */
function ReportMockScreenTimelineItem({
  mockScreen,
  deceivedMoments,
}: {
  mockScreen: MockScreenTimelineEntry;
  deceivedMoments: readonly DeceivedMoment[];
}) {
  const what =
    mockScreen.kind === "app-install"
      ? "앱 설치 안내 화면이 표시됐습니다."
      : "본인확인 입력 화면이 표시됐습니다.";
  // D-51 ③의 칭찬 문구는 **분기 "다"에서만** 나온다 — 살아 있되 제출 항목으로 새지 않는다.
  const copy = resolveMockScreenCopy(mockScreen, deceivedMoments, "report");
  return (
    <li className="flex flex-col gap-3">
      <div className="rounded-2xl border border-[#B96A1B]/30 bg-[#FBF3E8] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold text-[#B96A1B]">
            <span aria-hidden="true">⚠ </span>
            {mockScreen.timeLabel ? `${mockScreen.timeLabel}: ` : ""}
            {what}
          </p>
          <Badge variant="neutral">모의 화면</Badge>
        </div>
        <p
          className={
            copy.tone === "praise"
              ? "mt-2 text-base font-semibold text-[#0E6B62]"
              : "mt-2 text-base text-[#22303A]"
          }
        >
          {copy.text}
        </p>
        {!mockScreen.anchorResolved && (
          <p className="mt-2 text-sm text-[#6B655C]">
            이 화면이 대화 중 어느 시점에 표시됐는지는 확인하지 못했습니다.
          </p>
        )}
      </div>
    </li>
  );
}

function ReportVerifyTimelineItem({ verify }: { verify: VerifyTimelineEntry }) {
  return (
    <li className="flex flex-col gap-3">
      {verify.events.map((event) => (
        <div key={event.event} className="rounded-2xl border border-[#B96A1B]/30 bg-[#FBF3E8] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-[#B96A1B]">
              <span aria-hidden="true">⚠ </span>
              {(event.event === "verify_reconnected"
                ? verify.reconnectTimeLabel
                : verify.timeLabel)
                ? `${event.event === "verify_reconnected" ? verify.reconnectTimeLabel : verify.timeLabel}: `
                : ""}
              {event.what}
            </p>
            <Badge variant="neutral">확인 시도</Badge>
          </div>
          {/* D-51 ⑤ — 걸었지만 응하지 않은 세션은 **잘 대응한 지점**으로 다룬다(AC-009/AC-038).
              과신 표현("이제 면역")은 쓰지 않고, 아래 유효 대처를 그대로 함께 제시한다. */}
          {event.event === "verify_reconnected" && verify.outcome === "placed_not_complied" && (
            <p className="mt-2 text-base font-semibold text-[#0E6B62]">
              잘 대응한 지점입니다 — 확인 뒤에도 요구에 응하지 않았습니다.
            </p>
          )}
          {event.correctAction && (
            <p className="mt-2 text-base text-[#22303A]">
              <span className="font-semibold">이렇게 하시면 됩니다: </span>
              {event.correctAction}
            </p>
          )}
          {/* ⭐ §38.6 S3 — 항목이 갈라진 뒤로 `anchorResolved`는 **그 항목 자신의** 앵커를 뜻한다
              (오퍼 항목 = 오퍼 앵커 / 전환 항목 = 재연결 앵커). 종전의 `verify_offer_shown` 한정은
              두 이벤트가 한 항목에 있던 시절의 조건이었고, 그대로 두면 **전환 항목의 미해결이 조용히
              누락**된다(P-4 "조용히 버리지 않는다"). 과거 리포트(이벤트 2건 한 항목)에서는 두 카드에
              같은 고지가 붙는데, 그 항목의 `anchorResolved`가 실제로 둘 다에 적용되므로 맞다. */}
          {!verify.anchorResolved && (
            <p className="mt-2 text-sm text-[#6B655C]">
              이 안내가 대화 중 어느 시점에 있었는지는 확인하지 못했습니다.
            </p>
          )}
        </div>
      ))}
    </li>
  );
}
