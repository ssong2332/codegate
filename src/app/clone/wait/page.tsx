"use client";

// UX-003 클론 생성 대기 (Track A, T4, AC-018).
// Entry: UX-002에서 "클론 생성" 버튼이 이미 createVoiceClone 콜러블을 호출·완료한 뒤 이 화면으로
// 이동한다(record page 참고). 이 화면은 sessions/{sid}.cloneStatus를 구독해 단계형 진행 상태를
// 보여준다(UX.md D-4 "전용 화면으로 분리"). Mock은 항상 즉시 성공하므로 정교한 타임아웃/재시도
// 로직은 만들지 않는다(프로토타입 우선순위, 태스크 지시).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPendingSessionId } from "@/lib/recording";

type WaitState = "checking" | "pending" | "ready" | "failed" | "no-session" | "read-error";

export default function CloneWaitPage() {
  const router = useRouter();
  // sessionStorage 조회는 클라이언트 전용(SSR 없음)이라 lazy 초기값으로 한 번만 읽는다 — effect
  // 본문에서 동기적으로 setState를 호출하지 않기 위함(react-hooks/set-state-in-effect).
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [state, setState] = useState<WaitState>(sessionId ? "checking" : "no-session");

  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = onSnapshot(
      doc(db, "sessions", sessionId),
      (snapshot) => {
        const cloneStatus = snapshot.data()?.cloneStatus;
        if (cloneStatus === "ready") {
          setState("ready");
        } else if (cloneStatus === "failed") {
          setState("failed");
        } else {
          setState("pending");
        }
      },
      () => setState("read-error"),
    );
    return () => unsubscribe();
  }, [sessionId]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-bold">목소리 클론 생성 중</h1>

      {(state === "checking" || state === "pending") && (
        <p className="flex items-center gap-2 text-lg" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
          />
          잠시만 기다려 주세요. 내 목소리로 클론을 만들고 있습니다...
        </p>
      )}

      {state === "ready" && (
        <>
          <p className="text-lg font-semibold text-green-700" role="status">
            목소리 클론이 준비됐습니다.
          </p>
          <button
            type="button"
            onClick={() => router.push("/scenarios")}
            className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
          >
            다음: 시나리오 선택
          </button>
        </>
      )}

      {(state === "failed" || state === "read-error" || state === "no-session") && (
        <>
          <p role="alert" className="flex items-center gap-2 text-base text-red-700">
            <span aria-hidden="true">⚠</span>
            <span>
              {state === "no-session"
                ? "진행 중인 녹음 정보를 찾을 수 없습니다. 다시 녹음해 주세요."
                : "목소리 클론 생성에 실패했습니다. 다시 시도해 주세요."}
            </span>
          </p>
          <button
            type="button"
            onClick={() => router.push("/onboarding/record")}
            className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
          >
            재녹음으로 돌아가기
          </button>
        </>
      )}
    </main>
  );
}
