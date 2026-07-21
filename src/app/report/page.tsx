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
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateReport } from "@/lib/api";

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
};

type PageState = "no-session" | "loading" | "error" | "loaded";

export default function ReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const [state, setState] = useState<PageState>(sessionId ? "loading" : "no-session");
  const [report, setReport] = useState<ReportData | null>(null);

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
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>리포트를 찾을 세션 정보가 없습니다. 처음 화면으로 돌아가 다시 시작해 주세요.</span>
        </p>
        <button
          type="button"
          onClick={handleGoHome}
          className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
        >
          처음으로
        </button>
      </main>
    );
  }

  if (state === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="flex items-center gap-2 text-lg" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
          />
          취약점 리포트를 준비하는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "error" || !report) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>리포트 생성에 실패했습니다. 다시 시도해 주세요.</span>
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
        >
          다시 시도
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-bold">취약점 리포트</h1>

      {/* AC-009: 한 번도 속지 않은 경우 이를 명시하고, 시도된 수법만 나열한다. */}
      {!report.wasDeceived && (
        <p role="status" className="rounded bg-green-50 p-4 text-lg font-semibold text-green-800">
          이번 훈련에서는 속지 않았습니다. 아래는 시도된 수법입니다.
        </p>
      )}

      {/* AC-008/AC-026: 속은 시점 타임라인 — "N초 시점에 속았습니다" 형태로 텍스트로 명확히 표시.
          색만으로 위험도를 표기하지 않는다(UX.md Accessibility). */}
      {report.wasDeceived && (
        <section aria-label="속은 시점 타임라인" className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">속은 시점</h2>
          <ol className="flex flex-col gap-4">
            {report.deceivedMoments.map((moment) => (
              <li
                key={`${moment.turnIndex}-${moment.timeLabel}`}
                className="rounded border border-amber-300 bg-amber-50 p-4"
              >
                <p className="text-lg font-semibold text-amber-900">
                  <span aria-hidden="true">⚠ </span>
                  {moment.timeLabel}에 속았습니다
                </p>
                <p className="mt-2 text-base text-gray-800">
                  <span className="font-semibold">놓친 위험 신호: </span>
                  {moment.tactic}
                </p>
                <p className="mt-2 text-base text-gray-800">
                  <span className="font-semibold">이렇게 했어야 해요: </span>
                  {moment.correctAction}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* AC-008: 사용된 조작 수법 목록. */}
      <section aria-label="시도된 수법" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">시도된 수법</h2>
        {report.tacticsUsed.length > 0 ? (
          <ul className="list-disc pl-6 text-base text-gray-800">
            {report.tacticsUsed.map((tactic) => (
              <li key={tactic}>{tactic}</li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-gray-600">식별된 수법이 없습니다.</p>
        )}
      </section>

      {/* AC-008: 예방 조언 1개 이상. "개선 영역" 프레임 — "이제 면역됨" 류 과신 표현 금지(PRD Risk,
          UX.md Accessibility). */}
      <section aria-label="개선 영역과 예방 조언" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">개선 영역 &amp; 다음에 할 행동</h2>
        <ul className="list-disc pl-6 text-base leading-relaxed text-gray-800">
          {report.preventionAdvice.map((advice) => (
            <li key={advice}>{advice}</li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={handleGoHome}
        className="min-h-[56px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
      >
        처음으로
      </button>
    </main>
  );
}
