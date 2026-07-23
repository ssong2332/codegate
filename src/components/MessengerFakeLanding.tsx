"use client";

// UX-023 스미싱 링크 인앱 가짜 랜딩 (T29) — docs/UX.md UX-023, AC-045/032/022.
// 채팅(UX-022)에서 스미싱 링크 칩을 탭하면 나타나는 정적 목업이다. **입력값은 서버로 전송되지
// 않는다 — 이 화면을 위한 콜러블이 존재하지 않는다**(구조적 금지, AC-045): 이 파일은 어떤
// src/lib/api 함수도 import하지 않고, "확인" 버튼은 로컬 state만 바꾼다(가짜 피드백). 실 브랜드
// 명·로고·실 URL은 쓰지 않는다(AC-032 무해화).
import { useState } from "react";
import EndTrainingButton from "./EndTrainingButton";

type MessengerFakeLandingProps = {
  /** 링크의 displayText(모의 표기) — 이 목업의 제목으로도 그대로 쓴다. */
  title: string;
  /** 닫기/복귀 — UX-022 채팅으로 되돌아간다. */
  onClose: () => void;
  /** "훈련 종료"는 이 화면에서도 접근 가능해야 한다(AC-006). */
  onEndTraining: () => void;
};

export default function MessengerFakeLanding({
  title,
  onClose,
  onEndTraining,
}: MessengerFakeLandingProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // AC-045 핵심 — 여기서 어떤 네트워크 호출도 하지 않는다. 로컬 state만 바꿔 가짜 피드백을 준다.
    setSubmitted(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — 훈련용 모의 화면`}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#FAF8F5]"
    >
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#E2DDD3] bg-white px-4 py-3">
        {/* AC-022/045 상시 표식 — 색이 아닌 텍스트로 항상 노출. */}
        <p role="status" className="text-sm font-bold text-[#C6392F]">
          AI 훈련용 모의 화면 · 실제 로그인/전송이 아닙니다
        </p>
        <EndTrainingButton onClick={onEndTraining} />
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 p-6">
        <h1 className="text-xl font-bold text-[#22303A]">{title}</h1>

        {submitted ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-[#E2DDD3] bg-white p-5">
            <p role="status" className="text-lg font-semibold text-[#0E6B62]">
              입력되었습니다.
            </p>
            <p className="text-sm leading-relaxed text-[#6B655C]">
              (실제로는 어디에도 전송되지 않았습니다 — 훈련용 모의 화면입니다.)
            </p>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] rounded-xl bg-[#0E6B62] px-6 py-3 text-base font-bold text-white hover:bg-[#0B564F]"
            >
              채팅으로 돌아가기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#22303A]">
              이름
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="이름을 입력하세요"
                className="min-h-[48px] rounded-xl border border-[#C9C2B6] px-4 text-base"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#22303A]">
              연락처
              <input
                type="text"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="연락처를 입력하세요"
                className="min-h-[48px] rounded-xl border border-[#C9C2B6] px-4 text-base"
              />
            </label>

            <button
              type="submit"
              className="min-h-[52px] rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white hover:bg-[#0B564F]"
            >
              확인
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-[#C9C2B6] px-6 py-2.5 text-base font-semibold text-[#22303A] hover:bg-white"
            >
              닫기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
