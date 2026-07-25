"use client";

// UX-028 즉시 되감기 — 그 순간 다시 답해보기 (T70, UF-009, AC-062/AC-063)
//
// Entry: UX-007(session/end) · UX-008(report) · UX-018(report/replay)의 "그 순간 다시 해보기"가
// `/report/rewind?reportId=...&moment=N`으로 이동시킨다. 진입점 노출 규칙은 화면마다 다시 쓰지 않고
// `resolveRewindEntry`(src/lib/rewind/rewindEntry.ts) 하나를 공유한다(D-39/D-40, AC-042).
//
// ⚠️ 이 화면은 통화가 아니다(ADR-0008) — 원 세션을 재개하지 않고, 사기범 대사가 이어지지 않으며,
// 원 리포트를 읽기 전용으로만 참조한다. 사용자가 다시 답한 문장은 `judgeRewindAnswer` 콜러블이
// 판정하고 `reports/{rid}/rewindAttempts`에만 append된다(AC-007 불변식은 서버가 구조적으로 보장).
// 표시되는 대화는 저장 시점에 이미 마스킹된 텍스트뿐이다(AC-024).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { judgeRewindAnswer } from "@/lib/api";
import type { JudgeRewindAnswerResponse, RewindVerdict } from "@/lib/api";
import { scenarios } from "@/content/scenarios";
import { Badge, Button } from "@/components/ui";
import {
  buildRewindContext,
  type RewindMessageSource,
  type RewindMomentSource,
} from "@/lib/rewind/buildRewindContext";

// API.md judgeRewindAnswer Request "answerText ≤500자" — 서버가 invalid-argument로 거부하기 전에
// 입력 단계에서 먼저 막는다(P-5 "실패를 미리 막는다"). 서버 상수와 값이 갈라지면 사용자가 서버
// 에러를 먼저 보게 되므로 같은 값을 유지한다(functions/src/rewind/judge.ts).
const ANSWER_MAX_LENGTH = 500;

// 3단계 판정 라벨(고정 매핑, Architecture.md §15.2.3). 색이 아니라 텍스트+아이콘으로 표기한다
// (UX-028 Accessibility — 색 단독 금지).
const VERDICT_LABEL: Record<RewindVerdict, { text: string; icon: string; tone: string }> = {
  good: { text: "잘 대응했습니다", icon: "✓", tone: "text-[#0E6B62]" },
  risky: { text: "아직 위험합니다", icon: "⚠", tone: "text-[#B96A1B]" },
  unclear: { text: "판단하기 어렵습니다", icon: "?", tone: "text-[#6B655C]" },
};

type ReportContext = {
  reportId: string;
  sessionId: string;
  moments: RewindMomentSource[];
  messages: RewindMessageSource[];
  scenarioTitle: string | null;
  callerLabel: string;
};

type PageState = "no-report" | "loading" | "error" | "loaded";
type AnswerState = "idle" | "judging" | "judged" | "judge-failed";

export default function RewindPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportId = searchParams.get("reportId");
  const momentParam = Number(searchParams.get("moment") ?? "0");

  const [state, setState] = useState<PageState>(reportId ? "loading" : "no-report");
  const [context, setContext] = useState<ReportContext | null>(null);
  const [momentIndex, setMomentIndex] = useState(Number.isInteger(momentParam) && momentParam > 0 ? momentParam : 0);
  const [answer, setAnswer] = useState("");
  const [answerState, setAnswerState] = useState<AnswerState>("idle");
  const [judgement, setJudgement] = useState<JudgeRewindAnswerResponse | null>(null);
  const [modelAnswerShown, setModelAnswerShown] = useState(false);
  const [expandedContext, setExpandedContext] = useState(false);
  const answerLabelRef = useRef<HTMLLabelElement>(null);

  // 네트워크 호출은 setState를 하지 않는 순수 헬퍼로 분리한다(report/page.tsx·replay/page.tsx와
  // 동일한 react-hooks/set-state-in-effect 회피 관례).
  const fetchContext = useCallback(async (rid: string): Promise<ReportContext> => {
    const reportSnap = await getDoc(doc(db, "reports", rid));
    const reportData = reportSnap.data();
    if (!reportData) throw new Error("report-not-found");

    const sessionId = (reportData.sessionId as string | undefined) ?? rid;
    const moments = Array.isArray(reportData.deceivedMoments)
      ? (reportData.deceivedMoments as RewindMomentSource[])
      : [];

    const messagesSnap = await getDocs(
      query(collection(db, "sessions", sessionId, "messages"), orderBy("turnIndex", "asc")),
    );
    const messages: RewindMessageSource[] = messagesSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        role: data.role as "scammer" | "user",
        textMasked: data.textMasked as string,
        turnIndex: data.turnIndex as number,
      };
    });

    // 시나리오 제목·발신자 라벨은 장식용이라 조회 실패해도 드릴 자체를 막지 않는다(비차단, P-4).
    let scenarioTitle: string | null = null;
    let callerLabel = "상대방";
    try {
      const sessionSnap = await getDoc(doc(db, "sessions", sessionId));
      const scenarioId = sessionSnap.data()?.scenarioId as string | undefined;
      const scenario = scenarioId ? scenarios[scenarioId] : undefined;
      scenarioTitle = scenario?.title ?? null;
      callerLabel = scenario?.callerLabel ?? "상대방";
    } catch {
      // 무시 — 되감기 본체와 무관하다.
    }

    return { reportId: rid, sessionId, moments, messages, scenarioTitle, callerLabel };
  }, []);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchContext(reportId);
        if (cancelled) return;
        setContext(result);
        // 쿼리로 들어온 순간 인덱스가 범위를 벗어나면 첫 순간으로 되돌린다(직접 URL 진입 대비).
        // 순간이 아예 0건이면 아래 Empty 상태가 담당한다(D-40).
        setMomentIndex((current) => (current < result.moments.length ? current : 0));
        setState("loaded");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, fetchContext]);

  // UX-028 Focus Order — 진입 시 포커스는 "다시 답해보기" 입력 라벨로.
  useEffect(() => {
    if (state === "loaded") answerLabelRef.current?.focus();
  }, [state]);

  const moment = context?.moments[momentIndex] ?? null;
  const rewindContext = useMemo(
    () =>
      context && moment
        ? buildRewindContext(context.messages, moment, { before: expandedContext ? 6 : 2, after: 1 })
        : null,
    [context, moment, expandedContext],
  );

  const handleRetryLoad = () => {
    if (!reportId) return;
    setState("loading");
    fetchContext(reportId)
      .then((result) => {
        setContext(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  };

  const resetAnswer = () => {
    setAnswer("");
    setAnswerState("idle");
    setJudgement(null);
    setModelAnswerShown(false);
  };

  const handleSubmit = async () => {
    if (!reportId || !answer.trim() || answerState === "judging") return;
    setAnswerState("judging");
    try {
      const result = await judgeRewindAnswer({
        reportId,
        momentIndex,
        answerText: answer.trim().slice(0, ANSWER_MAX_LENGTH),
      });
      setJudgement(result);
      setAnswerState("judged");
    } catch {
      // Judge-failed(UX-028 States) — 조용히 넘기지 않고 실패를 명시한 뒤 모범 대처는 반드시
      // 보여준다(학습 가치 보존, P-4/AC-062).
      setJudgement(null);
      setAnswerState("judge-failed");
    }
  };

  const goToMoment = (nextIndex: number) => {
    if (!context || nextIndex < 0 || nextIndex >= context.moments.length) return;
    setMomentIndex(nextIndex);
    setExpandedContext(false);
    resetAnswer();
  };

  const handleGoHome = () => router.push("/");
  const handleGoToReport = () => {
    if (!context) return;
    router.push(`/report?sessionId=${encodeURIComponent(context.sessionId)}`);
  };
  const handleGoToReplay = () => {
    if (!context) return;
    router.push(`/report/replay?sessionId=${encodeURIComponent(context.sessionId)}`);
  };
  // UX-028 Exit — "속았던 순간 모아보기" → UX-030(실패 아카이브, T74). 누적 화면이라 이 세션
  // 컨텍스트를 넘기지 않는다(아카이브가 본인 uid 전체를 스스로 조회한다).
  const handleGoToArchive = () => router.push("/report/archive");

  if (state === "no-report") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>되감을 리포트 정보가 없습니다. 처음 화면으로 돌아가 다시 시작해 주세요.</span>
        </p>
        <Button type="button" variant="secondary" onClick={handleGoHome}>
          처음으로
        </Button>
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
          그 순간의 대화를 불러오는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "error" || !context) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>그 순간의 대화를 불러오지 못했습니다. 다시 시도해 주세요.</span>
        </p>
        <Button type="button" variant="primary" onClick={handleRetryLoad}>
          다시 시도
        </Button>
      </main>
    );
  }

  // Empty(UX-028 States, D-40) — 정상 경로에서는 진입점 자체가 뜨지 않지만 직접 URL 진입 등을
  // 대비한다. 없는 순간(near-miss)을 발명하지 않고 리플레이 해설로 안내한다.
  if (!moment) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="status" className="text-lg font-semibold text-[#22303A]">
          이번 대화에서는 되감을 순간이 없습니다.
        </p>
        <p className="text-base leading-relaxed text-[#6B655C]">
          상대의 요구에 응한 순간이 없었습니다. 대신 대화를 처음부터 되짚어보며 잘 대응한 지점을
          확인해 보세요.
        </p>
        <div className="flex w-full flex-col gap-2.5">
          <Button type="button" variant="primary" onClick={handleGoToReplay}>
            잘 대응한 지점 되짚어보기
          </Button>
          <Button type="button" variant="secondary" onClick={handleGoToReport}>
            리포트로 돌아가기
          </Button>
        </div>
      </main>
    );
  }

  const verdictLabel = judgement ? VERDICT_LABEL[judgement.verdict] : null;
  const answerTooLong = answer.length > ANSWER_MAX_LENGTH;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col bg-[#FAF8F5] pb-8">
      <div className="px-5 pt-[22px]">
        <p className="text-[13px] font-semibold text-[#6B655C]">
          {[context.scenarioTitle, moment.timeLabel].filter(Boolean).join(" · ")}
        </p>
        <h1 className="mt-1.5 text-[24px] font-bold leading-[1.35] text-[#22303A]">
          그 순간 다시 답해보기
        </h1>
        <p className="mt-1 text-base leading-relaxed text-[#6B655C]">
          이 한 턴만 다시 해봅니다. 대화가 이어지지는 않아요.{" "}
          {context.moments.length > 1 && `속은 순간 ${momentIndex + 1} / ${context.moments.length}`}
        </p>
        <div className="mt-2">
          <Badge variant="caution">{moment.tactic}</Badge>
        </div>
      </div>

      {/* Context — 앞뒤 몇 턴(읽기 전용, 마스킹) + 문제의 그 대사 강조 + 그때 내 답변. */}
      <section aria-label="속은 순간의 대화" className="mx-5 mt-4 flex flex-col gap-2.5">
        {rewindContext && rewindContext.turns.length > 0 ? (
          <>
            {rewindContext.hasMoreBefore && !expandedContext && (
              <button
                type="button"
                onClick={() => setExpandedContext(true)}
                className="min-h-[44px] rounded-xl border border-[#E2DDD3] bg-white px-4 text-sm font-semibold text-[#6B655C]"
              >
                앞의 대화 더 보기
              </button>
            )}
            <ol className="flex flex-col gap-2.5">
              {rewindContext.turns.map((turn) => (
                <li key={turn.id}>
                  <p className="mb-1 text-[11px] text-[#6B655C]">
                    {turn.role === "user" ? "나" : context.callerLabel}
                    {turn.kind === "scammer-focus" && (
                      <span className="ml-1.5 font-bold text-[#B96A1B]">
                        <span aria-hidden="true">⚠ </span>문제의 그 대사
                      </span>
                    )}
                    {turn.kind === "original-answer" && (
                      <span className="ml-1.5 font-semibold text-[#22303A]">
                        이때 당신은 이렇게 답했습니다
                      </span>
                    )}
                  </p>
                  <div
                    className={`rounded-[14px] px-4 py-3 text-[15px] leading-[1.55] ${
                      turn.kind === "scammer-focus"
                        ? "border-[1.5px] border-[#B96A1B]/50 bg-[#FBF3E8] text-[#22303A]"
                        : turn.role === "user"
                          ? "bg-[#0E6B62] text-white"
                          : "border border-[#E2DDD3] bg-white text-[#22303A]"
                    }`}
                  >
                    {turn.textMasked}
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : (
          // 전사 누락 등으로 그 순간의 대화를 못 찾은 경우 — 침묵하지 않고 명시한 뒤, 수법·모범
          // 대처만으로 드릴은 계속한다(학습 가치 보존).
          <p role="status" className="rounded-2xl border border-[#E2DDD3] bg-white p-4 text-base text-[#6B655C]">
            그때의 대화 내용을 불러오지 못했지만, 이 수법에 대해 다시 답해볼 수 있습니다.
          </p>
        )}
      </section>

      {/* 다시 답하기(텍스트 전용 — 음성 입력은 v1 미제공, §15.2.4).
          reviewer Minor m1(2026-07-25) — UX.md UX-028이 "모바일은 입력창 하단 고정"을 명시하는데
          일반 문서 흐름에 있어 스크롤해야 입력할 수 있었다. session/messenger가 이미 쓰는
          `sticky bottom-0 + env(safe-area-inset-bottom)` 패턴을 그대로 재사용한다. */}
      <section className="sticky bottom-0 z-10 mx-5 mt-5 flex flex-col gap-2 border-t border-[#E2DDD3] bg-[#FAF8F5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <label
          ref={answerLabelRef}
          tabIndex={-1}
          htmlFor="rewind-answer"
          className="text-lg font-bold text-[#22303A] outline-none"
        >
          여기서 다시 답해보기
        </label>
        <p className="text-sm text-[#6B655C]">
          이 순간으로 돌아갔다면 뭐라고 답하시겠어요? 답하지 않고 모범 대처만 볼 수도 있습니다.
        </p>
        <textarea
          id="rewind-answer"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          maxLength={ANSWER_MAX_LENGTH}
          rows={3}
          disabled={answerState === "judging"}
          className="w-full rounded-[14px] border border-[#C9C2B6] bg-white p-4 text-base leading-relaxed text-[#22303A] outline-none focus:border-[#0E6B62]"
          placeholder="예: 확인해 볼 테니 제가 아는 번호로 다시 걸겠습니다."
        />
        <p className="text-right text-xs text-[#6B655C]">
          {answer.length} / {ANSWER_MAX_LENGTH}자
        </p>
        <Button
          type="button"
          variant="primary"
          onClick={() => void handleSubmit()}
          disabled={!answer.trim() || answerTooLong || answerState === "judging"}
        >
          {answerState === "judging" ? "판정하는 중입니다..." : "이렇게 답해보기"}
        </Button>
        {!modelAnswerShown && answerState === "idle" && (
          <Button type="button" variant="secondary" onClick={() => setModelAnswerShown(true)}>
            모범 대처만 보기
          </Button>
        )}
      </section>

      {/* 판정 결과 — aria-live로 알린다(UX-028 Accessibility). 색 단독 표기 금지. */}
      <div aria-live="polite" className="mx-5 mt-4 flex flex-col gap-3">
        {answerState === "judging" && (
          <p className="flex items-center gap-2 text-base text-[#22303A]" role="status">
            <span
              aria-hidden="true"
              className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
            />
            답변을 살펴보는 중입니다...
          </p>
        )}

        {answerState === "judged" && judgement && verdictLabel && (
          <div className="rounded-2xl border border-[#E2DDD3] bg-white p-[18px]">
            <p className={`text-lg font-bold ${verdictLabel.tone}`}>
              <span aria-hidden="true">{verdictLabel.icon} </span>
              {verdictLabel.text}
            </p>
            <p className="mt-1 text-base leading-relaxed text-[#6B655C]">{judgement.reason}</p>
            <div className="my-3 h-px bg-[#EFEBE3]" />
            <p className="text-sm font-bold text-[#0E6B62]">이 순간의 모범 대처</p>
            <p className="mt-1 text-base leading-relaxed text-[#22303A]">{judgement.correctAction}</p>
            {/* 어느 경로가 판정했는지 숨기지 않는다(ADR-0008 — 판정 품질이 두 종류로 갈린다). */}
            <p className="mt-2 text-xs text-[#6B655C]">
              {judgement.judgedBy === "llm"
                ? "이 판정은 AI가 답변 내용을 보고 매겼습니다."
                : "이 판정은 키워드 규칙으로 매겼습니다 — 표현에 따라 다르게 볼 수 있습니다."}
            </p>
          </div>
        )}

        {answerState === "judge-failed" && (
          <div className="rounded-2xl border border-[#E2DDD3] bg-white p-[18px]">
            <p role="alert" className="text-base font-semibold text-[#C6392F]">
              <span aria-hidden="true">⚠ </span>이번 답변은 판정하지 못했습니다.
            </p>
            <p className="mt-1 text-base leading-relaxed text-[#6B655C]">
              판정을 불러오지 못했지만, 이 순간의 모범 대처는 그대로 확인하실 수 있습니다.
            </p>
            <div className="my-3 h-px bg-[#EFEBE3]" />
            <p className="text-sm font-bold text-[#0E6B62]">이 순간의 모범 대처</p>
            <p className="mt-1 text-base leading-relaxed text-[#22303A]">{moment.correctAction}</p>
          </div>
        )}

        {modelAnswerShown && answerState === "idle" && (
          <div className="rounded-2xl border border-[#E2DDD3] bg-white p-[18px]">
            <p className="text-sm font-bold text-[#0E6B62]">이 순간의 모범 대처</p>
            <p className="mt-1 text-base leading-relaxed text-[#22303A]">{moment.correctAction}</p>
          </div>
        )}
      </div>

      <div className="mx-5 mt-5 flex flex-col gap-2.5">
        {(answerState === "judged" || answerState === "judge-failed") && (
          <Button type="button" variant="secondary" onClick={resetAnswer}>
            같은 순간 한 번 더 답해보기
          </Button>
        )}
        {momentIndex + 1 < context.moments.length && (
          <Button type="button" variant="primary" onClick={() => goToMoment(momentIndex + 1)}>
            다음 순간 다시 해보기
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={handleGoToReport}>
          리포트로 돌아가기
        </Button>
        <Button type="button" variant="secondary" onClick={handleGoToReplay}>
          대화 전체 되짚어보기
        </Button>
        {/* UX-028 Exit "속았던 순간 모아보기" → UX-030(실패 아카이브, T74/UF-010). */}
        <Button type="button" variant="secondary" onClick={handleGoToArchive}>
          속았던 순간 모아보기
        </Button>
        <button
          type="button"
          onClick={handleGoHome}
          className="min-h-[48px] rounded-2xl px-6 py-3 text-base font-semibold text-[#6B655C]"
        >
          처음으로
        </button>
      </div>

      {/* 톤(P-8/P-21) — 과신("이제 안전")·질책("또 틀렸습니다") 표현을 쓰지 않는다. */}
      <div className="mx-5 mt-4 rounded-[12px] bg-[#F2EFE9] px-4 py-3">
        <p className="text-[13px] leading-[1.6] text-[#6B655C]">
          한 번 잘 답했다고 끝이 아니고, 한 번 놓쳤다고 잘못한 것도 아닙니다. 이런 순간을 여러 번
          연습해 두면 실제 상황에서 조금 더 빨리 알아챌 수 있습니다.
        </p>
      </div>
    </main>
  );
}
