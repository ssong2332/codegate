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
import { clearPendingSession, getPendingSessionId } from "@/lib/recording";
import { Button } from "@/components/ui";

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

export default function SessionEndPage() {
  const router = useRouter();
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [state, setState] = useState<PageState>(sessionId ? "ending" : "no-session");
  const [challenge, setChallenge] = useState<{ challengeId: string; displayName: string } | null>(
    null,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);

  // endReason: 현재 이 화면에 도달하는 유일한 실경로는 EndTrainingButton(상시 종료)이라
  // "user_ended"로 고정한다. 훗날 완료(completed)/한도 도달(limit_reached) 등 다른 경로가 이
  // 화면으로 진입 파라미터를 넘기게 되면(예: 채팅 화면 완성 후) 그 값을 받아 쓰도록 확장하면
  // 된다 — endSession 서버는 이미 어떤 endReason이든 멱등하게 처리한다. 네트워크 호출 자체는
  // setState를 하지 않는 순수 헬퍼로 분리하고(scenarios/page.tsx와 동일 패턴), 마운트 시
  // effect 안의 인라인 IIFE와 재시도 클릭 핸들러가 각자 결과에 따라 setState한다
  // (react-hooks/set-state-in-effect 규칙 — effect 안에서 이름 있는 함수를 통해 setState를
  // 호출하면 정적 분석이 "동기 setState"로 오탐하므로, effect 쪽은 인라인 IIFE로 둔다).
  const requestEndSession = (sid: string) => endSession({ sessionId: sid, endReason: "user_ended" });

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        await requestEndSession(sessionId);
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
  }, [sessionId]);

  // AC-015 Accessibility(UX.md Focus Order): 종료 직후 포커스를 "이것은 훈련이었습니다" 고지
  // 문구로 이동해 스크린리더가 안심 메시지부터 읽도록 한다. 화면 진입 시 1회만 이동하면 된다.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleRetry = () => {
    if (!sessionId) return;
    setState("ending");
    requestEndSession(sessionId)
      .then(async () => {
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

  let body: React.ReactNode;
  if (state === "no-session") {
    body = (
      <>
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
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
      <p className="flex items-center gap-2 text-lg text-[#22303A]" role="status">
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
        />
        훈련 자료를 정리하고 리포트를 준비하는 중입니다...
      </p>
    );
  } else if (state === "error") {
    body = (
      <>
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
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
        <p className="text-sm text-[#6B655C]" role="status">
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
          <Button type="button" variant="secondary" onClick={handleGoHome}>
            처음으로
          </Button>
        </div>
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center gap-6 bg-[#FAF8F5] px-6 py-10 text-center">
      {/* AC-023: "이것은 훈련이었습니다" 명시 고지. 색이 아닌 아이콘+텍스트로 강조, 항상 노출. */}
      <div
        aria-hidden="true"
        className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[#E4F0EC]"
      >
        <svg width="40" height="40" viewBox="0 0 13 13" fill="none">
          <path
            d="M2.5 7L5.2 9.7L10.5 3.5"
            stroke="#0E6B62"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-[26px] font-bold leading-[1.35] text-[#22303A] outline-none"
      >
        이것은 훈련이었습니다
      </h1>

      {/* AC-015 디스컬레이션(안심) 메시지 — 완화 톤·큰 글씨. 2인(UF-005) 재사용 시 강제 정체
          공개 문구로 교체한다(Architecture.md §14 Business Rules "○○님이 준비한 훈련이었습니다.
          실제 상황이 아니었습니다" 문구를 그대로 쓴다, AC-042). */}
      <p className="text-base leading-[1.7] text-[#6B655C]">
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

      <div className="flex w-full flex-col items-stretch gap-3">{body}</div>
    </main>
  );
}
