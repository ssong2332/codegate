"use client";

// UX-007 세션 종료 + 디스컬레이션 + "훈련이었습니다" 고지 (Track B, T8, AC-006/AC-007/AC-015/AC-023)
//
// Entry: 세션 화면(UX-005/UX-006)의 상시 EndTrainingButton이 이 화면으로 이동시킨다(AC-006).
// play/page.tsx(UX-005)의 handleEndTraining은 라우팅만 하고 실제 종료 API 호출은 이 화면
// 진입 시 수행한다 — T5가 남긴 갭을 여기서 닫는다(구현 보고서 참고). 현재 채팅 화면(UX-006)은
// 아직 T7/T8 이후 과제로 남은 스텁이라 실제 진입 경로는 play 화면의 "훈련 종료" 버튼뿐이다.
//
// AC-023(송금·계좌 유도 없음)의 "이것은 훈련이었습니다" 고지 + AC-015(디스컬레이션 안심 메시지)는
// endSession 성공/대기/실패 상태와 무관하게 항상 먼저 렌더링한다(UX.md UX-007 Failure 규칙 —
// "고지 메시지는 항상 먼저 노출해 심리적 안심 우선"). 안심 메시지는 완화 톤을 쓰고 "면역됨" 류
// 과신 표현은 쓰지 않는다(PRD Risks — 실제로는 다시 속을 수 있다는 사실을 왜곡하지 않는다).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { endSession } from "@/lib/api";
import type { EndSessionReason } from "@/lib/api/types";
import { clearPendingEndReason, clearPendingSession, getPendingSessionId, peekPendingEndReason } from "@/lib/recording";
import { Button, LoadingStatus } from "@/components/ui";
import { EXIT_BOARD } from "@/lib/design/e2Prep";
import { resolveRewindEntry } from "@/lib/rewind/rewindEntry";
import { awaitTranscriptFlush } from "@/lib/session/transcriptFlushHandoff";
import { releaseSessionPhotos } from "@/lib/messenger/sessionPhotos";
import { POST_SESSION_FACT_DISCLOSURE } from "@/lib/sessionboundary/postSessionCopy";

type PageState = "no-session" | "ending" | "ended" | "error";

// T37(UF-005 2인 사용자2 강제 정체 공개, AC-042, UX-007 2인 변형) — challengeId가 있는 세션이면
// endSession 성공 직후 세션 문서에서 challengeId·challengeCreatorDisplayName을 읽어 문구·인계
// 대상을 바꾼다. 조회 자체가 실패해도(드묾) 일반(단독) 세션 취급으로 안전하게 폴백한다 — 종료
// 흐름 자체를 막지 않는다.
async function fetchChallengeContext(
  sid: string,
): Promise<{ challengeId: string; displayName: string } | null> {
  try {
    const snap = await getDoc(doc(db, "sessions", sid));
    const data = snap.data();
    const challengeId = data?.challengeId as string | undefined;
    if (!challengeId) return null;
    return {
      challengeId,
      displayName: (data?.challengeCreatorDisplayName as string | undefined) ?? "상대방",
    };
  } catch {
    return null;
  }
}

// T192 C4 — 사유를 인자로 받는 순수 헬퍼(컴포넌트 밖 — effect 의존성에 함수가 끼지 않게).
function requestEndSession(sid: string, endReason: EndSessionReason) {
  return endSession({ sessionId: sid, endReason });
}

export default function SessionEndPage() {
  const router = useRouter();
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  // T192 C4(§79.9 종료 화면 · §79.19 (7) C4-2) — 통화 화면이 남긴 1회성 사유 힌트. 허용목록(`user_ended` ·
  // `limit_reached` · `scammer_ended`) 밖 · 없음 · 다른 세션이면 `user_ended`(판정 = `endReasonHint.ts`). 초기화
  // 함수에서 **읽기만** 하고(부수효과 0 — 초기화 이중 호출에도 같은 값 · PR A 리뷰 Minor-2), 지우기는 `endSession` 성공 뒤다
  // — 요청이 실패해 재시도하거나 새로고침해도 같은 사유가 남는다.
  const [endReason] = useState<EndSessionReason>(() => (sessionId ? peekPendingEndReason(sessionId) : "user_ended"));
  const [state, setState] = useState<PageState>(sessionId ? "ending" : "no-session");
  const [challenge, setChallenge] = useState<{ challengeId: string; displayName: string } | null>(
    null,
  );
  // T70(UX-028 진입점, AC-062) — 리포트는 endSession이 비동기로 만들기 때문에 이 화면에 도달한
  // 시점에 아직 없을 수 있다. 준비될 때까지 폴링하고, 그동안 버튼은 비활성 + "리포트를 준비하고
  // 있어요"로 알린다(UF-009 Failure (a) — 침묵 실패 금지).
  const [reportStatus, setReportStatus] = useState<"pending" | "ready" | "error">("pending");

  // §128(6) — 훈련이 끝났다: 대화방에서 보낸 사진(기기 메모리 objectURL)을 정리한다(`sessionPhotos.ts` 표).
  useEffect(() => {
    releaseSessionPhotos();
  }, []);
  const [deceivedMomentCount, setDeceivedMomentCount] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // endReason: (T192 C4 정정) 옛 주석은 "유일한 실경로가 상시 종료라 user_ended 고정 · endSession 서버는 어떤
  // endReason이든 멱등하게 처리한다"였다 — 둘 다 더는 참이 아니다. 실시간 한도 종료가 `limit_reached` 힌트를 남기고
  // (§79.10), 서버는 C1부터 허용목록 3값만 받으며(그 밖 = `invalid-argument` · `session/endReason.ts`) 표식 없는
  // `scammer_ended`는 `user_ended`로 기록한다. 멱등(이미 ended면 재작성 0)은 그대로다. 네트워크 호출 자체는
  // setState를 하지 않는 순수 헬퍼로 분리하고(scenarios/page.tsx와 동일 패턴), 마운트 시
  // effect 안의 인라인 IIFE와 재시도 클릭 핸들러가 각자 결과에 따라 setState한다
  // (react-hooks/set-state-in-effect 규칙 — effect 안에서 이름 있는 함수를 통해 setState를
  // 호출하면 정적 분석이 "동기 setState"로 오탐하므로, effect 쪽은 인라인 IIFE로 둔다).

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        // 2026-10-21 — 통화 화면은 전사 제출을 시작만 하고 곧바로 이 화면으로 온다. 리포트가 실제 대화를 분석하도록
        // endSession 전에 그 제출을 기다린다(§79.9 E5 순서 유지 · 같은 탭 SPA 이동일 때만 — `transcriptFlushHandoff.ts`).
        // 고지 문구는 이 기다림과 무관하게 이미 그려져 있다(UX-007 Failure 규칙).
        await awaitTranscriptFlush(sessionId);
        await requestEndSession(sessionId, endReason);
        if (cancelled) return;
        const challengeContext = await fetchChallengeContext(sessionId);
        if (cancelled) return;
        setChallenge(challengeContext);
        // 종료 성공 시 사전 세션 id·힌트를 비운다 — 같은 탭에서 다음 훈련이 종료된 세션을
        // 되살려 쓰던 치명 버그 차단(pendingSession.clearPendingSession 주석 참고). 이 화면의
        // 로컬 sessionId 변수는 이미 캡처돼 있어 "리포트 보기"(쿼리 파라미터로 전달)는 영향 없다.
        clearPendingSession();
        setState("ended");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, endReason]);

  // 리포트 준비 폴링(T70) — reports/{sessionId}는 endSession 내부 트리거가 만든다(reportId =
  // sessionId, generateReportCore.ts). 이 화면은 리포트를 **읽기만** 하며 생성을 재촉하지 않는다
  // (생성 책임은 UX-008 소관 — replay/page.tsx와 동일 원칙). 실패해도 종료 흐름 자체는 막지 않는다.
  useEffect(() => {
    if (!sessionId || state !== "ended") return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      attempts += 1;
      try {
        const snapshot = await getDoc(doc(db, "reports", sessionId));
        const data = snapshot.data();
        if (cancelled) return;
        if (data) {
          setDeceivedMomentCount(Array.isArray(data.deceivedMoments) ? data.deceivedMoments.length : 0);
          setReportStatus("ready");
          return;
        }
      } catch {
        if (cancelled) return;
        setReportStatus("error");
        return;
      }
      if (attempts >= 8) {
        setReportStatus("error");
        return;
      }
      timer = setTimeout(() => void poll(), 1500);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, state]);

  // AC-015 Accessibility(UX.md Focus Order): 종료 직후 포커스를 "이것은 훈련이었습니다" 고지
  // 문구로 이동해 스크린리더가 안심 메시지부터 읽도록 한다. 화면 진입 시 1회만 이동하면 된다.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleRetry = () => {
    if (!sessionId) return;
    setState("ending");
    requestEndSession(sessionId, endReason)
      .then(async () => {
        // Minor-2 — 종료가 성공한 뒤에만 사유 힌트를 지운다(실패 경로는 남겨 다음 재시도 · 새로고침이 같은 값을 보낸다).
        clearPendingEndReason();
        setChallenge(await fetchChallengeContext(sessionId));
        setState("ended");
      })
      .catch(() => setState("error"));
  };

  const handleGoHome = () => {
    router.push("/");
  };

  const handleViewReport = () => {
    if (!sessionId) return;
    // /report(UX-008)는 아직 T9 스텁이라 sessionId 쿼리를 읽어 쓰지 않지만, T9이 이어받을 때
    // 바로 쓸 수 있도록 미리 전달한다.
    router.push(`/report?sessionId=${encodeURIComponent(sessionId)}`);
  };

  // T37(UF-005 step4, AC-042 "강제") — 2인 사용자2는 UX-008(리포트, UF-002 전용)을 거치지 않고
  // 리플레이 해설(UX-018)로 곧장 인계한다(UX.md UX-007 Business Rules "이어서 리플레이 해설로
  // 반드시 인계"). 이 화면이 "리포트 보기" 버튼 자체를 렌더링하지 않는 것으로 인계를 강제한다 —
  // 세션 소유자(익명 uid)는 URL을 직접 알면 /report에도 접근은 가능하지만(소유권 규칙상 막을
  // 이유가 없음), 이 화면이 그 경로로 안내하지 않는다.
  const handleViewReplay = () => {
    if (!sessionId) return;
    router.push(`/report/replay?sessionId=${encodeURIComponent(sessionId)}`);
  };

  // T70(UX-028 즉시 되감기, AC-062/D-39/D-40) — 속은 순간이 1건 이상일 때만 노출한다. 2인
  // 사용자2(challenge)는 강제 정체 공개 → 강제 리플레이 해설 순서를 지켜야 하므로 이 화면에서는
  // 노출하지 않는다(AC-042 — 판정은 resolveRewindEntry가 한 곳에서 담당).
  const rewindEntry = resolveRewindEntry({
    reportStatus,
    deceivedMomentCount,
    isChallengeSession: challenge !== null,
    afterForcedReplay: false,
  });

  const handleRewind = () => {
    if (!sessionId) return;
    // reportId = sessionId(generateReportCore.ts 멱등 키) — 이 화면이 방금 읽은 문서 그대로다.
    router.push(`/report/rewind?reportId=${encodeURIComponent(sessionId)}&moment=0`);
  };

  let body: React.ReactNode;
  if (state === "no-session") {
    body = (
      <>
        <p role="alert" className="flex items-center gap-2 text-lg text-danger">
          <span aria-hidden="true">⚠</span>
          <span>
            진행 중인 훈련 세션 정보를 찾을 수 없습니다. 처음 화면으로 돌아가 다시 시작해
            주세요.
          </span>
        </p>
        <Button type="button" variant="secondary" onClick={handleGoHome}>
          처음으로
        </Button>
      </>
    );
  } else if (state === "ending") {
    body = (
      <LoadingStatus label="훈련 자료를 정리하고 리포트를 준비하는 중입니다" />
    );
  } else if (state === "error") {
    body = (
      <>
        <p role="alert" className="flex items-center gap-2 text-lg text-danger">
          <span aria-hidden="true">⚠</span>
          <span>훈련 종료 처리 중 문제가 발생했습니다. 다시 시도해 주세요.</span>
        </p>
        <Button type="button" variant="primary" onClick={handleRetry}>
          다시 시도
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-base text-ink-sub" role="status">
          훈련 중 사용된 음성·합성 파일은 폐기 절차가 시작되었습니다.
        </p>
        <div className="flex flex-col gap-3">
          {challenge ? (
            // T37(UF-005 step4, AC-042 "강제") — 2인 사용자2는 리포트(UX-008)가 아니라 리플레이
            // 해설(UX-018)로 곧장 인계된다. 이 화면에는 "리포트 보기" 버튼을 아예 두지 않는다.
            <Button type="button" variant="primary" onClick={handleViewReplay}>
              대화 되짚어보기
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={handleViewReport}>
              리포트 보기
            </Button>
          )}
          {/* UX-028(즉시 되감기) 진입점 — 리포트 준비 중에는 비활성 + 준비 중 안내 1줄, 속은
              순간이 0건이면 아예 노출하지 않는다(D-40 near-miss 미발명). */}
          {rewindEntry === "pending" && (
            <>
              <Button type="button" variant="secondary" disabled>
                그 순간 다시 해보기
              </Button>
              <p role="status" className="text-base text-ink-sub">
                리포트를 준비하고 있어요.
              </p>
            </>
          )}
          {rewindEntry === "available" && (
            <Button type="button" variant="secondary" onClick={handleRewind}>
              그 순간 다시 해보기
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={handleGoHome}>
            처음으로
          </Button>
        </div>
      </>
    );
  }

  return (
    // UX D-140 (2) — 높이 700px 이하(주소창이 보이는 작은 폰)에서는 `end-compact`(globals.css)가 여백 · 간격 · 아이콘 · 행간만
    // 줄여 한 화면에 든다(글자 크기 · 문면 무변경). 360×650 실측: 넘침 75 → 0.
    <main className="end-compact mx-auto flex min-h-dvh max-w-xl flex-col items-center gap-6 bg-page px-6 py-10 text-center">
      {/* UX D-141 (5)(시안 E2) — 종료 경계 판(모래 "끝."). 여기부터 실제 화면임을 화면 가로 판 한 장으로 먼저 알린다.
          아래 제목 · 안심 문단 · 사실 공개 문장(G445)은 그대로다. ⚠️ section이라 `.end-compact > div:first-of-type`
          (작은 화면 아이콘 축소)은 아래 아이콘 div에 그대로 걸린다. */}
      {/* 리뷰 Major — 높이 700px 이하에서는 판이 한 줄 띠로 줄고(아이콘 원 대신 띠 안의 체크), 종료 화면이 한 화면에 그대로
          든다(D-140 (2) · globals.css `.end-board`). 리뷰 Minor — 판 제목은 heading이 아니다(이 화면의 첫 제목은 아래 h1). */}
      <section className="end-board -mx-6 -mt-10 flex w-[calc(100%+3rem)] flex-col gap-2 bg-sand px-[26px] pb-6 pt-10 text-left text-ink">
        <p className="e2-rise flex items-center gap-3 font-display text-[48px] font-bold leading-[1.15] tracking-[-0.02em]">
          <svg aria-hidden="true" className="end-board-check hidden shrink-0" width="26" height="26" viewBox="0 0 13 13" fill="none">
            <path d="M2.5 7L5.2 9.7L10.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {EXIT_BOARD.title}
        </p>
        <p className="e2-rise text-[19px] font-bold leading-[1.55] [word-break:keep-all]" style={{ ["--e2-i" as string]: 1 }}>
          {EXIT_BOARD.line}
        </p>
      </section>
      {/* AC-023: "이것은 훈련이었습니다" 명시 고지. 색이 아닌 아이콘+텍스트로 강조, 항상 노출. */}
      <div
        aria-hidden="true"
        className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-brand-tint"
      >
        <svg className="text-brand" width="40" height="40" viewBox="0 0 13 13" fill="none">
          <path
            d="M2.5 7L5.2 9.7L10.5 3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-[26px] font-bold leading-[1.35] text-ink outline-none"
      >
        이것은 훈련이었습니다
      </h1>

      {/* AC-015 디스컬레이션(안심) 메시지 — 완화 톤·큰 글씨. 2인(UF-005) 재사용 시 강제 정체
          공개 문구로 교체한다(Architecture.md §14 Business Rules "○○님이 준비한 훈련이었습니다.
          실제 상황이 아니었습니다" 문구를 그대로 쓴다, AC-042). */}
      <p className="text-lg leading-[1.7] text-ink-sub">
        {challenge ? (
          <>
            {challenge.displayName}님이 준비한 훈련이었습니다. 실제 상황이 아니었습니다. 지금까지
            대화한 상대는 실제 사기범이 아니라 AI로 합성한 목소리였습니다. 실제로 돈이나
            개인정보가 오간 것은 없으니 안심하셔도 됩니다.
          </>
        ) : (
          <>
            지금까지 대화한 상대는 실제 사기범이 아니라 AI 훈련 프로그램이었습니다. 실제로 돈이나
            개인정보가 오간 것은 없으니 안심하셔도 됩니다. 오늘 연습한 경험을 잘 기억해 두시면,
            실제 상황에서도 도움이 될 거예요.
          </>
        )}
      </p>

      {/* T187(docs/Architecture.md §72.5 D4 · PRD v1.18 AC-089 (c) · UX-007 v1.29 노트 · D-83) —
          세션 후 사실 공개 문장. 세션 중 화면에서 지운 부정 고지의 정본 자리다. ⛔ 페이지 상태·세션
          내용(채널·난이도·제출/설치 여부)으로 가르거나 숨기지 않는다 — 제목과 같은 조건(무조건)으로
          렌더한다(G445). 디스컬레이션 문단과 같은 크기·색 · 경고 표현 0. */}
      <p className="text-lg leading-[1.7] text-ink-sub">{POST_SESSION_FACT_DISCLOSURE}</p>

      <div className="flex w-full flex-col items-stretch gap-3">{body}</div>
    </main>
  );
}
