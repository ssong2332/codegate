"use client";

// UX-010 방어 등급 (P1, Track A, T13, AC-010/AC-011)
//
// ⚠️ OQ-5 미확정 — 등급 산정식은 임시 플레이스홀더(v1)다(functions/src/report/
// computeDefenseGrade.ts 참고). docs/Tasks.md는 "T13 착수 전 OQ-5 확정"을 게이팅으로 명시했으나,
// 사용자가 "간단한 플레이스홀더로 진행"이라고 명시적으로 결정(2026-07-21)해 최종 산정식 확정 전에
// 최소 구현으로 진행한다 — 등급명 옆 "(v1)" 표기 + 화면 하단 안내 문구로 임시값임을 드러낸다.
//
// Entry: UX-008(리포트)에서 "등급 보기"(경량 스케치, UX.md D-8). 서버
// (functions/src/report/generateReportCore.ts)가 매 리포트 생성 시 users/{uid}.defenseGrade·
// sessionCount(Database.md P1 필드)를 이미 갱신해 두므로, 이 화면은 users/{uid} 문서 1회 read만
// 한다 — 별도 산정 호출 없음.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCurrentUser } from "@/lib/auth";

type PageState = "loading" | "empty" | "error" | "success";

type GradeData = {
  defenseGrade: string;
  sessionCount: number;
};

export default function GradePage() {
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const [state, setState] = useState<PageState>("loading");
  const [grade, setGrade] = useState<GradeData | null>(null);

  // 네트워크 호출·조건 분기 전체를 effect 안의 인라인 IIFE로 감싼다(session/end/page.tsx,
  // report/page.tsx와 동일 패턴 — react-hooks/set-state-in-effect 규칙이 effect 본문에서 직접
  // 실행되는 동기 setState를 "cascading render 위험"으로 오탐하므로, `!user` 조기 분기까지
  // 포함한 모든 setState를 async IIFE 내부로 둔다).
  useEffect(() => {
    if (userLoading) return;
    let cancelled = false;
    (async () => {
      if (!user) {
        // 전역 RouteGuard(src/lib/auth/RouteGuard.tsx)가 이미 인증을 강제해 이 경로엔 원래
        // 도달하지 않지만, 방어적으로 "기록 없음"과 동일하게 처리한다(비차단).
        if (!cancelled) setState("empty");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (cancelled) return;
        const data = snap.data();
        const sessionCount = typeof data?.sessionCount === "number" ? data.sessionCount : 0;
        const defenseGrade = typeof data?.defenseGrade === "string" ? data.defenseGrade : undefined;
        // UX-010 Empty: 첫 세션 전(=아직 리포트가 없어 서버가 등급을 써 준 적 없음) "기록 없음".
        if (!defenseGrade || sessionCount === 0) {
          setState("empty");
          return;
        }
        setGrade({ defenseGrade, sessionCount });
        setState("success");
      } catch {
        // UX-010 Failure: "산정 실패 → 리포트만 표시하고 생략(비차단)". 이 화면 자체가 등급
        // 전용 화면이라 완전히 비워두는 대신, 경고가 아닌 담담한 안내 문구로 생략한다.
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, userLoading]);

  const handleGoHome = () => router.push("/");
  const handleRetrain = () => router.push("/scenarios");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-bold">방어 등급</h1>

      {state === "loading" && (
        <p className="flex items-center gap-2 text-lg" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
          />
          등급을 불러오는 중입니다...
        </p>
      )}

      {state === "empty" && (
        <p className="text-base text-gray-600">
          아직 완료한 훈련 기록이 없습니다. 첫 훈련을 마치면 방어 등급이 표시됩니다.
        </p>
      )}

      {state === "error" && (
        <p className="text-base text-gray-600">
          등급 정보를 지금은 불러올 수 없습니다. 나중에 다시 확인해 주세요.
        </p>
      )}

      {/* AC-010/AC-011: 세션 결과로 산정된 등급 + 세션 간 지속되는 누적 세션 횟수를 함께 표시.
          Accessibility(UX.md): 등급을 색 배지가 아닌 텍스트로 표기. */}
      {state === "success" && grade && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-3xl font-bold" aria-label={`현재 방어 등급: ${grade.defenseGrade}`}>
            {grade.defenseGrade}
          </p>
          <p className="text-base text-gray-700">
            지금까지 완료한 훈련 세션: <span className="font-semibold">{grade.sessionCount}회</span>
          </p>
          <p className="text-xs text-gray-400">* 등급 산정 기준은 임시 값(v1)이며 추후 조정될 수 있습니다.</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleRetrain}
          className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
        >
          다시 훈련
        </button>
        <button
          type="button"
          onClick={handleGoHome}
          className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
        >
          처음으로
        </button>
      </div>
    </main>
  );
}
