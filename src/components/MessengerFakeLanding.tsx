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
};

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

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
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
      { label: "보관 신청 금액", placeholder: "금액을 입력하세요", inputMode: "numeric" },
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
      "문자로 안내된 계좌번호와 금액을 아래에 입력해 주세요.",
    ],
    fields: [
      { label: "안전계좌 번호", placeholder: "문자로 받은 계좌번호를 입력하세요", inputMode: "numeric" },
      { label: "이체 금액", placeholder: "이체하실 금액을 입력하세요", inputMode: "numeric" },
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
      "문자로 안내된 이관 계좌와 금액을 아래에 입력해 주세요.",
    ],
    fields: [
      { label: "이관 전용 계좌번호", placeholder: "문자로 받은 이관 계좌번호를 입력하세요", inputMode: "numeric" },
      { label: "이관 금액", placeholder: "이관하실 금액을 입력하세요", inputMode: "numeric" },
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
      "문자로 안내된 계좌번호와 옮기실 금액을 아래에 입력해 주세요.",
    ],
    fields: [
      { label: "보호계좌 번호", placeholder: "문자로 받은 계좌번호를 입력하세요", inputMode: "numeric" },
      { label: "옮길 금액", placeholder: "옮기실 금액을 입력하세요", inputMode: "numeric" },
    ],
    submitLabel: "보호계좌로 옮기기",
    successHeadline: "보호계좌로 옮기기가 처리되었습니다.",
    issuerLabel: "ⓒ 금융사고대응 보호계좌센터",
    mockHost: "acct-protect-desk.invalid",
  },
};

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
  returnLabel,
}: {
  landingId?: string;
  onClose: () => void;
  /** ⛔ 무인자 콜백이다 — 입력값은 아래 `values` state를 벗어나지 않는다(§31.6 G138/AC-045). */
  onCredentialSubmit?: () => void;
  /** 완료 화면 복귀 버튼 문면(진입 표면이 정한다 — D-93). */
  returnLabel: string;
}) {
  // R8 — **정확 일치 키 조회**만 한다(문자열 분해·부분 일치 금지).
  const copy = (landingId ? CREDENTIAL_LANDING_COPY[landingId] : undefined) ?? GENERIC_CREDENTIAL_COPY;
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const page = LANDING_PAGE_TOKENS;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // AC-045 핵심 — 여기서 어떤 네트워크 호출도 하지 않는다. 로컬 state만 바꿔 가짜 피드백을 준다.
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
          {copy.headline}
        </h1>
        {copy.bodyLines.map((line) => (
          <p key={line} className="text-[15px] leading-relaxed" style={{ color: page.body }}>
            {line}
          </p>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pb-6 pt-4">
        {copy.fields.map((field) => (
          <label
            key={field.label}
            className="flex flex-col gap-1.5 text-[15px] font-semibold"
            style={{ color: page.headline }}
          >
            {field.label}
            {/* T190-5(D-93) — 숫자 칸은 숫자 자판 힌트만(`inputMode` — 필드별 명시). ⛔ 검증 0. */}
            <input
              type="text"
              inputMode={field.inputMode}
              autoComplete="off"
              value={values[field.label] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.label]: event.target.value }))
              }
              placeholder={field.placeholder}
              className="min-h-[52px] rounded-[10px] border px-3.5 text-[17px] font-normal outline-none focus:border-2"
              style={{ borderColor: page.inputBorder, color: page.inputText }}
            />
          </label>
        ))}

        {/* 제출 버튼은 일부러 앱 브랜드 청록(#0E6B62)이 아닌 중립 회색(#41525E)을 쓴다 —
            이 화면이 우리 앱의 정식 CTA가 아니라 "낯선 가짜 사이트"라는 느낌을 유지해 훈련
            효과(진짜 앱 버튼과 구분)를 살린다(메신저 플로우.dc.html의 동일 의도적 선택). */}
        <button
          type="submit"
          className="min-h-[52px] rounded-[10px] text-base font-semibold transition-colors"
          style={{ backgroundColor: page.submitBg, color: page.submitText }}
        >
          {copy.submitLabel}
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
