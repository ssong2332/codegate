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
// ⭐ 2026-11-08 웹 안의 웹 PR-1 — 바깥 틀(브라우저 틀) 판정표 · 훈련 화면 테마(잎 모듈 · 상대 경로).
import { landingChromeFor } from "../lib/landing/landingChrome";
import { TRAINING_SCREEN_THEME } from "../lib/phone/deviceTheme";
// ⭐ 2026-11-08 웹 안의 웹 PR-3 — 구매 화면(금 · 상품권 · 내 은행 출금 · 대출) 사이트 계열 값(잎 모듈 · 상대 경로).
import {
  PURCHASE_SITE_TOKENS,
  SITE_SKINS,
  footerLines,
  purchaseFamilyOf,
  purchasePalette,
  type PurchaseFamilyId,
  type PurchasePalette,
  type SiteSkin,
  // ⭐ PR-4 — 안내 화면(기관 · 환급 · 택배 · 설치) 계열 값.
  GUIDE_SITE_TOKENS,
  guideFormFamilyOf,
  guidePalette,
} from "../lib/landing/siteSkins";
// ⭐ 2026-11-08 웹 안의 웹 PR-4 — 안내 화면 새 문구(잎 모듈 · 상대 경로).
import {
  AGENCY_SITE_COPY,
  AGENCY_TRANSFER_SITE_COPY,
  SEND_SITE_LOGO,
  INSTALL_APP_NAMES,
  INSTALL_PERMISSIONS,
  INSTALL_PERMISSION_HEADING,
  PARCEL_SITE_COPY,
  REFUND_SITE_COPY,
  type AgencySiteCopy,
} from "../lib/landing/guideCopy";
import type { MessengerSkin } from "../lib/messenger/detectSkin";
// §101 추가 — 금액 검증 · 한글 단위 표기 · 필수 칸 안내(잎 모듈 · 상대 경로 — 렌더 하네스 관례).
import { TRANSFER_LIMIT_NOTE, amountError, amountHint, requiredFieldError, transferLimitError } from "../lib/landing/amountInput";
import {
  BIRTHDATE_MASK,
  identityDisplayValue,
  identityError,
  identityHint,
  identityMaxLength,
  sanitizeIdentityInput,
  type IdentityFormat,
} from "../lib/landing/identityInput";
// §106 — 사건 기록 열람본의 피의자 칸 값(잎 모듈 · 상대 경로).
import { recordIssueInfo, recordSubjectRows, type RecordRow } from "../lib/landing/recordDocument";
// N1 · N4 — 같은 계좌로 보낸 합계 비교 · 완료 시각(잎 모듈 · 상대 경로 — 위 하네스 주석).
import { fictionalBalanceFor, myBankNameFor, recordTransferAndCompare, transferTimeText, type AmountComparison, type SpokenAccount } from "../lib/bankapp/bankApp";
// ⭐ 2026-11-07 실기기 신고 — 출금 계좌 선택 · 생체 인증 시트(내 은행 송금 화면 `BankAppOverlay`와 같은 컴포넌트 · 같은 판정표).
import { authMethodForSkin } from "../lib/bankapp/bankAuth";
import {
  accountLabel,
  availableBalance,
  recordLoanApplication,
  recordWithdrawal,
  resolveMyAccount,
  withdrawAccountsFor,
  type CardAccount,
  withdrawError,
  type WithdrawAccount,
} from "../lib/bankapp/withdrawAccounts";
import { LOAN_PURPOSES, loanApplyError, loanOfferFor } from "../lib/bankapp/loanFlow";
// ⭐ PR-3 — 대출 진행 칩 이름(위 줄은 `loanScreens.test.ts` S6의 치환 앵커라 그대로 두고 따로 가져온다).
import { LOAN_SITE_STEPS } from "../lib/bankapp/loanFlow";
import BankAuthSheet from "./BankAuthSheet";
// ⭐ 2026-11-07(Edge 시험 판 12) — 상품권 구매 화면(잎 모듈 · 상대 경로).
import {
  VOUCHER_BRAND,
  VOUCHER_COPY,
  VOUCHER_DENOMINATIONS,
  VOUCHER_MAX_QUANTITY,
  VOUCHER_SELLER,
  VOUCHER_SITE_COPY,
  denominationLabel,
  lastVoucherPurchase,
  recordVoucherPurchase,
  voucherOrderError,
  voucherWon,
  type VoucherPurchase,
} from "../lib/bankapp/voucher";
// ⭐ 2026-11-07(Edge 재시험 2 S7 · 사용자 결정 D-G1 ~ D-G6) — 금 거래소 구매 화면(잎 모듈 · 상대 경로).
import {
  GOLD_COPY,
  GOLD_MAX_QUANTITY,
  GOLD_PRICE_PER_GRAM,
  GOLD_PRODUCTS,
  GOLD_PURPOSES,
  GOLD_SHOP_NAME,
  GOLD_SITE_COPY,
  findGoldProduct,
  goldCheckResult,
  goldOrderError,
  goldProductPrice,
  goldWeightMark,
  goldWon,
  lastGoldPurchase,
  recordGoldPurchase,
  type GoldPurchase,
} from "../lib/bankapp/goldBuy";
// ⭐ 2026-11-07(사용자 결정 D-G2 E1-b) — 내 은행 현금 · 수표 출금 예약 + 문진표(잎 모듈 · 상대 경로).
import {
  CASH_COPY,
  CASH_FORMS,
  CASH_PURPOSES,
  CASH_QUESTIONS,
  cashAmountValue,
  cashCheckResult,
  cashReserveError,
  cashWon,
  lastCashReservation,
  recordCashReservation,
  type CashForm,
  type CashReservation,
} from "../lib/bankapp/cashWithdraw";
import WithdrawAccountSheet, { WithdrawAccountRow } from "./WithdrawAccountSheet";

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
  /**
   * ⭐ 2026-11-08 웹 안의 웹 PR-1 — 메신저 진입일 때 그 화면이 문자형(`sms`)인지 대화방형(`kakao`)인지. 문자형 = 기기 브라우저 틀,
   * 대화방형 = 메신저 안 브라우저 틀(판정표 `landingChrome.ts` LC). 부재 = 대화방형(종전 ✕ 동작 · 렌더 하네스 무변경).
   */
  messengerSurface?: "sms" | "kakao";
  /**
   * ⭐ PR-1 — 문자함 진입 전용: 문자함이 맨 위에 초록 통화 표시줄을 그리는가. iOS형 '◀ 메시지' 줄은 통화 표시줄이 없을 때만 그린다
   * (사용자 확정 2026-11-08). 부재 = 그린다(종전 문자함은 늘 통화 중).
   */
  callBarShown?: boolean;
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
   * ⛔⛔ **입력값을 싣지 않는다(§31.6 G138).** 입력값을 실으면 참가자가 입력한 계좌번호·예금주명이 컴포넌트
   * 밖으로 나가는 첫 경로가 생기고, 그 순간부터 페이지가 그 값을 어디로도 보낼 수 있다 —
   * 이 파일의 금지 토큰 스캔은 그것을 잡지 못한다(AC-045). `mockScreenCopy.test.ts`의 G138
   * 블록이 무인자 형태를 단언하고 역검증까지 같이 둔다.
   * ⚠️ 이 컴포넌트는 **네트워크 호출을 하지 않는다** — 기록은 페이지가 담당한다(§15.9.6).
   * N1(실기기 신고 2026-11-01) — 훈련용 이체 화면만 요구액 대비 **비교 결과 하나**("less" · "equal" · "more")를 싣는다. 금액 값은 여전히 0이다.
   */
  onCredentialSubmit?: (amountComparison?: AmountComparison) => void;
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
  /**
   * ⭐ P2(X6 · 2026-10-31) — 훈련용 이체 화면(`BANK_TRANSFER_LANDINGS`)의 받는 분 이름 · 금액(숫자만) · 세션 은행명(서버 문자 문서 구조화 필드).
   * 부재 = 받는 분 "확인 중" 표기 · 금액 빈 칸. ⛔ 참가자 입력이 아니다 — 어떤 콜백에도 싣지 않는다.
   */
  prefilledTransfer?: PrefilledTransfer;
  /**
   * ⭐ PR-B — 앱 안 대출 신청 화면(`loan-apply`)의 맥락: 탭 메모리 장부 열쇠(세션 id) · 가상 캐피탈 이름(문자 본문). 부재 = 그 화면도 종전 폼으로 그린다.
   * ⛔ 참가자 입력이 아니다 — 대출 금액 · 용도는 `LoanApplyMockup` 밖으로 나가지 않는다(G138).
   */
  loanContext?: { ledgerKey: string; lenderName: string };
  /**
   * ⭐ 2026-11-07(Edge 시험 판 12) — 상품권 구매 화면(`VOUCHER_LANDINGS`)의 결제 계좌 · 핀 발급 열쇠(참가자의 "내 은행" · 세션 id). 부재 = 열쇠 빈 값.
   * ⛔ 참가자 입력이 아니다 — 어떤 콜백에도 싣지 않는다.
   */
  bankIdentity?: { myBankName: string; ledgerKey: string };
  /**
   * ⭐ 2026-11-08(라이브 재시험 7 · 사용자 결정 "말한 값에 맞추기" · S12 금 거래소 화면도 같은 규칙) — 출금 예약 화면(`CASH_LANDINGS`) · 금 거래소 화면(`GOLD_LANDINGS`)을 여는 순간 참가자가 통화에서 말한 거래 은행 · 잔액
   * (판정표 S — `bankApp.ts` `spokenAccountFrom`). 말하지 않은 쪽 · 부재 = 종전 고정 값. ⛔ 화면 안에서만 쓴다(콜백 · 네트워크 0 · G138).
   */
  spokenAccountNow?: () => SpokenAccount;
  /**
   * ⭐ 2026-11-08(실기기 신고 — 상품권 화면에 무관한 은행 · 금액 3개 · 사용자 결정 D1 ~ D3) — 시작 전 '이번 훈련 속 내 정보' 카드에 넣은 거래 은행 · 잔액
   * (`withdrawAccounts.ts` 판정표 A1 · A5 — 말한 값보다 먼저). 부재 = 카드 값 없음. ⛔ 화면 안에서만 쓴다(콜백 · 네트워크 0 · G138).
   */
  cardAccountNow?: () => CardAccount | undefined;
};

/**
 * ⭐ P2(X6) — 훈련용 이체 화면 미리 채움(서버 구조화 필드 · 참가자 입력 아님). N1 · N2 추가:
 * `requestedAmount` = 대화 · 문자에서 요구한 금액(비교 기준 — 금액 칸은 채우지 않는다) · `myBankName` = 참가자의 "내 은행"(머리띠 — 받는 계좌 은행이 아니다) ·
 * `ledgerKey` = 같은 계좌로 나눠 보낸 합계를 세는 열쇠(세션 id).
 */
export type PrefilledTransfer = {
  bankName: string;
  holder?: string;
  amount?: string;
  requestedAmount?: string;
  myBankName?: string;
  ledgerKey?: string;
};

/** §101 — 이체 전 단계 기록 이벤트(서버 `functions/src/inCallSms/types.ts` `InCallSmsEvent`의 같은 3값). */
// 2026-11-07(사용자 결정 D-G4) — `landing_held` = 금 거래소 구매 화면의 고액 구매 확인 보류(고정 값 · 답 내용 0).
export type LandingProgressEvent = "landing_identity" | "landing_converted" | "landing_amount" | "landing_held";

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
  messengerSurface,
  callBarShown = true,
  onClose,
  onHide,
  onInstallConsent,
  onCredentialSubmit,
  onLandingStep,
  prefilledAccount,
  prefilledTransfer,
  loanContext,
  bankIdentity,
  spokenAccountNow,
  cardAccountNow,
}: MessengerFakeLandingProps) {
  // ⭐ PR-1 — 틀 색은 기기 쪽이다. 테마는 훈련 화면 테마(지금 라이트 고정 — 사용자 결정 2026-10-21 · `deviceTheme.ts`)를 따른다.
  const bar = browserBarTokensFor(skin, TRAINING_SCREEN_THEME);
  const returnLabel = RETURN_LABELS[entrySurface];
  const isMessenger = entrySurface === "messenger";
  // ⭐ PR-1 — 바깥 틀 판정표(LC1 ~ LC6). 틀 안 단추는 동작하는 것만: "‹ 문자"(문자함 = 숨기기 · 문자형 메신저 = 닫기) · ✕ · '◀ 메시지'.
  const chrome = landingChromeFor({ entrySurface, messengerSurface, skin, callBarShown });
  const backAction = entrySurface === "in-call-sms" ? onHide : onClose;
  // ⭐ PR-3 판정표 P1 ~ P6 — 구매 화면 4종만 사이트 계열 바탕 · 진행 막대 색(그 밖 = 종전 `LANDING_PAGE_TOKENS`). 분기 조건은 아래 서브 컴포넌트 선택과 같다.
  const purchaseFamily: PurchaseFamilyId | undefined =
    landingKind === "credential-form" &&
    landingId !== undefined &&
    (GOLD_LANDINGS.includes(landingId) ||
      CASH_LANDINGS.includes(landingId) ||
      VOUCHER_LANDINGS.includes(landingId) ||
      (landingId === "loan-apply" && loanContext !== undefined))
      ? purchaseFamilyOf(landingId)
      : undefined;
  // ⭐ PR-4 판정표 G — 안내 화면(기관 · 환급 · 택배 · 맥락 없는 대출 · 설치)도 계열 바탕 · 진행 막대 색. 이체 화면(G5) · 표 밖 id(G7) = 종전.
  const guideFamily =
    landingKind === "app-install"
      ? installCopyFor(landingId) !== undefined
        ? ("install" as const)
        : undefined
      : purchaseFamily === undefined && landingKind === "credential-form"
        ? guideFormFamilyOf(landingId)
        : undefined;
  const pageFamily = purchaseFamily ?? guideFamily;
  const pageBg = pageFamily ? SITE_SKINS[pageFamily].pageBg : LANDING_PAGE_TOKENS.pageBg;
  const progressColor = pageFamily ? SITE_SKINS[pageFamily].accent : LANDING_PAGE_TOKENS.issuerBarBg;
  // B2 — iOS형 틀이면 아래 고정 결제 막대를 떠 있는 주소 막대 위로.
  const payBarLifted = chrome.frame === "device-bottom";

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

  // ⭐ 2026-11-08 웹 안의 웹 PR-1 — 가짜 호스트(`.invalid` · 호스트만 · 스킴 0 · 누를 수 없는 텍스트). 세 틀이 같은 노드를 쓴다.
  const hostNode = <>{landingHostFor(landingKind, landingId)}</>;
  // ⭐ PR-1 — 메신저 안 브라우저 첫 줄(페이지 제목) = 그 사이트 이름(카탈로그 `issuerLabel`에서 'ⓒ ' 정확 접두 1회 제거 — 새 문구 0).
  const siteTitle = landingTitleFor(landingKind, landingId);
  // ⭐ PR-1(사용자 결정 O4 (a)) — 주소 아래 사이트 색 진행 막대(약 1.2초 뒤 사라짐 · 움직임 줄이기면 그리지 않음 — globals.css). 장식.
  const progressBar = (
    <span
      aria-hidden="true"
      className="landing-progress block h-0.5 w-full origin-left"
      style={{ backgroundColor: progressColor }}
    />
  );
  // ⭐ PR-1 — "‹ 문자"(문자 진입 두 틀이 같은 단추를 쓴다). 문자함 = 숨기기(입력값 유지 — D-94) · 문자형 메신저 = 닫기.
  const backButton =
    chrome.control === "back-sms" && backAction ? (
      <button
        type="button"
        onClick={backAction}
        className="flex h-12 min-w-[56px] shrink-0 items-center text-[15px]"
        style={{ color: bar.back }}
      >
        <PhoneIcon name="chevron-back" size={22} />
        문자
      </button>
    ) : null;

  const content: ReactNode = (
    <>
      {/* ② 바깥 틀(⭐ 2026-11-08 웹 안의 웹 PR-1 — 판정표 `landingChrome.ts` LC · 시안 1절). 종전엔 모든 진입이 같은 흰 막대였다.
          - device-top(안드로이드형 · 문자 진입) = 위 주소 막대 52px: "‹ 문자" + 주소 필드(사이트 정보 아이콘 = 조정 막대 · 가짜 호스트).
          - device-bottom(iOS형 · 문자 진입) = 아래 떠 있는 주소 막대(아래에서 그린다) + 통화 표시줄이 없을 때 맨 위 24px '◀ 메시지'.
          - in-app(대화방형 메신저 진입) = 메신저 안 브라우저 52px: ✕ + 제목 · 주소 두 줄.
          ⛔ 동작하는 단추만(사용자 결정 O1 = (b)) — 아래 툴바 · ⋯ · 새로고침 · 공유 0. 자물쇠 · 빨간 ⚠ · 모노 글꼴 0(D-92 · D-6).
          ⚠️ 사용자 결정(2026-10-18) — 종료 버튼은 어느 틀에도 없다. T187(§72) — 세션 중 표식 · 난이도 배지 없음.
          ⚠️ T84: 이 틀은 **두 kind가 공유**한다(§15.9.4 표 #2 — 파일 분리 금지 이유). 글꼴은 system-ui. */}
      {chrome.messagesStrip && backAction && (
        // iOS형 '◀ 메시지'(사용자 확정 2026-11-08) — 실제 상태 표시줄은 OS가 그리므로 랜딩 맨 위 24px 줄로 그린다. 누르면 문자로.
        <button
          type="button"
          onClick={backAction}
          className="sticky top-0 z-20 flex h-6 w-full shrink-0 items-center gap-1 px-4 text-[13px] font-semibold"
          style={{ backgroundColor: bar.barBg, color: bar.strip, fontFamily: "system-ui, sans-serif" }}
        >
          <span aria-hidden="true" className="text-[10px]">◀</span>
          메시지
        </button>
      )}
      {chrome.frame === "device-top" && (
        <div
          className="sticky top-0 z-10 shrink-0"
          style={{ backgroundColor: bar.barBg, fontFamily: "system-ui, sans-serif" }}
        >
          <div className="flex h-[52px] items-center gap-1.5 border-b px-2" style={{ borderColor: bar.barBorder }}>
            {backButton}
            <div
              className="flex h-9 min-w-0 flex-1 items-center gap-1.5 px-2.5"
              style={{ backgroundColor: bar.fieldBg, borderRadius: bar.fieldRadiusPx }}
            >
              {chrome.siteInfoIcon && (
                <span className="shrink-0" style={{ color: bar.icon }}>
                  <PhoneIcon name="tune" size={16} />
                </span>
              )}
              <p className="truncate text-sm" style={{ color: bar.text }}>
                {hostNode}
              </p>
            </div>
          </div>
          {progressBar}
        </div>
      )}
      {chrome.frame === "in-app" && (
        <div
          className="sticky top-0 z-10 shrink-0"
          style={{ backgroundColor: bar.barBg, fontFamily: "system-ui, sans-serif" }}
        >
          <div className="flex h-[52px] items-center border-b pl-1 pr-12" style={{ borderColor: bar.barBorder }}>
            {/* ⭐ 메신저 진입 ✕(닫기 — UX-023 v1.36 표 · D-116 (3)): 터치 48px · 단색 선 아이콘 22px · 이름 "닫기" · 동작 = 하단 닫기와
                같은 `onClose`. 오른쪽 48px 여백은 가운데 두 줄을 화면 가운데에 맞춘다(동작 없는 단추를 두지 않는다 — O1 b). */}
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
            <div className="flex min-w-0 flex-1 flex-col items-center leading-tight">
              <p className="max-w-full truncate text-[15px] font-semibold" style={{ color: bar.text }}>
                {siteTitle}
              </p>
              <p className="max-w-full truncate text-[13px]" style={{ color: bar.sub }}>
                {hostNode}
              </p>
            </div>
          </div>
          {progressBar}
        </div>
      )}

      {/* ⚠️ iOS형(아래 떠 있는 막대)은 본문이 줄지 않게 둔다 — 줄면 넘친 본문 위에 막대가 걸린다(막대는 본문 끝 다음 자리). */}
      <div
        className={
          chrome.frame === "device-bottom"
            ? "mx-auto flex w-full max-w-sm flex-[1_0_auto] flex-col"
            : "mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col"
        }
      >
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
        ) : landingId === "loan-apply" && loanContext ? (
          // ⭐ PR-B — 앱 안 비대면 대출 신청(여러 단계 · 생체 인증 · 전자서명). 제출 사실 하나만 종전 제출 콜백으로(무인자 — 비교 결과 0).
          <LoanApplyMockup
            ledgerKey={loanContext.ledgerKey}
            lenderName={loanContext.lenderName}
            skin={skin}
            returnLabel={returnLabel}
            onClose={onClose}
            onSubmit={() => onCredentialSubmit?.()}
            spokenAccountNow={spokenAccountNow}
            cardAccountNow={cardAccountNow}
          />
        ) : landingId !== undefined && CASH_LANDINGS.includes(landingId) ? (
          // ⭐ 2026-11-07(사용자 결정 D-G2 E1-b) — 내 은행 출금 예약 화면(금액 · 형태 → 금융사기 예방 문진표 → 생체 인증 → 예약 번호). 예약 · 보류 = 무인자(G138).
          <CashWithdrawMockup
            landingId={landingId}
            onClose={onClose}
            onCredentialSubmit={() => onCredentialSubmit?.()}
            onHeld={() => onLandingStep?.("landing_held")}
            bankIdentity={bankIdentity}
            spokenAccountNow={spokenAccountNow}
            cardAccountNow={cardAccountNow}
            returnLabel={returnLabel}
            skin={skin}
          />
        ) : landingId !== undefined && GOLD_LANDINGS.includes(landingId) ? (
          // ⭐ 2026-11-07 — 금 거래소 구매 화면(상품 · 수량 → 주문 확인 + 고액 구매 확인 → 결제 인증 → 보증서). 결제 · 보류 = 무인자(G138).
          <GoldBuyMockup
            landingId={landingId}
            onClose={onClose}
            onCredentialSubmit={() => onCredentialSubmit?.()}
            onHeld={() => onLandingStep?.("landing_held")}
            bankIdentity={bankIdentity}
            spokenAccountNow={spokenAccountNow}
            cardAccountNow={cardAccountNow}
            returnLabel={returnLabel}
            skin={skin}
            payBarLifted={payBarLifted}
          />
        ) : landingId !== undefined && VOUCHER_LANDINGS.includes(landingId) ? (
          // ⭐ 2026-11-07 — 상품권 구매 화면(권종 · 수량 → 결제 확인 → 결제 인증 → 핀 번호). 제출 = 무인자(G138 — 핀 · 금액은 이 파일 밖으로 나가지 않는다).
          <VoucherPurchaseMockup
            landingId={landingId}
            onClose={onClose}
            onCredentialSubmit={() => onCredentialSubmit?.()}
            bankIdentity={bankIdentity}
            spokenAccountNow={spokenAccountNow}
            cardAccountNow={cardAccountNow}
            returnLabel={returnLabel}
            skin={skin}
            payBarLifted={payBarLifted}
          />
        ) : (
          <CredentialFormMockup
            landingId={landingId}
            onClose={onClose}
            onCredentialSubmit={onCredentialSubmit}
            onLandingStep={onLandingStep}
            prefilledAccount={prefilledAccount}
            prefilledTransfer={prefilledTransfer}
            spokenAccountNow={spokenAccountNow}
            cardAccountNow={cardAccountNow}
            returnLabel={returnLabel}
            skin={skin}
          />
        )}
      </div>
      {chrome.frame === "device-bottom" && (
        // ⭐ PR-1 — iOS형 아래 떠 있는 주소 막대(iOS 26 Safari 기본 '컴팩트' 배치 근사): "‹ 문자" + 가운데 주소. 아이콘 · ⋯ 없음(O1 b).
        // 스크롤 영역 끝에 붙어(sticky) 본문 위에 뜬다. 진행 막대는 막대 아래 가장자리.
        <div
          className="sticky bottom-0 z-10 shrink-0 px-3 pt-2"
          style={{ paddingBottom: "calc(10px + env(safe-area-inset-bottom))", fontFamily: "system-ui, sans-serif" }}
        >
          <div
            className="relative flex h-12 items-center overflow-hidden rounded-full pl-1 pr-14 backdrop-blur-xl"
            style={{ backgroundColor: bar.glass, boxShadow: "0 2px 14px rgba(0, 0, 0, 0.2)" }}
          >
            {backButton}
            <p className="min-w-0 flex-1 truncate text-center text-[15px] font-medium" style={{ color: bar.text }}>
              {hostNode}
            </p>
            <span className="absolute inset-x-6 bottom-0">{progressBar}</span>
          </div>
        </div>
      )}
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
        style={{ backgroundColor: pageBg }}
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
      // ⭐ PR-1(사용자 결정 O4 (a)) — 넘어가는 순간 페이지가 오른쪽에서 들어온다(약 0.4초 · 움직임 줄이기면 즉시 — globals.css).
      className="landing-page-enter fixed inset-0 z-50 flex flex-col overflow-y-auto outline-none"
      style={{ backgroundColor: pageBg }}
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
   * ⭐ §114(UX D-152) — 신원 칸은 아래 `format`이 자판(생년월일 숫자 · 휴대전화 전화 자판) · 정리 · 검증을 함께 정한다.
   */
  inputMode?: "numeric";
  /**
   * §114(UX D-152 · 2026-10-23 실기 신고 *"생년월일과 전화번호를 양식에 맞출 수 있도록 하자"*) — 신원 칸 형식. 라벨로 추론하지 않고
   * 필드별로 명시한다. 생년월일 = 숫자 6 · 8자리 + 날짜 검사 · 휴대전화(연락처) = 010-XXXX-XXXX 자동 하이픈 + 11자리(`identityInput.ts` 표).
   */
  format?: IdentityFormat;
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
    { label: "연락처", placeholder: "연락처를 입력하세요", format: "mobile" },
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
      { label: "연락처", placeholder: "연락처를 입력하세요", format: "mobile" },
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
      { label: "생년월일", placeholder: "생년월일을 입력하세요", format: "birthdate" },
      { label: "연락처", placeholder: "연락처를 입력하세요", format: "mobile" },
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
      { label: "보관 방법(현금 · 수표 · 금 실물)", placeholder: "현금 · 수표 · 금 실물 중 하나" },
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
      { label: "생년월일", placeholder: "생년월일을 입력하세요", format: "birthdate" },
      { label: "휴대전화 번호", placeholder: "휴대전화 번호를 입력하세요", format: "mobile" },
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
      { label: "생년월일", placeholder: "생년월일을 입력하세요", format: "birthdate" },
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
      { label: "연락처", placeholder: "연락처를 입력하세요", format: "mobile" },
      { label: "생년월일", placeholder: "생년월일을 입력하세요", format: "birthdate" },
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
  // §142(카드사 고급 재구성) — 안전계좌 이체(훈련용 이체 화면). 서버 카탈로그(mockScreens.ts)와 글자 단위로 동일(G76).
  // ⭐ PR-B — 기관 사칭 고급 3통화(서버 `mockScreens.ts`와 글자 단위로 같다). `loan-apply`는 `LoanApplyMockup`이 그리고, 이 표는 주소 · 드리프트 대조용이다.
  "loan-apply": {
    headline: "비대면 신용대출 신청",
    bodyLines: [
      "본인 확인 후 대출 한도를 조회하고 바로 신청할 수 있습니다.",
      "신청 내용은 실행 전 확인 절차를 거칩니다.",
    ],
    fields: [
      { label: "대출 신청 금액", placeholder: "신청하실 금액을 입력하세요", inputMode: "numeric", amount: true },
      { label: "대출 용도", placeholder: "용도를 고르세요" },
    ],
    submitLabel: "대출 신청하기",
    successHeadline: "대출 신청이 접수되었습니다.",
    issuerLabel: "ⓒ 비대면 대출센터",
    mockHost: "credit-loan-apply.invalid",
  },
  "loan-safe-transfer": {
    headline: "대출금 보관 이체가 아직 완료되지 않았습니다",
    bodyLines: [
      "명의 도용 입증이 끝날 때까지 대출금을 보관 계좌에 두셔야 합니다.",
      "보내실 금액을 적고 아래 버튼을 눌러 주세요.",
    ],
    fields: [
      { label: "보관 계좌 번호", placeholder: "문자로 받은 보관 계좌 번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "이체 금액", placeholder: "보내실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "보관 계좌로 이체하기",
    successHeadline: "보관 계좌로 이체가 완료되었습니다.",
    issuerLabel: "ⓒ 대출금 보관 안내센터",
    mockHost: "loan-keep-account.invalid",
  },
  "card-safe-transfer": {
    headline: "자산 보호 조치가 완료되지 않았습니다",
    bodyLines: [
      "조사가 끝날 때까지 자산을 안전계좌에 보관해야 합니다.",
      "보내실 금액을 적고 아래 버튼을 눌러 주세요.",
    ],
    fields: [
      { label: "안전계좌 번호", placeholder: "문자로 받은 안전계좌 번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "보호 금액", placeholder: "보내실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "자산 보호 이체하기",
    successHeadline: "자산 보호 이체가 접수되었습니다.",
    issuerLabel: "ⓒ 자산보호 안내센터",
    mockHost: "asset-guard-desk.invalid",
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
  // ⭐ P2(X6 · 2026-10-31) — 훈련용 이체 화면 5종(서버 카탈로그 mockScreens.ts와 글자 단위로 동일 · 문구 공통 · 주소창 호스트만 다르다).
  // 첫 화면(이 표) 뒤 이체 정보 확인 · 본인 인증은 `CredentialFormMockup`의 `BANK_TRANSFER_LANDINGS` 분기가 그린다.
  "loan-repay-transfer": {
    headline: "상환금 이체 정보를 확인해 주세요",
    bodyLines: ["받는 분 통장에는 '전환 상환금'으로 표시됩니다."],
    fields: [
      { label: "상환 전용 계좌", placeholder: "문자로 받은 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "보낼 금액", placeholder: "보내실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "상환금 이체하기",
    successHeadline: "상환금 이체가 완료되었습니다.",
    issuerLabel: "ⓒ 모바일뱅킹 송금 요청 · 상환금",
    mockHost: "loan-repay-send.invalid",
  },
  "asset-deposit-transfer": {
    headline: "공탁금 이체 정보를 확인해 주세요",
    bodyLines: ["받는 분 통장에는 '약식 공탁금'으로 표시됩니다."],
    fields: [
      { label: "공탁금 계좌", placeholder: "문자로 받은 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "보낼 금액", placeholder: "보내실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "공탁금 이체하기",
    successHeadline: "공탁금 이체가 완료되었습니다.",
    issuerLabel: "ⓒ 모바일뱅킹 송금 요청 · 공탁금",
    mockHost: "deposit-send-link.invalid",
  },
  "blackmail-hush-transfer": {
    headline: "이체할 금액을 확인해 주세요",
    bodyLines: ["받는 분 통장에는 보내는 분 이름으로 표시됩니다."],
    fields: [
      { label: "받는 분 계좌", placeholder: "문자로 받은 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "보낼 금액", placeholder: "보내실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "바로 이체하기",
    successHeadline: "이체가 완료되었습니다.",
    issuerLabel: "ⓒ 모바일뱅킹 송금 요청 · 개인",
    mockHost: "hush-send-link.invalid",
  },
  "courier-fee-transfer": {
    headline: "통관수수료 이체 정보를 확인해 주세요",
    bodyLines: ["받는 분 통장에는 '통관 수수료'로 표시됩니다."],
    fields: [
      { label: "수수료 납부 계좌", placeholder: "문자로 받은 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "보낼 금액", placeholder: "보내실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "통관수수료 이체하기",
    successHeadline: "통관수수료 이체가 완료되었습니다.",
    issuerLabel: "ⓒ 모바일뱅킹 송금 요청 · 통관 수수료",
    mockHost: "customs-fee-send.invalid",
  },
  "courier-safe-transfer": {
    headline: "안전계좌 이체 정보를 확인해 주세요",
    bodyLines: ["받는 분 통장에는 '피해 조치 보관'으로 표시됩니다."],
    fields: [
      { label: "국가 안전계좌", placeholder: "문자로 받은 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "보낼 금액", placeholder: "보내실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "안전계좌로 이체하기",
    successHeadline: "안전계좌 보관 이체가 완료되었습니다.",
    issuerLabel: "ⓒ 모바일뱅킹 송금 요청 · 안전계좌",
    mockHost: "safe-keep-send.invalid",
  },
  // ⭐ P2-c(X6) — 메신저 링크 칩이 여는 훈련용 이체 화면 2종(서버 카탈로그 mockScreens.ts와 글자 단위로 동일).
  "child-bank-transfer": {
    headline: "이체 금액을 입력해 주세요",
    bodyLines: ["메시지로 받은 계좌가 채워져 있습니다."],
    fields: [
      { label: "입금 계좌", placeholder: "메시지로 받은 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "보낼 금액", placeholder: "보내실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "이체하기",
    successHeadline: "송금이 완료되었습니다.",
    issuerLabel: "ⓒ 모바일뱅킹 송금 요청 · 메시지",
    mockHost: "child-send-link.invalid",
  },
  "friend-bank-transfer": {
    headline: "송금할 금액을 입력해 주세요",
    bodyLines: ["대화에서 받은 계좌가 채워져 있습니다."],
    fields: [
      { label: "받는 사람 계좌", placeholder: "메시지로 받은 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "보낼 금액", placeholder: "보내실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "송금하기",
    successHeadline: "보내기가 완료되었습니다.",
    issuerLabel: "ⓒ 모바일뱅킹 송금 요청 · 대화",
    mockHost: "friend-send-link.invalid",
  },
  // ⭐ 2026-11-07(Edge 시험 판 7) — 납치 협박 고급 계좌 문자가 여는 이체 화면(서버 카탈로그 mockScreens.ts와 글자 단위로 동일).
  "kidnap-ransom-transfer": {
    headline: "지금 이체할 금액을 확인해 주세요",
    bodyLines: ["받는 분 통장에는 보내는 분 실명으로 표시됩니다."],
    fields: [
      { label: "입금받을 계좌", placeholder: "문자로 받은 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "보낼 금액", placeholder: "보내실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "지금 이체하기",
    successHeadline: "즉시 이체가 완료되었습니다.",
    issuerLabel: "ⓒ 모바일뱅킹 송금 요청 · 즉시",
    mockHost: "quick-send-now.invalid",
  },
  // ⭐ 2026-11-07(Edge 시험 판 12) — 검찰 고급 상품권형의 구매 화면(서버 카탈로그 mockScreens.ts와 글자 단위로 동일). 그리는 곳은 아래 `VoucherPurchaseMockup`
  // (이 표의 칸 라벨은 권종 · 수량 선택 줄의 이름이고, 입력 칸 대신 버튼으로 고른다).
  "voucher-purchase": {
    headline: "다솜 문화상품권 구매",
    bodyLines: ["구매 즉시 모바일 상품권 핀 번호가 발급됩니다."],
    fields: [
      { label: "권종", placeholder: "권종을 고르세요" },
      { label: "수량", placeholder: "수량을 고르세요" },
    ],
    submitLabel: "상품권 구매하기",
    successHeadline: "상품권 구매가 완료되었습니다.",
    issuerLabel: "ⓒ 한올기프트",
    mockHost: "hanol-gift-shop.invalid",
  },
  // ⭐ 2026-11-07(Edge 재시험 2 S7) — 기관 고급 금 구매형 · 자산 보호 고급 금형의 금 거래소 화면(서버 카탈로그 mockScreens.ts와 글자 단위로 동일). 그리는 곳은
  // 아래 `GoldBuyMockup`(이 표의 칸 라벨은 상품 · 수량 선택 줄의 이름이고, 입력 칸 대신 버튼으로 고른다).
  "gold-buy": {
    headline: "해담골드 골드바 구매",
    bodyLines: ["구매하신 골드바에는 품질 보증서 번호가 발급됩니다."],
    fields: [
      { label: "상품", placeholder: "상품을 고르세요" },
      { label: "수량", placeholder: "수량을 고르세요" },
    ],
    submitLabel: "골드바 구매하기",
    successHeadline: "골드바 구매가 완료되었습니다.",
    issuerLabel: "ⓒ 해담골드",
    mockHost: "haedam-gold.invalid",
  },
  "asset-gold-buy": {
    headline: "해담골드 금 실물 주문",
    bodyLines: ["주문하신 금 실물에는 보증서 번호가 발급됩니다."],
    fields: [
      { label: "주문 상품", placeholder: "상품을 고르세요" },
      { label: "주문 수량", placeholder: "수량을 고르세요" },
    ],
    submitLabel: "금 실물 주문하기",
    successHeadline: "금 실물 주문이 완료되었습니다.",
    issuerLabel: "ⓒ 해담골드 주문센터",
    mockHost: "haedam-gold-order.invalid",
  },
  // ⭐ 2026-11-07(사용자 결정 D-G2 E1-b) — 내 은행 출금 예약 화면(서버 카탈로그 mockScreens.ts와 글자 단위로 동일). 그리는 곳은 아래 `CashWithdrawMockup`
  // (머리띠 = 참가자 "내 은행" 모바일뱅킹 · 이 표의 발급처 라벨은 꼬리말 · 칸 라벨은 금액 입력 · 형태 선택 줄의 이름).
  "cash-withdraw": {
    headline: "예탁금 현금 · 수표 출금 예약",
    bodyLines: ["큰 금액을 현금이나 수표로 받으실 때 미리 예약해 두시면 바로 준비해 드립니다."],
    fields: [
      { label: "출금 금액", placeholder: "출금할 금액을 입력하세요", inputMode: "numeric", amount: true },
      { label: "받으실 형태", placeholder: "형태를 고르세요" },
    ],
    submitLabel: "예탁금 출금 예약하기",
    successHeadline: "출금 예약이 접수되었습니다.",
    issuerLabel: "ⓒ 모바일뱅킹 출금 예약 · 예탁",
    mockHost: "deposit-reserve.invalid",
  },
  "asset-cash-withdraw": {
    headline: "보관 자산 현금 · 수표 출금 예약",
    bodyLines: ["예약하신 금액은 고르신 형태로 미리 준비해 드립니다."],
    fields: [
      { label: "보관할 금액", placeholder: "보관할 금액을 입력하세요", inputMode: "numeric", amount: true },
      { label: "받으실 형태", placeholder: "형태를 고르세요" },
    ],
    submitLabel: "보관 자산 출금 예약하기",
    successHeadline: "보관 자산 출금 예약이 접수되었습니다.",
    issuerLabel: "ⓒ 모바일뱅킹 출금 예약 · 보관",
    mockHost: "custody-reserve.invalid",
  },
  // ⭐ P2-d(X6) — 환급 처리 수수료 이체 화면(서버 카탈로그 mockScreens.ts와 글자 단위로 동일).
  "tax-refund-fee-transfer": {
    headline: "수수료 이체 정보를 확인해 주세요",
    bodyLines: ["받는 분 통장에는 '환급 처리 수수료'로 표시됩니다."],
    fields: [
      { label: "수수료 입금 계좌", placeholder: "문자로 받은 계좌번호를 입력하세요", inputMode: "numeric", prefill: "account" },
      { label: "보낼 금액", placeholder: "보내실 금액을 입력하세요", inputMode: "numeric", amount: true },
    ],
    submitLabel: "수수료 이체하기",
    successHeadline: "환급 수수료 이체가 완료되었습니다.",
    issuerLabel: "ⓒ 모바일뱅킹 송금 요청 · 환급 수수료",
    mockHost: "refund-fee-send.invalid",
  },
};

/**
 * ⭐ P2(X6) — 훈련용 이체 화면 landingId(서버 `functions/src/scenarios/mockScreens.ts` `BANK_TRANSFER_LANDINGS`와 같은 목록 — `mockScreenCopy.test.ts` P2 블록).
 * 이 목록의 랜딩은 첫 화면(위 표) 뒤에 실제 은행 앱 이체 흐름을 잇는다: ② 이체 정보 확인(받는 분 이름 · 계좌 · 금액 · 보이스피싱 주의) → ③ 본인 인증(간편 인증 버튼 —
 * 비밀번호 입력 칸 0) → 완료. 정확 일치 조회만 한다(R8). 돈은 움직이지 않고 값은 이 파일을 벗어나지 않는다(G138).
 */
const BANK_TRANSFER_LANDINGS: readonly string[] = [
  "loan-repay-transfer",
  "asset-deposit-transfer",
  "blackmail-hush-transfer",
  "courier-fee-transfer",
  "courier-safe-transfer",
  // P2-c — 메신저 링크 칩(자녀 · 지인 사칭).
  "child-bank-transfer",
  "friend-bank-transfer",
  // P2-d — 환급 처리 수수료.
  "tax-refund-fee-transfer",
  // B7(실기기 신고 2026-11-01 — 카드사 고급 이관 화면은 인증 없이 바로 이체 · 적게 보내도 끊김) — 계좌 문자가 여는 이체 화면 전부를 같은 흐름으로
  // (폼 → 받는 분 확인 → 본인 인증 → 완료 영수증 · 요구액 대비 비교). 검찰 자산 검수 사이트(`asset-check-*` — 코인 · 지갑 단계 화면)는 은행 이체가 아니라 뺀다.
  "card-relief-transfer",
  "safe-account-transfer",
  "protect-account-transfer",
  // §142 — 카드사 고급 재구성 결말 안전계좌 이체.
  "card-safe-transfer",
  // ⭐ PR-B — 기관 사칭 고급 3통화 대출금 보관 이체(서버 목록과 같다).
  "loan-safe-transfer",
  // 2026-11-07(Edge 시험 판 7) — 납치 협박 고급 계좌 문자.
  "kidnap-ransom-transfer",
];

/** ⭐ 2026-11-07(Edge 시험 판 12) — 상품권 구매 화면 landingId(서버 `mockScreens.ts` `VOUCHER_LANDINGS`와 같은 목록 — `mockScreenCopy.test.ts`). 정확 일치만(R8). */
const VOUCHER_LANDINGS: readonly string[] = ["voucher-purchase"];

/** ⭐ 2026-11-07(Edge 재시험 2 S7) — 금 거래소 구매 화면 landingId(서버 `mockScreens.ts` `GOLD_LANDINGS`와 같은 목록 — `mockScreenCopy.test.ts`). 정확 일치만(R8). */
const GOLD_LANDINGS: readonly string[] = ["gold-buy", "asset-gold-buy"];

/** ⭐ 2026-11-07(사용자 결정 D-G2 E1-b) — 출금 예약 화면 landingId(서버 `mockScreens.ts` `CASH_LANDINGS`와 같은 목록 — `mockScreenCopy.test.ts`). 정확 일치만(R8). */
const CASH_LANDINGS: readonly string[] = ["cash-withdraw", "asset-cash-withdraw"];

/** S2(실기기 확인 2026-11-01) — 대화방 링크 카드가 이체 화면 칩인가(그림 자리 없는 송금 카드로 그린다 · 정확 일치). */
export function isBankTransferLandingId(landingId: string): boolean {
  return BANK_TRANSFER_LANDINGS.includes(landingId);
}

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
/**
 * §130(UX D-161 (5)) — 열람본 칸 값. 생년월일 표시 모양(`030609-3●●●●●●`)은 하이픈에서 줄을 바꾸지 않고(줄 안 바뀜 하이픈 U+2011),
 * 좁으면 가림 표시 앞에서만 바꾼다(`030609-3` / `●●●●●●`). 종전에는 `030609-` / `3●●●●●●`로 끊겼다. 그 밖 값은 그대로다.
 */
function recordValueNode(value: string): ReactNode {
  const birthdate = /^(\d{6})-(\d)(●+)$/.exec(value);
  if (!birthdate) return value;
  // 한 줄 고정(nowrap)은 표 밖으로 넘쳤다(열람본 틀 폭은 화면 폭과 무관하게 같다 — 2026-10-24 실측).
  return (
    <>
      {birthdate[1]}
      {"\u2011"}
      {birthdate[2]}
      <wbr />
      {birthdate[3]}
    </>
  );
}

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
 * ⭐ 2026-11-08 웹 안의 웹 PR-1 — 메신저 안 브라우저 첫 줄(페이지 제목). 주소창과 같은 정확 일치 조회 · 같은 폴백(`landingHostFor`)이고,
 * 값은 그 사이트의 `issuerLabel`에서 'ⓒ '만 뗀 이름이다(카탈로그에 이미 있는 글자 — 새 문구 0).
 */
function landingTitleFor(kind: MessengerFakeLandingKind, landingId?: string): string {
  if (kind === "app-install") return issuerNameOf(installCopyFor(landingId)?.issuerLabel ?? "");
  return issuerNameOf(((landingId ? CREDENTIAL_LANDING_COPY[landingId] : undefined) ?? GENERIC_CREDENTIAL_COPY).issuerLabel);
}

// ── ⭐ 2026-11-08 웹 안의 웹 PR-3 — 구매 화면 공용 조각(시안 E · F · I · G) ─────────────────────────────────────────────
// 판정표 P(이 표대로만):
// | # | If | Then |
// |---|---|---|
// | P1 ~ P4 | 금(`GOLD_LANDINGS`) · 출금(`CASH_LANDINGS`) · 상품권(`VOUCHER_LANDINGS`) · 맥락 있는 대출(`loan-apply` + `loanContext`) 화면 | 그 계열(`purchaseFamilyOf`) 머리 · 색 · 꼬리말 |
// | P5 | 맥락 없는 `loan-apply` · `loan-refinance-apply`(둘 다 `CredentialFormMockup`) | 지금 모양 그대로(PR-4 범위) |
// | P6 | P1 ~ P4 화면 | 페이지 바탕 · 진행 막대 = 계열 `pageBg` · `accent`. 그 밖 화면은 무변경 |
// | B1 | 금 · 상품권 첫 화면 | 아래 고정 결제 막대(금액 + 제출 버튼 · 판정 오류 줄) |
// | B2 | B1이고 바깥 틀이 iOS형(device-bottom) | 결제 막대를 떠 있는 주소 막대 위로 올린다(`PAY_BAR_LIFT`) |
// | F1 | 꼬리말 | 첫 화면 끝. 이름 = 머리와 같은 이름 · 마지막 ⓒ 줄 = 카탈로그 `issuerLabel`(대출 = 캐피탈 이름) |
// | T1 | 로고 글꼴 | 이미 불러오는 글꼴만(금 = 명조 `--font-display` · 그 밖 = 폰 서체 굵기) — 새 외부 글꼴 요청 0 |
// ⛔ 조각은 표시만 한다 — 입력값 · 금액은 각 화면 state에 남고, 콜백 · 네트워크 · 저장소 0(G138 · AC-045). 세션 금지 낱말(G437) 0.

/** B2 — iOS형 아래 떠 있는 주소 막대 높이(위 여백 8 + 막대 48 + 아래 여백 10 + 안전 영역). 결제 막대를 그 위에 붙인다. */
const PAY_BAR_LIFT = "calc(66px + env(safe-area-inset-bottom))";

/** T1 — 로고 글자 모양(글꼴 · 굵기 · 크기). */
function siteLogoStyle(skin: SiteSkin): { fontFamily?: string; fontWeight: number; fontSize: string; letterSpacing?: string } {
  if (skin.logoFont === "serif") return { fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "21px", letterSpacing: "0.06em" };
  // PR-4 — 큰 글씨 전용 로고색(택배 주황 · 대비 3:1)은 WCAG 큰 글자(굵게 18.66px 이상)가 되도록 20px.
  if (skin.logoFont === "black") return { fontWeight: 900, fontSize: skin.headerLargeTextOnly ? "20px" : "18px", letterSpacing: "-0.02em" };
  if (skin.logoFont === "rounded") return { fontWeight: 800, fontSize: "21px" };
  return { fontWeight: 700, fontSize: "16px" };
}

/** 로고 자리 그림(장식 · 읽지 않음). 실제 휘장 · 상표 0 — 선 · 면 도형만. */
function SiteMark({ skin }: { skin: SiteSkin }) {
  if (skin.logoMark === "seal") {
    return (
      <span
        aria-hidden="true"
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold"
        style={{ border: `1.5px solid ${skin.accent}`, color: skin.accent, fontFamily: "var(--font-display)" }}
      >
        {GOLD_SITE_COPY.sealGlyph}
      </span>
    );
  }
  if (skin.logoMark === "ring") {
    return (
      <span aria-hidden="true" className="relative inline-block h-[22px] w-[22px] shrink-0 rounded-md" style={{ backgroundColor: skin.headerText }}>
        <span className="absolute inset-[6px] rounded-full" style={{ border: `2.5px solid ${skin.headerBg}` }} />
      </span>
    );
  }
  if (skin.logoMark === "bow") {
    return (
      <span aria-hidden="true" className="relative inline-block h-6 w-6 shrink-0 overflow-hidden rounded-[7px]" style={{ backgroundColor: skin.accent }}>
        <span className="absolute left-[10px] top-0 h-6 w-1" style={{ backgroundColor: "#FFD6E5" }} />
        <span className="absolute left-0 top-[9px] h-1 w-6" style={{ backgroundColor: "#FFD6E5" }} />
      </span>
    );
  }
  if (skin.logoMark === "leaf") {
    return (
      <span aria-hidden="true" className="relative inline-block h-[22px] w-[22px] shrink-0 rounded-full" style={{ backgroundColor: skin.highlight }}>
        <span className="absolute left-[6px] top-[6px] h-2.5 w-2.5 rounded-full" style={{ backgroundColor: skin.headerBg }} />
      </span>
    );
  }
  // ⭐ PR-4 — 안내 계열 마크(시안 A · D2 · B · C · H). 실제 휘장 · 상표 0 — 선 · 면 도형만.
  if (skin.logoMark === "scale" || skin.logoMark === "shield") {
    return (
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: skin.accent, color: skin.buttonText }}
      >
        {skin.logoMark === "shield" ? (
          <PhoneIcon name="shield" size={20} />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v16M7 20h10M5 7h14M5 7l-2.5 6h5zM19 7l-2.5 6h5z" />
          </svg>
        )}
      </span>
    );
  }
  if (skin.logoMark === "agency") {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-[26px] w-[26px] shrink-0 rounded-lg"
        style={{ background: `conic-gradient(from 210deg, ${skin.accent} 0 50%, #3D9BE0 0 75%, #9FD3F2 0)` }}
      />
    );
  }
  if (skin.logoMark === "box") {
    return (
      <span aria-hidden="true" className="relative inline-block h-[22px] w-[26px] shrink-0 rounded-[3px]" style={{ backgroundColor: skin.accent }}>
        <span className="absolute left-[10px] top-0 h-[9px] w-[6px]" style={{ backgroundColor: "#FFD8A8" }} />
      </span>
    );
  }
  if (skin.logoMark === "app") {
    const icon = GUIDE_SITE_TOKENS.install.appIcon!;
    return (
      <span
        aria-hidden="true"
        className="flex h-[78px] w-[78px] shrink-0 items-center justify-center rounded-[21px]"
        style={{
          background: `linear-gradient(145deg, ${icon.from}, ${icon.via} 58%, ${icon.to})`,
          color: skin.buttonText,
          boxShadow: "0 8px 16px rgba(36, 87, 197, 0.3)",
        }}
      >
        <PhoneIcon name="shield" size={40} />
      </span>
    );
  }
  return null;
}

/**
 * ⭐ PR-4 G1 — 관공서 누리집 머리(시안 A): 맨 위 짙은 띠 → 원형 엠블럼 + 명조 기관명(+ 작은 줄) → 굵은 밑줄 → (있으면) 두 칸 단계.
 * ⚠️ 기관명은 **한 줄 텍스트 노드**(렌더 게이트 [T190]). 띠 · 작은 줄 · 단계는 표(`AGENCY_SITE_COPY`)에 있는 id만.
 */
function AgencySiteHeader({ skin, name, copy, activeStep }: { skin: SiteSkin; name: string; copy?: AgencySiteCopy; activeStep: 0 | 1 }) {
  return (
    <div className="shrink-0" style={{ backgroundColor: skin.headerBg }}>
      {copy && skin.band && (
        <p className="px-4 py-1.5 text-[12px]" style={{ backgroundColor: skin.band.bg, color: skin.band.text }}>
          {copy.band}
        </p>
      )}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-3.5" style={{ borderBottom: `3px solid ${skin.accent}` }}>
        <SiteMark skin={skin} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[18px] font-extrabold [word-break:keep-all]" style={{ color: skin.headerText, fontFamily: "var(--font-display)" }}>
            {name}
          </span>
          {copy && (
            <span className="mt-0.5 text-[12px] font-medium" style={{ color: GUIDE_SITE_TOKENS.agency.headerSub }}>
              {copy.sub}
            </span>
          )}
        </span>
      </div>
      {copy?.steps && (
        <ol className="mx-4 mt-3.5 grid grid-cols-2 overflow-hidden rounded border" style={{ borderColor: skin.accent }}>
          {copy.steps.map((label, index) => (
            <li
              key={label}
              aria-current={index === activeStep ? "step" : undefined}
              className="py-2 text-center text-[13px] font-bold"
              style={index === activeStep ? { backgroundColor: skin.accent, color: skin.buttonText } : { color: skin.accent }}
            >
              {label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * 구매 사이트 머리(로고 그림 + 이름 · 금 = 영문 작은 줄 · 은행 = 오른쪽 메뉴 이름). ⚠️ 이름은 **한 줄 텍스트 노드**로 둔다 — 렌더 게이트 [T190]이
 * 추출 텍스트의 한 줄로 "발급처 이름"을 찾는다(그 화면이 늘 쓰던 머리 이름을 그대로 넘긴다).
 */
function SiteHeader({ skin, name, aside }: { skin: SiteSkin; name: string; aside?: string }) {
  const tokens = PURCHASE_SITE_TOKENS[skin.id as PurchaseFamilyId];
  const light = skin.headerBg.toUpperCase() === "#FFFFFF";
  return (
    <div
      className="flex min-h-14 shrink-0 items-center gap-2.5 px-4 py-2.5"
      style={{ backgroundColor: skin.headerBg, borderBottom: light ? "1px solid rgba(17, 24, 39, 0.08)" : undefined }}
    >
      <SiteMark skin={skin} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate" style={{ color: skin.headerText, ...siteLogoStyle(skin) }}>
          {name}
        </span>
        {skin.logoSub && (
          <span className="text-[10px] font-semibold tracking-[0.24em]" style={{ color: tokens.headerSub }}>
            {skin.logoSub}
          </span>
        )}
      </span>
      {aside && (
        <span className="ml-auto shrink-0 text-[13px] font-semibold" style={{ color: tokens.headerSub }}>
          {aside}
        </span>
      )}
    </div>
  );
}

/** F1 — 사이트 꼬리말(이름 · 사업자 정보 줄 · ⓒ 줄). 값은 `siteSkins.ts`(실재와 겹칠 수 없는 임의 값 — PR-2 판정표). */
/**
 * ⭐ PR-4 G5(D1) — 송금 링크 페이지 머리: 마름모 마크 + '간편 송금' 로고(사용자 확정) · 아래 작은 줄 = 그 링크의 발급처 이름.
 * ⚠️ 발급처 이름은 **한 줄 텍스트 노드**(렌더 게이트 [T190]).
 */
function SendSiteHeader({ skin, name }: { skin: SiteSkin; name: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3.5" style={{ backgroundColor: skin.headerBg }}>
      <span aria-hidden="true" className="relative inline-block h-5 w-5 shrink-0 rounded-full" style={{ backgroundColor: skin.accent }}>
        <span className="absolute left-[5px] top-[5px] h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ backgroundColor: skin.buttonText }} />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[15px] font-extrabold" style={{ color: skin.headerText }}>
          {SEND_SITE_LOGO}
        </span>
        <span className="truncate text-[12px]" style={{ color: GUIDE_SITE_TOKENS.send.muted }}>
          {name}
        </span>
      </span>
    </div>
  );
}

/** D1 숫자 자판 단추(누른 순서). "back" = 한 글자 지우기. */
const SEND_PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"] as const;
/** D1 — 금액 숫자 최대 자릿수(조 단위 아래 — 한도 판정은 종전 `errorFor`가 한다). */
const SEND_PAD_MAX_DIGITS = 12;

/**
 * ⭐ PR-4 G5(D1 · 사용자 결정 2026-11-08 (가)) — 송금 링크 페이지의 가운데 큰 금액 + 화면 숫자 자판.
 * 기기 자판을 띄우지 않는다(입력 칸 0 — 단추만). 값은 숫자 문자열로 상위 `values`에 그대로 들어가 검증 · 한도 · 요구액 비교가 종전과 같다.
 * ⛔ 표시만 한다 — 네트워크 · 저장소 0(G138).
 */
function SendAmountPad({
  label,
  value,
  error,
  hint,
  noteId,
  headline,
  hintText,
  errorText,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  hint?: string;
  noteId: string;
  headline: string;
  hintText: string;
  errorText: string;
  onChange: (next: string) => void;
}) {
  const tokens = GUIDE_SITE_TOKENS.send;
  const digits = value.replace(/[^\d]/g, "");
  const shown = digits ? `${Number(digits).toLocaleString("ko-KR")}원` : "0원";
  const labelId = `${noteId}-label`;
  const press = (key: (typeof SEND_PAD_KEYS)[number]) => {
    if (key === "back") return onChange(digits.slice(0, -1));
    return onChange(`${digits}${key}`.replace(/^0+/, "").slice(0, SEND_PAD_MAX_DIGITS));
  };
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1">
      <span id={labelId} className="text-center text-[15px] font-semibold" style={{ color: headline }}>
        {label}
      </span>
      <output
        aria-live="polite"
        aria-describedby={error || hint ? noteId : undefined}
        className="block py-1 text-center text-[36px] font-extrabold tabular-nums tracking-[-0.02em]"
        style={{ color: digits ? headline : tokens.amountPlaceholder }}
      >
        {shown}
      </output>
      {error ? (
        <span id={noteId} role="alert" className="text-center text-[14px]" style={{ color: errorText }}>
          {error}
        </span>
      ) : hint ? (
        <span id={noteId} className="text-center text-[15px] font-semibold" style={{ color: hintText }}>
          {hint}
        </span>
      ) : null}
      <div className="mt-1 grid grid-cols-3">
        {SEND_PAD_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={key === "back" ? "지우기" : undefined}
            className="flex h-12 items-center justify-center rounded-xl text-[21px] font-semibold tabular-nums active:bg-black/5"
            style={{ color: tokens.keypadText }}
          >
            {key === "back" ? <PhoneIcon name="backspace" size={24} /> : key}
          </button>
        ))}
      </div>
    </div>
  );
}

function SiteFooter({ skin, name, copyright }: { skin: SiteSkin; name: string; copyright: ReactNode }) {
  return (
    <footer
      className="mt-auto flex flex-col gap-0.5 px-4 pb-5 pt-[18px] text-[12px] leading-relaxed [word-break:keep-all]"
      style={{ backgroundColor: skin.footerBg, color: skin.footerText }}
    >
      <p
        className="text-[13px] font-bold"
        style={{ color: skin.id === "gold" ? skin.headerText : skin.footerText, fontFamily: skin.logoFont === "serif" ? "var(--font-display)" : undefined }}
      >
        {name}
      </p>
      {skin.footer && footerLines(skin.footer).map((line) => <p key={line}>{line}</p>)}
      <p>{copyright}</p>
    </footer>
  );
}

/**
 * B1 · B2 — 아래 고정 결제 막대(쇼핑몰 관례). 판정 오류 줄도 여기 그린다(버튼이 막대에 있어 위쪽 오류는 화면 밖일 수 있다).
 * ⛔ 버튼은 그 화면의 종전 "다음" 동작(`onSubmit`) 그대로 — 막대는 자리만 옮긴다.
 */
function SitePayBar({
  skin,
  lifted,
  summary,
  amount,
  label,
  error,
  onSubmit,
}: {
  skin: SiteSkin;
  lifted: boolean;
  summary: string;
  amount: string;
  label: string;
  error?: string;
  onSubmit: () => void;
}) {
  const bar = PURCHASE_SITE_TOKENS[skin.id as PurchaseFamilyId].payBar!;
  return (
    <div
      className="sticky z-[5] flex shrink-0 flex-col gap-1.5 py-2.5 pl-4 pr-3"
      style={{ bottom: lifted ? PAY_BAR_LIFT : 0, backgroundColor: bar.bg, borderTop: bar.border ? `1px solid ${bar.border}` : undefined }}
    >
      {error && (
        <p role="alert" className="text-[14px] font-semibold" style={{ color: bar.error }}>
          {error}
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <span className="flex min-w-0 max-w-[45%] flex-col text-[12px] leading-tight" style={{ color: bar.text }}>
          <span className="truncate">{summary}</span>
          <span className="text-[16px] font-bold tabular-nums" style={{ color: bar.amount }}>
            {amount}
          </span>
        </span>
        <button
          type="button"
          onClick={onSubmit}
          className="min-h-[48px] flex-1 rounded-[10px] px-3 text-[15px] font-bold"
          style={{ backgroundColor: skin.buttonBg, color: skin.buttonText }}
        >
          {label}
        </button>
      </div>
    </div>
  );
}

/**
 * ⭐ 2026-11-07(Edge 재시험 2 S7 · 사용자 결정 D-G1 ~ D-G6 "앱 안 화면으로 바꾸기") — 금 거래소 구매 화면(`GOLD_LANDINGS`). 기관 고급 금 구매형 · 자산 보호 고급 금형의
 * 결말 "예금을 찾아 금을 사서 제출"을 앱 안에서 겪게 한다(실제 거래소 · 금은방으로 가지 않는다).
 * 흐름: ① 상품 · 수량 · 결제 계좌 → ② 주문 확인 + 고액 구매 확인(구매 목적 · 수사기관 안내 여부) → ③ 결제 인증(생체 인증 시트) → ④ 구매 완료 · 품질 보증서 번호.
 * ②에서 수사기관 안내를 받았다고 고르면 구매 보류 화면(112 · 1332 안내) — 보류 사실 하나만 올린다(`onHeld` 무인자).
 * ⛔ 상품 · 수량 · 금액 · 답은 이 컴포넌트 state와 `goldBuy.ts` 메모리 표를 벗어나지 않는다(G138 — 콜백 무인자 · 네트워크 · 저장소 0).
 */
function GoldBuyMockup({
  landingId,
  onClose,
  onCredentialSubmit,
  onHeld,
  bankIdentity,
  spokenAccountNow,
  cardAccountNow,
  returnLabel,
  skin,
  payBarLifted,
}: {
  landingId: string;
  onClose: () => void;
  /** ⛔ 무인자 — 결제했다는 사실 하나만 올린다(G138). */
  onCredentialSubmit: () => void;
  /** ⛔ 무인자 — 고액 구매 확인에서 보류됐다는 사실 하나만 올린다(G138 · 사용자 결정 D-G4). */
  onHeld: () => void;
  bankIdentity?: { myBankName: string; ledgerKey: string };
  /** 판정표 S12(2026-11-08 사용자 결정) — 출금 예약 화면과 같은 규칙: 여는 순간 참가자가 말한 거래 은행 · 잔액. ⛔ 결제 계좌 목록에만 쓴다(G138). */
  spokenAccountNow?: () => SpokenAccount;
  /** 판정표 A1 · A5(2026-11-08) — 시작 전 카드에 넣은 거래 은행 · 잔액(말한 값보다 먼저). ⛔ 계좌 목록 · 머리띠에만(G138). */
  cardAccountNow?: () => CardAccount | undefined;
  returnLabel: string;
  skin: MessengerSkin;
  /** PR-3 B2 — iOS형 틀이면 결제 막대를 떠 있는 주소 막대 위로. */
  payBarLifted: boolean;
}) {
  const copy = CREDENTIAL_LANDING_COPY[landingId] ?? GENERIC_CREDENTIAL_COPY;
  // ⭐ PR-3(판정표 P1) — 금 거래소 계열 색. 키 이름이 기본 토큰과 같아 아래 단계 코드는 그대로다.
  const page: PurchasePalette = purchasePalette("gold");
  const site = SITE_SKINS.gold;
  const siteTokens = PURCHASE_SITE_TOKENS.gold;
  const ledger = bankIdentity?.ledgerKey ?? "";
  const [spoken] = useState<SpokenAccount>(() => spokenAccountNow?.() ?? {});
  // ⭐ 2026-11-08 판정표 A · C(`withdrawAccounts.ts`) — 카드 값 → 말한 값 → 고정 값 · 참가자 쪽 값이 있으면 그 계좌 하나만.
  const [mine] = useState(() =>
    resolveMyAccount({ card: cardAccountNow?.(), spoken, fixedBankName: bankIdentity?.myBankName ?? myBankNameFor(ledger), fixedBalance: fictionalBalanceFor(ledger) }),
  );
  const appBankName = mine.bankName;
  const [accounts] = useState(() => withdrawAccountsFor({ seed: ledger, appBankName, primaryBalance: mine.balance, single: mine.single }));
  const [accountId, setAccountId] = useState<WithdrawAccount["id"]>("main");
  const account = accounts.find((item) => item.id === accountId) ?? accounts[0]!;
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [productId, setProductId] = useState<string | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);
  const [purpose, setPurpose] = useState<string | undefined>(undefined);
  const [agencyRequested, setAgencyRequested] = useState<boolean | undefined>(undefined);
  const [stage, setStage] = useState<"form" | "confirm" | "auth" | "held">("form");
  const [error, setError] = useState<string | undefined>(undefined);
  const [purchase, setPurchase] = useState<GoldPurchase | undefined>(() => lastGoldPurchase(ledger, landingId));
  const product = findGoldProduct(productId);
  const total = product ? goldProductPrice(product) * quantity : 0;
  // 발급처 꼬리말(서버 issuerLabel 그대로 · 렌더 게이트 대상). 렌더 게이트 역검증 ①의 오염 지점(입력 화면의 발급처 꼬리말 한 곳)을 그대로 두려고 이름을 따로 둔다.
  const shopFooter = copy.issuerLabel;
  const productLabelText = copy.fields[0]?.label ?? "";
  const quantityLabelText = copy.fields[1]?.label ?? "";

  // PR-3 — 검정 머리 + 금색 명조 로고 · 인장(시안 E). 이름 = 종전 머리띠와 같은 발급처 이름(렌더 게이트 [T190]).
  const goldIssuerBar = <SiteHeader skin={site} name={issuerNameOf(copy.issuerLabel)} />;
  const rowList = (rows: [string, string][]) => (
    <dl className="flex flex-col divide-y rounded-[10px] border" style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg }}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 px-3.5 py-3 text-[15px]" style={{ borderColor: page.inputBorder }}>
          <dt style={{ color: page.body }}>{label}</dt>
          <dd className="break-all text-right font-semibold tabular-nums" style={{ color: page.headline }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
  const choiceStyle = (selected: boolean) => ({
    border: `${selected ? 2 : 1}px solid ${selected ? page.selectedBorder : page.inputBorder}`,
    backgroundColor: selected ? page.selectedBg : page.inputBg,
    color: selected ? page.selectedText : page.headline,
  });

  const finishPurchase = () => {
    if (!productId) return;
    // AC-045 — 네트워크 호출 0. 보증서 번호는 `goldBuy.ts` 메모리 표에서만 만든다.
    const made = recordGoldPurchase(ledger, landingId, productId, quantity, new Date());
    recordWithdrawal(ledger, account.id, String(total));
    setPurchase(made);
    setStage("form");
    onCredentialSubmit();
  };

  // ④ 구매 완료 · 품질 보증서 번호(이 화면이 만든 값 · 버튼으로 고른 상품 정보만).
  if (purchase) {
    const bought = findGoldProduct(purchase.productId);
    return (
      <>
        {goldIssuerBar}
        <div className="flex flex-col gap-4 p-5">
          <p role="status" className="text-lg font-semibold leading-snug" style={{ color: page.headline }}>
            {copy.successHeadline}
          </p>
          {rowList([
            [GOLD_COPY.productRow, `${bought?.label ?? ""} × ${purchase.quantity}${GOLD_COPY.quantityUnit}`],
            [GOLD_COPY.amountRow, goldWon(purchase.total)],
            [GOLD_COPY.warrantyLabel, purchase.warranty],
            [GOLD_COPY.paidLabel, transferTimeText(purchase.purchasedAt)],
          ])}
          <Button type="button" onClick={onClose}>
            {returnLabel}
          </Button>
        </div>
      </>
    );
  }

  // 고액 구매 확인 보류(112 · 1332 안내). 다시 주문 화면으로 돌아갈 수 있다(사기범이 다시 요구하는 흐름 — 판정표 A4).
  if (stage === "held") {
    return (
      <>
        {goldIssuerBar}
        <div className="flex flex-col gap-4 p-5">
          <p role="status" className="text-lg font-semibold leading-snug" style={{ color: page.headline }}>
            {GOLD_COPY.heldHeadline}
          </p>
          {GOLD_COPY.heldLines.map((line) => (
            <p key={line} className="text-[15px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>
              {line}
            </p>
          ))}
          <button
            type="button"
            onClick={() => {
              setAgencyRequested(undefined);
              setStage("form");
            }}
            className="min-h-[48px] rounded-[10px] border px-6 py-2.5 text-base font-semibold"
            style={{ borderColor: page.inputBorder, color: page.headline }}
          >
            {GOLD_COPY.heldBack}
          </button>
        </div>
      </>
    );
  }

  // ② 주문 확인 + 고액 구매 확인 · ③ 결제 인증(시트가 확인 화면 위로 올라온다).
  if (stage !== "form" && product) {
    const handlePay = () => {
      const result = goldCheckResult(purpose, agencyRequested);
      if (result === "incomplete") {
        setError(GOLD_COPY.checkError);
        return;
      }
      setError(undefined);
      if (result === "held") {
        setStage("held");
        onHeld();
        return;
      }
      setStage("auth");
    };
    return (
      <>
        {goldIssuerBar}
        <div inert={stage === "auth" ? true : undefined}>
          <div className="flex flex-col gap-4 px-5 pb-6 pt-5">
            <h1 className="text-xl font-bold leading-snug [word-break:keep-all]" style={{ color: page.headline }}>
              {GOLD_COPY.confirmHeadline}
            </h1>
            {rowList([
              [GOLD_COPY.productRow, `${product.label} × ${quantity}${GOLD_COPY.quantityUnit}`],
              [GOLD_COPY.sellerRow, GOLD_SHOP_NAME],
              [GOLD_COPY.payFromRow, accountLabel(account)],
              [GOLD_COPY.amountRow, goldWon(total)],
            ])}
            <section className="flex flex-col gap-3 rounded-[10px] px-3.5 py-3" style={{ backgroundColor: page.fieldReadonlyBg }}>
              <h2 className="text-[15px] font-bold" style={{ color: page.headline }}>
                {GOLD_COPY.checkHeading}
              </h2>
              <p className="text-[14px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>
                {GOLD_COPY.checkLead}
              </p>
              <span id="gold-purpose-label" className="text-[14px] font-semibold" style={{ color: page.headline }}>
                {GOLD_COPY.purposeLabel}
              </span>
              <div role="radiogroup" aria-labelledby="gold-purpose-label" className="grid grid-cols-2 gap-2">
                {GOLD_PURPOSES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={value === purpose}
                    onClick={() => {
                      setPurpose(value);
                      setError(undefined);
                    }}
                    className="min-h-[48px] rounded-[10px] text-[15px] font-semibold"
                    style={choiceStyle(value === purpose)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <span id="gold-agency-label" className="text-[14px] font-semibold leading-relaxed [word-break:keep-all]" style={{ color: page.headline }}>
                {GOLD_COPY.agencyQuestion}
              </span>
              <div role="radiogroup" aria-labelledby="gold-agency-label" className="grid grid-cols-2 gap-2">
                {([true, false] as const).map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    role="radio"
                    aria-checked={agencyRequested === value}
                    onClick={() => {
                      setAgencyRequested(value);
                      setError(undefined);
                    }}
                    className="min-h-[48px] rounded-[10px] text-[15px] font-semibold"
                    style={choiceStyle(agencyRequested === value)}
                  >
                    {value ? GOLD_COPY.yes : GOLD_COPY.no}
                  </button>
                ))}
              </div>
            </section>
            {error && (
              <p role="alert" className="text-[14px] font-semibold" style={{ color: page.errorText }}>
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handlePay}
              className="min-h-[52px] rounded-[10px] text-base font-semibold"
              style={{ backgroundColor: page.submitBg, color: page.submitText }}
            >
              {goldWon(total)} {GOLD_COPY.pay}
            </button>
            <button
              type="button"
              onClick={() => setStage("form")}
              className="min-h-[48px] rounded-[10px] border px-6 py-2.5 text-base font-semibold"
              style={{ borderColor: page.inputBorder, color: page.headline }}
            >
              {GOLD_COPY.cancel}
            </button>
          </div>
        </div>
        {stage === "auth" && (
          <BankAuthSheet
            method={authMethodForSkin(skin)}
            appName={`${appBankName} 모바일뱅킹`}
            summary={`${GOLD_SHOP_NAME} ${goldWon(total)} ${GOLD_COPY.pay}`}
            onSuccess={finishPurchase}
            onCancel={() => setStage("confirm")}
          />
        )}
      </>
    );
  }

  // ① 상품 · 수량 · 결제 계좌(⭐ PR-3 — 시세 띠 · 금괴 카드 2×2 · 신뢰 표시 · 꼬리말 · 아래 고정 결제 막대 — 시안 E).
  const handleNext = () => {
    const found = goldOrderError(productId, quantity) ?? withdrawError(ledger, account, String(total));
    setError(found);
    if (!found) setStage("confirm");
  };
  return (
    <>
      {goldIssuerBar}
      {/* 시세 띠 — 오늘 판매가 1g · 1돈 환산(같은 단가로 계산 · 새 숫자 0). */}
      <div
        className="grid grid-cols-[1fr_auto] gap-y-0.5 px-4 py-2 text-[12px] tabular-nums"
        style={{ backgroundColor: site.band?.bg, color: site.band?.text }}
      >
        <span>{GOLD_COPY.priceNote}</span>
        <b className="text-right text-[13.5px]" style={{ color: siteTokens.payBar?.amount }}>
          {goldWon(GOLD_PRICE_PER_GRAM)}
        </b>
        <span>{GOLD_SITE_COPY.donLabel}</span>
        <b className="text-right text-[13.5px]" style={{ color: siteTokens.payBar?.amount }}>
          {goldWon(GOLD_PRICE_PER_GRAM * GOLD_SITE_COPY.donGrams)}
        </b>
      </div>
      <div className="flex flex-col gap-4 px-4 pb-5 pt-[18px]">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold tracking-[0.14em]" style={{ color: siteTokens.heroMuted }}>
            {GOLD_SITE_COPY.kicker}
          </span>
          <h1 className="text-xl font-bold leading-snug [word-break:keep-all]" style={{ color: page.headline }}>
            {copy.headline}
          </h1>
          {copy.bodyLines.map((line) => (
            <p key={line} className="text-[15px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>
              {line}
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span id="gold-product-label" className="text-[15px] font-semibold" style={{ color: page.headline }}>
            {productLabelText}
          </span>
          {/* 금괴 카드 — 좁은 폭(340px 미만)은 한 줄에 하나. 고른 카드 = 두꺼운 금색 테두리 + 그림자. */}
          <div role="radiogroup" aria-labelledby="gold-product-label" className="grid grid-cols-1 gap-2.5 min-[340px]:grid-cols-2">
            {GOLD_PRODUCTS.map((item) => {
              const selected = item.id === productId;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setProductId(item.id);
                    setError(undefined);
                  }}
                  className="flex min-h-[52px] flex-col items-stretch gap-1.5 rounded-[10px] p-2.5 text-left"
                  style={{ ...choiceStyle(selected), boxShadow: selected ? "0 2px 8px rgba(168, 132, 58, 0.18)" : undefined }}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-[50px] flex-col items-center justify-center rounded-[5px] text-[11px] font-extrabold leading-tight tracking-[0.08em]"
                    style={{
                      background: "linear-gradient(162deg, #F8E7B0 0%, #E0BD63 34%, #A8843A 66%, #EBCB78 100%)",
                      boxShadow: "inset 0 -5px 0 rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
                      color: "#5A4517",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {goldWeightMark(item.grams)}
                    <span className="text-[8px] tracking-[0.2em] opacity-80">{GOLD_SITE_COPY.barMark}</span>
                  </span>
                  <span className="text-[14px] font-bold leading-snug">{item.label}</span>
                  <span className="text-[14px] font-bold tabular-nums">{goldWon(goldProductPrice(item))}</span>
                  <span
                    className="self-start rounded-[3px] px-1.5 text-[11px] font-bold"
                    style={{ backgroundColor: siteTokens.badge?.bg, color: siteTokens.badge?.text }}
                  >
                    {GOLD_SITE_COPY.cardBadge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GOLD_SITE_COPY.trust.map((item) => (
            <span
              key={item}
              className="rounded-full border px-2.5 py-0.5 text-[12px] font-semibold"
              style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg, color: page.body }}
            >
              {item}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span id="gold-quantity-label" className="text-[15px] font-semibold" style={{ color: page.headline }}>
            {quantityLabelText}
          </span>
          <div role="group" aria-labelledby="gold-quantity-label" className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`${quantityLabelText} 줄이기`}
              disabled={quantity <= 1}
              onClick={() => {
                setQuantity(Math.max(1, quantity - 1));
                setError(undefined);
              }}
              className="h-11 w-11 rounded-full border text-xl font-semibold disabled:opacity-40"
              style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg, color: page.headline }}
            >
              −
            </button>
            <output aria-live="polite" className="min-w-[3ch] text-center text-lg font-bold tabular-nums" style={{ color: page.headline }}>
              {quantity}
              {GOLD_COPY.quantityUnit}
            </output>
            <button
              type="button"
              aria-label={`${quantityLabelText} 늘리기`}
              disabled={quantity >= GOLD_MAX_QUANTITY}
              onClick={() => {
                setQuantity(Math.min(GOLD_MAX_QUANTITY, quantity + 1));
                setError(undefined);
              }}
              className="h-11 w-11 rounded-full border text-xl font-semibold disabled:opacity-40"
              style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg, color: page.headline }}
            >
              +
            </button>
          </div>
        </div>
        <WithdrawAccountRow
          account={account}
          ledgerKey={ledger}
          onOpen={() => setAccountSheetOpen(true)}
          colors={{ border: page.inputBorder, bg: page.inputBg, label: page.body, value: page.headline }}
        />
        {accountSheetOpen && (
          <WithdrawAccountSheet
            accounts={accounts}
            selectedId={account.id}
            ledgerKey={ledger}
            onSelect={(id) => {
              setAccountId(id);
              setError(undefined);
              setAccountSheetOpen(false);
            }}
            onClose={() => setAccountSheetOpen(false)}
          />
        )}
      </div>
      <SiteFooter skin={site} name={issuerNameOf(copy.issuerLabel)} copyright={shopFooter} />
      <SitePayBar
        skin={site}
        lifted={payBarLifted}
        summary={product ? `${product.label} × ${quantity}${GOLD_COPY.quantityUnit}` : GOLD_COPY.totalLabel}
        amount={goldWon(total)}
        label={copy.submitLabel}
        error={error}
        onSubmit={handleNext}
      />
    </>
  );
}

function CashWithdrawMockup({
  landingId,
  onClose,
  onCredentialSubmit,
  onHeld,
  bankIdentity,
  spokenAccountNow,
  cardAccountNow,
  returnLabel,
  skin,
}: {
  landingId: string;
  onClose: () => void;
  /** ⛔ 무인자 — 예약했다는 사실 하나만 올린다(G138). */
  onCredentialSubmit: () => void;
  /** ⛔ 무인자 — 문진표에서 보류됐다는 사실 하나만 올린다(G138 · 사용자 결정 D-G4). */
  onHeld: () => void;
  bankIdentity?: { myBankName: string; ledgerKey: string };
  /** 판정표 S — 여는 순간 참가자가 말한 거래 은행 · 잔액(말하지 않은 쪽 = 고정 값). ⛔ 계좌 목록 · 머리띠에만 쓴다(G138). */
  spokenAccountNow?: () => SpokenAccount;
  /** 판정표 A1 · A5(2026-11-08) — 시작 전 카드에 넣은 거래 은행 · 잔액(말한 값보다 먼저). ⛔ 계좌 목록 · 머리띠에만(G138). */
  cardAccountNow?: () => CardAccount | undefined;
  returnLabel: string;
  skin: MessengerSkin;
}) {
  const copy = CREDENTIAL_LANDING_COPY[landingId] ?? GENERIC_CREDENTIAL_COPY;
  // ⭐ PR-3(판정표 P2) — 내 은행 계열 색(남색 · 흰 머리). 키 이름이 기본 토큰과 같아 아래 단계 코드는 그대로다.
  const page: PurchasePalette = purchasePalette("bank");
  const site = SITE_SKINS.bank;
  const ledger = bankIdentity?.ledgerKey ?? "";
  const [spoken] = useState<SpokenAccount>(() => spokenAccountNow?.() ?? {});
  // ⭐ 2026-11-08 판정표 A · C(`withdrawAccounts.ts`) — 카드 값 → 말한 값 → 고정 값 · 참가자 쪽 값이 있으면 그 계좌 하나만.
  const [mine] = useState(() =>
    resolveMyAccount({ card: cardAccountNow?.(), spoken, fixedBankName: bankIdentity?.myBankName ?? myBankNameFor(ledger), fixedBalance: fictionalBalanceFor(ledger) }),
  );
  const appBankName = mine.bankName;
  const [accounts] = useState(() => withdrawAccountsFor({ seed: ledger, appBankName, primaryBalance: mine.balance, single: mine.single }));
  const [accountId, setAccountId] = useState<WithdrawAccount["id"]>("main");
  const account = accounts.find((item) => item.id === accountId) ?? accounts[0]!;
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [amountRaw, setAmountRaw] = useState("");
  const [form, setForm] = useState<CashForm | undefined>(undefined);
  const [purpose, setPurpose] = useState<string | undefined>(undefined);
  const [answers, setAnswers] = useState<(boolean | undefined)[]>(() => CASH_QUESTIONS.map(() => undefined));
  const [stage, setStage] = useState<"form" | "check" | "auth" | "held">("form");
  const [error, setError] = useState<string | undefined>(undefined);
  const [reservation, setReservation] = useState<CashReservation | undefined>(() => lastCashReservation(ledger, landingId));
  const amount = cashAmountValue(amountRaw) ?? 0;
  const formLabel = (id: CashForm | undefined) => CASH_FORMS.find((item) => item.id === id)?.label ?? "";
  // 발급처 꼬리말(서버 issuerLabel 그대로 · 렌더 게이트 대상). 렌더 게이트 역검증 ①의 오염 지점을 그대로 두려고 이름을 따로 둔다.
  const reserveFooter = copy.issuerLabel;
  const amountLabelText = copy.fields[0]?.label ?? "";
  const formLabelText = copy.fields[1]?.label ?? "";

  // 이체 화면(`CredentialFormMockup`)과 같은 규칙 — 내 은행이 정해져 있으면 그 은행 모바일뱅킹, 아니면 발급처 라벨(렌더 게이트 · 메신저 진입).
  // 판정표 S — 참가자가 거래 은행을 말했으면 그 은행(출금 계좌 줄과 같은 이름).
  const bankHeaderName = bankIdentity?.myBankName ? `${appBankName} 모바일뱅킹` : issuerNameOf(copy.issuerLabel);
  // ⭐ PR-3 F1 — 꼬리말 이름 = 그 은행(내 은행이 없으면 발급처 이름).
  const bankFooterName = bankIdentity?.myBankName ? appBankName : issuerNameOf(copy.issuerLabel);
  // ⭐ PR-3 — 흰 머리 + 남색 고리 로고 · 오른쪽 메뉴 이름(시안 I).
  const cashBankBar = <SiteHeader skin={site} name={bankHeaderName} aside={CASH_COPY.menuTitle} />;
  const rowList = (rows: [string, string][]) => (
    <dl className="flex flex-col divide-y rounded-[10px] border" style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg }}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 px-3.5 py-3 text-[15px]" style={{ borderColor: page.inputBorder }}>
          <dt style={{ color: page.body }}>{label}</dt>
          <dd className="break-all text-right font-semibold tabular-nums" style={{ color: page.headline }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
  const choiceStyle = (selected: boolean) => ({
    border: `${selected ? 2 : 1}px solid ${selected ? page.selectedBorder : page.inputBorder}`,
    backgroundColor: selected ? page.selectedBg : page.inputBg,
    color: selected ? page.selectedText : page.headline,
  });

  const finishReservation = () => {
    if (!form) return;
    // AC-045 — 네트워크 호출 0. 예약 번호는 `cashWithdraw.ts` 메모리 표에서만 만든다.
    const made = recordCashReservation(ledger, landingId, form, amount, new Date());
    recordWithdrawal(ledger, account.id, String(amount));
    setReservation(made);
    setStage("form");
    onCredentialSubmit();
  };

  // ④ 예약 완료 · 예약 번호(이 화면이 만든 값).
  if (reservation) {
    return (
      <>
        {cashBankBar}
        <div className="flex flex-col gap-4 p-5">
          <p role="status" className="text-lg font-semibold leading-snug" style={{ color: page.headline }}>
            {copy.successHeadline}
          </p>
          {rowList([
            [CASH_COPY.numberLabel, reservation.number],
            [CASH_COPY.amountRow, cashWon(reservation.amount)],
            [CASH_COPY.formRow, formLabel(reservation.form)],
            [CASH_COPY.fromLabel, accountLabel(account)],
          ])}
          <Button type="button" onClick={onClose}>
            {returnLabel}
          </Button>
        </div>
      </>
    );
  }

  // 문진표 보류(112 · 1332 안내). 다시 예약 화면으로 돌아갈 수 있다(사기범이 다시 요구하는 흐름 — 판정표 A4).
  if (stage === "held") {
    return (
      <>
        {cashBankBar}
        <div className="flex flex-col gap-4 p-5">
          <p role="status" className="text-lg font-semibold leading-snug" style={{ color: page.headline }}>
            {CASH_COPY.heldHeadline}
          </p>
          {CASH_COPY.heldLines.map((line) => (
            <p key={line} className="text-[15px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>
              {line}
            </p>
          ))}
          <button
            type="button"
            onClick={() => {
              setAnswers(CASH_QUESTIONS.map(() => undefined));
              setStage("form");
            }}
            className="min-h-[48px] rounded-[10px] border px-6 py-2.5 text-base font-semibold"
            style={{ borderColor: page.inputBorder, color: page.headline }}
          >
            {CASH_COPY.heldBack}
          </button>
        </div>
      </>
    );
  }

  // ② 금융사기 예방 문진표 · ③ 생체 인증(시트가 문진표 위로 올라온다).
  if (stage !== "form") {
    const handleReserve = () => {
      const result = cashCheckResult(purpose, answers);
      if (result === "incomplete") {
        setError(CASH_COPY.checkError);
        return;
      }
      setError(undefined);
      if (result === "held") {
        setStage("held");
        onHeld();
        return;
      }
      setStage("auth");
    };
    return (
      <>
        {cashBankBar}
        <div inert={stage === "auth" ? true : undefined}>
          <div className="flex flex-col gap-4 px-5 pb-6 pt-5">
            <h1 className="text-xl font-bold leading-snug [word-break:keep-all]" style={{ color: page.headline }}>
              {CASH_COPY.checkHeading}
            </h1>
            <p className="text-[14px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>
              {CASH_COPY.checkLead}
            </p>
            {rowList([
              [CASH_COPY.fromLabel, accountLabel(account)],
              [CASH_COPY.amountRow, cashWon(amount)],
              [CASH_COPY.formRow, formLabel(form)],
            ])}
            <span id="cash-purpose-label" className="text-[14px] font-semibold" style={{ color: page.headline }}>
              {CASH_COPY.purposeLabel}
            </span>
            <div role="radiogroup" aria-labelledby="cash-purpose-label" className="grid grid-cols-2 gap-2">
              {CASH_PURPOSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={value === purpose}
                  onClick={() => {
                    setPurpose(value);
                    setError(undefined);
                  }}
                  className="min-h-[48px] rounded-[10px] text-[15px] font-semibold"
                  style={choiceStyle(value === purpose)}
                >
                  {value}
                </button>
              ))}
            </div>
            {CASH_QUESTIONS.map((question, index) => (
              <div key={question} className="flex flex-col gap-2">
                <span id={`cash-q${index}-label`} className="text-[14px] font-semibold leading-relaxed [word-break:keep-all]" style={{ color: page.headline }}>
                  {question}
                </span>
                <div role="radiogroup" aria-labelledby={`cash-q${index}-label`} className="grid grid-cols-2 gap-2">
                  {([true, false] as const).map((value) => (
                    <button
                      key={String(value)}
                      type="button"
                      role="radio"
                      aria-checked={answers[index] === value}
                      onClick={() => {
                        setAnswers(answers.map((answer, i) => (i === index ? value : answer)));
                        setError(undefined);
                      }}
                      className="min-h-[48px] rounded-[10px] text-[15px] font-semibold"
                      style={choiceStyle(answers[index] === value)}
                    >
                      {value ? CASH_COPY.yes : CASH_COPY.no}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {error && (
              <p role="alert" className="text-[14px] font-semibold" style={{ color: page.errorText }}>
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleReserve}
              className="min-h-[52px] rounded-[10px] text-base font-semibold"
              style={{ backgroundColor: page.submitBg, color: page.submitText }}
            >
              {CASH_COPY.reserve}
            </button>
            <button
              type="button"
              onClick={() => setStage("form")}
              className="min-h-[48px] rounded-[10px] border px-6 py-2.5 text-base font-semibold"
              style={{ borderColor: page.inputBorder, color: page.headline }}
            >
              {CASH_COPY.cancel}
            </button>
          </div>
        </div>
        {stage === "auth" && (
          <BankAuthSheet
            method={authMethodForSkin(skin)}
            appName={`${appBankName} 모바일뱅킹`}
            summary={`${CASH_COPY.menuTitle} ${cashWon(amount)}`}
            onSuccess={finishReservation}
            onCancel={() => setStage("check")}
          />
        )}
      </>
    );
  }

  // ① 출금 계좌 · 금액 · 받으실 형태.
  const handleNext = () => {
    const found = cashReserveError(amountRaw, form) ?? withdrawError(ledger, account, String(amount));
    setError(found);
    if (!found) setStage("check");
  };
  const amountHintText = amountHint(amountRaw);
  return (
    <>
      {cashBankBar}
      {/* ⭐ PR-3 — 흰 카드 상자 안에 출금 계좌 · 금액 · 형태 · 버튼(시안 I). 문진표 · 생체 인증 · 예약 번호는 그대로. 방문 지점 칸 없음. */}
      <div className="m-3 flex flex-col gap-4 rounded-[14px] p-4" style={{ backgroundColor: page.inputBg, boxShadow: "0 1px 2px rgba(17, 24, 39, 0.06)" }}>
        <h1 className="text-xl font-bold leading-snug [word-break:keep-all]" style={{ color: page.headline }}>
          {copy.headline}
        </h1>
        {copy.bodyLines.map((line) => (
          <p key={line} className="text-[15px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>
            {line}
          </p>
        ))}
        <WithdrawAccountRow
          account={account}
          ledgerKey={ledger}
          onOpen={() => setAccountSheetOpen(true)}
          colors={{ border: page.inputBorder, bg: page.fieldReadonlyBg, label: page.body, value: page.headline }}
        />
        {accountSheetOpen && (
          <WithdrawAccountSheet
            accounts={accounts}
            selectedId={account.id}
            ledgerKey={ledger}
            onSelect={(id) => {
              setAccountId(id);
              setError(undefined);
              setAccountSheetOpen(false);
            }}
            onClose={() => setAccountSheetOpen(false)}
          />
        )}
        <label className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold" style={{ color: page.headline }}>
            {amountLabelText}
          </span>
          <span className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={amountRaw}
              onChange={(event) => {
                setAmountRaw(event.target.value.replace(/[^0-9,]/g, ""));
                setError(undefined);
              }}
              placeholder={copy.fields[0]?.placeholder}
              className="min-h-[52px] min-w-0 flex-1 rounded-none px-0.5 text-right text-[22px] font-extrabold tabular-nums placeholder:text-[15px] placeholder:font-normal"
              style={{ border: 0, borderBottom: `2px solid ${site.accent}`, backgroundColor: page.inputBg, color: page.headline }}
            />
            <button
              type="button"
              onClick={() => {
                setAmountRaw(String(availableBalance(ledger, account) - (availableBalance(ledger, account) % 10_000)));
                setError(undefined);
              }}
              className="min-h-[52px] shrink-0 rounded-[10px] border px-4 text-[15px] font-semibold"
              style={{ borderColor: page.inputBorder, color: page.headline }}
            >
              {CASH_COPY.allButton}
            </button>
          </span>
          {/* 금액 아래 한글 단위(이체 화면과 같은 `amountHint` — 새 문구 0). */}
          {amountHintText && (
            <span className="text-right text-[13px] font-semibold" style={{ color: page.hintText }}>
              {amountHintText}
            </span>
          )}
        </label>
        <div className="flex flex-col gap-2">
          <span id="cash-form-label" className="text-[15px] font-semibold" style={{ color: page.headline }}>
            {formLabelText}
          </span>
          <div role="radiogroup" aria-labelledby="cash-form-label" className="grid grid-cols-2 gap-2">
            {CASH_FORMS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={item.id === form}
                onClick={() => {
                  setForm(item.id);
                  setError(undefined);
                }}
                className="min-h-[52px] rounded-[10px] text-base font-semibold"
                style={choiceStyle(item.id === form)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p role="alert" className="text-[14px] font-semibold" style={{ color: page.errorText }}>
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleNext}
          className="min-h-[52px] rounded-[10px] text-base font-semibold"
          style={{ backgroundColor: page.submitBg, color: page.submitText }}
        >
          {copy.submitLabel}
        </button>
      </div>
      <SiteFooter skin={site} name={bankFooterName} copyright={reserveFooter} />
    </>
  );
}

/**
 * ⭐ 2026-11-07(Edge 시험 판 12 · 사용자 결정 "앱 안 화면 추가") — 상품권 구매 화면(`VOUCHER_LANDINGS`). 검찰 고급 상품권형의 결말
 * "문화상품권을 사서 핀 번호를 불러 달라"를 앱 안에서 끝까지 겪게 한다(실제 판매처 · 매장으로 가지 않는다).
 * 흐름: ① 권종 · 수량 · 결제 계좌 → ② 결제 정보 확인(판매처 주의 문구) → ③ 결제 인증(생체 인증 시트 — 이체 화면과 같은 `BankAuthSheet`) → ④ 구매 완료 + 핀 번호 카드.
 * ⛔ 핀 · 권종 · 수량 · 금액은 이 컴포넌트 state와 `voucher.ts` 메모리 표를 벗어나지 않는다(G138 — 콜백은 무인자 · 네트워크 · 저장소 0).
 * 다시 열면 같은 세션의 마지막 구매 내역(핀 카드)을 보여 준다 — 통화하며 문자함을 오가도 번호를 다시 읽을 수 있게.
 */
function VoucherPurchaseMockup({
  landingId,
  onClose,
  onCredentialSubmit,
  bankIdentity,
  spokenAccountNow,
  cardAccountNow,
  returnLabel,
  skin,
  payBarLifted,
}: {
  landingId: string;
  onClose: () => void;
  /** ⛔ 무인자 — 결제했다는 사실 하나만 올린다(G138). */
  onCredentialSubmit: () => void;
  bankIdentity?: { myBankName: string; ledgerKey: string };
  /** 판정표 A2 · A3 · A6(2026-11-08 실기기 신고) — 여는 순간 참가자가 통화에서 말한 거래 은행 · 잔액. ⛔ 결제 계좌 목록에만(G138). */
  spokenAccountNow?: () => SpokenAccount;
  /** 판정표 A1 · A5(2026-11-08) — 시작 전 카드에 넣은 거래 은행 · 잔액(말한 값보다 먼저). ⛔ 계좌 목록 · 머리띠에만(G138). */
  cardAccountNow?: () => CardAccount | undefined;
  returnLabel: string;
  skin: MessengerSkin;
  /** PR-3 B2 — iOS형 틀이면 결제 막대를 떠 있는 주소 막대 위로. */
  payBarLifted: boolean;
}) {
  const copy = CREDENTIAL_LANDING_COPY[landingId] ?? GENERIC_CREDENTIAL_COPY;
  // ⭐ PR-3(판정표 P3) — 상품권 몰 계열 색. 키 이름이 기본 토큰과 같아 아래 단계 코드는 그대로다.
  const page: PurchasePalette = purchasePalette("gift");
  const site = SITE_SKINS.gift;
  const siteTokens = PURCHASE_SITE_TOKENS.gift;
  const ledger = bankIdentity?.ledgerKey ?? "";
  // ⭐ 2026-11-08 판정표 A · C — 신고 화면(검찰 고급 상품권). 카드 값 → 말한 값 → 고정 값 · 참가자 쪽 값이 있으면 그 계좌 하나만.
  const [mine] = useState(() =>
    resolveMyAccount({
      card: cardAccountNow?.(),
      spoken: spokenAccountNow?.(),
      fixedBankName: bankIdentity?.myBankName ?? myBankNameFor(ledger),
      fixedBalance: fictionalBalanceFor(ledger),
    }),
  );
  const appBankName = mine.bankName;
  const [accounts] = useState(() => withdrawAccountsFor({ seed: ledger, appBankName, primaryBalance: mine.balance, single: mine.single }));
  const [accountId, setAccountId] = useState<WithdrawAccount["id"]>("main");
  const account = accounts.find((item) => item.id === accountId) ?? accounts[0]!;
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [denomination, setDenomination] = useState<number | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);
  const [stage, setStage] = useState<"form" | "confirm" | "auth">("form");
  const [error, setError] = useState<string | undefined>(undefined);
  const [purchase, setPurchase] = useState<VoucherPurchase | undefined>(() => lastVoucherPurchase(ledger, landingId));
  const total = denomination !== undefined ? denomination * quantity : 0;
  // 발급처 꼬리말(서버 issuerLabel 그대로 · 렌더 게이트 대상). 이름을 따로 둔 것은 렌더 게이트 역검증 ①의 오염 지점(입력 화면의 발급처 꼬리말 한 곳)을 그대로 두려는 것.
  const sellerFooter = copy.issuerLabel;
  const denominationLabelText = copy.fields[0]?.label ?? "";
  const quantityLabelText = copy.fields[1]?.label ?? "";

  // PR-3 — 리본 마크 + 둥근 굵은 로고(시안 F). 이름 = 종전 머리띠와 같은 발급처 이름(렌더 게이트 [T190]).
  const voucherIssuerBar = <SiteHeader skin={site} name={issuerNameOf(copy.issuerLabel)} />;
  const rowList = (rows: [string, string][]) => (
    <dl className="flex flex-col divide-y rounded-[10px] border" style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg }}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 px-3.5 py-3 text-[15px]" style={{ borderColor: page.inputBorder }}>
          <dt style={{ color: page.body }}>{label}</dt>
          <dd className="break-all text-right font-semibold tabular-nums" style={{ color: page.headline }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );

  const finishPurchase = () => {
    if (denomination === undefined) return;
    // AC-045 — 네트워크 호출 0. 핀은 `voucher.ts` 메모리 표에서만 만든다.
    const made = recordVoucherPurchase(ledger, landingId, denomination, quantity, new Date());
    recordWithdrawal(ledger, account.id, String(total));
    setPurchase(made);
    setStage("form");
    onCredentialSubmit();
  };

  // ④ 구매 완료 + 핀 번호 카드(이 화면이 만든 값 · 버튼으로 고른 상품 정보만 — 참가자가 타이핑한 입력값 재표시 0).
  if (purchase) {
    return (
      <>
        {voucherIssuerBar}
        <div className="flex flex-col gap-4 p-5">
          <p role="status" className="text-lg font-semibold leading-snug" style={{ color: page.headline }}>
            {copy.successHeadline}
          </p>
          <ul className="flex flex-col gap-3">
            {purchase.pins.map((pin, index) => (
              <li
                key={pin}
                className="flex flex-col gap-2 rounded-[14px] border px-4 py-4"
                style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold" style={{ color: page.headline }}>
                    {VOUCHER_BRAND} {denominationLabel(purchase.denomination)}
                  </span>
                  {purchase.pins.length > 1 && (
                    <span className="text-[13px] tabular-nums" style={{ color: page.body }}>
                      {index + 1}/{purchase.pins.length}
                    </span>
                  )}
                </div>
                <span className="text-[13px]" style={{ color: page.body }}>
                  {VOUCHER_COPY.pinHeading}
                </span>
                {/* 스크린리더가 숫자를 한 자씩 읽게 띄어 쓴 이름을 단다(인증번호 문자와 같은 관례 — 수사로 읽히면 받아 적을 수 없다). */}
                <span
                  className="font-mono text-[22px] font-bold tracking-[0.06em] tabular-nums"
                  style={{ color: page.headline }}
                  aria-label={`${VOUCHER_COPY.pinHeading} ${pin.replace(/-/g, "").split("").join(" ")}`}
                >
                  {pin}
                </span>
                <span className="text-[13px]" style={{ color: page.body }}>
                  {VOUCHER_COPY.issuedLabel} {transferTimeText(purchase.purchasedAt)} · {VOUCHER_COPY.validLabel} {VOUCHER_COPY.validValue}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>
            {VOUCHER_COPY.pinNote}
          </p>
          <Button type="button" onClick={onClose}>
            {returnLabel}
          </Button>
        </div>
      </>
    );
  }

  // ② 결제 정보 확인 · ③ 결제 인증(시트가 확인 화면 위로 올라온다 — 이체 화면과 같은 모양).
  if (stage !== "form" && denomination !== undefined) {
    return (
      <>
        {voucherIssuerBar}
        <div inert={stage === "auth" ? true : undefined}>
          <div className="flex flex-col gap-4 px-5 pb-6 pt-5">
            <h1 className="text-xl font-bold leading-snug [word-break:keep-all]" style={{ color: page.headline }}>
              {VOUCHER_COPY.confirmHeadline}
            </h1>
            {rowList([
              [VOUCHER_COPY.productRow, `${VOUCHER_BRAND} ${denominationLabel(denomination)} × ${quantity}`],
              [VOUCHER_COPY.sellerRow, VOUCHER_SELLER],
              [VOUCHER_COPY.payFromRow, accountLabel(account)],
              [VOUCHER_COPY.amountRow, voucherWon(total)],
            ])}
            <p
              role="note"
              className="rounded-[10px] px-3.5 py-3 text-[14px] leading-relaxed [word-break:keep-all]"
              style={{ backgroundColor: page.fieldReadonlyBg, color: page.body }}
            >
              {VOUCHER_COPY.notice}
            </p>
            <button
              type="button"
              onClick={() => setStage("auth")}
              className="min-h-[52px] rounded-[10px] text-base font-semibold"
              style={{ backgroundColor: page.submitBg, color: page.submitText }}
            >
              {voucherWon(total)} {VOUCHER_COPY.pay}
            </button>
            <button
              type="button"
              onClick={() => setStage("form")}
              className="min-h-[48px] rounded-[10px] border px-6 py-2.5 text-base font-semibold"
              style={{ borderColor: page.inputBorder, color: page.headline }}
            >
              {VOUCHER_COPY.cancel}
            </button>
          </div>
        </div>
        {stage === "auth" && (
          <BankAuthSheet
            method={authMethodForSkin(skin)}
            appName={`${appBankName} 모바일뱅킹`}
            summary={`${VOUCHER_SELLER} ${voucherWon(total)} ${VOUCHER_COPY.pay}`}
            onSuccess={finishPurchase}
            onCancel={() => setStage("confirm")}
          />
        )}
      </>
    );
  }

  // ① 권종 · 수량 · 결제 계좌(⭐ PR-3 — 상품권 실물 카드 · 권종 칩 4칸 · 즉시 발송 배지 · 꼬리말 · 아래 고정 결제 막대 — 시안 F).
  const handleNext = () => {
    const found = voucherOrderError(denomination, quantity) ?? withdrawError(ledger, account, String(total));
    setError(found);
    if (!found) setStage("confirm");
  };
  return (
    <>
      {voucherIssuerBar}
      {/* 상품권 실물 카드(장식) — 고른 권종 금액을 카드에 바로 보여 준다. 흰 글자 대비를 위해 시안보다 짙은 분홍 그라데이션(판정표 P C1). */}
      <div
        aria-hidden="true"
        className="mx-4 mt-4 flex h-[150px] flex-col justify-between rounded-2xl p-4 text-white"
        style={{
          background:
            "radial-gradient(circle at 85% 15%, rgba(255, 255, 255, 0.22) 0 22%, transparent 23%), linear-gradient(135deg, #C2255C, #A61E4D 55%, #862E9C)",
          boxShadow: "0 8px 18px rgba(194, 37, 92, 0.28)",
        }}
      >
        <span className="text-[18px] font-extrabold">{VOUCHER_BRAND}</span>
        <span className="min-h-[34px] text-[26px] font-black tabular-nums">{denomination !== undefined ? voucherWon(denomination) : ""}</span>
        <span className="flex justify-between text-[12px] font-semibold">
          <span>{VOUCHER_SITE_COPY.cardKind}</span>
          <span>{VOUCHER_SITE_COPY.cardPin}</span>
        </span>
      </div>
      <div className="flex flex-col gap-4 px-4 pb-5 pt-4">
        <div className="flex flex-col gap-1.5">
          <span
            className="self-start rounded-[4px] px-2 py-0.5 text-[12px] font-bold"
            style={{ backgroundColor: siteTokens.badge?.bg, color: siteTokens.badge?.text }}
          >
            {VOUCHER_SITE_COPY.instantBadge}
          </span>
          <h1 className="text-xl font-bold leading-snug [word-break:keep-all]" style={{ color: page.headline }}>
            {copy.headline}
          </h1>
          {copy.bodyLines.map((line) => (
            <p key={line} className="text-[15px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>
              {line}
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span id="voucher-denomination-label" className="text-[15px] font-semibold" style={{ color: page.headline }}>
            {denominationLabelText}
          </span>
          <div role="radiogroup" aria-labelledby="voucher-denomination-label" className="grid grid-cols-2 gap-1.5 min-[360px]:grid-cols-4">
            {VOUCHER_DENOMINATIONS.map((value) => {
              const selected = value === denomination;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setDenomination(value);
                    setError(undefined);
                  }}
                  className="min-h-[48px] rounded-[10px] px-1 text-[14px] font-bold"
                  style={{
                    border: `${selected ? 2 : 1}px solid ${selected ? page.selectedBorder : page.inputBorder}`,
                    backgroundColor: selected ? page.selectedBg : page.inputBg,
                    color: selected ? page.selectedText : page.headline,
                  }}
                >
                  {denominationLabel(value)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span id="voucher-quantity-label" className="text-[15px] font-semibold" style={{ color: page.headline }}>
            {quantityLabelText}
          </span>
          <div role="group" aria-labelledby="voucher-quantity-label" className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`${quantityLabelText} 줄이기`}
              disabled={quantity <= 1}
              onClick={() => {
                setQuantity(Math.max(1, quantity - 1));
                setError(undefined);
              }}
              className="h-11 w-11 rounded-[10px] border text-xl font-semibold disabled:opacity-40"
              style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg, color: page.headline }}
            >
              −
            </button>
            <output aria-live="polite" className="min-w-[3ch] text-center text-lg font-bold tabular-nums" style={{ color: page.headline }}>
              {quantity}장
            </output>
            <button
              type="button"
              aria-label={`${quantityLabelText} 늘리기`}
              disabled={quantity >= VOUCHER_MAX_QUANTITY}
              onClick={() => {
                setQuantity(Math.min(VOUCHER_MAX_QUANTITY, quantity + 1));
                setError(undefined);
              }}
              className="h-11 w-11 rounded-[10px] border text-xl font-semibold disabled:opacity-40"
              style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg, color: page.headline }}
            >
              +
            </button>
          </div>
        </div>
        <WithdrawAccountRow
          account={account}
          ledgerKey={ledger}
          onOpen={() => setAccountSheetOpen(true)}
          colors={{ border: page.inputBorder, bg: page.inputBg, label: page.body, value: page.headline }}
        />
        {accountSheetOpen && (
          <WithdrawAccountSheet
            accounts={accounts}
            selectedId={account.id}
            ledgerKey={ledger}
            onSelect={(id) => {
              setAccountId(id);
              setError(undefined);
              setAccountSheetOpen(false);
            }}
            onClose={() => setAccountSheetOpen(false)}
          />
        )}
      </div>
      <SiteFooter skin={site} name={issuerNameOf(copy.issuerLabel)} copyright={sellerFooter} />
      <SitePayBar
        skin={site}
        lifted={payBarLifted}
        summary={denomination !== undefined ? `${denominationLabel(denomination)} × ${quantity}장` : VOUCHER_COPY.totalLabel}
        amount={voucherWon(total)}
        label={copy.submitLabel}
        error={error}
        onSubmit={handleNext}
      />
    </>
  );
}

/**
 * kind=`credential-form` — 가짜 로그인/정보입력 랜딩.
 *
 * T104: 그리는 문구만 landingId로 갈리고 **안전 계약은 하나도 갈리지 않는다**(P-28) —
 * 네트워크 호출 0건, 제출은 로컬 state만 변경, 완료 화면의 안전 고지는 상황과 무관하게 동일하다.
 * T190-5(UX-023 v1.33 (1)(3)~(6)) — 배치 = ③ 기관 헤더 띠 → ④ 헤드라인·안내 → ⑤ 입력 → ⑥ 제출 → ⑦ 닫기 → ⑧ 발급처.
 * 🔒 원은 없앴다(Superseded). 본문 ③~⑧은 기관 페이지라 기기 스킨과 무관하게 같다(UX-023 v1.33 (8)).
 */
/** §122(10) — 생년월일 칸 안내(숫자열 금지 — AC-005). 칸이 `900101-1` 너비라 짧게 두고, 형식은 칸 아래 안내 · 가림 표시가 보여 준다. */
const BIRTHDATE_PLACEHOLDER = "생년월일";

/**
 * §122(10)(사용자 결정 "주민번호 앞자리형") — 생년월일 칸을 `900101-1●●●●●●` 모양으로 감싼다. 가림 표시 6칸은 입력 칸이 아니다
 * (⛔ 뒷자리 첫 숫자 외에는 받지 않는다 — 개인정보 최소화). 다른 신원 칸은 감싸지 않는다(그대로 렌더).
 */
function IdentityBox({
  masked,
  error,
  page,
  children,
  radius,
}: {
  masked: boolean;
  error: boolean;
  // PR-4 — 안내 계열 색 한 벌(`guidePalette`)도 받는다(키 구조만 본다).
  page: { errorText: string; inputBorder: string; inputBg: string; inputText: string };
  children: React.ReactElement;
  /** PR-4 — 계열 입력 칸 모서리(px). 부재 = 종전 10px. */
  radius?: number;
}) {
  if (!masked) return children;
  return (
    <span
      className="flex min-h-[52px] items-center gap-1 rounded-[10px] border px-3.5 focus-within:border-2"
      style={{ borderColor: error ? page.errorText : page.inputBorder, backgroundColor: page.inputBg, borderRadius: radius }}
    >
      {children}
      <span aria-hidden="true" className="select-none text-[12px] font-normal tracking-[0.18em]" style={{ color: page.inputText }}>
        {BIRTHDATE_MASK}
      </span>
    </span>
  );
}

// ⭐ PR-B(2026-11-07 · §15.9.1 R1 — 가짜 랜딩은 이 파일 안 서브 컴포넌트만 · 사용자 결정 "앱 안 대출 체험" · D-L2 용도는 알리지 않음 — docs/research/institution-advanced-loan-design-2026-11-07.md §6) —
// 문자 링크(`institution-loan-guide`)로 여는 **앱 안 비대면 신용대출 신청**. 실제 대출 · 실제 금융회사 0(가상 캐피탈 이름 = 문자 본문에서 읽는다).
//
// | 단계 | 화면 | 다음 |
// |---|---|---|
// | intro | 상품 안내(가상 캐피탈 · 금리 범위 · 최대 한도) | "본인 확인하고 한도 조회" |
// | verify | 생체 인증 시트(`BankAuthSheet`) — 본인 확인 | 성공 → limit · 취소 → intro |
// | limit | 조회된 한도 · 금리 · 신청 금액 입력 · 용도 선택(생활비 · 사업자금 · 주택 · 대환 · 기타) · 입금 계좌 | "다음"(금액 검증 L1 ~ L3) |
// | terms | 약정 확인(금액 · 금리 · 기간 · 상환 방식 · 입금 계좌 · 14일 철회 안내) · 동의 | "전자서명하고 신청" |
// | sign | 생체 인증 시트 — 전자서명 | 성공 → done(신청 사실 1회 기록) · 취소 → terms |
// | done | 신청 접수 · "실행 전 확인 전화를 드릴 수 있습니다" | 복귀 |
//
// 금액 판정표(앞 행이 먼저):
// | # | If | Then |
// |---|---|---|
// | L1 | 빈 칸 · 숫자 아님 · 0 | `amountError` 안내 |
// | L2 | 조회된 한도 초과 | "대출 가능 한도를 넘었습니다." |
// | L3 | 용도 미선택 | "대출 용도를 선택해 주세요." |
//
// ⛔ G138 · AC-045 — 금액 · 용도 · 인증 값은 콜백 · 네트워크 · 저장소로 나가지 않는다. 밖으로 나가는 것은 마지막 신청 버튼을 눌렀다는 사실(`onSubmit()` 무인자)뿐이다.
// 신청 금액은 같은 탭 메모리 장부(`recordLoanApplication`)에만 적는다 — 입금 안내 문자가 오면 그 금액이 첫 계좌에 들어오고(`disburseLoan`), 대출금 보관
// 이체 화면이 요구액 대사가 없을 때 그 금액을 비교 기준으로 쓴다(서버 0).
// ⛔ 세션 중 화면이라 '모의' · '훈련' 문구 0(G437).
type LoanApplyStage = "intro" | "verify" | "limit" | "terms" | "sign" | "done";

const loanWon = (value: number): string => `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;

type LoanApplyProps = {
  /** 세션 id(한도 · 입금 계좌의 결정적 씨앗 · 탭 메모리 장부 열쇠). */
  ledgerKey: string;
  /** 가상 캐피탈 이름(문자 본문). */
  lenderName: string;
  skin: MessengerSkin;
  returnLabel: string;
  onClose: () => void;
  /** 마지막 신청 버튼을 눌렀다는 사실 하나(무인자 — G138). */
  onSubmit?: () => void;
  /** 판정표 A(2026-11-08) — 입금 계좌(= 첫 출금 계좌)의 은행 · 잔액 출처. ⛔ 화면 안에서만(G138). */
  spokenAccountNow?: () => SpokenAccount;
  cardAccountNow?: () => CardAccount | undefined;
};

function LoanApplyMockup({ ledgerKey, lenderName, skin, returnLabel, onClose, onSubmit, spokenAccountNow, cardAccountNow }: LoanApplyProps) {
  // ⭐ PR-3(판정표 P4) — 대출 계열 색. 키 이름이 기본 토큰과 같아 아래 단계 코드는 그대로다.
  const page: PurchasePalette = purchasePalette("loan");
  const site = SITE_SKINS.loan;
  const siteTokens = PURCHASE_SITE_TOKENS.loan;
  const [stage, setStage] = useState<LoanApplyStage>("intro");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState<string | undefined>(undefined);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const offer = loanOfferFor(ledgerKey);
  // ⭐ 2026-11-08 판정표 A — 입금 계좌는 뒤의 대출금 보관 이체 화면의 첫 출금 계좌와 같은 계좌다(같은 판정 · 같은 장부 열쇠 "main").
  const [mine] = useState(() =>
    resolveMyAccount({ card: cardAccountNow?.(), spoken: spokenAccountNow?.(), fixedBankName: myBankNameFor(ledgerKey), fixedBalance: fictionalBalanceFor(ledgerKey) }),
  );
  const appBankName = mine.bankName;
  const depositAccount = withdrawAccountsFor({ seed: ledgerKey, appBankName, primaryBalance: mine.balance, single: mine.single })[0]!;
  const amountValue = Number(amount.replace(/[\s,]/g, "")) || 0;
  const hint = amountHint(amount);

  // ⭐ PR-3 — 짙은 청록 머리(로고 = 문자 속 가상 캐피탈 이름 그대로) + 둥글게 내려오는 큰 제목 영역 · 진행 칩(시안 G). 금리 문구 추가 0.
  const stepIndex = stage === "intro" || stage === "verify" ? 0 : stage === "limit" ? 1 : stage === "terms" || stage === "sign" ? 2 : -1;
  const hero = (title: string) => (
    <>
      <SiteHeader skin={site} name={`${lenderName} 비대면 대출`} />
      <div className="rounded-b-[24px] px-4 pb-[30px] pt-1" style={{ backgroundColor: site.headerBg, color: siteTokens.heroMuted }}>
        <h1 className="mb-2.5 text-[23px] font-bold leading-snug [word-break:keep-all]" style={{ color: site.headerText }}>
          {title}
        </h1>
        {stepIndex >= 0 && (
          <ol className="flex flex-wrap gap-1.5 text-[12px] font-semibold">
            {LOAN_SITE_STEPS.map((step, index) => (
              <li
                key={step}
                aria-current={index === stepIndex ? "step" : undefined}
                className="rounded-full px-2.5 py-0.5"
                style={
                  index === stepIndex
                    ? { backgroundColor: site.highlight, color: siteTokens.heroChipOnText }
                    : { backgroundColor: siteTokens.heroChipOff?.bg, color: siteTokens.heroChipOff?.text }
                }
              >
                {step}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
  /** 큰 제목 영역 위로 겹쳐 올라오는 흰 입력 카드. */
  const cardClass = "relative mx-3 -mt-4 flex flex-col gap-4 rounded-2xl p-4";
  const cardStyle = { backgroundColor: page.inputBg, boxShadow: "0 6px 16px rgba(14, 94, 82, 0.14)" };
  const primary = (label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[52px] rounded-[10px] text-base font-semibold disabled:opacity-50"
      style={{ backgroundColor: page.submitBg, color: page.submitText }}
    >
      {label}
    </button>
  );
  const secondary = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[48px] rounded-[10px] border px-6 py-2.5 text-base font-semibold"
      style={{ borderColor: page.inputBorder, color: page.headline }}
    >
      {label}
    </button>
  );
  const rows = (items: [string, string][]) => (
    <dl className="flex flex-col divide-y rounded-[10px] border" style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg }}>
      {items.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 px-3.5 py-3 text-[15px]" style={{ borderColor: page.inputBorder }}>
          <dt style={{ color: page.body }}>{label}</dt>
          <dd className="break-all text-right font-semibold" style={{ color: page.headline }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );

  if (stage === "done") {
    return (
      <>
        {hero("대출 신청이 접수되었습니다.")}
        <div className={cardClass} style={cardStyle}>
          <p className="text-[15px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>
            대출 실행 전 본인 확인을 위해 {lenderName}에서 확인 전화를 드릴 수 있습니다. 실행되면 문자로 알려 드립니다.
          </p>
          {rows([
            ["신청 금액", loanWon(amountValue)],
            ["입금 계좌", accountLabel(depositAccount)],
          ])}
          {secondary(returnLabel, onClose)}
        </div>
      </>
    );
  }

  if (stage === "terms" || stage === "sign") {
    return (
      <>
        <div inert={stage === "sign" ? true : undefined}>
          {hero("대출 약정 내용을 확인해 주세요")}
          <div className={cardClass} style={cardStyle}>
            {rows([
              ["대출 금액", loanWon(amountValue)],
              ["금리", `연 ${offer.ratePercent}% (고정)`],
              ["대출 기간", "12개월"],
              ["상환 방식", "원리금 균등 분할 상환"],
              ["입금 계좌", accountLabel(depositAccount)],
            ])}
            <p
              role="note"
              className="rounded-[10px] px-3.5 py-3 text-[14px] leading-relaxed [word-break:keep-all]"
              style={{ backgroundColor: page.fieldReadonlyBg, color: page.body }}
            >
              대출 계약일부터 14일 안에 대출계약 철회를 신청할 수 있습니다. 누군가 대출을 받으라고 시켰다면 신청하지 마세요.
            </p>
            <label className="flex min-h-[48px] items-center gap-3 text-[15px]" style={{ color: page.headline }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="h-5 w-5" />
              약정 내용과 대출 상품 설명을 확인했습니다
            </label>
            {primary("전자서명하고 신청", () => setStage("sign"), !agreed)}
            {secondary("이전", () => setStage("limit"))}
          </div>
        </div>
        {stage === "sign" && (
          <BankAuthSheet
            method={authMethodForSkin(skin)}
            appName={`${lenderName} 전자서명`}
            summary={`${loanWon(amountValue)} 대출 신청`}
            onSuccess={() => {
              // 신청 금액은 이 탭 메모리 장부에만(G138 — 콜백은 무인자).
              recordLoanApplication(ledgerKey, amount);
              setStage("done");
              onSubmit?.();
            }}
            onCancel={() => setStage("terms")}
          />
        )}
      </>
    );
  }

  if (stage === "limit") {
    return (
      <>
        {hero(`최대 ${loanWon(offer.limit)}까지 받을 수 있어요`)}
        <div className={cardClass} style={cardStyle}>
          {rows([
            ["대출 가능 한도", loanWon(offer.limit)],
            ["금리", `연 ${offer.ratePercent}%`],
          ])}
          <label className="flex flex-col gap-1.5 text-[15px] font-semibold" style={{ color: page.headline }}>
            신청 금액
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(undefined);
              }}
              placeholder="신청하실 금액을 입력하세요"
              className="min-h-[48px] rounded-none px-0.5 text-right text-[22px] font-extrabold tabular-nums placeholder:text-[15px] placeholder:font-normal"
              style={{ border: 0, borderBottom: `2px solid ${site.accent}`, backgroundColor: page.inputBg, color: page.inputText }}
            />
            {hint && (
              <span className="text-right text-sm font-semibold" style={{ color: page.hintText }}>
                {hint}
              </span>
            )}
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[15px] font-semibold" style={{ color: page.headline }}>
              대출 용도
            </legend>
            <div className="flex flex-wrap gap-2">
              {LOAN_PURPOSES.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={purpose === item}
                  onClick={() => {
                    setPurpose(item);
                    setError(undefined);
                  }}
                  className="min-h-[44px] rounded-full border px-4 text-[15px]"
                  style={{
                    borderColor: purpose === item ? page.selectedBorder : page.inputBorder,
                    backgroundColor: purpose === item ? page.selectedBg : page.inputBg,
                    color: purpose === item ? page.selectedText : page.headline,
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </fieldset>
          {rows([["입금 계좌", accountLabel(depositAccount)]])}
          {error && (
            <p role="alert" className="text-sm" style={{ color: page.errorText }}>
              {error}
            </p>
          )}
          {primary("다음", () => {
            const next = loanApplyError({ raw: amount, formatError: amountError(amount), limit: offer.limit, purpose });
            if (next) {
              setError(next);
              return;
            }
            setAgreed(false);
            setStage("terms");
          })}
        </div>
      </>
    );
  }

  // intro · verify(시트가 intro 위로 올라온다)
  return (
    <>
      <div inert={stage === "verify" ? true : undefined}>
        {hero("비대면 신용대출")}
        <div className={cardClass} style={cardStyle}>
          <p className="text-[15px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>
            본인 확인 후 대출 한도를 조회하고 바로 신청할 수 있습니다. 신청 내용은 실행 전 확인 절차를 거칩니다.
          </p>
          {rows([
            ["금리", "연 9.9% ~ 15.9%"],
            ["최대 한도", "3,000만 원"],
            ["대출 기간", "12 ~ 60개월"],
          ])}
          {primary("본인 확인하고 한도 조회", () => setStage("verify"))}
          {secondary(returnLabel, onClose)}
        </div>
        {/* F1 — 꼬리말 이름 · ⓒ = 문자 속 가상 캐피탈 이름(카탈로그 발급처 대신 — 이 화면의 사이트 이름). 값 = `siteSkins.ts` 대출 계열. */}
        <div className="mt-5">
          <SiteFooter skin={site} name={lenderName} copyright={`ⓒ ${lenderName}`} />
        </div>
      </div>
      {stage === "verify" && (
        <BankAuthSheet
          method={authMethodForSkin(skin)}
          appName={`${lenderName} 본인 확인`}
          summary="대출 한도 조회를 위한 본인 확인"
          onSuccess={() => setStage("limit")}
          onCancel={() => setStage("intro")}
        />
      )}
    </>
  );
}


function CredentialFormMockup({
  landingId,
  onClose,
  onCredentialSubmit,
  onLandingStep,
  prefilledAccount,
  prefilledTransfer,
  spokenAccountNow,
  cardAccountNow,
  returnLabel,
  skin,
}: {
  landingId?: string;
  onClose: () => void;
  /** ⛔ 입력값은 아래 `values` state를 벗어나지 않는다(§31.6 G138/AC-045). N1 — 훈련용 이체 화면만 요구액 대비 비교 결과 하나를 싣는다. */
  onCredentialSubmit?: (amountComparison?: AmountComparison) => void;
  /** §101 — 여러 화면 사이트의 이체 전 단계(고정 이벤트 값만 — 입력값 0). */
  onLandingStep?: (step: LandingProgressEvent) => void;
  /** §101 추가 · D-115 — 수취 계좌 미리 채움 값(부재 = 빈 입력 칸). */
  prefilledAccount?: string;
  /** ⭐ P2(X6) — 훈련용 이체 화면의 받는 분 · 금액 · 은행 미리 채움(부재 = 받는 분 "조회 중" · 금액 빈 칸). */
  prefilledTransfer?: PrefilledTransfer;
  /** 판정표 A(2026-11-08) — 훈련용 이체 화면의 첫 출금 계좌 은행 · 잔액 출처(말한 값 · 카드 값). ⛔ 화면 안에서만(G138). */
  spokenAccountNow?: () => SpokenAccount;
  cardAccountNow?: () => CardAccount | undefined;
  /** 완료 화면 복귀 버튼 문면(진입 표면이 정한다 — D-93). */
  returnLabel: string;
  /** 기기 스킨 — 훈련용 이체 화면의 인증 수단(iOS형 = 얼굴 · 그 밖 = 지문). */
  skin: MessengerSkin;
}) {
  // R8 — **정확 일치 키 조회**만 한다(문자열 분해·부분 일치 금지).
  const copy = (landingId ? CREDENTIAL_LANDING_COPY[landingId] : undefined) ?? GENERIC_CREDENTIAL_COPY;
  // ⭐ P2(X6) — 훈련용 이체 화면이면 첫 화면(이 폼) 뒤 실제 은행 앱 이체 흐름을 잇는다: 폼 → 이체 정보 확인 → 본인 인증 → 완료.
  const bankTransfer = landingId !== undefined && BANK_TRANSFER_LANDINGS.includes(landingId);
  const [bankStage, setBankStage] = useState<"form" | "confirm" | "auth">("form");
  // 2026-11-07 — 출금 계좌(가상 3개 · 기본 = 머리띠 은행 입출금 · 잔액은 내 은행 송금 화면과 같은 세션 값) · 계좌 선택 시트.
  const ledger = prefilledTransfer?.ledgerKey ?? "";
  // ⭐ 2026-11-08 판정표 A · C — 카드 값 → 말한 값 → 고정 값 · 참가자 쪽 값이 있으면 그 계좌 하나만(이체 화면이 아니면 쓰이지 않는다).
  const [mine] = useState(() =>
    resolveMyAccount({
      card: bankTransfer ? cardAccountNow?.() : undefined,
      spoken: bankTransfer ? spokenAccountNow?.() : undefined,
      fixedBankName: prefilledTransfer?.myBankName ?? myBankNameFor(ledger, prefilledTransfer?.bankName),
      fixedBalance: fictionalBalanceFor(ledger),
    }),
  );
  const appBankName = mine.bankName;
  const [accounts] = useState(() =>
    withdrawAccountsFor({ seed: ledger, appBankName, primaryBalance: mine.balance, avoidBankName: prefilledTransfer?.bankName, single: mine.single }),
  );
  const [accountId, setAccountId] = useState<WithdrawAccount["id"]>("main");
  const account = accounts.find((item) => item.id === accountId) ?? accounts[0]!;
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  // P2 — 훈련용 이체 화면의 금액 칸(`amount`)은 문자 금액을 처음 값으로만 채운다(고칠 수 있다 · 검증 그대로). 값은 이 컴포넌트 state를 벗어나지 않는다(G138).
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      copy.fields
        .filter((field) => bankTransfer && field.amount && prefilledTransfer?.amount !== undefined)
        .map((field) => [field.label, prefilledTransfer?.amount ?? ""]),
    ),
  );
  const [submitted, setSubmitted] = useState(false);
  // N4(실기기 신고 2026-11-01 — 완료 화면이 "송금이 완료되었습니다." 한 줄뿐) — 훈련용 이체 화면의 완료 영수증(보낸 금액 표기 · 보낸 시각).
  // 제출 순간 한 번 만든다(완료 분기는 `values`를 읽지 않는다 — G255 좁은 예외: 이체 화면의 받는 분 · 계좌 · 금액만 · 은행 앱 완료 화면 BA5와 같다).
  const [receipt, setReceipt] = useState<{ amountText: string; sentAt: Date } | null>(null);
  // §109 — 열람본 발급 정보의 기준 시각(제출 이벤트 시각 = `performance.timeOrigin + event.timeStamp` · 기기 시계). 입력값과 무관하다.
  const [issuedAtMs, setIssuedAtMs] = useState(0);
  // §101 — 여러 화면 사이트의 현재 화면(0 = 본인 확인 = 위 `copy`). 한 화면 폼이면 늘 0이다.
  const stepScreens = landingId ? STEP_FLOW_COPY[landingId] : undefined;
  const [stepIndex, setStepIndex] = useState(0);
  const screen: StepScreenCopy =
    stepScreens && stepIndex > 0
      ? stepScreens[stepIndex - 1]
      : { headline: copy.headline, bodyLines: copy.bodyLines, fields: copy.fields, actionLabel: copy.submitLabel };
  // ⭐ PR-4 판정표 G1 ~ G5 · G7 — 안내 계열 머리 · 색 · 꼬리말(표 밖 id = 종전 `LANDING_PAGE_TOKENS` 그대로).
  const guideFamily = guideFormFamilyOf(landingId);
  // G5′(사용자 결정 2026-11-08 (가)) — 이체 화면은 **첫 화면(계좌 · 금액 입력)만** 사이트다. 확인 → 인증 → 영수증은 종전 '{내 은행} 모바일뱅킹' 머리띠 · 색(N2).
  const siteStage = guideFamily !== undefined && !(bankTransfer && (submitted || bankStage !== "form"));
  const site = siteStage && guideFamily ? SITE_SKINS[guideFamily] : undefined;
  const page =
    site && guideFamily
      ? { ...LANDING_PAGE_TOKENS, ...(guideFamily === "loan" ? purchasePalette("loan") : guidePalette(guideFamily)) }
      : LANDING_PAGE_TOKENS;
  const corners =
    site && guideFamily && guideFamily !== "loan"
      ? GUIDE_SITE_TOKENS[guideFamily]
      : { inputRadius: 10, buttonRadius: guideFamily === "loan" ? 12 : 10 };
  const agencyLike = site?.id === "agency" || site?.id === "agency-transfer";
  const sendPage = site?.id === "send";
  const agencyCopy =
    site?.id === "agency-transfer" ? AGENCY_TRANSFER_SITE_COPY : site?.id === "agency" && landingId ? AGENCY_SITE_COPY[landingId] : undefined;
  const refundCopy = guideFamily === "refund" && landingId ? REFUND_SITE_COPY[landingId] : undefined;
  const parcelCopy = guideFamily === "parcel" && landingId ? PARCEL_SITE_COPY[landingId] : undefined;
  // 렌더 게이트 역검증 ① 앵커 — 이 화면의 ⓒ 줄은 이 노드 하나로만 그린다(종전 꼬리말 · 사이트 꼬리말 공용).
  const issuerMark = <>{copy.issuerLabel}</>;
  // §130(UX D-161 (6)) — 마지막 이체 확인 화면은 앞 화면에서 넣은 금액을 다시 보여 준다(실제 이체 앱의 확인 화면 모양). 제출 전 확인이라
  // G255(완료 화면 되비추기 0)와 겹치지 않는다 — 완료 분기는 여전히 `values`를 읽지 않는다. 값은 이 화면 문자열로만 쓰인다(G138).
  const amountField = stepScreens?.flatMap((step) => step.fields ?? []).find((field) => field.amount);
  const confirmAmount =
    stepScreens && stepIndex === stepScreens.length && amountField ? amountHint(values[amountField.label] ?? "") : undefined;
  // §101 추가(사용자 실기 신고 — "공백으로 두고 이체를 누르면 넘어간다") — 칸별 안내 한 줄. 빈 칸 · 금액 오류면 제출 · 단계 진행 · 콜백 0
  // (속은 순간은 실제로 넘어간 제출에서만 잡힌다 — AC-080). 안내는 고정 문구이고 입력값을 싣지 않는다.
  const [errors, setErrors] = useState<Record<string, string>>({});
  // P2 — 이체 화면 금액 칸의 처음 값은 읽기 전용이 아니라서 여기 들지 않는다(검증도 그대로 받는다).
  const isPrefilled = (field: CredentialFieldCopy) => field.prefill === "account" && prefilledAccount !== undefined;
  const errorFor = (field: CredentialFieldCopy): string | undefined => {
    if (isPrefilled(field)) return undefined;
    const raw = values[field.label] ?? "";
    if (field.format) return identityError(field.format, field.label, raw); // §114
    // P2-d — 훈련용 이체 화면의 금액은 실제 앱처럼 1회 한도를 넘으면 막는다(`transferLimitError` — 근거는 그 함수 주석).
    // 2026-11-07 — 고른 출금 계좌의 출금 가능 금액 · 1일 한도도 막는다(판정표 W — `withdrawAccounts.ts`).
    return field.amount
      ? (amountError(raw) ?? (bankTransfer ? (transferLimitError(raw) ?? withdrawError(ledger, account, raw)) : undefined))
      : requiredFieldError(field.label, raw);
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
    // ⭐ P2 — 훈련용 이체 화면은 폼 다음이 이체 정보 확인이다(제출 · 콜백 0 — 속은 순간은 마지막 인증 버튼에서만).
    if (bankTransfer && bankStage === "form") {
      setBankStage("confirm");
      return;
    }
    finishSubmit(event.timeStamp);
  };

  const finishSubmit = (timeStamp: number) => {
    // AC-045 핵심 — 여기서 어떤 네트워크 호출도 하지 않는다. 로컬 state만 바꿔 가짜 피드백을 준다.
    setIssuedAtMs(performance.timeOrigin + timeStamp);
    setSubmitted(true);
    // T123/AC-080 — **"제출했다는 사실" 하나만** 위로 올린다. 기록은 페이지가 한다(§15.9.6).
    // ⛔ `values`를 넘기지 않는다(G138) — 넘기는 순간 입력값이 이 파일을 벗어난다.
    // N1 — 훈련용 이체 화면은 요구액 대비 비교 결과("less" · "equal" · "more") 하나만 더 싣는다(금액 값 0 · 판정표는 `bankApp.ts` C).
    if (bankTransfer) {
      const amountRaw = values[copy.fields.find((field) => field.amount)?.label ?? ""] ?? "";
      const amountDigits = amountRaw.replace(/[^\d]/g, "");
      setReceipt({ amountText: amountDigits ? `${Number(amountDigits).toLocaleString("ko-KR")}원` : "", sentAt: new Date() });
      recordWithdrawal(ledger, account.id, amountRaw);
      onCredentialSubmit?.(
        recordTransferAndCompare(
          prefilledTransfer?.ledgerKey ?? "",
          {
            accountNumber: prefilledAccount ?? "",
            ...(prefilledTransfer?.amount ? { amount: prefilledTransfer.amount } : {}),
            ...(prefilledTransfer?.requestedAmount ? { requestedAmount: prefilledTransfer.requestedAmount } : {}),
          },
          amountRaw,
        ),
      );
      return;
    }
    onCredentialSubmit?.();
  };

  // ⭐ PR-4 G1 ~ G4 — 안내 계열이면 그 사이트 머리(택배 = 아래 운송장 띠까지). 그 밖은 종전 남색 머리띠(이체 화면 N2 포함).
  const parcelInvoice = parcelCopy && GUIDE_SITE_TOKENS.parcel.invoiceBand && (
    <p
      className="flex shrink-0 items-center justify-between gap-2 px-4 py-2.5 text-[13px]"
      style={{ backgroundColor: GUIDE_SITE_TOKENS.parcel.invoiceBand.bg, color: GUIDE_SITE_TOKENS.parcel.invoiceBand.text }}
    >
      <span>{parcelCopy.invoiceLabel}</span>
      <b className="tabular-nums tracking-[0.04em]">{parcelCopy.invoice}</b>
    </p>
  );
  const issuerBar = site ? (
    agencyLike ? (
      <AgencySiteHeader skin={site} name={issuerNameOf(copy.issuerLabel)} copy={agencyCopy} activeStep={submitted ? 1 : 0} />
    ) : sendPage ? (
      <SendSiteHeader skin={site} name={issuerNameOf(copy.issuerLabel)} />
    ) : (
      <>
        <SiteHeader skin={site} name={issuerNameOf(copy.issuerLabel)} />
        {parcelInvoice}
      </>
    )
  ) : (
    <div
      className="flex h-14 shrink-0 items-center gap-2.5 px-4 text-base font-semibold"
      style={{ backgroundColor: page.issuerBarBg, color: page.issuerBarText }}
    >
      <PhoneIcon name="shield" size={24} />
      {/* P2 — 훈련용 이체 화면은 은행 앱 흉내라 머리띠에 은행명을 쓴다. N2(실기기 신고 2026-11-01) — 받는 계좌 은행이 아니라 참가자의 "내 은행"이다
          (`myBankName` — 부재 = 발급처 이름 · 실존 은행명 0). */}
      <span className="truncate">
        {bankTransfer && prefilledTransfer?.myBankName ? `${appBankName} 모바일뱅킹` : issuerNameOf(copy.issuerLabel)}
      </span>
    </div>
  );

  // ⭐ P2(X6) — 이체 정보 확인 · 본인 인증(제출 전 화면 — 완료 분기가 아니라 G255 밖 · §130 확인 화면 선례). 실제 은행 앱 흐름 대조는
  // docs/research/in-service-experience-plan-2026-10-31.md §9(하나 원큐 공식 안내: 이체정보 입력 → 확인 → 추가인증 → 인증 → 완료).
  if (bankTransfer && !submitted && bankStage !== "form") {
    const amountRaw = values[copy.fields.find((field) => field.amount)?.label ?? ""] ?? "";
    const amountDigits = amountRaw.replace(/[^\d]/g, "");
    const amountText = amountDigits ? `${Number(amountDigits).toLocaleString("ko-KR")}원` : "";
    const holder = prefilledTransfer?.holder;
    // P2-c — 받는 분 이름을 모르는 진입(메신저 칩 — 예금주가 대화에서 정해진다)은 그 행을 그리지 않는다(지어낸 이름 0).
    const rows: [string, string][] = [
      ["출금 계좌", accountLabel(account)],
      ...(holder ? [["받는 분", holder] as [string, string]] : []),
      ["받는 계좌", prefilledAccount ?? ""],
      ["보내는 금액", amountText],
      ["수수료", "면제"],
    ];
    const cancel = (
      <button
        type="button"
        onClick={() => setBankStage("form")}
        className="min-h-[48px] rounded-[10px] border px-6 py-2.5 text-base font-semibold"
        style={{ borderColor: page.inputBorder, color: page.headline }}
      >
        취소
      </button>
    );
    return (
      <>
        {issuerBar}
        {/* 확인 화면은 인증 시트 뒤에도 그대로 남는다(실제 앱처럼 시트가 위로 올라온다) — 시트가 열리면 뒤는 inert. */}
        <div inert={bankStage === "auth" ? true : undefined}>
          <div className="flex flex-col gap-4 px-5 pb-6 pt-5">
            <h1 className="text-xl font-bold leading-snug [word-break:keep-all]" style={{ color: page.headline }}>
              {holder ? `${holder}님에게 ${amountText}을 보낼까요?` : `이 계좌로 ${amountText}을 보낼까요?`}
            </h1>
            <dl className="flex flex-col divide-y rounded-[10px] border" style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg }}>
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 px-3.5 py-3 text-[15px]" style={{ borderColor: page.inputBorder }}>
                  <dt style={{ color: page.body }}>{label}</dt>
                  <dd className="break-all text-right font-semibold" style={{ color: page.headline }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {/* 실제 앱의 이체 전 주의 문구 자리(문구는 은행마다 다르다 — 추정 · §9 표). 정답을 가르치는 문장이 아니라 은행이 늘 띄우는 일반 주의다. */}
            <p
              role="note"
              className="rounded-[10px] px-3.5 py-3 text-[14px] leading-relaxed [word-break:keep-all]"
              style={{ backgroundColor: page.fieldReadonlyBg, color: page.body }}
            >
              보이스피싱 주의 · 모르는 사람이 전화나 문자로 이체를 요구하면 보내기 전에 멈추고 확인하세요.
            </p>
            <button
              type="button"
              onClick={() => setBankStage("auth")}
              className="min-h-[52px] rounded-[10px] text-base font-semibold"
              style={{ backgroundColor: page.submitBg, color: page.submitText }}
            >
              이체
            </button>
            {cancel}
          </div>
        </div>
        {/* ⭐ 2026-11-07 — 본인 인증 = 생체 인증 시트(One UI형 지문 길게 누름 · iOS형 얼굴 자동 스캔 · 판정표 `bankAuth.ts` B).
            ⛔ 비밀번호 · 인증번호 입력 칸 0. 성공 = 종전 제출 한 번(속은 순간) · 취소 = 확인 화면. */}
        {bankStage === "auth" && (
          <BankAuthSheet
            method={authMethodForSkin(skin)}
            appName={`${appBankName} 모바일뱅킹`}
            summary={holder ? `${holder}님에게 ${amountText} 이체` : `${amountText} 이체`}
            onSuccess={finishSubmit}
            onCancel={() => setBankStage("confirm")}
          />
        )}
      </>
    );
  }

  // §106 — 제출 뒤 가짜 사건 기록 열람본(표에 있는 landingId만 · 정확 일치 R8). 없으면 종전 완료 화면.
  const recordDocument = landingId ? RECORD_DOCUMENT_COPY[landingId] : undefined;
  if (submitted && recordDocument) {
    // ⛔ G255 좁은 예외(#221) — 피의자 칸에만 방금 넣은 신원 값을 찍는다. 값은 화면 문자열로만 쓰이고 콜백 · 네트워크에 실리지 않는다(G138).
    // §122(10) — 열람본의 생년월일도 입력 칸과 같은 모양(`900101-1●●●●●●`)으로 보인다.
    const displayValues = Object.fromEntries(
      copy.fields.map((field) => [field.label, identityDisplayValue(field.format, values[field.label] ?? "")]),
    );
    const subjectRows = recordSubjectRows(
      copy.fields.map((field) => field.label),
      displayValues,
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
          {recordValueNode(row.value)}
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

  // N4 — 훈련용 이체 화면 완료 영수증(실제 은행 앱 완료 화면: 받는 분 · 받는 계좌 · 보낸 금액 · 보낸 시각). 값은 화면 문자열로만 쓰인다(G138).
  if (submitted && bankTransfer && receipt) {
    const receiptRows: [string, string][] = [
      ...(prefilledTransfer?.holder ? [["받는 분", prefilledTransfer.holder] as [string, string]] : []),
      ["받는 계좌", prefilledAccount ?? ""],
      ["보낸 금액", receipt.amountText],
      ["보낸 시각", transferTimeText(receipt.sentAt)],
      ["출금 계좌", accountLabel(account)],
    ];
    return (
      <>
        {issuerBar}
        <div className="flex flex-col gap-4 p-5">
          <p role="status" className="text-lg font-semibold leading-snug" style={{ color: page.headline }}>
            {copy.successHeadline}
          </p>
          <dl className="flex flex-col divide-y rounded-[10px] border" style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg }}>
            {receiptRows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 px-3.5 py-3 text-[15px]" style={{ borderColor: page.inputBorder }}>
                <dt style={{ color: page.body }}>{label}</dt>
                <dd className="break-all text-right font-semibold tabular-nums" style={{ color: page.headline }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <Button type="button" onClick={onClose}>
            {returnLabel}
          </Button>
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

  // §130.6(D10 남은 부분) — 본문도 낱말 단위로만 줄을 바꾼다(360폭 "아래에서 이체 / 를 확인해 주세요").
  const bodyNodes = screen.bodyLines.map((line) => (
    <p key={line} className="text-[15px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>
      {line}
    </p>
  ));
  const refundTokens = GUIDE_SITE_TOKENS.refund;
  const parcelTokens = GUIDE_SITE_TOKENS.parcel;

  return (
    <>
      {issuerBar}
      {/* ⭐ PR-4 G2 — 환급 조회 결과 카드(시안 B · 금액 = 사용자 결정 O3 "넣기"). 장식 표시만 — 입력 · 콜백 0. */}
      {refundCopy && (
        <section
          className="mx-4 mt-3.5 flex flex-col gap-1 rounded-2xl border px-4 pb-3.5 pt-4"
          style={{ backgroundColor: page.inputBg, borderColor: "#DCE4EF" }}
        >
          <p className="text-[13px] font-semibold" style={{ color: page.body }}>
            {refundCopy.label}
          </p>
          <p className="text-[30px] font-black leading-tight tabular-nums" style={{ color: refundTokens.resultAmount }}>
            {refundCopy.amount}
          </p>
          <dl
            className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-dashed pt-2.5 text-[13px]"
            style={{ borderColor: "#C9D6E6", color: page.body }}
          >
            {refundCopy.rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt>{label}</dt>
                <dd className="text-right font-semibold" style={{ color: page.headline }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <span
            className="mt-1.5 self-start rounded-full px-2.5 py-0.5 text-[12px] font-bold"
            style={{ backgroundColor: refundTokens.resultTag?.bg, color: refundTokens.resultTag?.text }}
          >
            {refundCopy.tag}
          </span>
        </section>
      )}
      <div className={sendPage ? "flex flex-col items-center gap-2.5 px-5 pt-4 text-center" : "flex flex-col gap-2.5 px-5 pt-4"}>
        {/* ⭐ PR-4 G5(D1) — 받는 사람 원형 이니셜(문자 · 대화에서 받은 예금주 첫 글자 · 모르면 사람 아이콘 — 지어낸 이름 0). */}
        {sendPage && (
          <span
            aria-hidden="true"
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-[21px] font-extrabold"
            style={{ backgroundColor: GUIDE_SITE_TOKENS.send.avatar?.bg, color: GUIDE_SITE_TOKENS.send.avatar?.text }}
          >
            {prefilledTransfer?.holder ? prefilledTransfer.holder.slice(0, 1) : <PhoneIcon name="person" size={26} />}
          </span>
        )}
        {/* ⭐ PR-4 G3 — 빨간 보류 배지(시안 C · O3 배지 = 넣기). */}
        {parcelCopy && (
          <span
            className="self-start rounded px-2 py-0.5 text-[12px] font-extrabold"
            style={{ backgroundColor: parcelTokens.holdBadge?.bg, color: parcelTokens.holdBadge?.text }}
          >
            {parcelCopy.status}
          </span>
        )}
        {/* §130(UX D-161 (6)) — 낱말 단위로만 줄을 바꾼다(360폭에서 "…이체합니 / 다" 한 글자 줄바꿈). PR-4 G1 — 기관은 명조 제목. */}
        <h1
          className="text-xl font-bold leading-snug [word-break:keep-all]"
          style={{ color: page.headline, fontFamily: agencyLike ? "var(--font-display)" : undefined }}
        >
          {screen.headline}
        </h1>
        {/* ⭐ PR-4 G3 — 배송 단계 타임라인(완료 · 완료 · 보류 — 색 + 글자로 함께 전한다). */}
        {parcelCopy && parcelTokens.timeline && (
          <ol className="mb-1 ml-1.5 mt-1 flex flex-col gap-3 border-l-2 pl-5" style={{ borderColor: parcelTokens.timeline.line }}>
            {parcelCopy.steps.map((step) => (
              <li
                key={step.label}
                className="relative text-[14px] font-semibold leading-snug"
                style={{ color: step.state === "hold" ? parcelTokens.timeline!.holdText : page.headline }}
              >
                <span
                  aria-hidden="true"
                  className="absolute -left-[27px] top-0.5 h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: step.state === "hold" ? parcelTokens.timeline!.hold : parcelTokens.timeline!.done,
                    boxShadow: step.state === "hold" ? `0 0 0 3px ${parcelTokens.holdBadge?.bg}` : undefined,
                  }}
                />
                {step.label}
                <span className="block text-[12px] font-normal" style={{ color: parcelTokens.timeline!.sub }}>
                  {step.sub}
                </span>
              </li>
            ))}
          </ol>
        )}
        {/* ⭐ PR-4 G1 · G5(D2) — 기관 안내 · 기관형 이체는 왼쪽 굵은 선 공지 상자 안에 본문. 그 밖은 종전 그대로. */}
        {agencyLike && site ? (
          <div
            role="note"
            className="mt-1 flex flex-col gap-1.5 border border-l-4 px-3 py-2.5"
            style={{ borderColor: "#C9D1E0", borderLeftColor: site.accent, backgroundColor: page.fieldReadonlyBg }}
          >
            {bodyNodes}
          </div>
        ) : (
          bodyNodes
        )}
        {/* P2 — 실제 이체 화면처럼 출금 계좌를 맨 위에 둔다. 2026-11-07 — 눌러서 고른다(가상 계좌 · 번호 가운데 가림 · 출금 가능 금액). */}
        {bankTransfer && (
          <div className="mt-1 w-full text-left">
            <WithdrawAccountRow
              account={account}
              ledgerKey={ledger}
              onOpen={() => setAccountSheetOpen(true)}
              colors={{ border: page.inputBorder, bg: page.inputBg, label: page.body, value: page.headline }}
            />
          </div>
        )}
        {bankTransfer && accountSheetOpen && (
          <WithdrawAccountSheet
            accounts={accounts}
            selectedId={account.id}
            ledgerKey={ledger}
            onSelect={(id) => {
              setAccountId(id);
              setErrors({});
              setAccountSheetOpen(false);
            }}
            onClose={() => setAccountSheetOpen(false)}
          />
        )}
        {/* P2-d — 실제 이체 화면의 한도 안내(1회 · 1일). */}
        {bankTransfer && (
          <p className="text-[13px]" style={{ color: page.body }}>
            {TRANSFER_LIMIT_NOTE}
          </p>
        )}
        {confirmAmount && (
          <p
            className="mt-1 flex items-baseline justify-between gap-3 rounded-[10px] border px-3.5 py-3 text-[15px]"
            style={{ borderColor: page.inputBorder, backgroundColor: page.inputBg, color: page.body }}
          >
            <span>이체 금액</span>
            <span className="text-[18px] font-bold" style={{ color: page.headline }}>
              {confirmAmount}
            </span>
          </p>
        )}
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
          const hint = field.amount
            ? amountHint(values[field.label] ?? "")
            : field.format
              ? identityHint(field.format, values[field.label] ?? "")
              : undefined;
          const noteId = `landing-note-${stepIndex}-${field.label}`;
          // ⭐ PR-4 G5(D1 · 사용자 결정 2026-11-08 (가)) — 송금 요청 페이지의 금액은 화면 숫자 자판으로 넣는다(기기 자판 0). 값 · 검증 · 한도 · 요구액 비교는 같은 `values` · `errorFor` 그대로.
          if (sendPage && field.amount) {
            return (
              <SendAmountPad
                key={field.label}
                label={field.label}
                value={values[field.label] ?? ""}
                error={error}
                hint={hint}
                noteId={noteId}
                headline={page.headline}
                hintText={page.hintText}
                errorText={page.errorText}
                onChange={(next) => {
                  setValues((current) => ({ ...current, [field.label]: next }));
                  if (error) setErrors((current) => ({ ...current, [field.label]: "" }));
                }}
              />
            );
          }
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
                  style={{ backgroundColor: page.fieldReadonlyBg, color: page.inputText, borderRadius: site ? corners.inputRadius : undefined }}
                />
              ) : (
                // T190-5(D-93) — 숫자 칸은 숫자 자판 힌트만(`inputMode` — 필드별 명시). 입력값 자동 서식 0.
                // §101 추가 — 제출 때 빈 칸 · 금액 오류를 칸 아래에 알린다(위 `errorFor`).
                // §114 — 신원 칸(`format`)은 입력하는 동안 숫자만 남기고 자르며 휴대전화는 하이픈을 넣는다 · 자판도 형식이 정한다.
                // §122(10) — 생년월일은 실제 본인확인 사이트 모양: 칸 안에 앞 6자리 + 뒷자리 첫 숫자(`900101-1`)를 받고 나머지 6칸은 가림 표시만.
                <IdentityBox masked={field.format === "birthdate"} error={Boolean(error)} page={page} radius={site ? corners.inputRadius : undefined}>
                  <input
                    type="text"
                    inputMode={field.format === "mobile" ? "tel" : field.format === "birthdate" ? "numeric" : field.inputMode}
                    maxLength={field.format ? identityMaxLength(field.format) : undefined}
                    autoComplete="off"
                    value={values[field.label] ?? ""}
                    onChange={(event) => {
                      const next = field.format ? sanitizeIdentityInput(field.format, event.target.value) : event.target.value;
                      setValues((current) => ({ ...current, [field.label]: next }));
                      if (error) setErrors((current) => ({ ...current, [field.label]: "" }));
                    }}
                    placeholder={field.format === "birthdate" ? BIRTHDATE_PLACEHOLDER : field.placeholder}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error || hint ? noteId : undefined}
                    className={
                      field.format === "birthdate"
                        ? "min-h-[50px] w-[8.6ch] bg-transparent text-[17px] font-normal tracking-[0.06em] outline-none"
                        : "min-h-[52px] rounded-[10px] border px-3.5 text-[17px] font-normal outline-none focus:border-2"
                    }
                    style={
                      field.format === "birthdate"
                        ? { color: page.inputText }
                        : {
                            borderColor: error ? page.errorText : page.inputBorder,
                            backgroundColor: page.inputBg,
                            color: page.inputText,
                            borderRadius: site ? corners.inputRadius : undefined,
                          }
                    }
                  />
                </IdentityBox>
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
          style={{ backgroundColor: page.submitBg, color: page.submitText, borderRadius: site ? corners.buttonRadius : undefined }}
        >
          {screen.actionLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[48px] rounded-[10px] border px-6 py-2.5 text-base font-semibold"
          style={{ borderColor: page.inputBorder, color: page.headline, borderRadius: site ? corners.buttonRadius : undefined }}
        >
          닫기
        </button>
        {/* ⑧ 발급처 — 13px · #6B655C(흰 바탕 대비 약 5.8:1 · 옛 #C9C2B6 미달 Superseded). PR-4 — 안내 계열은 아래 사이트 꼬리말의 ⓒ 줄로. */}
        {!site?.footer && (
          <p className="text-center text-[13px]" style={{ color: page.issuerFooter }}>
            {issuerMark}
          </p>
        )}
      </form>
      {/* ⭐ PR-4 F1 — 안내 계열 사이트 꼬리말(이름 · 정보 줄 · ⓒ 줄 = 카탈로그 `issuerLabel`). 입력 화면 끝에만 · 송금 링크(D1)는 꼬리말 없음(시안). */}
      {site?.footer && <SiteFooter skin={site} name={issuerNameOf(copy.issuerLabel)} copyright={issuerMark} />}
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
  // §142(카드사 고급 재구성) — 원격 지원 앱 설치(통화 중 문자함 안에서 열린다). 서버 카탈로그 항목과 바이트 동일(G76).
  "card-remote-support-install": {
    headline: "원격 지원 도우미를 설치해야 보안 점검이 시작됩니다",
    bodyLines: [
      "상담원이 휴대폰 보안 상태를 함께 점검해 드리는 앱입니다.",
      "아래에서 원격 지원 도우미 설치를 진행해 주세요.",
      "설치 후 접근 권한을 허용하면 상담원이 점검을 이어서 진행해 드립니다.",
    ],
    consentLabel: "설치하고 권한 허용하기",
    issuerLabel: "ⓒ 원격 지원 도우미",
    mockHost: "remote-help-store.invalid",
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

  // ⭐ 2026-11-08 웹 안의 웹 PR-4 G6 — 앱 소개 페이지(시안 H): 큰 앱 아이콘 + 앱 이름 + 만든 곳 → 제목 · 설명 → 요청하는 권한 목록 → 큰 파란 버튼 → 꼬리말.
  // ⛔ 권한 목록은 그림일 뿐이다(실제 권한 API 호출 0 · AC-072). 단계(설치 → 권한 확인창 → 완료) · 콜백은 종전 그대로.
  const skin = SITE_SKINS.install;
  const tokens = GUIDE_SITE_TOKENS.install;
  const appName = landingId ? INSTALL_APP_NAMES[landingId] : undefined;
  const maker = issuerNameOf(installCopy.issuerLabel);
  const primary = { backgroundColor: skin.buttonBg, color: skin.buttonText, borderRadius: tokens.buttonRadius };
  const outline = { borderColor: tokens.border, color: skin.text, backgroundColor: tokens.surface, borderRadius: tokens.buttonRadius };

  return (
    <>
      <div className="flex flex-col items-center gap-2.5 px-4 pb-[18px] pt-6 text-center" style={{ backgroundColor: tokens.surface }}>
        <SiteMark skin={skin} />
        {appName && (
          <p className="text-[19px] font-extrabold tracking-[-0.02em]" style={{ color: skin.text }}>
            {appName}
          </p>
        )}
        {appName !== maker && (
          <p className="-mt-1.5 text-[13px]" style={{ color: tokens.muted }}>
            {maker}
          </p>
        )}
        <h1 className="mt-1 text-[17px] font-bold leading-snug [word-break:keep-all]" style={{ color: skin.text }}>
          {installCopy.headline}
        </h1>
      </div>
      <div className="flex flex-col gap-1.5 px-5 pt-3">
        {installCopy.bodyLines.map((line) => (
          <p key={line} className="text-[15px] leading-relaxed [word-break:keep-all]" style={{ color: tokens.muted }}>
            {line}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
        {phase === "intro" && (
          <>
            <section className="rounded-[14px] px-3.5 py-1.5" style={{ backgroundColor: tokens.surface }}>
              <h2 className="mb-0.5 mt-2 text-[13px] font-bold" style={{ color: tokens.muted }}>
                {INSTALL_PERMISSION_HEADING}
              </h2>
              <ul>
                {INSTALL_PERMISSIONS.map((permission, index) => (
                  <li
                    key={permission.label}
                    className="flex items-center gap-3 py-2.5 text-[15px]"
                    style={{ color: skin.text, borderTop: index > 0 ? "1px solid #EEF0F4" : undefined }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                      style={{ backgroundColor: tokens.permissionIcon?.bg, color: tokens.permissionIcon?.fg }}
                    >
                      <PhoneIcon name={permission.icon} size={18} />
                    </span>
                    {permission.label}
                  </li>
                ))}
              </ul>
            </section>
            <button type="button" onClick={() => setPhase("installing")} className="min-h-[52px] text-base font-semibold" style={primary}>
              설치 진행하기
            </button>
            <button type="button" onClick={onClose} className="min-h-[48px] border px-6 py-2.5 text-base font-semibold" style={outline}>
              닫기
            </button>
          </>
        )}

        {phase === "installing" && (
          <>
            <p role="status" className="text-base font-semibold" style={{ color: skin.text }}>
              설치 중... {progress}%
            </p>
            {/* 진행 바 — 색만으로 상태를 전달하지 않도록 위 숫자 라벨과 함께 쓴다(접근성 규칙). */}
            <div aria-hidden="true" className="h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: tokens.noteBg }}>
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{ width: `${progress}%`, backgroundColor: skin.accent }}
              />
            </div>
            <button type="button" onClick={onClose} className="min-h-[48px] border px-6 py-2.5 text-base font-semibold" style={outline}>
              닫기
            </button>
          </>
        )}

        {phase === "permission" && (
          <div className="flex flex-col gap-4 rounded-[16px] p-5" style={{ backgroundColor: tokens.surface }}>
            {/* ⚠️ 실제 OS 권한 요청 다이얼로그가 **뜨지 않는다** — 화면 안에 그린 가짜 확인창이다. */}
            <p className="text-base font-semibold" style={{ color: skin.text }}>
              설치가 끝났습니다. 계속하려면 접근 권한을 허용해 주세요.
            </p>
            <button type="button" onClick={handleConsent} className="min-h-[52px] text-base font-semibold" style={primary}>
              {installCopy.consentLabel}
            </button>
            <button type="button" onClick={onClose} className="min-h-[48px] border px-6 py-2.5 text-base font-semibold" style={outline}>
              허용하지 않고 닫기
            </button>
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col gap-4 rounded-[16px] p-5" style={{ backgroundColor: tokens.surface }}>
            <p role="status" className="text-lg font-semibold" style={{ color: skin.text }}>
              권한이 허용되었습니다.
            </p>
            {/* T187(§72 · AC-086 (d) · D-83) — 설치 뒤 부정 고지 삭제. 세션 후 사실 공개가 잇는다. */}
            <Button type="button" onClick={onClose}>
              {returnLabel}
            </Button>
          </div>
        )}
      </div>
      {/* F1 — 꼬리말(만든 곳 · 사업자 정보 · ⓒ 줄 = 카탈로그 `issuerLabel`). */}
      <SiteFooter skin={skin} name={maker} copyright={installCopy.issuerLabel} />
    </>
  );
}
