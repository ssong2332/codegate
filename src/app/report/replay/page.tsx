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
import {
  buildReplayTimeline,
  getAnnotatedTurnIndexes,
  type ReplayTimelineItem,
} from "@/lib/replay/buildReplayTimeline";

type ReportSummary = {
  wasDeceived: boolean;
  tacticsUsed: string[];
  createdAt: Timestamp | null;
};

type PageState = "no-session" | "loading" | "error" | "loaded";

export default function ReplayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const [state, setState] = useState<PageState>(sessionId ? "loading" : "no-session");
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [timeline, setTimeline] = useState<ReplayTimelineItem[]>([]);
  const [scenarioTitle, setScenarioTitle] = useState<string | null>(null);
  const [callerLabel, setCallerLabel] = useState<string>("상대방");
  // 스텝 내비게이션(P-13) — 주석이 달린 항목 중 현재 위치(-1=아직 이동 안 함).
  const [stepPos, setStepPos] = useState(-1);
  const [stepAnnounce, setStepAnnounce] = useState("");
  const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map());

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
      };
    });

    const deceivedMoments = Array.isArray(reportData.deceivedMoments)
      ? (reportData.deceivedMoments as ReplayTimelineItem["annotation"][]).filter(
          (m): m is NonNullable<typeof m> => m !== null,
        )
      : [];

    const scenarioId = sessionData.scenarioId as string | undefined;
    const scenario = scenarioId ? scenarios[scenarioId] : undefined;

    return {
      summary: {
        wasDeceived: Boolean(reportData.wasDeceived),
        tacticsUsed: Array.isArray(reportData.tacticsUsed) ? (reportData.tacticsUsed as string[]) : [],
        createdAt: reportData.createdAt instanceof Timestamp ? reportData.createdAt : null,
      } satisfies ReportSummary,
      timeline: buildReplayTimeline(messages, deceivedMoments),
      scenarioTitle: scenario?.title ?? null,
      callerLabel: scenario?.callerLabel ?? "상대방",
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
        setScenarioTitle(result.scenarioTitle);
        setCallerLabel(result.callerLabel);
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

  const annotatedTurnIndexes = getAnnotatedTurnIndexes(timeline);
  const hasMultipleChannels = new Set(timeline.map((item) => item.channel ?? "voice")).size > 1;

  const goToStep = (nextPos: number) => {
    if (nextPos < 0 || nextPos >= annotatedTurnIndexes.length) return;
    setStepPos(nextPos);
    const turnIndex = annotatedTurnIndexes[nextPos];
    const el = itemRefs.current.get(turnIndex);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
    const item = timeline.find((t) => t.turnIndex === turnIndex);
    if (item?.annotation) {
      setStepAnnounce(
        `${nextPos + 1}번째 신호 / 총 ${annotatedTurnIndexes.length}개. ${item.annotation.timeLabel}: ${item.annotation.tactic} 신호.`,
      );
    }
  };

  const handleRetry = () => {
    if (!sessionId) return;
    setState("loading");
    fetchReplay(sessionId)
      .then((result) => {
        setReport(result.summary);
        setTimeline(result.timeline);
        setScenarioTitle(result.scenarioTitle);
        setCallerLabel(result.callerLabel);
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
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>되짚어볼 대화를 찾을 세션 정보가 없습니다. 처음 화면으로 돌아가 다시 시작해 주세요.</span>
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
          대화 되짚어보기를 준비하는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "error" || !report) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>대화 되짚어보기를 불러오지 못했습니다. 다시 시도해 주세요.</span>
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

  const dateLabel = report.createdAt
    ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
        report.createdAt.toDate(),
      )
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col bg-[#FAF8F5] pb-8">
      <div className="px-5 pt-[22px]">
        <p className="text-sm font-semibold text-[#6B655C]">
          {[dateLabel, scenarioTitle].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1.5 text-[26px] font-bold leading-[1.35] text-[#22303A]">대화 되짚어보기</p>
        <p className="mt-1 text-base leading-relaxed text-[#4A5560]">
          대화를 처음부터 순서대로 다시 보며, 사기 신호가 있었던 지점을 확인해 보세요.
        </p>
      </div>

      {/* Empty(AC-009 정합): 한 번도 속지 않은 경우 그 사실을 명시하고 시도된 수법을 나열한다.
          "면역됨/이제 안전"류 과신 표현은 쓰지 않는다(PRD Risk, P-8 "개선 영역" 프레임). */}
      {!report.wasDeceived && (
        <div className="mx-5 mt-4 rounded-2xl border border-[#E2DDD3] bg-white p-[18px]">
          <p role="status" className="text-base font-semibold text-[#0E6B62]">
            이번 대화에서는 한 번도 속지 않았습니다.
          </p>
          <p className="mt-1.5 text-base leading-relaxed text-[#4A5560]">
            사기 수법은 계속 진화하므로, 오늘 시도된 수법을 다시 확인하고 대화 흐름 속에서 어떻게
            대응했는지 아래에서 되짚어 보세요. 이건 한 번에 끝나는 게 아니라 계속 유지해야 할 개선
            영역입니다.
          </p>
          {report.tacticsUsed.length > 0 && (
            <>
              <p className="mt-3 text-sm font-semibold text-[#22303A]">시도된 수법</p>
              <ul className="mt-1 list-disc pl-6 text-base text-[#22303A]">
                {report.tacticsUsed.map((tactic) => (
                  <li key={tactic}>{tactic}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* 스텝 내비게이션(P-13) — 신호로 점프 + 순차 스크롤 병행. 큰 터치 타겟. */}
      <div className="mx-5 mt-4 flex items-center justify-between gap-2 rounded-2xl border border-[#E2DDD3] bg-white px-4 py-3">
        {annotatedTurnIndexes.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => goToStep(stepPos - 1)}
              disabled={stepPos <= 0}
              className="min-h-[48px] min-w-[96px] rounded-xl border border-[#C9C2B6] px-4 text-base font-bold text-[#22303A] disabled:opacity-40"
            >
              ◂ 이전 신호
            </button>
            <p className="text-sm font-semibold text-[#4A5560]" aria-hidden="true">
              신호 {stepPos + 1 > 0 ? stepPos + 1 : "-"} / {annotatedTurnIndexes.length}
            </p>
            <button
              type="button"
              onClick={() => goToStep(stepPos + 1)}
              disabled={stepPos >= annotatedTurnIndexes.length - 1}
              className="min-h-[48px] min-w-[96px] rounded-xl border border-[#C9C2B6] px-4 text-base font-bold text-[#22303A] disabled:opacity-40"
            >
              다음 신호 ▸
            </button>
          </>
        ) : (
          // Failure(UX-018): 신호가 하나도 없으면 침묵하지 않고 명시한다.
          <p className="text-base text-[#4A5560]" role="status">
            이번 대화에서는 뚜렷한 위험 신호가 없었습니다.
          </p>
        )}
      </div>
      {/* aria-live: 스텝 이동 시 스크린리더에 현재 신호를 알린다(P-13). */}
      <p aria-live="polite" className="sr-only">
        {stepAnnounce}
      </p>

      {/* 대화 타임라인 — 스크린리더가 항상 대화 순서(DOM 순서)대로 읽는다. */}
      <ol className="mx-5 mt-4 flex flex-col gap-3">
        {timeline.map((item) => (
          <li
            key={item.id}
            ref={(el) => {
              if (el) itemRefs.current.set(item.turnIndex, el);
              else itemRefs.current.delete(item.turnIndex);
            }}
            tabIndex={-1}
            className={`flex flex-col gap-1 rounded-2xl border p-4 outline-none ${
              item.annotation ? "border-[#EFC7C3] bg-[#FDF1F0]" : "border-[#E2DDD3] bg-white"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#6B655C]">
                {item.role === "user" ? "나" : callerLabel}
              </span>
              {hasMultipleChannels && (
                <span className="rounded-full bg-[#EFEBE3] px-2 py-0.5 text-xs font-semibold text-[#6B655C]">
                  {(item.channel ?? "voice") === "messenger" ? "메신저" : "통화"}
                </span>
              )}
            </div>
            <p className="text-base leading-relaxed text-[#22303A]">{item.textMasked}</p>

            {/* 신호 주석 — 색만이 아니라 아이콘+텍스트로 이중 표기(P-13, Accessibility). */}
            {item.annotation && (
              <div role="note" className="mt-1.5 flex items-start gap-2 border-t border-[#EFC7C3] pt-2">
                <svg width="18" height="18" viewBox="0 0 16 16" className="mt-0.5 shrink-0" aria-hidden="true">
                  <path d="M8 1 L15 14 H1 Z" fill="#B96A1B" />
                </svg>
                <p className="text-sm leading-relaxed text-[#22303A]">
                  <span className="font-semibold text-[#C6392F]">
                    {item.annotation.timeLabel}: 이 말이 &apos;{item.annotation.tactic}&apos; 신호였습니다.
                  </span>{" "}
                  {item.annotation.correctAction}
                </p>
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="mx-5 mt-5 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={handleGoToReport}
          className="min-h-[52px] rounded-2xl border border-[#C9C2B6] px-6 py-3 text-lg font-semibold text-[#22303A] hover:bg-white"
        >
          요약 리포트로 돌아가기
        </button>
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
