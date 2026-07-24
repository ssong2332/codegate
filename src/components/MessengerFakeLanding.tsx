"use client";

// UX-023 스미싱 링크 인앱 가짜 랜딩 (T29) — docs/UX.md UX-023, AC-045/032/022.
// 채팅(UX-022)에서 스미싱 링크 칩을 탭하면 나타나는 정적 목업이다. **입력값은 서버로 전송되지
// 않는다 — 이 화면을 위한 콜러블이 존재하지 않는다**(구조적 금지, AC-045): 이 파일은 어떤
// src/lib/api 함수도 import하지 않고, "확인" 버튼은 로컬 state만 바꾼다(가짜 피드백). 실 브랜드
// 명·로고·실 URL은 쓰지 않는다(AC-032 무해화).
import { useState } from "react";
import EndTrainingButton from "./EndTrainingButton";
import { Banner, Button } from "./ui";

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
      {/* AC-022/045 상시 표식 — 브랜드 스킨과 무관한 모듈이라 새 디자인 시스템(Banner)을 자유롭게
          적용한다. 텍스트는 기존 문구 그대로(내용 변경 없음, 컨테이너만 Banner로 교체). */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-[#E2DDD3] bg-white px-4 py-3">
        <Banner variant="caution" sticky className="flex-1">
          <span className="font-semibold text-[#B96A1B]">AI 훈련용 모의 화면</span> · 실제 로그인/전송이
          아닙니다
        </Banner>
        <EndTrainingButton onClick={onEndTraining} />
      </div>

      {/* 메신저 플로우.dc.html "가짜 브라우저 주소창" 재현 — 링크의 displayText(=이미 채팅에
          표시된 모의 URL)를 그대로 다시 보여줄 뿐, 새 state·네트워크 호출은 없다(AC-045 무변경). */}
      <div className="flex items-center gap-2 border-b border-[#E2DDD3] bg-[#F2EFE9] px-4 py-2.5">
        <div className="flex h-9 flex-1 items-center gap-2 rounded-full border border-[#E2DDD3] bg-white px-3.5">
          <span aria-hidden="true" className="text-xs text-[#C6392F]">
            ⚠
          </span>
          <p className="truncate font-mono text-xs text-[#6B655C]">{title}</p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 p-6">
        {submitted ? (
          <div className="flex flex-col gap-4 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-5">
            <p role="status" className="text-lg font-semibold text-[#0E6B62]">
              입력되었습니다.
            </p>
            <p className="text-sm leading-relaxed text-[#6B655C]">
              (실제로는 어디에도 전송되지 않았습니다 — 훈련용 모의 화면입니다.)
            </p>
            <Button type="button" onClick={onClose}>
              채팅으로 돌아가기
            </Button>
          </div>
        ) : (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2EFE9]">
              <span aria-hidden="true" className="text-2xl">
                🔒
              </span>
            </div>
            <div className="-mt-4 flex flex-col gap-2">
              <h1 className="text-xl font-bold leading-snug text-[#22303A]">본인확인이 필요합니다</h1>
              <p className="text-sm leading-relaxed text-[#6B655C]">
                안전한 서비스 이용을 위해 아래 정보를 입력해 주세요.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#22303A]">
                이름
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="이름을 입력하세요"
                  className="min-h-[48px] rounded-[10px] border border-[#E2DDD3] px-3.5 text-base text-[#22303A] outline-none focus:border-[#6B655C]"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#22303A]">
                연락처
                <input
                  type="text"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="연락처를 입력하세요"
                  className="min-h-[48px] rounded-[10px] border border-[#E2DDD3] px-3.5 text-base text-[#22303A] outline-none focus:border-[#6B655C]"
                />
              </label>

              {/* "확인" 버튼은 일부러 앱 브랜드 청록(#0E6B62)이 아닌 중립 회색(#41525E)을 쓴다 —
                  이 화면이 우리 앱의 정식 CTA가 아니라 "낯선 가짜 사이트"라는 느낌을 유지해 훈련
                  효과(진짜 앱 버튼과 구분)를 살린다(메신저 플로우.dc.html의 동일 의도적 선택). */}
              <button
                type="submit"
                className="min-h-[52px] rounded-[10px] bg-[#41525E] text-base font-semibold text-white transition-colors hover:bg-[#374049]"
              >
                확인
              </button>
              <p className="text-center text-xs text-[#C9C2B6]">ⓒ 본인확인센터</p>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] rounded-[10px] border border-[#C9C2B6] px-6 py-2.5 text-base font-semibold text-[#22303A] hover:bg-white"
              >
                닫기
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
