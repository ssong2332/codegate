"use client";

// UX-011 연령 확인(age-gate) (P1, Track C, T14, AC-014) — 핵심 루프 비차단.
//
// 방식 판단(자기신고 확인 플래그 vs 생년월일 입력, 구현 보고서 참조): UX.md UX-011이 명시적으로
// 허용한 두 방식("연령/생년 입력 또는 확인 플래그") 중 "만 {MIN_AGE}세 이상입니다" 자기신고
// 확인을 택했다 — 생년월일 입력은 날짜 파싱·형식 검증·나이 계산(월/일 경계, 윤년 등) 로직이
// 추가로 필요해 P1 프로토타입 범위에서 과도하다(OQ-8 확정 근거 자체도 "별도 보호자 동의
// 플로우를 만들지 않을 때 구현이 가장 간단"으로 동일한 단순화 방향을 명시).
//
// States(UX.md UX-011 States 표): Success(예 → 통과), Error(아니오 → "기준 미달 시 차단 안내").
// 차단 시 별도 우회 동작을 제공하지 않는다(AC-014 "접근을 제한").
import { useState } from "react";
import { MIN_AGE } from "@/lib/age/resolveAgeGateDecision";
import { verifyAge } from "@/lib/age/verifyAge";

type AgeGateProps = {
  /** 확인 결과(users/{uid}.ageVerified)를 기록할 대상 사용자. */
  uid: string;
  /** 통과 후 호출된다 — 다음 화면(UX-002) 이동은 부모(페이지)가 담당한다. */
  onPass: () => void;
};

type Status = "asking" | "saving" | "blocked" | "error";

export default function AgeGate({ uid, onPass }: AgeGateProps) {
  const [status, setStatus] = useState<Status>("asking");

  const handleConfirm = async () => {
    setStatus("saving");
    try {
      await verifyAge(uid);
      onPass();
    } catch {
      setStatus("error");
    }
  };

  const handleDecline = () => {
    setStatus("blocked");
  };

  // Error 상태(UX.md "기준 미달 시 차단 안내") — 접근을 제한하고 되돌릴 동작을 주지 않는다.
  if (status === "blocked") {
    return (
      <div className="flex flex-col gap-4 rounded border border-gray-300 p-6 text-center">
        <p
          role="alert"
          className="flex items-center justify-center gap-2 text-lg font-semibold text-red-700"
        >
          <span aria-hidden="true">⚠</span>
          <span>만 {MIN_AGE}세 미만은 이 훈련 서비스를 이용할 수 없습니다.</span>
        </p>
        <p className="text-base text-gray-600">보호자와 함께 다른 안전 교육 자료를 확인해 주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded border border-gray-300 p-6 text-center">
      <h1 className="text-2xl font-bold">연령 확인</h1>
      <p className="text-lg leading-relaxed">
        이 훈련 서비스는 만 {MIN_AGE}세 이상만 이용할 수 있습니다.
      </p>
      <p className="text-lg font-semibold">만 {MIN_AGE}세 이상이 맞습니까?</p>

      {status === "error" && (
        <p role="alert" className="flex items-center justify-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>확인 저장에 실패했습니다. 연결 상태를 확인하고 다시 시도해 주세요.</span>
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={status === "saving"}
          className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {status === "saving" ? "확인 중..." : `예, 만 ${MIN_AGE}세 이상입니다`}
        </button>
        <button
          type="button"
          onClick={handleDecline}
          disabled={status === "saving"}
          className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100 disabled:opacity-50"
        >
          아니오, 만 {MIN_AGE}세 미만입니다
        </button>
      </div>
    </div>
  );
}
