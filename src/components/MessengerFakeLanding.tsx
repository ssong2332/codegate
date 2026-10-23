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
// 위 (1) `src/lib/api` 미import, (2) 제출이 로컬 state만 변경, (3) 이 화면에 종료 버튼을 두지 않음(사용자 결정
// 2026-10-18 — 브라우저 바의 종료 버튼 제거. 끝내는 경로는 메신저 = 닫기 → 대화 화면의 종료 버튼, 문자함 = "‹ 문자"
// → "통화로 돌아가기" → 빨간 통화 종료. T187 §72 — 세션 중 표식도 폐지)가 모두 이 파일 안에서 보장된다.
// 파일을 쪼개면 그 계약이 신규 파일에는 자동으로 적용되지
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
import { useEffect, useRef, useState, type ReactNode } from "react";
import PhoneIcon from "./PhoneIcon";
import { Button } from "./ui";
// ⚠️ 상대 경로로 import한다 — 렌더 게이트 하네스(`src/lib/mockscreenrender/renderHarness.ts`)가 CommonJS require로
// 이 파일을 불러와 `@/` 별칭을 풀지 못한다. 토큰 모듈은 값 import가 없는 잎 모듈이다.
import { LANDING_PAGE_TOKENS, browserBarTokensFor } from "../lib/phone/skinTokens";
import type { MessengerSkin } from "../lib/messenger/detectSkin";
// §101 추가 — 금액 검증 · 한글 단위 표기 · 필수 칸 안내(잎 모듈 · 상대 경로 — 렌더 하네스 관례).
import { amountError, amountHint, requiredFieldError } from "../lib/landing/amountInput";
// §106 — 사건 기록 열람본의 피의자 칸 값(잎 모듈 · 상대 경로).
import { recordIssueInfo, recordSubjectRows, type RecordRow } from "../lib/landing/recordDocument";

/** UX-023의 목업 종류. 부재 → `credential-form`(하위호환 읽기 규칙, §15.9.1 R2). */
export type MessengerFakeLandingKind = "credential-form" | "app-install";

/**
 * T190-5(docs/Architecture.md §74.8 · UX D-93 · D-94) — 이 랜딩을 연 표면. ⛔ **표현만** 가른다(kind 분기·제출
 * 무인자·네트워크 0은 그대로 — §15.9.4 파일 단위 계약):
 * - `"messenger"`(기본 · UX-022에서 연 경우) — 지금처럼 화면 전체를 덮는 대화상자. 완료 버튼 "채팅으로 돌아가기".
 * - `"in-call-sms"`(UX-027 문자함 안의 두 번째 보기) — 대화상자 역할·`aria-modal`·`fixed`가 **없는** 영역
 *   (문자함 대화상자 하나 안에 들어간다 — 중첩 `aria-modal` 0, G460). 완료 버튼 "문자로 돌아가기" · 브라우저 바
 *   왼쪽 "문자" 셰브런(숨김 = 입력값 유지, D-94). 통화 표시줄은 문자함이 맨 위에 한 번 그린다(T103 5요소).
 */
export type MessengerFakeLandingEntrySurface = "messenger" | "in-call-sms";

type MessengerFakeLandingProps = {
  /** 링크의 displayText(모의 표기) — 이 목업의 대화상자 이름(aria-label)으로 쓴다(주소창은 가짜 호스트). */
  title: string;
  /** 서버 카탈로그가 확정한 목업 종류(§15.9.1 R3). 클라가 문자열로 추론하지 않는다. */
  landingKind?: MessengerFakeLandingKind;
  /**
   * 상황별 콘텐츠 조회 키(T104 · §19.4 R8). **정확 일치 조회에만 쓴다** — 정규식·`startsWith`·
   * `includes`·부분 문자열 분해로 랜딩 성격을 추론하는 코드를 두지 않는다(AC-024 자유문자열 분류
   * 금지 원칙 계승). 미스면 **같은 kind의 기본 문구**로 떨어진다(R7 — 조회가 kind를 바꾸는 경로는
   * 만들지 않는다. 그것이 R5 "app-install 방향 폴백 금지"를 우회하는 유일한 구멍이다).
   */
  landingId?: string;
  /** 진입 표면(위 타입 주석). 부재 = `"messenger"` — 기존 호출부·렌더 게이트 무변경. */
  entrySurface?: MessengerFakeLandingEntrySurface;
  /** 브라우저 바의 기기 스킨(UX-023 v1.33 (2)(8) — 바의 모서리·배경만 다르다). 부재 = 기본. */
  skin?: MessengerSkin;
  /** 닫기/복귀 — 연 표면(채팅 또는 문자함)으로 되돌아간다. */
  onClose: () => void;
  /** `"in-call-sms"` 전용 — 브라우저 뒤로 "문자"(랜딩을 **숨기기만** 한다 · 입력값은 이 컴포넌트 안에 남는다). */
  onHide?: () => void;
  // ⚠️ 사용자 결정(2026-10-18) — 브라우저 바의 종료 버튼을 없애 `onEndTraining` prop도 없앴다(이 화면은 종료를
  // 직접 하지 않는다 — 연 표면으로 닫고, 그 표면의 종료 컨트롤로 끝낸다).
  /**
   * kind=`app-install`에서 참가자가 가짜 "권한 허용"에 응한 순간(§15.9.5 e-1 D-51 ④).
   * ⚠️ 이 컴포넌트는 **네트워크 호출을 하지 않는다** — 기록은 페이지가 담당한다(§15.9.6).
   */
  onInstallConsent?: () => void;
  /**
   * kind=`credential-form`에서 참가자가 입력 폼을 **제출한 순간**(T123 · AC-080 (b) — 응낙 판정
   * 지점은 제출 하나다. 링크 탭·화면 노출·입력 중은 승격되지 않는다).
   * ⛔⛔ **무인자다(§31.6 G138).** 인자를 실으면 참가자가 입력한 계좌번호·예금주명이 컴포넌트
   * 밖으로 나가는 첫 경로가 생기고, 그 순간부터 페이지가 그 값을 어디로도 보낼 수 있다 —
   * 이 파일의 금지 토큰 스캔은 그것을 잡지 못한다(AC-045). `mockScreenCopy.test.ts`의 G138
   * 블록이 무인자 형태를 단언하고 역검증까지 같이 둔다.
   * ⚠️ 이 컴포넌트는 **네트워크 호출을 하지 않는다** — 기록은 페이지가 담당한다(§15.9.6).
   */
  onCredentialSubmit?: () => void;
  /**
   * ⭐ §101(검찰 고급 자산 검수 사이트) — 여러 화면 사이트(`STEP_FLOW_COPY`)에서 **이체 전 단계 버튼**을 누른 순간. 인자는
   * `STEP_FLOW_EVENTS`의 고정 값 하나뿐이다(본인 확인 · 코인 전환 · 금액 입력 뒤 다음). 마지막 이체 확인은 위 `onCredentialSubmit`.
   * ⛔ 입력값(`values`)을 싣지 않는다(G138 동형 — `mockScreenCopy.test.ts` §101 블록). 이 컴포넌트는 네트워크 호출을 하지 않는다.
   */
  onLandingStep?: (step: LandingProgressEvent) => void;
  /**
   * ⭐ §101 추가 · UX D-115 — 이 랜딩을 연 문자의 **사기 측 수취 계좌**("{세션 은행명} {계좌번호}" — 서버 문자 문서 `bankName` · `accountNumber`).
   * `prefill: "account"`인 칸을 이 값으로 채운 **읽기 전용** 칸으로 그린다. 부재(옛 문서 · 메신저 진입) = 종전 빈 입력 칸.
   * ⛔ 참가자 입력이 아니다(서버 카탈로그 · 문자에서 온 값) — 어떤 콜백에도 싣지 않는다.
   */
  prefilledAccount?: string;
};

/** §101 — 이체 전 단계 기록 이벤트(서버 `functions/src/inCallSms/types.ts` `InCallSmsEvent`의 같은 3값). */
export type LandingProgressEvent = "landing_identity" | "landing_converted" | "landing_amount";

/** 완료 화면 복귀 버튼 문면(UX-023 v1.33 (5) · D-93) — 진입 표면이 정한다. 동작은 둘 다 `onClose`. */
const RETURN_LABELS: Record<MessengerFakeLandingEntrySurface, string> = {
  messenger: "채팅으로 돌아가기",
  "in-call-sms": "문자로 돌아가기",
};

/** 포커스 트랩 후보(InCallSmsOverlay와 같은 선택자). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function MessengerFakeLanding({
  title,
  landingKind = "credential-form",
  landingId,
  entrySurface = "messenger",
  skin = "default",
  onClose,
  onHide,
  onInstallConsent,
  onCredentialSubmit,
  onLandingStep,
  prefilledAccount,
}: MessengerFakeLandingProps) {
  const bar = browserBarTokensFor(skin);
  const returnLabel = RETURN_LABELS[entrySurface];
  const isMessenger = entrySurface === "messenger";

  // ── 메신저 진입 대화상자의 포커스(사용자 결정 2026-10-18 · UX-023 v1.36 표 · D-116) ───────────────────────────
  // 진입 = 대화상자 컨테이너(이름 "{표시} 화면") · 트랩 = ✕ → 입력 칸 → 제출 → 하단 닫기(첫/끝은 매 Tab마다 실제 보이는
  // 요소에서 다시 고른다 — 완료 화면이면 끝 = 복귀 버튼) · Esc = 닫기 · 닫힌 뒤 = 연 요소(링크)로 포커스 복귀.
  // ⚠️ 문자함 진입(`in-call-sms`)은 문자함 대화상자가 트랩·Esc를 맡는다(중첩 트랩 0 — G460). 여기서는 아무것도 하지 않는다.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!isMessenger) return;
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      const panel = dialogRef.current;
      if (!panel) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [isMessenger]);

  // T194-a(§84.13.3 ③ ⓑ) — 표에 없는 id의 `app-install`은 설치 화면을 그리지 않는다(지원금 문구 · credential 폴백 0 — UF-012 Failure (a) 생략).
  if (landingKind === "app-install" && installCopyFor(landingId) === undefined) return null;

  const content: ReactNode = (
    <>
      {/* ② 브라우저 바(UX-023 v1.33 (2) · D-92) — 높이 52px · 왼쪽(메신저 진입 = ✕ 닫기 · 문자함 진입 = "‹ 문자")
          + 주소 필드(지구본 + 가짜 호스트 · 오른쪽 끝 8px 앞까지 = 바의 `px-2`).
          ⚠️ 사용자 결정(2026-10-18) — 오른쪽 끝의 종료 버튼을 **없앴다**(메신저 진입·문자함 진입 둘 다). 주소 필드가
          `flex-1`로 남은 폭을 채우므로 옛 `justify-end`(종료 버튼을 오른쪽 끝에 붙이던 G449 클래스)도 뺐다.
          ⚠️ T84: 이 바는 **두 kind가 공유**한다 — 바가 kind와 무관하게 하나라는 것이 파일 분리를 금지하는 두 번째
          이유다(§15.9.4 표 #2). T187(§72 · AC-086 · D-82·D-84) — 세션 중 표식·난이도 배지는 없다.
          ⭐ T190-2/T190-5(§74.9 · D-101 · D-92) — 주소 = 그 랜딩의 **가짜 호스트**(`.invalid` · 호스트만 · 스킴 0 ·
          누를 수 없는 텍스트). 빨간 ⚠(사이트 위험 판정 힌트 — D-6 위반)·모노 글꼴·자물쇠("안전한 연결"이라는 새
          주장)를 그리지 않는다. 글꼴은 system-ui. `title`은 대화상자 이름(A5)으로만 쓴다. */}
      <div
        className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center gap-1.5 border-b px-2"
        style={{ backgroundColor: bar.barBg, borderColor: bar.barBorder, fontFamily: "system-ui, sans-serif" }}
      >
        {/* ⭐ 메신저 진입 전용 ✕(닫기 — UX-023 v1.36 표 · D-116 (3)): 종료 버튼이 빠진 뒤 위쪽 출구가 0이 되지 않게
            한다. 터치 48px · 단색 선 아이콘 22px · 이름 "닫기"(그 화면에 이미 있는 말 — 새 문구 0) · 동작 = 하단 닫기와
            같은 `onClose`. */}
        {isMessenger && (
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-12 w-12 shrink-0 items-center justify-center"
            style={{ color: bar.back }}
          >
            <PhoneIcon name="close" size={22} />
          </button>
        )}
        {entrySurface === "in-call-sms" && onHide && (
          <button
            type="button"
            onClick={onHide}
            className="flex h-12 min-w-[56px] shrink-0 items-center text-[15px]"
            style={{ color: bar.back }}
          >
            <PhoneIcon name="chevron-back" size={22} />
            문자
          </button>
        )}
        <div
          className="flex h-9 min-w-0 flex-1 items-center gap-1.5 px-2.5"
          style={{ backgroundColor: bar.fieldBg, borderRadius: bar.fieldRadiusPx }}
        >
          <span className="shrink-0" style={{ color: bar.icon }}>
            <PhoneIcon name="globe" size={16} />
          </span>
          <p className="truncate text-sm" style={{ color: bar.text }}>
            {landingHostFor(landingKind, landingId)}
          </p>
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col">
        {/* ⚠️ **kind 분기가 먼저 끝난다**(§19.4 R7). 상황별 콘텐츠 조회는 선택된 서브 컴포넌트
            **안쪽**에서만 일어나며, 조회 결과가 kind를 바꾸는 경로는 존재하지 않는다. */}
        {/* ⚠️ T194-a — `app-install`도 상황별 콘텐츠를 갖게 됐다(`subsidy-install` · `parcel-install` 2종 — UF-012 v1.38
            "콘텐츠 1벌"). 조회는 여전히 서브 컴포넌트 안쪽 · 정확 일치 · 같은 kind 기본 문구 폴백이다(INSTALL_LANDING_COPY). */}
        {landingKind === "app-install" ? (
          <AppInstallMockup
            landingId={landingId}
            onClose={onClose}
            onConsent={onInstallConsent}
            returnLabel={returnLabel}
          />
        ) : (
          <CredentialFormMockup
            landingId={landingId}
            onClose={onClose}
            onCredentialSubmit={onCredentialSubmit}
            onLandingStep={onLandingStep}
            prefilledAccount={prefilledAccount}
            returnLabel={returnLabel}
          />
        )}
      </div>
    </>
  );

  // ⭐ T190-5(§74.8 · G460) — 문자함 안에서 열리면 대화상자가 아니라 **영역**이다(문자함 대화상자 하나 안의 두 번째
  // 보기). `aria-label`은 두 경우 모두 같은 형태다(A5 — 꼬리 " 화면" 유지).
  if (entrySurface === "in-call-sms") {
    return (
      <div
        role="region"
        aria-label={`${title} 화면`}
        // reviewer Major — 문자함이 보기를 바꿀 때 이 영역으로 포커스를 옮긴다(스크린리더가 이름을 읽어 전환을 안다).
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto outline-none"
        style={{ backgroundColor: LANDING_PAGE_TOKENS.pageBg }}
      >
        {content}
      </div>
    );
  }
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 화면`}
      // 진입 포커스를 받는 컨테이너(UX-023 v1.36 — 이름을 읽어 전환을 안다). Tab 순서에는 들지 않는다.
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto outline-none"
      style={{ backgroundColor: LANDING_PAGE_TOKENS.pageBg }}
    >
      {content}
    </div>
  );
}

/** 상황별 랜딩 문구(T104 · UX-023 v1.13). **서버 카탈로그
 *  (`functions/src/scenarios/mockScreens.ts`)가 정본**이고 여기는 렌더 문자열이다 —
 *  두 패키지라 import로 공유할 수 없어 `mockScreenCopy.test.ts`가 소스 텍스트를 직접 대조한다.
 *  ⚠️ `placeholder`는 카탈로그 필드가 아닌 **순수 표현 힌트**다(숫자열 금지 — AC-005). */
type CredentialFieldCopy = {
  label: string;
  placeholder: string;
  /**
   * T190-5(UX-023 v1.33 (4) · D-93) — **클라 전용 자판 힌트**(`placeholder`와 같은 층 · 서버 카탈로그 필드 아님 —
   * 드리프트 대조 밖). 계좌번호·금액 칸에만 **필드별로 명시**한다(라벨로 추론하지 않는다 — §74.8).
   * ⛔ 검증이 아니다 — `type="text"` 유지 · maxlength·pattern·자동 서식·오류 문구 0.
   */
  inputMode?: "numeric";
  /** §101 추가 — 금액 칸(숫자 · 0 초과 검증 + 칸 아래 한글 단위 표기 "47억 원"). 라벨로 추론하지 않고 필드별로 명시한다. */
  amount?: true;
  /** §101 추가 · UX D-115 — 문자로 안내된 사기 측 수취 계좌로 미리 채우는 칸(값 = `prefilledAccount` · 읽기 전용). */
  prefill?: "account";
};
type CredentialCopy = {
  headline: string;
  bodyLines: string[];
  fields: CredentialFieldCopy[];
  submitLabel: string;
  successHeadline: string;
  issuerLabel: string;
  /** T190-2(§74.9) — 가짜 주소창 호스트(`.invalid`). 서버 카탈로그 `mockHost`와 글자 단위로 같다(G76). */
  mockHost: string;
};

/** 콘텐츠가 없는 landingId의 폴백(§15.9.1 R5 · AC-078 (d)) — **범용 화면**이다.
 *  ⛔ 어떤 경우에도 `app-install` 방향으로 떨어지지 않는다(그쪽은 kind가 정하며 이 표는 kind를
 *  바꾸지 못한다 — 애초에 `AppInstallMockup`은 이 표를 보지 않는다). T29 원본 문구 그대로. */
const GENERIC_CREDENTIAL_COPY: CredentialCopy = {
  headline: "본인확인이 필요합니다",
  bodyLines: ["안전한 서비스 이용을 위해 아래 정보를 입력해 주세요."],
  fields: [
    { label: "이름", placeholder: "이름을 입력하세요" },
    { label: "연락처", placeholder: "연락처를 입력하세요" },
  ],
  submitLabel: "확인",
  successHeadline: "입력되었습니다.",
  issuerLabel: "ⓒ 본인확인센터",
  // T190-2(§74.9) — 서버 카탈로그에 없는 **클라 범용 폴백 호스트**(같은 D-101 규칙 — `mockScreenCopy.test.ts` G453).
  mockHost: "id-verify-center.invalid",
};

/** landingId → 상황별 문구. **정확 일치 조회만 한다**(R8). */
const CREDENTIAL_LANDING_COPY: Record<string, CredentialCopy> = {
  "parcel-redelivery": {
    headline: "주소가 확인되지 않아 배송이 보류되었습니다",
    bodyLines: [
      "받는 분 정보가 일부 확인되지 않아 물품이 접수처에 보관 중입니다.",
      "아래 정보를 확인해 주시면 오늘 중으로 재배송이 접수됩니다.",
    ],
    fields: [
      { label: "받는 분 성함", placeholder: "성함을 입력하세요" },
      { label: "연락처", placeholder: "연락처를 입력하세요" },
      { label: "받으실 주소", placeholder: "주소를 입력하세요" },
    ],
    submitLabel: "재배송 신청하기",
    successHeadline: "재배송이 접수되었습니다.",
    issuerLabel: "ⓒ 종합물류 재배송 접수처",
    mockHost: "parcel-resend-desk.invalid",
  },
  "loan-refinance-apply": {
    headline: "전환 신청서 본인확인이 필요합니다",
    bodyLines: [
      "저금리 전환 승인을 위해 신청인 본인 확인이 남아 있습니다.",
      "아래 정보를 입력하시면 상담사가 접수 완료를 안내해 드립니다.",
    ],
    fields: [
      { label: "성함", placeholder: "성함을 입력하세요" },
      { label: "생년월일", placeholder: "생년월일을 입력하세요" },
      { label: "연락처", placeholder: "연락처를 입력하세요" },
    ],
    submitLabel: "본인확인 완료하기",
    successHeadline: "본인확인이 완료되었습니다.",
    issuerLabel: "ⓒ 대환대출 전환심사팀",
    mockHost: "loan-switch-center.invalid",
  },
  "tax-refund-claim": {
    headline: "환급금 받으실 계좌를 등록해 주세요",
    bodyLines: [
      "조회된 미수령 환급금이 확인되었습니다.",
      "받으실 계좌를 등록하시면 당일 지급 처리됩니다.",
    ],
    fields: [
      { label: "예금주", placeholder: "예금주를 입력하세요" },
      { label: "은행", placeholder: "은행을 입력하세요" },
      { label: "계좌번호", placeholder: "계좌번호를 입력하세요", inputMode: "numeric" },
    ],
    submitLabel: "계좌 등록하기",
    successHeadline: "계좌가 등록되었습니다.",
    issuerLabel: "ⓒ 환급금 지급 안내센터",
    mockHost: "refund-pay-center.invalid",
  },
  // §92.3(DECISIONS #206) — 고급 전용 2종의 통화 중 문자 랜딩(서버 `functions/src/scenarios/mockScreens.ts`와 같은 글자).
  "asset-custody-apply": {
    headline: "수사 종료 시까지 자산 보관 신청이 필요합니다",
    bodyLines: [
      "명의 도용 정황이 확인되어 보호 조치 대상으로 분류되었습니다.",
      "신청서를 제출하시면 담당 직원이 보관 절차를 안내해 드립니다.",
    ],
    fields: [
      { label: "보관 신청 금액", placeholder: "금액을 입력하세요", inputMode: "numeric", amount: true },
      { label: "돈을 찾을 은행", placeholder: "은행을 입력하세요" },
      { label: "찾는 방법(현금 또는 수표)", placeholder: "현금 또는 수표" },
    ],
    submitLabel: "보관 신청하기",
    successHeadline: "보관 신청이 접수되었습니다.",
    issuerLabel: "ⓒ 자산보호 보관접수 안내",
    mockHost: "asset-custody-desk.invalid",
  },
  "case-record-view": {
    headline: "사건 기록 열람 전 본인 확인이 필요합니다",
    bodyLines: [
      "고객님 명의가 관련된 사건이 접수되어 있습니다.",
      "본인 확인이 끝나면 영장 사본과 사건 기록을 바로 열람하실 수 있습니다.",
    ],
    fields: [
      { label: "성명", placeholder: "성명을 입력하세요" },
      { label: "생년월일", placeholder: "생년월일을 입력하세요" },
      { label: "휴대전화 번호", placeholder: "휴대전화 번호를 입력하세요" },
    ],
    submitLabel: "사건 기록 열람하기",
    successHeadline: "본인 확인이 완료되었습니다.",
    issuerLabel: "ⓒ 사건조회 안내센터",
    mockHost: "case-view-center.invalid",
  },
  // §101 — 검찰 고급 fv-h3vn 자산 검수 사이트의 첫 화면(본인 확인). 이어지는 화면은 아래 `STEP_FLOW_COPY`(서버 카탈로그와 글자 단위로 동일).
  "asset-check-site": {
    headline: "사건 관련 자산 검수를 위해 본인 확인이 필요합니다",
    bodyLines: [
      "고객님 명의 자산이 범죄수익 여부 검수 대상으로 분류되었습니다.",
      "본인 확인이 끝나면 검수 대상 자산과 보관 절차가 안내됩니다.",
    ],
    fields: [
      { label: "성명", placeholder: "성명을 입력하세요" },
      { label: "생년월일", placeholder: "생년월일을 입력하세요" },
    ],
    submitLabel: "본인 확인하기",
    successHeadline: "보관 지갑 이체가 접수되었습니다.",
    issuerLabel: "ⓒ 사건자산 검수 안내센터",
    mockHost: "asset-review-desk.invalid",
  },
  // §98 — 검찰 고급 fv-c8wq 둘째 화면(이체형 — 서버 카탈로그 mockScreens.ts와 글자 단위로 동일).
  "asset-check-wallet": {
    headline: "검수 전용 보관 지갑 전송이 아직 완료되지 않았습니다",
    bodyLines: [
      "범죄수익 여부 검수가 끝날 때까지 코인으로 바꾼 자산을 보관 지갑에 맡겨 두셔야 합니다.",
      "문자로 안내된 지갑 번호와 전송할 금액을 아래에 입력해 주세요.",
    ],
    fields: [
      { label: "보관 지갑 번호", placeholder: "문자로 받은 지갑 번호를 입력하세요" },
      { label: "전송 금액", placeholder: "전송하실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "보관 지갑으로 전송하기",
    successHeadline: "보관 지갑 전송이 접수되었습니다.",
    issuerLabel: "ⓒ 사건자산 검수센터",
    mockHost: "asset-check-wallet.invalid",
  },
  "courier-customs-check": {
    headline: "수취인 정보가 일치하지 않아 통관이 보류되었습니다",
    bodyLines: [
      "국제 배송 물품의 수취인 정보가 확인되지 않았습니다.",
      "아래 정보를 확인해 주셔야 통관 절차가 재개됩니다.",
    ],
    fields: [
      { label: "수취인 성함", placeholder: "성함을 입력하세요" },
      { label: "연락처", placeholder: "연락처를 입력하세요" },
      { label: "생년월일", placeholder: "생년월일을 입력하세요" },
    ],
    submitLabel: "수취인 정보 확인하기",
    successHeadline: "수취인 정보가 확인되었습니다.",
    issuerLabel: "ⓒ 국제통관지원센터",
    mockHost: "customs-check-desk.invalid",
  },
  // §51 — 이체형 가짜 랜딩(§45 ⓐ 집행, UX-023 v1.25 (2)/(17-a) 정본 — bodyLines 둘째 줄은
  // T116 G194(라벨 중복 등장) 정정 후 문면, 서버 카탈로그(mockScreens.ts)와 글자 단위로 동일).
  "safe-account-transfer": {
    headline: "안전계좌 이체가 아직 완료되지 않았습니다",
    bodyLines: [
      "범죄 연루가 확인된 자금은 임시 안전계좌로 옮겨야 보호 조치가 적용됩니다.",
      "이체하실 금액만 입력하시면 보호 조치가 바로 적용됩니다.",
    ],
    fields: [
      { label: "안전계좌 번호", placeholder: "문자로 받은 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "이체 금액", placeholder: "이체하실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "안전계좌로 이체하기",
    successHeadline: "안전계좌로 이체가 완료되었습니다.",
    issuerLabel: "ⓒ 자산보호 이체 안내센터",
    mockHost: "jasan-boho-center.invalid",
  },
  // §51 — 이체형 가짜 랜딩(§45 ⓐ 집행, UX-023 v1.25 (2)/(17-a) 정본 — bodyLines 둘째 줄은
  // T116 G194 정정 후 문면, 서버 카탈로그(mockScreens.ts)와 글자 단위로 동일).
  "card-relief-transfer": {
    headline: "피해금 이관 신청이 완료되지 않았습니다",
    bodyLines: [
      "진행 중인 해외 결제 승인을 막으려면 잔액을 이관 전용 계좌로 옮기셔야 합니다.",
      "이관하실 금액을 적고 아래 버튼을 눌러 주세요.",
    ],
    fields: [
      { label: "이관 전용 계좌번호", placeholder: "문자로 받은 이관 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "이관 금액", placeholder: "이관하실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "피해금 이관하기",
    successHeadline: "피해금 이관이 접수되었습니다.",
    issuerLabel: "ⓒ 카드 피해금 이관 지원센터",
    mockHost: "card-relief-desk.invalid",
  },
  // §53(§51 커밋 D) — 이체형 가짜 랜딩(UX-023 v1.25 (2)/(17-a) 정본 — bodyLines 둘째 줄은
  // T116 G194 정정 후 문면, 서버 카탈로그(mockScreens.ts)와 글자 단위로 동일).
  "protect-account-transfer": {
    headline: "보호계좌로 옮기기가 아직 처리되지 않았습니다",
    bodyLines: [
      "비정상 출금 시도가 확인되어 잔액을 옮겨 두셔야 출금이 막힙니다.",
      "옮겨 두실 금액을 입력하면 출금 차단이 시작됩니다.",
    ],
    fields: [
      { label: "보호계좌 번호", placeholder: "문자로 받은 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "옮길 금액", placeholder: "옮기실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "보호계좌로 옮기기",
    successHeadline: "보호계좌로 옮기기가 처리되었습니다.",
    issuerLabel: "ⓒ 금융사고대응 보호계좌센터",
    mockHost: "acct-protect-desk.invalid",
  },
};

/** §101 — 여러 화면 사이트의 둘째 화면부터(서버 카탈로그 `MockScreenItem.stepScreens`와 1:1 · 글자 단위 동일). */
type StepScreenCopy = {
  headline: string;
  bodyLines: string[];
  /** 화면에 나열만 하는 줄(입력 아님). */
  items?: string[];
  fields?: CredentialFieldCopy[];
  actionLabel: string;
};

/**
 * ⭐ §101(2026-10-21 사용자 요청 — *"제공되는 웹사이트에서 코인 전환하고 이체하고 하는 거로 가자"*) — 여러 화면 사이트. 키 = landingId(정확 일치 — R8).
 * 첫 화면 = `CREDENTIAL_LANDING_COPY`의 같은 키(본인 확인), 그 뒤 = 이 배열 순서. 화면 i(0 = 본인 확인)의 버튼은 `STEP_FLOW_EVENTS[i]`를 올리고,
 * 마지막 화면의 버튼은 종전 제출(`onCredentialSubmit`)이다. ⛔ 거래소 가입 · 입금 · 매수 같은 실제 조작 단계는 화면에 없다(버튼 하나가 "전환"을 대신한다).
 */
const STEP_FLOW_COPY: Record<string, StepScreenCopy[]> = {
  "asset-check-site": [
    {
      headline: "검수 대상 자산이 확인되었습니다",
      bodyLines: [
        "아래 자산은 검수가 끝날 때까지 안전 자산(코인)으로 전환해 보관하셔야 합니다.",
        "전환하지 않은 자산은 증거 보전을 위해 동결될 수 있습니다.",
      ],
      items: ["거래 은행 예금 · 검수 대상", "적금 · 검수 대상", "대출 가능액 · 검수 대상"],
      actionLabel: "안전 자산(코인)으로 전환하기",
    },
    {
      headline: "오늘 전환할 금액을 입력해 주세요",
      bodyLines: [
        "검수 대상 자산 가운데 오늘 전환할 금액을 입력해 주세요.",
        "전환된 자산은 다음 화면에서 검수 전용 보관 지갑으로 옮겨집니다.",
      ],
      fields: [{ label: "전환 금액", placeholder: "전환하실 금액을 입력하세요", inputMode: "numeric", amount: true }],
      actionLabel: "다음",
    },
    {
      headline: "검수 전용 보관 지갑으로 이체합니다",
      bodyLines: ["보관 지갑 번호: KW-7Q2X-4471", "검수가 끝나면 전액 반환됩니다. 아래에서 이체를 확인해 주세요."],
      actionLabel: "보관 지갑으로 이체하기",
    },
  ],
};

/** §106 — 제출 뒤 가짜 사건 기록 열람본(서버 카탈로그 `MockScreenItem.recordDocument`와 1:1 · 글자 단위 동일). §109 — 공문서 머리 · 결재란 · 발급 정보. */
type RecordDocumentCopy = {
  issuer: string;
  title: string;
  documentNumber: string;
  caseRows: RecordRow[];
  subjectHeading: string;
  subjectHalfLabels: string[];
  subjectRows: RecordRow[];
  approvalRows: RecordRow[];
  noticeLines: string[];
  issueLabels: string[];
  footerNotice: string;
  sealLabel: string;
  stampLabel: string;
};

/**
 * ⭐ §106(2026-10-22 사용자 실기 요청 — *"사용자가 입력한 값대로 들어간 기록서가 있어야 할 거 같은데"*) — 키 = landingId(정확 일치 — R8).
 * 피의자 칸 앞쪽 = 본인 확인 칸 라벨 순서대로 방금 넣은 값(`values` — 이 컴포넌트 로컬 state), 뒤쪽 = 아래 `subjectRows`(고정).
 * ⛔ G255 좁은 예외(DECISIONS #221): 신원 칸(성명 · 생년월일 · 휴대전화 번호)만 · 계좌 · 금액 칸이 있는 랜딩에는 두지 않는다 · 값은 콜백에 싣지 않는다(G138).
 * ⭐ §109(사용자 실기 요청 — *"OO수사본부처럼 적혀 있는데 … 더 사실적인 문서로"*) — "OO" 가림 표시 대신 가상 고유명(통화 페르소나와 같은 값).
 */
const RECORD_DOCUMENT_COPY: Record<string, RecordDocumentCopy> = {
  "case-record-view": {
    issuer: "한빛지방검찰청",
    title: "사건기록 열람본",
    documentNumber: "제2026-금조-3318호",
    caseRows: [
      { label: "사건번호", value: "2026형제3318호", half: true },
      { label: "진행 상태", value: "수사 중", half: true },
      { label: "죄명", value: "금융실명법 위반 · 명의 도용 계좌 연루" },
      { label: "담당 부서", value: "금융범죄조사부" },
      { label: "담당 검사", value: "윤서진", half: true },
      { label: "담당 수사관", value: "정하람", half: true },
    ],
    subjectHeading: "피의자 인적 사항",
    subjectHalfLabels: ["성명", "생년월일"],
    subjectRows: [
      { label: "구분", value: "피의자(명의 도용 피해 여부 조사 중)" },
    ],
    approvalRows: [
      { label: "수사관", value: "정" },
      { label: "검사", value: "윤" },
      { label: "부장검사", value: "전결" },
    ],
    noticeLines: [
      "본인 명의 계좌 2건에서 범죄 자금 경유 정황이 확인되어 자산 검수 대상으로 분류되었습니다.",
      "검수 절차는 담당 수사관이 별도로 안내합니다. 안내에 따르지 않으면 계좌가 동결될 수 있습니다.",
      "본 기록은 비공개 수사 자료입니다. 외부에 알리면 수사 방해로 처리될 수 있습니다.",
    ],
    issueLabels: ["열람 신청 번호", "발급 일시", "열람 만료"],
    footerNotice: "본 열람본은 화면 열람 전용입니다. 출력 · 복제 · 화면 저장을 금합니다.",
    sealLabel: "열람 전용",
    stampLabel: "열람용",
  },
};

/** §109 — 공문서 본문 글꼴(바탕 · 명조 계열 → 기기 serif). 머리 띠 · 버튼은 종전 system-ui 그대로. */
const RECORD_DOCUMENT_FONT = "'Nanum Myeongjo', 'Noto Serif KR', 'Noto Serif CJK KR', Batang, AppleMyungjo, serif";

/** §109 — 문서 아래 바코드 장식의 막대 폭(px · 고정 배열 — 무작위 0 · 읽히는 부호 아님). */
const RECORD_BARCODE_BARS: readonly number[] = [2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 1, 3, 2, 1, 3, 1, 2, 1, 1, 2];

/** §101 — 화면 i(0 = 본인 확인)의 버튼이 올리는 고정 이벤트. 길이 = 마지막(이체 확인) 화면 앞까지. */
const STEP_FLOW_EVENTS: readonly LandingProgressEvent[] = ["landing_identity", "landing_converted", "landing_amount"];

/**
 * 가짜 주소창에 보일 호스트(T190-2 · §74.9). ⚠️ kind가 **먼저** 갈린다(§19.4 R7) — `app-install`은 credential
 * 콘텐츠 표를 보지 않고 자기 상수만 쓴다(R5 폴백 금지 우회 경로 0). credential 쪽은 정확 일치 조회(R8) +
 * 범용 폴백이다(`CredentialFormMockup`과 같은 규칙).
 */
function landingHostFor(kind: MessengerFakeLandingKind, landingId?: string): string {
  if (kind === "app-install") return installCopyFor(landingId)?.mockHost ?? "";
  return ((landingId ? CREDENTIAL_LANDING_COPY[landingId] : undefined) ?? GENERIC_CREDENTIAL_COPY).mockHost;
}

/**
 * ③ 기관 헤더 띠의 이름(UX-023 v1.33 (3) · D-92) — `issuerLabel`(무변경 카탈로그 값)에서 **맨 앞의 정확한 두 글자
 * `"ⓒ "`만** 1회 뗀다(없으면 그대로 — 정확 접두 1회, 패턴 추론 아님).
 */
function issuerNameOf(issuerLabel: string): string {
  const prefix = "ⓒ ";
  return issuerLabel.slice(0, prefix.length) === prefix ? issuerLabel.slice(prefix.length) : issuerLabel;
}

/**
 * kind=`credential-form` — 가짜 로그인/정보입력 랜딩.
 *
 * T104: 그리는 문구만 landingId로 갈리고 **안전 계약은 하나도 갈리지 않는다**(P-28) —
 * 네트워크 호출 0건, 제출은 로컬 state만 변경, 완료 화면의 안전 고지는 상황과 무관하게 동일하다.
 * T190-5(UX-023 v1.33 (1)(3)~(6)) — 배치 = ③ 기관 헤더 띠 → ④ 헤드라인·안내 → ⑤ 입력 → ⑥ 제출 → ⑦ 닫기 → ⑧ 발급처.
 * 🔒 원은 없앴다(Superseded). 본문 ③~⑧은 기관 페이지라 기기 스킨과 무관하게 같다(UX-023 v1.33 (8)).
 */
function CredentialFormMockup({
  landingId,
  onClose,
  onCredentialSubmit,
  onLandingStep,
  prefilledAccount,
  returnLabel,
}: {
  landingId?: string;
  onClose: () => void;
  /** ⛔ 무인자 콜백이다 — 입력값은 아래 `values` state를 벗어나지 않는다(§31.6 G138/AC-045). */
  onCredentialSubmit?: () => void;
  /** §101 — 여러 화면 사이트의 이체 전 단계(고정 이벤트 값만 — 입력값 0). */
  onLandingStep?: (step: LandingProgressEvent) => void;
  /** §101 추가 · D-115 — 수취 계좌 미리 채움 값(부재 = 빈 입력 칸). */
  prefilledAccount?: string;
  /** 완료 화면 복귀 버튼 문면(진입 표면이 정한다 — D-93). */
  returnLabel: string;
}) {
  // R8 — **정확 일치 키 조회**만 한다(문자열 분해·부분 일치 금지).
  const copy = (landingId ? CREDENTIAL_LANDING_COPY[landingId] : undefined) ?? GENERIC_CREDENTIAL_COPY;
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  // §109 — 열람본 발급 정보의 기준 시각(제출 이벤트 시각 = `performance.timeOrigin + event.timeStamp` · 기기 시계). 입력값과 무관하다.
  const [issuedAtMs, setIssuedAtMs] = useState(0);
  // §101 — 여러 화면 사이트의 현재 화면(0 = 본인 확인 = 위 `copy`). 한 화면 폼이면 늘 0이다.
  const stepScreens = landingId ? STEP_FLOW_COPY[landingId] : undefined;
  const [stepIndex, setStepIndex] = useState(0);
  const screen: StepScreenCopy =
    stepScreens && stepIndex > 0
      ? stepScreens[stepIndex - 1]
      : { headline: copy.headline, bodyLines: copy.bodyLines, fields: copy.fields, actionLabel: copy.submitLabel };
  const page = LANDING_PAGE_TOKENS;
  // §101 추가(사용자 실기 신고 — "공백으로 두고 이체를 누르면 넘어간다") — 칸별 안내 한 줄. 빈 칸 · 금액 오류면 제출 · 단계 진행 · 콜백 0
  // (속은 순간은 실제로 넘어간 제출에서만 잡힌다 — AC-080). 안내는 고정 문구이고 입력값을 싣지 않는다.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isPrefilled = (field: CredentialFieldCopy) => field.prefill === "account" && prefilledAccount !== undefined;
  const errorFor = (field: CredentialFieldCopy): string | undefined => {
    if (isPrefilled(field)) return undefined;
    const raw = values[field.label] ?? "";
    return field.amount ? amountError(raw) : requiredFieldError(field.label, raw);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    for (const field of screen.fields ?? []) {
      const message = errorFor(field);
      if (message) found[field.label] = message;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    // §101 — 이체 확인 전 화면이면 "그 단계 버튼을 눌렀다"는 고정 값 하나만 올리고 다음 화면으로 넘어간다(입력값은 `values`에 남는다).
    if (stepScreens && stepIndex < stepScreens.length) {
      onLandingStep?.(STEP_FLOW_EVENTS[stepIndex]);
      setStepIndex(stepIndex + 1);
      return;
    }
    // AC-045 핵심 — 여기서 어떤 네트워크 호출도 하지 않는다. 로컬 state만 바꿔 가짜 피드백을 준다.
    setIssuedAtMs(performance.timeOrigin + event.timeStamp);
    setSubmitted(true);
    // T123/AC-080 — **"제출했다는 사실" 하나만** 위로 올린다. 기록은 페이지가 한다(§15.9.6).
    // ⛔ `values`를 넘기지 않는다(G138) — 넘기는 순간 입력값이 이 파일을 벗어난다.
    onCredentialSubmit?.();
  };

  const issuerBar = (
    <div
      className="flex h-14 shrink-0 items-center gap-2.5 px-4 text-base font-semibold"
      style={{ backgroundColor: page.issuerBarBg, color: page.issuerBarText }}
    >
      <PhoneIcon name="shield" size={24} />
      <span className="truncate">{issuerNameOf(copy.issuerLabel)}</span>
    </div>
  );

  // §106 — 제출 뒤 가짜 사건 기록 열람본(표에 있는 landingId만 · 정확 일치 R8). 없으면 종전 완료 화면.
  const recordDocument = landingId ? RECORD_DOCUMENT_COPY[landingId] : undefined;
  if (submitted && recordDocument) {
    // ⛔ G255 좁은 예외(#221) — 피의자 칸에만 방금 넣은 신원 값을 찍는다. 값은 화면 문자열로만 쓰이고 콜백 · 네트워크에 실리지 않는다(G138).
    const subjectRows = recordSubjectRows(
      copy.fields.map((field) => field.label),
      values,
      recordDocument.subjectRows,
      recordDocument.subjectHalfLabels,
    );
    const issue = recordIssueInfo(new Date(issuedAtMs));
    const issueValues = [issue.requestNo, issue.issuedAt, issue.expiresAt];
    const ink = page.headline;
    const seal = page.errorText;
    // §109 — 공문서 표: 연달은 반 칸(`half`) 두 개는 한 줄(라벨 · 값 · 라벨 · 값), 그 밖은 값이 나머지 3칸을 가로지른다.
    const rowTable = (rows: RecordRow[]) => {
      const lines: RecordRow[][] = [];
      for (let i = 0; i < rows.length; i += 1) {
        if (rows[i].half && rows[i + 1]?.half) {
          lines.push([rows[i], rows[i + 1]]);
          i += 1;
        } else {
          lines.push([rows[i]]);
        }
      }
      const cell = (row: RecordRow, span: number) => [
        <th
          key={`${row.label}-l`}
          scope="row"
          className="whitespace-nowrap border px-1 py-[3px] text-center font-semibold"
          style={{ borderColor: ink, backgroundColor: page.fieldReadonlyBg }}
        >
          {row.label}
        </th>,
        <td
          key={`${row.label}-v`}
          colSpan={span}
          className={`${span === 1 ? "break-keep" : "break-all"} border px-1.5 py-[3px]`}
          style={{ borderColor: ink, color: page.inputText }}
        >
          {row.value}
        </td>,
      ];
      return (
        <table className="w-full border-collapse text-left text-[13px] leading-[1.35]">
          <tbody>
            {lines.map((line) => (
              <tr key={line[0].label}>{line.length === 2 ? [...cell(line[0], 1), ...cell(line[1], 1)] : cell(line[0], 3)}</tr>
            ))}
          </tbody>
        </table>
      );
    };
    return (
      <>
        {issuerBar}
        {/* §109 — 문서만 스크롤한다(머리 띠 · 복귀 버튼은 늘 보인다 — 사용자 원칙 "스크롤 최소화"). */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3 pt-2">
          <p role="status" className="shrink-0 text-[14px] font-semibold" style={{ color: page.hintText }}>
            {copy.successHeadline}
          </p>
          <article
            className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto border-[1.5px] px-3 pb-3 pt-2.5"
            style={{ borderColor: ink, color: ink, fontFamily: RECORD_DOCUMENT_FONT }}
          >
            {/* 문서 머리 — 중립 엠블럼(가상 도형 · 실존 기관 문장 아님) · 기관명 · 문서번호 · 제목. */}
            <header className="flex shrink-0 flex-col gap-1.5 border-b-2 pb-2" style={{ borderColor: ink }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
                    <circle cx="11" cy="11" r="10" fill="none" stroke={ink} strokeWidth="1.4" />
                    <circle cx="11" cy="11" r="6.5" fill="none" stroke={ink} strokeWidth="0.8" />
                    <path d="M11 4.5 L15 11 L11 17.5 L7 11 Z" fill={ink} />
                  </svg>
                  <span className="truncate text-[14px] font-bold tracking-[0.08em]">{recordDocument.issuer}</span>
                </div>
                <span className="shrink-0 text-[11px]" style={{ color: page.body }}>
                  {recordDocument.documentNumber}
                </span>
              </div>
              <h1 className="text-center text-[19px] font-bold tracking-[0.3em]">{recordDocument.title}</h1>
            </header>
            {/* 글자 도장(관인 이미지 아님) — 실제 공문서의 "열람용" 표시를 흉내 낸 테두리 글자. */}
            <span
              aria-hidden="true"
              className="absolute right-2 top-[50px] rotate-[-8deg] rounded-[3px] border-2 px-1 py-px text-[12px] font-bold"
              style={{ borderColor: seal, color: seal }}
            >
              {recordDocument.stampLabel}
            </span>
            {rowTable(recordDocument.caseRows)}
            <h2 className="shrink-0 text-[13px] font-bold">{recordDocument.subjectHeading}</h2>
            {rowTable(subjectRows)}
            <div className="flex shrink-0 flex-col gap-0.5">
              {recordDocument.noticeLines.map((line) => (
                <p key={line} className="text-[12px] leading-snug" style={{ color: page.inputText }}>
                  {line}
                </p>
              ))}
            </div>
            {/* 관인 자리 · 결재란(한 줄) — 관인은 가상 도형 + 글자(실존 관인 문안 · 모양 아님). 결재 칸은 서명 대신 성 1글자(빨간 원) 또는 "전결". */}
            <div className="flex shrink-0 items-end justify-between gap-2">
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                <span className="text-[14px] font-bold tracking-[0.08em]">{recordDocument.issuer}</span>
                <span
                  aria-hidden="true"
                  className="ml-1 flex h-10 w-10 shrink-0 items-center justify-center break-keep border-2 text-center text-[10px] font-bold leading-tight"
                  style={{ borderColor: seal, color: seal, outline: `1px solid ${seal}`, outlineOffset: "2px" }}
                >
                  {recordDocument.sealLabel}
                </span>
              </div>
              <table className="shrink-0 border-collapse text-center text-[11px]">
                <tbody>
                  <tr>
                    {recordDocument.approvalRows.map((row) => (
                      <th key={row.label} scope="col" className="w-12 whitespace-nowrap border px-0.5 py-0.5 font-semibold" style={{ borderColor: ink, backgroundColor: page.fieldReadonlyBg }}>
                        {row.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {recordDocument.approvalRows.map((row) => (
                      <td key={row.label} className="h-8 border px-0.5" style={{ borderColor: ink }}>
                        {row.value.length === 1 ? (
                          <span
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold"
                            style={{ borderColor: seal, color: seal }}
                          >
                            {row.value}
                          </span>
                        ) : (
                          row.value
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {/* 발급 정보 — 값은 제출 시각으로 만든다(`recordIssueInfo` · 입력값 0). 바코드는 읽히지 않는 장식(고정 막대 폭). */}
            <footer className="flex shrink-0 flex-col gap-1 border-t pt-1.5 text-[11px]" style={{ borderColor: page.inputBorder, color: page.body }}>
              <div className="flex items-end justify-between gap-2">
                <dl className="grid grid-cols-[auto_1fr] gap-x-2">
                  {recordDocument.issueLabels.map((label, index) => (
                    <div key={label} className="contents">
                      <dt>{label}</dt>
                      <dd style={{ color: page.inputText }}>{issueValues[index]}</dd>
                    </div>
                  ))}
                </dl>
                <svg aria-hidden="true" width="64" height="28" viewBox="0 0 64 28" className="shrink-0">
                  {RECORD_BARCODE_BARS.map((width, index) =>
                    index % 2 === 0 ? (
                      <rect key={index} x={RECORD_BARCODE_BARS.slice(0, index).reduce((sum, w) => sum + w, 0)} y="0" width={width} height="28" fill={ink} />
                    ) : null,
                  )}
                </svg>
              </div>
              <p>{recordDocument.footerNotice}</p>
            </footer>
          </article>
          <div className="shrink-0">
            <Button type="button" onClick={onClose}>
              {returnLabel}
            </Button>
          </div>
        </div>
      </>
    );
  }

  if (submitted) {
    return (
      <>
        {issuerBar}
        <div className="flex flex-col gap-4 p-5">
          {/* ⛔ 입력값 재표시 0(G255) — 완료 문구 + 복귀 버튼 1개뿐이다. */}
          <p role="status" className="text-lg font-semibold leading-snug" style={{ color: page.headline }}>
            {copy.successHeadline}
          </p>
          {/* T187(§72 · PRD v1.18 AC-086 (d) · UX D-83) — 제출 직후 부정 고지를 지웠다. 그 사실은
              세션 후 UX-007의 사실 공개 문장이 말한다. 빈 자리를 채우지 않는다. */}
          <Button type="button" onClick={onClose}>
            {returnLabel}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {issuerBar}
      <div className="flex flex-col gap-2.5 px-5 pt-4">
        <h1 className="text-xl font-bold leading-snug" style={{ color: page.headline }}>
          {screen.headline}
        </h1>
        {screen.bodyLines.map((line) => (
          <p key={line} className="text-[15px] leading-relaxed" style={{ color: page.body }}>
            {line}
          </p>
        ))}
        {/* §101 — 검수 대상 자산 같은 나열 줄(입력 아님 · 숫자 0). */}
        {screen.items && (
          <ul className="mt-1 flex flex-col gap-2">
            {screen.items.map((item) => (
              <li
                key={item}
                className="rounded-[10px] border px-3.5 py-3 text-[15px] font-semibold"
                style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg, color: page.headline }}
              >
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form key={stepIndex} onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pb-6 pt-4">
        {(screen.fields ?? []).map((field) => {
          const error = errors[field.label];
          const hint = field.amount ? amountHint(values[field.label] ?? "") : undefined;
          const noteId = `landing-note-${stepIndex}-${field.label}`;
          return (
            <label
              key={field.label}
              className="flex flex-col gap-1.5 text-[15px] font-semibold"
              style={{ color: page.headline }}
            >
              {field.label}
              {isPrefilled(field) ? (
                // ⭐ D-115 (3) — 문자로 안내된 수취 계좌를 미리 채운 읽기 전용 칸(연회색 · 테두리 0 · 자판 0 · Tab 도달). placeholder 0.
                <input
                  type="text"
                  readOnly
                  aria-readonly="true"
                  value={prefilledAccount}
                  className="min-h-[52px] rounded-[10px] px-3.5 text-[17px] font-normal outline-none"
                  style={{ backgroundColor: page.fieldReadonlyBg, color: page.inputText }}
                />
              ) : (
                // T190-5(D-93) — 숫자 칸은 숫자 자판 힌트만(`inputMode` — 필드별 명시). 입력값 자동 서식 0.
                // §101 추가 — 제출 때 빈 칸 · 금액 오류를 칸 아래에 알린다(위 `errorFor`).
                <input
                  type="text"
                  inputMode={field.inputMode}
                  autoComplete="off"
                  value={values[field.label] ?? ""}
                  onChange={(event) => {
                    const next = event.target.value;
                    setValues((current) => ({ ...current, [field.label]: next }));
                    if (error) setErrors((current) => ({ ...current, [field.label]: "" }));
                  }}
                  placeholder={field.placeholder}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error || hint ? noteId : undefined}
                  className="min-h-[52px] rounded-[10px] border px-3.5 text-[17px] font-normal outline-none focus:border-2"
                  style={{ borderColor: error ? page.errorText : page.inputBorder, backgroundColor: page.inputBg, color: page.inputText }}
                />
              )}
              {/* §101 추가 — 오류 안내가 우선, 없으면 금액 한글 단위 표기("47억 원"). */}
              {error ? (
                <span id={noteId} role="alert" className="text-[14px] font-normal" style={{ color: page.errorText }}>
                  {error}
                </span>
              ) : hint ? (
                <span id={noteId} className="text-[15px] font-semibold" style={{ color: page.hintText }}>
                  {hint}
                </span>
              ) : null}
            </label>
          );
        })}

        {/* 제출 버튼은 일부러 앱 브랜드 청록(#0E6B62)이 아닌 중립 회색(#41525E)을 쓴다 —
            이 화면이 우리 앱의 정식 CTA가 아니라 "낯선 가짜 사이트"라는 느낌을 유지해 훈련
            효과(진짜 앱 버튼과 구분)를 살린다(메신저 플로우.dc.html의 동일 의도적 선택). */}
        <button
          type="submit"
          className="min-h-[52px] rounded-[10px] text-base font-semibold transition-colors"
          style={{ backgroundColor: page.submitBg, color: page.submitText }}
        >
          {screen.actionLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[48px] rounded-[10px] border px-6 py-2.5 text-base font-semibold"
          style={{ borderColor: page.inputBorder, color: page.headline }}
        >
          닫기
        </button>
        {/* ⑧ 발급처 — 13px · #6B655C(흰 바탕 대비 약 5.8:1 · 옛 #C9C2B6 미달 Superseded). */}
        <p className="text-center text-[13px]" style={{ color: page.issuerFooter }}>
          {copy.issuerLabel}
        </p>
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
const INSTALL_ISSUER_LABEL = "ⓒ 업무처리 확인센터";
/** T190-2(§74.9) — 설치 화면 가짜 주소창 호스트(서버 `subsidy-install.mockHost`와 같은 글자 — G76). */
const INSTALL_MOCK_HOST = "support-app-center.invalid";

/** 설치 화면 한 벌의 문구(서버 카탈로그 `app-install` 항목의 화면 필드와 1:1). */
type InstallCopy = {
  headline: string;
  bodyLines: string[];
  consentLabel: string;
  issuerLabel: string;
  mockHost: string;
};

/**
 * ⭐ T194-a(docs/Architecture.md §84.4.3 · §84.13.3 ③ · UX UF-012 v1.38 (1) "콘텐츠 1벌 · 가상 앱 이름 — D-58 콘텐츠 축") — 설치 화면의
 * **상황별 콘텐츠**. 예전 주석(*"`app-install`은 상황 축을 갖지 않는다 — 도달 가능한 항목이 1종뿐"*)의 전제가 택배 고급
 * (`parcel-install`)으로 깨져, landingId 정확 일치 조회 표를 둔다.
 * ⛔ 규칙(§84.13.3 ③): ⓐ 키 = 서버 카탈로그 `app-install` 항목의 landingId 전수 · 값 = 그 항목 화면 필드와 **바이트 동일**(키 집합 양방향 ·
 * 값 대조 = `mockScreenCopy.test.ts`) ⓑ **표에 없는 id면 설치 화면을 그리지 않는다** — 지원금 문구 기본값 폴백 0 · credential 폴백 0(R5 ·
 * UF-012 Failure (a) 생략) ⓒ kind 분기가 먼저 끝난 뒤 조회(R7) · 정확 일치만(R8) · 신규 kind · 컴포넌트 파일 0(AC-106 (a)).
 */
const INSTALL_LANDING_COPY: Record<string, InstallCopy> = {
  "subsidy-install": {
    headline: INSTALL_HEADLINE,
    bodyLines: INSTALL_BODY_LINES,
    consentLabel: INSTALL_CONSENT_LABEL,
    issuerLabel: INSTALL_ISSUER_LABEL,
    mockHost: INSTALL_MOCK_HOST,
  },
  "parcel-install": {
    headline: "배송 확인 앱을 설치해야 재배송이 접수됩니다",
    bodyLines: [
      "주소 확인이 끝나지 않아 재배송 접수가 보류되어 있습니다.",
      "아래에서 배송 확인 앱 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 상담원이 재배송 접수를 마무리해 드립니다.",
    ],
    consentLabel: "권한 허용하고 계속하기",
    issuerLabel: "ⓒ 종합물류 배송확인센터",
    mockHost: "parcel-app-desk.invalid",
  },
  // §110.2(실기 신고 10) — 자녀 사칭 카톡 고급의 보험 접수 앱(메신저 링크). 서버 카탈로그 항목과 바이트 동일(G76).
  "child-insurance-install": {
    headline: "휴대폰 보험 접수 앱을 설치해야 보험 처리가 됩니다",
    bodyLines: [
      "파손 보험 접수에는 휴대폰 명의자 본인 확인이 필요합니다.",
      "아래에서 보험 접수 앱 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 접수가 자동으로 이어집니다.",
    ],
    consentLabel: "권한 허용하고 계속하기",
    issuerLabel: "ⓒ 휴대폰 파손보험 접수센터",
    mockHost: "phone-care-claim.invalid",
  },
  // T194-c-1(docs/Architecture.md §84.15.4 · §84.16.5 단계 6) — Q2 통화 중 설치 화면 3종(문자함 안에서 열린다). 서버 카탈로그 항목과 바이트 동일(G76).
  "card-guard-app-install": {
    headline: "피해 차단용 보안 앱을 설치해야 보호 조치가 시작됩니다",
    bodyLines: [
      "명의 도용 피해가 다른 결제로 번지지 않도록 보호 조치가 필요합니다.",
      "아래에서 피해 차단용 보안 앱 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 상담원이 보호 조치를 이어서 진행해 드립니다.",
    ],
    consentLabel: "권한 허용하고 계속하기",
    issuerLabel: "ⓒ 카드 명의보호 안내센터",
    mockHost: "card-guard-check.invalid",
  },
  "loan-check-app-install": {
    headline: "심사용 보안 점검 앱을 설치해야 대출 심사가 진행됩니다",
    bodyLines: [
      "저금리 전환 심사 전에 휴대폰 보안 점검이 남아 있습니다.",
      "아래에서 심사용 보안 점검 앱 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 상담사가 심사 접수를 이어서 진행해 드립니다.",
    ],
    consentLabel: "권한 허용하고 계속하기",
    issuerLabel: "ⓒ 대출심사 보안점검 안내",
    mockHost: "loan-check-app.invalid",
  },
  "card-delivery-app-install": {
    headline: "보안 점검 앱을 설치해야 사고 접수가 이어집니다",
    bodyLines: [
      "신청하지 않은 카드 발급 건이 명의 도용 사고로 접수 대기 중입니다.",
      "아래에서 보안 점검 앱 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 상담원이 사고 접수를 이어서 처리해 드립니다.",
    ],
    consentLabel: "권한 허용하고 계속하기",
    issuerLabel: "ⓒ 카드 사고접수 안내",
    mockHost: "card-safe-check.invalid",
  },
};

/** 정확 일치 조회 — 미스면 `undefined`(⛔ 기본 문구 폴백 0 — 호출부가 설치 화면을 그리지 않는다). */
function installCopyFor(landingId?: string): InstallCopy | undefined {
  return landingId ? INSTALL_LANDING_COPY[landingId] : undefined;
}

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
 * 없다는 불변식을 kind 추가 후에도 유지하기 위해서다(§15.9.6, 기존 `onClose`와 같은 패턴).
 */
function AppInstallMockup({
  landingId,
  onClose,
  onConsent,
  returnLabel,
}: {
  /** T194-a — 상황별 설치 문구 조회 키(정확 일치만 · 미스 = 기본 설치 문구). */
  landingId?: string;
  onClose: () => void;
  onConsent?: () => void;
  /** 완료 화면 복귀 버튼 문면(T190-5 · D-93 — 진입 표면이 정한다). */
  returnLabel: string;
}) {
  const installCopy = installCopyFor(landingId);
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

  // T194-a(§84.13.3 ③ ⓑ) — 상위가 이미 걸렀지만 이 서브 컴포넌트도 표 밖 id에서는 아무것도 그리지 않는다(기본 문구 폴백 0).
  if (!installCopy) return null;

  return (
    // T190-5 — 랜딩 본문 여백을 이 kind 안으로 옮겼다(공유 래퍼는 credential 화면의 전폭 기관 헤더 띠 때문에 여백 0).
    <div className="flex flex-col gap-6 p-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2EFE9]">
        <span aria-hidden="true" className="text-2xl">
          📱
        </span>
      </div>
      <div className="-mt-4 flex flex-col gap-2">
        <h1 className="text-xl font-bold leading-snug text-[#22303A]">{installCopy.headline}</h1>
        {installCopy.bodyLines.map((line) => (
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
          <p className="text-center text-[13px] text-[#6B655C]">{installCopy.issuerLabel}</p>
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
            {installCopy.consentLabel}
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
          {/* T187(§72 · AC-086 (d) · D-83) — 설치 뒤 부정 고지 삭제. 세션 후 사실 공개가 잇는다. */}
          <Button type="button" onClick={onClose}>
            {returnLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
