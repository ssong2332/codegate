"use client";

// UX-023 스미싱 링크 인앱 가짜 랜딩 (T29) — docs/UX.md UX-023, AC-045/032/022.
// 채팅(UX-022)에서 스미싱 링크 칩을 탭하면 나타나는 정적 목업이다. **입력값은 서버로 전송되지
// 않는다 — 이 화면을 위한 콜러블이 존재하지 않는다**(구조적 금지, AC-045): 이 파일은 어떤
// src/lib/api 함수도 import하지 않고, "확인" 버튼은 로컬 state만 바꾼다(가짜 피드백). 실 브랜드
// 명·로고·실 URL은 쓰지 않는다(AC-032 무해화).
//
// ── T84(UX-023 v1.12 kind 축 · §15.9.1 · DECISIONS #42 · AC-072) ─────────────────────────────
// **kind 분기는 반드시 이 파일 *안에서* 한다(R1).** 신규 컴포넌트 파일·신규 라우트를 만들지
// 않는다. 이유는 "화면이 하나"여서가 아니라 **안전 계약이 파일 단위로 성립**하기 때문이다 —
// 위 (1) `src/lib/api` 미import, (2) 제출이 로컬 state만 변경, (3) 상시 모의 표식 + 상시 "훈련
// 종료"가 모두 이 파일 안에서 보장된다. 파일을 쪼개면 그 계약이 신규 파일에는 자동으로 적용되지
// 않아 **검증 경로가 이중화**되고, 그것이 정확히 AC-072가 금지한 상태다. 파일이 커지면 아래처럼
// **같은 파일 안의 서브 컴포넌트**로 나눈다.
//
// ⚠️ **AC-072 하드 제약(이 파일에 없어야 하는 것 — 스캔 테스트가 고정한다)**: 실 설치 파일·
// 앱스토어 링크·**실존 앱명**·실제 OS/브라우저 권한 API 호출(`navigator.permissions`·
// `getUserMedia`·`Notification.requestPermission` 등)·외부 네비게이션(`window.open`·`href=`·
// `http(s)://`)·`fetch`/`httpsCallable`. "권한 허용"은 **화면 안의 가짜 버튼**일 뿐이고, 참가자
// 기기에는 아무것도 설치되지 않는다. 응낙 사실의 기록은 **페이지**가 콜백을 받아 콜러블로
// 처리한다(§15.9.6 — 이 컴포넌트는 콜백만 위로 올린다).
//
// ⚠️ 아래 app-install 문구는 서버 카탈로그(`functions/src/scenarios/mockScreens.ts`)의
// `headline`/`bodyLines`/`consentLabel`이 정본이며, 두 곳이 갈라지지 않도록 드리프트 테스트
// (`src/components/mockScreenCopy.test.ts`)가 문자열을 직접 대조한다.
import { useEffect, useState } from "react";
import EndTrainingButton from "./EndTrainingButton";
import { Banner, Button } from "./ui";

/** UX-023의 목업 종류. 부재 → `credential-form`(하위호환 읽기 규칙, §15.9.1 R2). */
export type MessengerFakeLandingKind = "credential-form" | "app-install";

type MessengerFakeLandingProps = {
  /** 링크의 displayText(모의 표기) — 이 목업의 제목으로도 그대로 쓴다. */
  title: string;
  /** 서버 카탈로그가 확정한 목업 종류(§15.9.1 R3). 클라가 문자열로 추론하지 않는다. */
  landingKind?: MessengerFakeLandingKind;
  /** 닫기/복귀 — UX-022 채팅으로 되돌아간다. */
  onClose: () => void;
  /** "훈련 종료"는 이 화면에서도 접근 가능해야 한다(AC-006). */
  onEndTraining: () => void;
  /**
   * kind=`app-install`에서 참가자가 가짜 "권한 허용"에 응한 순간(§15.9.5 e-1 D-51 ④).
   * ⚠️ 이 컴포넌트는 **네트워크 호출을 하지 않는다** — 기록은 페이지가 담당한다(§15.9.6).
   */
  onInstallConsent?: () => void;
};

export default function MessengerFakeLanding({
  title,
  landingKind = "credential-form",
  onClose,
  onEndTraining,
  onInstallConsent,
}: MessengerFakeLandingProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — 훈련용 모의 화면`}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#FAF8F5]"
    >
      {/* AC-022/045 상시 표식 — 브랜드 스킨과 무관한 모듈이라 새 디자인 시스템(Banner)을 자유롭게
          적용한다. 텍스트는 기존 문구 그대로(내용 변경 없음, 컨테이너만 Banner로 교체).
          ⚠️ T84: 이 헤더는 **두 kind가 공유**한다 — 표식(AC-022)과 상시 종료(AC-006)가 kind와
          무관하게 성립해야 하고, 그것이 파일 분리를 금지하는 두 번째 이유다(§15.9.4 표 #2). */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-[#E2DDD3] bg-white px-4 py-3">
        <Banner variant="caution" sticky className="flex-1">
          <span className="font-semibold text-[#B96A1B]">AI 훈련용 모의 화면</span> ·{" "}
          {landingKind === "app-install"
            ? "실제 설치·권한 부여가 아닙니다"
            : "실제 로그인/전송이 아닙니다"}
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
        {landingKind === "app-install" ? (
          <AppInstallMockup onClose={onClose} onConsent={onInstallConsent} />
        ) : (
          <CredentialFormMockup onClose={onClose} />
        )}
      </div>
    </div>
  );
}

/** 기존 kind — 가짜 로그인/정보입력 랜딩(T29 원본 그대로, 문구·동작 무변경). */
function CredentialFormMockup({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // AC-045 핵심 — 여기서 어떤 네트워크 호출도 하지 않는다. 로컬 state만 바꿔 가짜 피드백을 준다.
    setSubmitted(true);
  };

  if (submitted) {
    return (
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
    );
  }

  return (
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
  );
}

/** 서버 카탈로그(`functions/src/scenarios/mockScreens.ts`)와 **문자열이 일치해야 하는** 문구.
 *  드리프트 테스트가 두 파일을 직접 대조한다. */
const INSTALL_HEADLINE = "업무처리 확인 앱을 설치해야 진행됩니다";
const INSTALL_BODY_LINES = [
  "지원금 신청은 본인확인 절차가 끝난 뒤에 접수됩니다.",
  "아래에서 확인용 앱 설치를 진행해 주세요.",
  "설치 후 접근 권한을 허용하면 담당자가 신청을 대신 처리해 드립니다.",
];
const INSTALL_CONSENT_LABEL = "권한 허용하고 계속하기";

/** 가짜 설치 진행 표시의 단계(UX-023 v1.12 ①→②→③→④). 전부 **로컬 state**이며 시간 경과 외에
 *  아무 부수효과가 없다 — 타이머는 진행률 숫자만 올린다. */
type InstallPhase = "intro" | "installing" | "permission" | "done";

/**
 * 신규 kind — 모의 앱 설치·원격 지원 허용(UF-012 2단계).
 *
 * ⚠️ **여기서 일어나는 일은 전부 화면 안의 연출이다**: 진행률은 `setInterval`이 올리는 숫자이고,
 * "권한 허용"은 `<button>`이며, 브라우저·OS 권한 API를 **호출하지 않는다**. 참가자 기기에는
 * 아무것도 설치되지 않고 외부로 나가는 경로도 없다(AC-072).
 * ⚠️ 응낙 순간의 **기록**은 `onConsent` 콜백으로 페이지에 넘긴다 — 이 파일에 네트워크 경로가
 * 없다는 불변식을 kind 추가 후에도 유지하기 위해서다(§15.9.6, 기존 `onClose`/`onEndTraining`과
 * 같은 패턴).
 */
function AppInstallMockup({ onClose, onConsent }: { onClose: () => void; onConsent?: () => void }) {
  const [phase, setPhase] = useState<InstallPhase>("intro");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (phase !== "installing") return;
    const timer = setInterval(() => {
      setProgress((current) => {
        const next = current + 20;
        if (next >= 100) {
          clearInterval(timer);
          setPhase("permission");
          return 100;
        }
        return next;
      });
    }, 260);
    return () => clearInterval(timer);
  }, [phase]);

  const handleConsent = () => {
    // AC-045/AC-072 핵심 — 여기서 어떤 네트워크 호출도, 어떤 권한 API 호출도 하지 않는다.
    // 로컬 state로 가짜 완료 피드백을 주고, "응했다"는 사실만 페이지로 올린다.
    setPhase("done");
    onConsent?.();
  };

  return (
    <>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2EFE9]">
        <span aria-hidden="true" className="text-2xl">
          📱
        </span>
      </div>
      <div className="-mt-4 flex flex-col gap-2">
        <h1 className="text-xl font-bold leading-snug text-[#22303A]">{INSTALL_HEADLINE}</h1>
        {INSTALL_BODY_LINES.map((line) => (
          <p key={line} className="text-sm leading-relaxed text-[#6B655C]">
            {line}
          </p>
        ))}
      </div>

      {phase === "intro" && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setPhase("installing")}
            className="min-h-[52px] rounded-[10px] bg-[#41525E] text-base font-semibold text-white transition-colors hover:bg-[#374049]"
          >
            설치 진행하기
          </button>
          <p className="text-center text-xs text-[#C9C2B6]">ⓒ 업무처리 확인센터</p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-[10px] border border-[#C9C2B6] px-6 py-2.5 text-base font-semibold text-[#22303A] hover:bg-white"
          >
            닫기
          </button>
        </div>
      )}

      {phase === "installing" && (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-base font-semibold text-[#22303A]">
            설치 중... {progress}%
          </p>
          {/* 진행 바 — 색만으로 상태를 전달하지 않도록 위 숫자 라벨과 함께 쓴다(접근성 규칙). */}
          <div aria-hidden="true" className="h-2.5 w-full overflow-hidden rounded-full bg-[#E2DDD3]">
            <div
              className="h-full rounded-full bg-[#41525E] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-[10px] border border-[#C9C2B6] px-6 py-2.5 text-base font-semibold text-[#22303A] hover:bg-white"
          >
            닫기
          </button>
        </div>
      )}

      {phase === "permission" && (
        <div className="flex flex-col gap-4 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-5">
          {/* ⚠️ 실제 OS 권한 요청 다이얼로그가 **뜨지 않는다** — 화면 안에 그린 가짜 확인창이다. */}
          <p className="text-base font-semibold text-[#22303A]">
            설치가 끝났습니다. 계속하려면 접근 권한을 허용해 주세요.
          </p>
          <button
            type="button"
            onClick={handleConsent}
            className="min-h-[52px] rounded-[10px] bg-[#41525E] text-base font-semibold text-white transition-colors hover:bg-[#374049]"
          >
            {INSTALL_CONSENT_LABEL}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-[10px] border border-[#C9C2B6] px-6 py-2.5 text-base font-semibold text-[#22303A] hover:bg-white"
          >
            허용하지 않고 닫기
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-4 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-5">
          <p role="status" className="text-lg font-semibold text-[#0E6B62]">
            권한이 허용되었습니다.
          </p>
          <p className="text-sm leading-relaxed text-[#6B655C]">
            (실제로는 아무것도 설치되지 않았고 어떤 권한도 부여되지 않았습니다 — 훈련용 모의
            화면입니다.)
          </p>
          <Button type="button" onClick={onClose}>
            채팅으로 돌아가기
          </Button>
        </div>
      )}
    </>
  );
}
