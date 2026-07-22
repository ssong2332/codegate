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
import { endSession } from "@/lib/api";
import { clearPendingSession, getPendingSessionId } from "@/lib/recording";

type PageState = "no-session" | "ending" | "ended" | "error";

export default function SessionEndPage() {
  const router = useRouter();
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [state, setState] = useState<PageState>(sessionId ? "ending" : "no-session");
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
      .then(() => setState("ended"))
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

  let body: React.ReactNode;
  if (state === "no-session") {
    body = (
      <>
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>
            진행 중인 훈련 세션 정보를 찾을 수 없습니다. 처음 화면으로 돌아가 다시 시작해
            주세요.
          </span>
        </p>
        <button
          type="button"
          onClick={handleGoHome}
          className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
        >
          처음으로
        </button>
      </>
    );
  } else if (state === "ending") {
    body = (
      <p className="flex items-center gap-2 text-lg" role="status">
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
        />
        훈련 자료를 정리하고 리포트를 준비하는 중입니다...
      </p>
    );
  } else if (state === "error") {
    body = (
      <>
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>훈련 종료 처리 중 문제가 발생했습니다. 다시 시도해 주세요.</span>
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
        >
          다시 시도
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-base text-gray-700" role="status">
          훈련 중 사용된 음성·합성 파일은 폐기 절차가 시작되었습니다.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleViewReport}
            className="min-h-[56px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
          >
            리포트 보기
          </button>
          <button
            type="button"
            onClick={handleGoHome}
            className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
          >
            처음으로
          </button>
        </div>
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-8">
      {/* AC-023: "이것은 훈련이었습니다" 명시 고지. 색이 아닌 아이콘+텍스트로 강조, 항상 노출. */}
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="flex items-center gap-3 text-2xl font-bold leading-relaxed outline-none"
      >
        <span aria-hidden="true">✅</span>
        <span>이것은 훈련이었습니다</span>
      </h1>

      {/* AC-015 디스컬레이션(안심) 메시지 — 완화 톤·큰 글씨. */}
      <p className="text-lg leading-relaxed text-gray-800">
        지금까지 대화한 상대는 실제 사기범이 아니라 AI 훈련 프로그램이었습니다. 실제로 돈이나
        개인정보가 오간 것은 없으니 안심하셔도 됩니다. 오늘 연습한 경험을 잘 기억해 두시면,
        실제 상황에서도 도움이 될 거예요.
      </p>

      {body}
    </main>
  );
}
