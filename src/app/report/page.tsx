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
import { scenarios } from "@/content/scenarios";

type DeceivedMoment = {
  turnIndex: number;
  timeLabel: string;
  tactic: string;
  correctAction: string;
};

type ReportData = {
  wasDeceived: boolean;
  deceivedMoments: DeceivedMoment[];
  tacticsUsed: string[];
  preventionAdvice: string[];
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
      wasDeceived: Boolean(data.wasDeceived),
      deceivedMoments: Array.isArray(data.deceivedMoments) ? (data.deceivedMoments as DeceivedMoment[]) : [],
      tacticsUsed: Array.isArray(data.tacticsUsed) ? (data.tacticsUsed as string[]) : [],
      preventionAdvice: Array.isArray(data.preventionAdvice) ? (data.preventionAdvice as string[]) : [],
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
        if (!cancelled && title) setScenarioTitle(title);
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

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col bg-[#FAF8F5] pb-8">
      <div className="px-5 pt-[22px]">
        <p className="text-sm font-semibold text-[#6B655C]">
          {[dateLabel, scenarioTitle].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1.5 text-[26px] font-bold leading-[1.35] text-[#22303A]">
          이번 훈련에서
          <br />
          확인된 것
        </p>
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
                <p className="mt-0.5 text-base leading-relaxed text-[#4A5560]">
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
            <p className="mt-0.5 text-base leading-relaxed text-[#4A5560]">
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
            <p className="mt-0.5 text-base leading-relaxed text-[#4A5560]">
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
          <span aria-hidden="true" className="text-[#8A8378]">
            {expandedSection === "timeline" ? "▴" : "▾"}
          </span>
        </button>
        {expandedSection === "timeline" && (
          <section aria-label="속은 시점 타임라인" className="flex flex-col gap-3 px-1">
            {report.wasDeceived ? (
              <ol className="flex flex-col gap-3">
                {report.deceivedMoments.map((moment) => (
                  <li
                    key={`${moment.turnIndex}-${moment.timeLabel}`}
                    className="rounded-2xl border border-[#EFC7C3] bg-[#FDF1F0] p-4"
                  >
                    <p className="text-lg font-semibold text-[#C6392F]">
                      <span aria-hidden="true">⚠ </span>
                      {moment.timeLabel}에 속았습니다
                    </p>
                    <p className="mt-2 text-base text-[#22303A]">
                      <span className="font-semibold">놓친 위험 신호: </span>
                      {moment.tactic}
                    </p>
                    <p className="mt-2 text-base text-[#22303A]">
                      <span className="font-semibold">이렇게 했어야 해요: </span>
                      {moment.correctAction}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-2xl border border-[#E2DDD3] bg-white p-4 text-base text-[#4A5560]">
                속은 시점이 없습니다 — 이번 훈련에서는 한 번도 속지 않았습니다.
              </p>
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
          <span aria-hidden="true" className="text-[#8A8378]">
            {expandedSection === "tactics" ? "▴" : "▾"}
          </span>
        </button>
        {expandedSection === "tactics" && (
          <section aria-label="시도된 수법" className="px-1">
            {report.tacticsUsed.length > 0 ? (
              <ul className="list-disc rounded-2xl border border-[#E2DDD3] bg-white p-4 pl-8 text-base text-[#22303A]">
                {report.tacticsUsed.map((tactic) => (
                  <li key={tactic}>{tactic}</li>
                ))}
              </ul>
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
          <span aria-hidden="true" className="text-[#8A8378]">
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
                <p className="text-base leading-relaxed text-[#4A5560]">{advice}</p>
              </div>
            ))}
          </section>
        )}
      </div>

      <div className="mx-5 mt-4 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => router.push("/scenarios")}
          className="min-h-[56px] rounded-2xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white"
        >
          다른 시나리오 훈련하기
        </button>
        {/* mockup의 "가족에게 리포트 공유"는 이 빌드 스코프에 없는 기능(OQ-15 미확정 — 자녀의 부모
            리포트 열람은 open, PRD "발표 내러티브 강조는 확정했으나 빌드 스코프는 별개") — 실제로
            동작하지 않는 버튼을 두는 대신, 이미 구현·검증된 히스토리 화면(T15)으로 대체했다. */}
        <button
          type="button"
          onClick={() => router.push("/history")}
          className="min-h-[52px] rounded-2xl border border-[#C9C2B6] px-6 py-3 text-lg font-semibold text-[#4A5560]"
        >
          히스토리 보기
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
