"use client";

// UX-009 사칭 이미지 (P1, Track B, T12, AC-025/AC-022) — 핵심 루프 비차단.
//
// 정적 에셋 판단(구현 보고서 참조): 이미지 생성 도구가 붙어 있지 않아(프로토타입 우선순위,
// CLAUDE.md 추측 금지 원칙에 따라 없는 도구를 있다고 가정하지 않음) 실제 PNG/SVG 파일 대신
// HTML/CSS로 그린 가짜 은행 앱 "송금완료" 화면을 기본 렌더링으로 사용한다. `src`를 넘기면 실제
// 이미지 에셋(정적 파일 또는 향후 생성 파이프라인 산출물)로 교체 가능하도록 인터페이스만 남겨둔다
// (Architecture.md §12 UX-009 행 "정적 에셋" 계약과 정합 — 구현 방식은 CSS 카드, 계약은 이미지 슬롯).
//
// AC-022: SyntheticLabel(공용 컴포넌트, AC-022)을 항상 함께 노출한다(카드 내부 화면 상시 라벨).
// AC-023: 실제 계좌번호·수취인 등은 전부 가상/placeholder이며 "실제 송금이 아닙니다" 문구를 덧붙여
// 실제 송금·계좌 기능이 없음을 이미지 자체에서도 명확히 한다.
// UX-009 Failure: "로드 실패 시 생략(핵심 루프 비차단)" — `src`가 주어진 실제 이미지 로드가
// 실패하면 컴포넌트 전체를 조용히 생략한다(화면 전체를 막는 에러 UI를 만들지 않는다). `src`가
// 없는 기본 CSS 카드 경로는 네트워크 로드가 없어 이 실패 모드가 발생하지 않는다.
import { useState } from "react";
import SyntheticLabel from "./SyntheticLabel";

type SpoofImageProps = {
  /** 실제 이미지 에셋 경로(선택). 미전달 시 내장 HTML/CSS 가짜 송금완료 카드를 렌더링한다. */
  src?: string;
  /** 대체 텍스트(Accessibility, UX-009 스펙). */
  alt?: string;
  /** 부모(역할극 채팅 화면)가 "닫기" 동작을 주입한다. 미전달 시 닫기 버튼을 숨긴다(단독 사용 가능). */
  onClose?: () => void;
};

const DEFAULT_ALT = "은행 앱 송금완료 화면을 흉내낸 AI 훈련용 합성 이미지";

export default function SpoofImage({ src, alt = DEFAULT_ALT, onClose }: SpoofImageProps) {
  const [imgFailed, setImgFailed] = useState(false);

  // 실제 에셋 로드 실패 → 조용히 생략(UX.md UX-009 States: Error "로드 실패 시 생략").
  if (src && imgFailed) return null;

  return (
    <div
      role="img"
      aria-label={alt}
      className="relative mx-auto w-full max-w-xs overflow-hidden rounded-xl border border-gray-300 shadow-lg"
    >
      {/* AC-022 합성 표식 — 화면 상시 라벨(카드 위 고정 오버레이). */}
      <div className="absolute right-2 top-2 z-10">
        <SyntheticLabel />
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="사칭 이미지 닫기"
          className="absolute left-2 top-2 z-10 flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full bg-black/60 text-sm font-bold text-white hover:bg-black/80"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}

      {src ? (
        // 세션 종료 시 폐기 대상 임시 합성물 후보(Storage 경로)까지 포함해 확장될 수 있어
        // next/image 최적화 파이프라인 없이 단순 <img>로 둔다(현재는 정적 카드가 기본 경로라 실사용 없음).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          onError={() => setImgFailed(true)}
          className="block w-full"
        />
      ) : (
        // 기본 렌더링: 정적 이미지 에셋 대신 HTML/CSS로 그린 가짜 은행 앱 송금완료 화면.
        // 계좌번호·수취인·시각은 전부 가상 placeholder(AC-023 — 실제 송금·계좌 기능 아님을
        // 텍스트로도 명시).
        <div className="flex flex-col gap-4 bg-gradient-to-b from-sky-600 to-sky-700 p-6 text-white">
          <p className="text-xs opacity-80">OO뱅크 (가상 은행 · 실제 존재하지 않음)</p>
          <div className="flex flex-col items-center gap-2 py-4">
            <span aria-hidden="true" className="text-4xl">
              ✅
            </span>
            <p className="text-lg font-bold">송금완료</p>
            <p className="text-3xl font-extrabold">1,000,000원</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-white/10 p-4 text-sm">
            <dt className="opacity-80">받는분</dt>
            <dd className="text-right font-semibold">홍길동(가상)</dd>
            <dt className="opacity-80">계좌번호</dt>
            <dd className="text-right font-mono">000-0000-0000-00 (가상)</dd>
            <dt className="opacity-80">거래시각</dt>
            <dd className="text-right">00:00:00 (가상)</dd>
          </dl>
          <p className="text-center text-xs opacity-90">
            ※ 실제 송금이 아닙니다. AI 훈련용으로 합성된 화면입니다.
          </p>
        </div>
      )}
    </div>
  );
}
