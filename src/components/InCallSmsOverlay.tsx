"use client";

// UX-027 통화 중 문자(SMS) — **전면 문자함 + 통화 필** (T68 → T103, UF-008, D-35~D-38/D-55~D-57,
// AC-059/060/061, P-20/P-27).
//
// ⚠️ **이것은 라우트가 아니라 통화 화면(UX-014) 위에 겹치는 계층이다**(D-35, 이 기능의 전부).
// `/session/play`와 `/session/messenger`가 별도 라우트라 이동하면 통화 컴포넌트가 언마운트되어
// 실시간 세션·마이크·타이머가 끊긴다 — 그래서 호출부(session/play/page.tsx)는 이 컴포넌트를
// 세션 컴포넌트의 **형제 노드로 조건부 렌더**하며, early return·래퍼 추가·router.push를 하지 않는다.
// T103의 주/부 반전은 **시각적 층위에서만** 일어난다(D-55) — 문자함이 화면 전체를 차지하는 주
// 표면이 되고 통화가 상단 필로 축소되지만, 실행 층위에서는 여전히 형제 노드 하나가 그려질 뿐이다.
//
// ⚠️ **읽기 전용(AC-060)**: 답장·전달·전송 UI가 없고, 이 파일은 전송 계열 API를 import하지 않는다.
// 링크는 `linkDisplayText`(모의 표기) + `fakeLandingId`로만 표현되며 **실 URL 필드가 없다** —
// 탭하면 기존 인앱 가짜 랜딩(UX-023 `MessengerFakeLanding`)으로만 전환된다(AC-032/045, D-37).
// ⚠️ **말풍선 스레드로 바뀌어도 "보내는 쪽"은 닮지 않는다**(P-27 (6)) — 스레드 하단 입력 바를
// 만드는 것이 이 화면의 최빈 사고이며, `callContinuity.test.ts`의 G80 스캔이 그것을 고정한다.
//
// ⚠️ **종료 경로(사용자 결정 2026-10-18)**: 이 오버레이 안의 자체 종료 버튼(헤더 오른쪽)을 **없앴다**.
// 끝내려면 "통화로 돌아가기"(통화 표시줄 탭 · 헤더 뒤로 · 하단 버튼 · 랜딩 "‹ 문자" 뒤 그 경로) → 통화 화면의
// 빨간 통화 종료다. 복귀 컨트롤은 전부 포커스 트랩(panelRef) **안**에 있어 트랩이 사용자를 가두지 않는다.
// 트랩을 푸는 방식은 쓰지 않는다. 복귀 컨트롤은 스크롤과 무관한 `shrink-0` 영역에 남는다 — 말풍선
// 스레드 안으로 넣어 함께 스크롤되게 만들지 않는다(§23.4).
//
// ⚠️ **퇴장 연출은 이 컴포넌트 내부 상태로만 처리한다**(§23.6 A4 / G89) — 호출부에 두 번째 상태를
// 만들어 언마운트를 지연시키면 **한도 도달 시 종료 고지가 연출 시간만큼 가려진다**(AC-059).
// 호출부가 `setSmsOverlayOpen(false)`를 부르는 경로(한도 자동 종료·훈련 종료)는 이 상태를 거치지
// 않고 **즉시 언마운트**된다(§23.6 A5).
import { useCallback, useEffect, useRef, useState } from "react";
import MessengerFakeLanding, { type LandingProgressEvent } from "./MessengerFakeLanding";
import { lenderNameFromSmsBody } from "@/lib/bankapp/loanFlow";
import PhoneIcon from "./PhoneIcon";
import {
  MIXED_THREAD_HEADER_LABEL,
  formatSmsClock,
  groupSmsThreads,
  initialThreadNumber,
  needsTimeSeparator,
  prefilledAccountOf,
  prefilledTransferOf,
  spellOutOtp,
  splitBodyAtDialNumber,
  splitBodyAtOtp,
  takeNewlyVisibleSmsIds,
  threadPreviewText,
  type InCallSmsView,
} from "@/lib/incallsms";
import { runExitSequence } from "@/lib/incallsms/closeSequence";
import { CALL_BAR_TOKENS, smsListTokensFor, smsThreadTokensFor } from "@/lib/phone/skinTokens";
import { BANK_APP_COPY, amountFromSmsBody, holderFromSmsBody, type AmountComparison, type SpokenAccount, type TransferTarget } from "@/lib/bankapp/bankApp";
import type { MessengerSkin } from "@/lib/messenger/detectSkin";

type InCallSmsOverlayProps = {
  messages: InCallSmsView[];
  /** 통화가 살아 있다는 증거(P-20/P-27) — 통화 필의 발신자 표기. */
  callerLabel: string;
  elapsedLabel: string;
  /**
   * 실기기 신고 F1(2026-11-02) — 아직 연결된 통화가 없다(§142 R2 시작 문자 화면 — 첫 통화는 참가자가 문자 속 번호를 눌러 건다).
   * 참이면 ① 통화 표시줄("통화 중 · 경과")을 그리지 않는다(없는 통화를 있다고 보이지 않는다). 부재 = 종전.
   */
  noActiveCall?: boolean;
  /**
   * ⛔ **더 이상 그리지 않는다**(사용자 결정 2026-10-18 — 통화 표시줄의 AI 대사 자막 제거, 문자함·그 안의 랜딩
   * 둘 다). 대사 자막은 통화 화면 자체 자막에만 남는다(표시줄 탭 = 통화 복귀). 호출부(session/play/page.tsx)가
   * 아직 넘기므로 타입에만 남겨 두고 **구조 분해하지 않는다** — 호출부 정리는 그 파일 소유 세션의 몫이다.
   */
  scammerCaption?: string | null;
  onClose: () => void;
  /**
   * ⛔ **더 이상 쓰지 않는다**(사용자 결정 2026-10-18 — 헤더 오른쪽 종료 버튼 제거). 호출부가 아직 넘기므로 타입에만
   * 남겨 두고 구조 분해하지 않는다(위 `scammerCaption`과 같은 이유).
   */
  onEndTraining?: () => void;
  /** 문자를 열어본 시각 기록(fire-and-forget — 실패해도 훈련을 막지 않는다). */
  onOpened: (smsId: string) => void;
  /** 링크 칩 탭 기록. */
  onLinkTapped: (smsId: string) => void;
  /**
   * 그 링크가 연 가짜 랜딩의 폼을 **제출한 사실** 기록(T123 · AC-080).
   * ⚠️ 이 파일도 콜러블을 부르지 않는다 — `onOpened`·`onLinkTapped`와 정확히 같은 형태로
   * 콜백만 위로 올리고, 실제 기록은 **페이지**가 한다(§15.9.6 · §31.3 (2) 3).
   * ⛔ 참가자 입력값은 이 경로에 실리지 않는다(G138/AC-045) — 인자는 `smsId`와 N1 비교 결과뿐이다.
   */
  /** N1 — 훈련용 이체 화면이면 요구액 대비 비교 결과 하나(금액 값 0 · G138)가 함께 온다. */
  onLandingSubmitted: (smsId: string, amountComparison?: AmountComparison) => void;
  /**
   * §101 — 여러 화면 사이트에서 이체 전 단계 버튼을 누른 사실(인자 = 이 문자의 id + 고정 단계 값). 기록은 페이지가 한다.
   * 부재 = 중계 0(종전 동작).
   */
  onLandingStep?: (smsId: string, step: LandingProgressEvent) => void;
  /**
   * T194-c-1(docs/Architecture.md §84.15.4 · §84.16.5 단계 6 · Q2) — 통화 중 문자가 연 **모의 설치 화면**(`landingKind === "app-install"`)이
   * 보였다 · 가짜 "권한 허용"에 응했다는 사실을 페이지로 중계한다(기록은 페이지 — `recordMockScreenEvent`). 인자는 랜딩 id뿐이다.
   * 부재 = 중계 0(종전 동작 — 이 표면의 설치 화면이 없는 세션).
   */
  onInstallShown?: (landingId: string) => void;
  onInstallConsent?: (landingId: string) => void;
  /**
   * T190-5(docs/Architecture.md §74.5 (2) · AC-092 (b)) — 통화 화면이 계산한 기기 스킨(한 세션 = 한 스킨).
   * 문자함 헤더·스레드와 그 안에서 연 랜딩의 브라우저 바가 같은 값을 쓴다. 부재 = 기본.
   */
  skin?: MessengerSkin;
  /**
   * ⭐ BA-1 간소화안(2026-11-01 · 사용자 승인 "간소화안으로") — 이체 화면 문자(계좌 구조화 필드 + 이체 랜딩)의 계좌번호를 한 번 누르면 '송금' 메뉴가 뜨고,
   * 고르면 그 문자 id와 받는 계좌(서버 문자 문서의 필드 그대로 — 참가자 입력 아님)를 페이지로 올린다. 페이지가 은행 앱 송금 화면을 연다.
   * 이 문자의 링크(사기 사이트 이체 화면)는 그리지 않는다 — 은행 앱이 대신한다. 부재 = 종전 화면(진단 플래그 꺼짐).
   * ⛔ 기기 복사 API 0 · 인증번호 메뉴 0(AC-061).
   */
  onSendToAccount?: (smsId: string, target: TransferTarget) => void;
  /**
   * §142(카드사 고급 재구성) — 전화번호 안내 문자의 번호를 누르면(실기 문자 앱이 번호를 알아보고 통화를 제안하듯) 그 번호를 페이지로 올린다.
   * 페이지가 앱 안 전화 다이얼을 그 번호로 채워 연다(실제 전화 발신 0). 부재 = 번호는 보통 글자.
   */
  onDialNumber?: (number: string) => void;
  /**
   * N1 · N2(실기기 신고 2026-11-01) — 이 세션 참가자의 "내 은행"(이체 화면 머리띠 — 받는 계좌 은행이 아니다) · 같은 계좌로 나눠 보낸 합계 열쇠(세션 id).
   * 부재 = 머리띠는 발급처 이름 · 합계 열쇠 빈 값.
   */
  bankIdentity?: { myBankName: string; ledgerKey: string };
  /**
   * ⭐ PR-A(2026-11-07 · 기관 사칭 고급 · 택배 통관 고급 — 적은 금액이 통과) — 이체 화면을 여는 순간의 요구액(판정표 R1: 통화에서 사기범이 마지막으로 말한
   * 금액). 없으면 문자 금액(R2) · 둘 다 없으면 비교 0(R3). 금액 값은 이 화면 안의 비교에만 쓰이고 콜백 · 네트워크로 나가지 않는다(G138). 부재 = R2 · R3만.
   */
  demandAmountNow?: (landingId?: string) => string | undefined;
  /**
   * ⭐ 2026-11-08(라이브 재시험 7 · 사용자 결정 "말한 값에 맞추기") — 출금 예약 화면을 여는 순간 참가자가 통화에서 말한 거래 은행 · 잔액(판정표 S).
   * 화면 안 계좌 목록 · 머리띠에만 쓰이고 콜백 · 네트워크로 나가지 않는다(G138). 부재 = 종전 고정 값.
   */
  spokenAccountNow?: () => SpokenAccount;
  /**
   * 2026-11-07 실기기 신고("문자 발신처는 다른데 한 곳에서 오는 걸로 되어 있다") — 열 때 바로 보일 **대화방**(발신 라벨 또는 번호).
   * 도착 배너를 눌러 열면 그 문자를 보낸 번호의 대화방이 바로 열린다(실제 휴대폰 알림). 부재 · 없는 번호 = 받은 문자 목록(메시지 앱 첫 화면).
   */
  initialThread?: string | null;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 연출을 끌지 말지의 유일한 판단 지점(§23.6 A2/A3). 켜져 있으면 즉시 교체한다. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function InCallSmsOverlay({
  messages,
  callerLabel,
  elapsedLabel,
  noActiveCall = false,
  onClose,
  onOpened,
  onLinkTapped,
  onLandingSubmitted,
  onLandingStep,
  onInstallShown,
  onInstallConsent,
  skin = "default",
  onSendToAccount,
  demandAmountNow,
  spokenAccountNow,
  onDialNumber,
  bankIdentity,
  initialThread = null,
}: InCallSmsOverlayProps) {
  // 2026-11-07 실기기 신고 — 실제 메시지 앱처럼 **보낸 번호마다 대화방 하나**. 첫 화면 = 번호별 목록, 행을 누르면 그 번호의 문자만.
  // 묶는 열쇠 = 발신 라벨의 번호 부분(S3 `sameSenderNumber`와 같은 판정 — 옛 꼴 `번호 (안내 이름)` 라벨도 같은 번호면 한 방).
  const threads = groupSmsThreads(messages);
  const thread = smsThreadTokensFor(skin);
  const list = smsListTokensFor(skin);
  // 지금 열린 대화방의 번호(목록으로 돌아가도 유지 — 숨긴 대화방의 열람 관측이 그대로 이어진다).
  const [openNumber, setOpenNumber] = useState<string | null>(() => initialThreadNumber(threads, initialThread));
  const openThread = threads.find((item) => item.number === openNumber) ?? null;
  // 열린 대화방의 문자 — 도착 순. 대화방 안에서는 발신처가 하나뿐이라 말풍선 위 발신처 줄이 없다.
  const sorted = openThread ? openThread.messages : [];
  // 머리줄 = 그 방 첫 문자의 발신 라벨(서버가 번호만 보내면 번호만 — 저장 안 된 번호는 이름이 보이지 않는다).
  const headerLabel = openThread ? openThread.title : "";
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  // 말풍선 스레드의 스크롤 컨테이너 = 열람 판정의 뷰포트(IntersectionObserver root).
  const threadRef = useRef<HTMLDivElement | null>(null);
  const bubbleRefs = useRef(new Map<string, HTMLLIElement>());
  const recordedRef = useRef(new Set<string>());
  // 콜백 prop의 identity가 매 렌더 바뀌어도 effect를 재실행시키지 않는다(호출부의 핸들러는
  // useCallback으로 감싸여 있지 않다 — 이 화면의 다른 곳과 같은 ref 경유 관례).
  const onCloseRef = useRef(onClose);
  const onOpenedRef = useRef(onOpened);
  useEffect(() => {
    onCloseRef.current = onClose;
    onOpenedRef.current = onOpened;
  });
  // 퇴장 연출 진행 상태. `closingRef`는 중복 호출 멱등성(§23.6 A6)을 렌더와 무관하게 지킨다.
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const [entryNotice, setEntryNotice] = useState("");
  // T104 — 상황별 랜딩을 열려면 `fakeLandingId`(조회 키)와 서버가 확정한 `landingKind`가 함께
  // 필요하다. 둘 다 문자 문서에서 온 값이며 **클라가 문자열로 분류하지 않는다**(§15.9.1 R3/R8).
  // ⭐ T190-5(docs/Architecture.md §74.8 · UX D-94) — 랜딩은 이 대화상자 **안의 두 번째 보기**다(중첩 `aria-modal`
  // 0 — G26/G460). `view`가 두 보기를 `hidden`으로 토글하고, 숨긴 랜딩은 마운트된 채 입력값을 자기 로컬 state에
  // 그대로 갖는다(G138 — 값을 이 파일로 끌어올리지 않는다). 같은 문자의 링크를 다시 누르면 같은 랜딩이 돌아오고,
  // 다른 문자면 `key`가 바뀌어 새로 마운트된다. 닫기·완료 복귀·문자함 닫기 → 언마운트(값 폐기 — UX-023 (1)).
  const [landing, setLanding] = useState<{
    smsId: string;
    displayText: string;
    landingId?: string;
    landingKind?: "credential-form" | "app-install";
    /** §101 추가 · D-115 — 이 문자의 수취 계좌(랜딩 첫 칸 미리 채움). */
    prefilledAccount?: string;
    /** ⭐ P2(X6) — 훈련용 이체 화면의 받는 분 · 금액 · 은행(문자 문서 구조화 필드). */
    /** PR-A — `requestedAmount` = 판정표 R1(통화에서 사기범이 마지막으로 말한 금액 · 비교 전용). */
    prefilledTransfer?: (NonNullable<ReturnType<typeof prefilledTransferOf>> & { requestedAmount?: string }) | undefined;
  } | null>(null);
  // 보기 3개 — 받은 문자 목록 · 번호별 대화방 · 그 안에서 연 랜딩(전부 이 대화상자 안 · `hidden` 토글).
  const [view, setView] = useState<"list" | "thread" | "landing">(() => (openNumber ? "thread" : "list"));
  // 목록 행 — 대화방에서 목록으로 돌아올 때 그 행으로 포커스를 되돌린다.
  const listTitleRef = useRef<HTMLHeadingElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  // ⭐ BA-1 간소화안 — '송금' 메뉴가 열린 말풍선.
  const [sendMenuSmsId, setSendMenuSmsId] = useState<string | null>(null);
  // ⭐ reviewer Major(포커스) — 보기 전환 때 포커스가 `hidden`이 된 요소와 함께 body로 떨어지지 않게 한다.
  // 랜딩으로 가면 랜딩 영역(`role="region"` · 이름 "{제목} 화면")으로 옮겨 스크린리더가 그 이름을 읽어 전환을 안다
  // (세션 중 새 문구 0 — AC-093 (e) · 기존 이름 A5를 쓴다). 스레드로 돌아오면 그 랜딩을 연 **링크 버튼**으로 되돌린다.
  const landingViewRef = useRef<HTMLDivElement | null>(null);
  const linkButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusSmsIdRef = useRef<string | null>(null);
  const previousViewRef = useRef<"list" | "thread" | "landing">(view);

  /**
   * 닫기 요청 — Esc·바깥 탭·필 탭·"통화로 돌아가기"가 전부 여기로 온다.
   * 연출이 켜져 있으면 퇴장 클래스를 입히고 `onAnimationEnd`에서 `onClose()`를 부른다.
   * 연출이 꺼져 있으면(reduced-motion) **즉시** 부른다 — 애니메이션이 없으면 `animationend`가
   * 영영 오지 않으므로 여기서 갈라 주지 않으면 문자함이 닫히지 않는다(§23.6 A3).
   */
  const requestClose = useCallback(() => {
    if (closingRef.current) return; // 중복 호출 멱등(§23.6 A6)
    closingRef.current = true;
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
  }, [onClose]);

  // ⭐ 퇴장 시퀀스 — **`closing`이 켜진 커밋 이후** 패널에서 실제로 도는 애니메이션을 직접
  // 붙잡아 기다린다(Web Animations API).
  //
  // ⚠️ **왜 `onAnimationEnd`를 쓰지 않는가(2026-07-27 라이브 결함).** 예전 구현은 언마운트를
  // React 합성 이벤트 `onAnimationEnd` **하나**에 걸어 뒀는데, 라이브에서 퇴장 애니메이션이
  // `state:"finished"`로 끝났는데도 `onClose()`가 불리지 않아 **문자함이 닫히지 않았다**
  // (opacity 0인 `fixed inset-0` 레이어가 화면 전체를 계속 덮어 참가자가 통화 화면에 갇힌다).
  // 그 이벤트는 이 저장소의 어떤 테스트로도 관측할 수 없어 T103 불변식 6건이 전부 통과한 채로
  // 결함이 빠져나갔다. ⇒ **완료 신호를 이벤트 전달에 의존하지 않는 경로로 바꾸고**(애니메이션
  // 객체의 `finished` 프로미스), 그 위에 **상한 안전망**을 얹는다(§23.6 A4 계약은 그대로 —
  // 퇴장은 여전히 이 컴포넌트 내부 상태이고 호스트는 손대지 않는다).
  useEffect(() => {
    if (!closing) return;
    const node = panelRef.current;
    const animations = typeof node?.getAnimations === "function" ? node.getAnimations() : [];
    return runExitSequence({
      animations,
      schedule: (fn, ms) => window.setTimeout(fn, ms),
      cancelScheduled: (handle) => window.clearTimeout(handle as number),
      onDone: () => onCloseRef.current(),
    });
  }, [closing]);

  // 열릴 때 포커스를 오버레이 제목으로 이동한다(UX-027 Focus Order). 닫을 때의 복귀는 호출부가
  // 직전 트리거(배너/"문자함" 버튼)로 되돌린다.
  useEffect(() => {
    (previousViewRef.current === "list" ? listTitleRef.current : titleRef.current)?.focus();
  }, []);

  // 전면 전환을 스크린리더에 알린다(UX Accessibility v1.13 — "문자함을 엽니다. 통화는 계속됩니다.").
  // 마운트 직후 내용을 채워야 라이브 영역이 실제로 읽힌다. 인라인 async IIFE로 감싼다
  // (react-hooks/set-state-in-effect 회피 — 이 코드베이스의 관례).
  useEffect(() => {
    (async () => {
      setEntryNotice("문자함을 엽니다. 통화는 계속됩니다.");
    })();
  }, []);

  // ⭐ 열람 기록(UX-027 Data Operations Update) — **실제로 뷰포트에 들어온 문자만** 기록한다.
  //
  // ⚠️ **왜 "그려진 것 전부"가 아닌가(2026-07-27 QA 지적).** 아코디언을 없애면서 스레드에 그려진
  // id 전부를 기록했더니, 문자함을 **한 번 열기만 해도 스크롤조차 안 한 하단 문자까지** 열람으로
  // 박혔다. 서버 `openedAt`은 최초 1회만 세팅되고 **되돌릴 수 없으며**, 리포트·리플레이는 그 값만
  // 보고 *"문자를 열어 확인했습니다"*·*"화면에 인증번호가 표시됐습니다"* 캡션을 만든다 ⇒ 보지도
  // 못한 인증번호에 "표시됐다"가 붙어 **훈련 피드백이 거짓을 말한다**(AC-026 보조 타임라인).
  // ⛔ 판정 기준은 **"뷰포트에 들어왔는가" 하나**다 — 노출 시간·읽음 확인 같은 새 개념을 만들지
  // 않는다. 서버 계약(1회성·영구 기록)도 무변경이며, 고치는 것은 **언제 부르는가** 뿐이다.
  // ⚠️ 관측 수단이 없으면(구형 브라우저) **기록하지 않는다** — 과다 기록보다 누락이 낫다.
  const threadIds = `${openNumber ?? ""}|${sorted.map((sms) => sms.smsId).join(",")}`;
  useEffect(() => {
    const root = threadRef.current;
    if (!root || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const newlyVisible = takeNewlyVisibleSmsIds(
          entries.map((entry) => ({
            isIntersecting: entry.isIntersecting,
            smsId: (entry.target as HTMLElement).dataset.smsId,
          })),
          recordedRef.current,
        );
        for (const smsId of newlyVisible) {
          recordedRef.current.add(smsId);
          const node = bubbleRefs.current.get(smsId);
          if (node) observer.unobserve(node); // 같은 문자를 다시 세지 않는다
          onOpenedRef.current(smsId);
        }
      },
      { root }, // threshold 기본값 0 = "한 조각이라도 뷰포트에 들어왔다"
    );
    for (const [smsId, node] of bubbleRefs.current) {
      if (!recordedRef.current.has(smsId)) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [threadIds]);

  // Esc 닫기 + 포커스 트랩(트랩 안에 "통화로 돌아가기" 컨트롤이 있어 통화 화면의 종료로 항상 돌아갈 수 있다 —
  // 첫/끝 요소는 매 Tab마다 실제 보이는 요소에서 다시 고르므로 헤더 종료 버튼이 빠져도 그대로 동작한다).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        // T190-5(§74.8) — 랜딩 보기에서는 Esc = 브라우저 뒤로("문자" — 숨김, 입력값 유지).
        // 2026-11-07 — 대화방에서는 Esc = 뒤로(목록 · 실제 휴대폰 뒤로 키) · 목록에서는 통화로.
        if (view === "landing") setView("thread");
        else if (view === "thread") setView("list");
        else requestClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // reviewer Major — 포커스가 패널 밖(body 등)에 있으면 Tab이 `aria-modal` 밖으로 새지 않게 안쪽으로 감싼다.
      if (!active || !panelRef.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (active === first || active === titleRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [requestClose, view]);

  // 보기 전환 뒤(커밋 뒤 — `hidden`이 풀린 다음) 포커스를 옮긴다. 첫 마운트는 위 제목 포커스가 맡는다.
  useEffect(() => {
    if (previousViewRef.current === view) return;
    previousViewRef.current = view;
    if (view === "landing") {
      landingViewRef.current?.querySelector<HTMLElement>('[role="region"]')?.focus();
      return;
    }
    if (view === "list") {
      // 대화방에서 돌아오면 그 방의 행으로(없으면 목록 제목으로).
      const row = openNumber ? rowRefs.current.get(openNumber) : undefined;
      if (row) row.focus();
      else listTitleRef.current?.focus();
      return;
    }
    const smsId = returnFocusSmsIdRef.current;
    const trigger = smsId ? linkButtonRefs.current.get(smsId) : undefined;
    if (trigger) trigger.focus();
    else titleRef.current?.focus();
  }, [view, openNumber]);


  const openLanding = (sms: InCallSmsView) => {
    onLinkTapped(sms.smsId);
    // T194-c-1(Q2) — 설치 화면이 열리는 순간을 페이지로 중계한다(서버가 `shown`을 최초 1회만 세팅 — 다시 열어도 멱등).
    if (sms.landingKind === "app-install" && sms.fakeLandingId) onInstallShown?.(sms.fakeLandingId);
    returnFocusSmsIdRef.current = sms.smsId;
    // D-94 — 같은 문자의 랜딩이 이미 있으면 그대로 다시 보인다(입력값 유지). 다르면 교체(새 마운트).
    // ⭐ PR-A — 요구액(판정표 R1)은 열 때마다 다시 잰다(사기범이 그사이 금액을 말했을 수 있다). 같은 문자의 랜딩은 그대로 두고 요구액만 바꾼다(입력값 유지 — D-94).
    const spoken = demandAmountNow?.(sms.fakeLandingId);
    const withDemand = (transfer: ReturnType<typeof prefilledTransferOf>): (NonNullable<typeof transfer> & { requestedAmount?: string }) | undefined =>
      transfer && spoken ? { ...transfer, requestedAmount: spoken } : transfer;
    setLanding((current) =>
      current && current.smsId === sms.smsId
        ? { ...current, prefilledTransfer: withDemand(prefilledTransferOf(sms)) }
        : {
            smsId: sms.smsId,
            displayText: sms.linkDisplayText ?? "",
            landingId: sms.fakeLandingId,
            landingKind: sms.landingKind,
            prefilledAccount: prefilledAccountOf(sms),
            prefilledTransfer: withDemand(prefilledTransferOf(sms)),
          },
    );
    setView("landing");
  };

  // 목록 행 누름 = 그 번호의 대화방. 앞 대화방의 랜딩 복귀 자리는 잊는다(다른 방의 링크로 포커스를 보내지 않는다).
  const openThreadOf = (number: string) => {
    returnFocusSmsIdRef.current = null;
    setOpenNumber(number);
    setView("thread");
  };

  const closeLanding = () => {
    setLanding(null);
    setView("thread");
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="통화 중 도착한 문자 — 문자함"
        className={`fixed inset-0 z-40 flex items-stretch justify-center bg-black/55 ${
          closing ? "sms-dim-exit" : "sms-dim-enter"
        }`}
      >
        {/* 바깥 탭으로 닫기(UX-027 Exit). 통화가 살아 있다는 신호는 상단 통화 표시줄이 상시·실시간으로 맡는다. */}
        <button
          type="button"
          aria-label="문자 닫고 통화로 돌아가기"
          onClick={requestClose}
          className="absolute inset-0 h-full w-full cursor-default"
          tabIndex={-1}
        />

        {/* 폰 폭 단일 컬럼 · 세 브레이크포인트 동일 규칙(Responsive v1.13 — 데스크톱에서도 폰 폭
            컨테이너 중앙 정렬, 메신저 셸 UX-022와 같은 규칙). 브레이크포인트마다 갈리던 모서리·
            여백 이중 규칙을 두지 않는다(D-57 ㄹ). 글꼴은 system-ui(P-37 R-4). */}
        <div
          ref={panelRef}
          className={`relative mx-auto flex h-full w-full max-w-[430px] flex-col overflow-hidden ${
            closing ? "sms-surface-exit" : "sms-surface-enter"
          }`}
          style={{ backgroundColor: thread.threadBg, fontFamily: "system-ui, sans-serif" }}
        >
          <p aria-live="polite" className="sr-only">
            {entryNotice}
          </p>

          {/* ── ① 통화 표시줄(P-37 (4) · P-27 (2)(9) · UX-027 v1.33 (2)) — 스크롤과 무관하게 맨 위 고정이고, 문자함과
              그 안의 랜딩 **두 보기가 함께 쓴다**(UX-023 (1) "UX-027에서 열렸을 때만" — 구조로 충족 · §74.8 ③).
              4요소: ① 상대 표기 ② 초 단위 경과 시간 ③ "통화 중" **텍스트**(색·아이콘 단독 금지) ⑤ 탭 = 통화 복귀.
              ⛔ 옛 ④ 최신 사기범 자막은 **없앴다**(사용자 결정 2026-10-18 — 문자함·랜딩 두 보기 모두). 대사 자막은 통화
              화면 자체 자막에만 남고, 표시줄 탭 1번으로 그 화면에 돌아간다. 번호는 옛 5요소 번호를 그대로 둔다.
              오른쪽 "통화로" 칩은 없앴다(표시줄 자체가 버튼이고 아래 큰 복귀 버튼이 있다).
              ⛔ 발신자는 호출부가 이미 계산해 넘긴 `callerLabel` prop **하나만** 읽는다(G87/§23.7 C1·C2).
              아래 스레드의 발신번호(`senderLabel`)는 **문자의 발신자**이고 통화 발신자와 다른 값이 정상이다(§23.7 C3). */}
          {!noActiveCall && (
          <button
            type="button"
            onClick={requestClose}
            className="flex h-12 shrink-0 items-center text-left"
            style={{ backgroundColor: CALL_BAR_TOKENS.bg, color: CALL_BAR_TOKENS.text }}
          >
            {/* 사용자 결정(2026-10-18 · UX-027 v1.36 (2) ①) — 한 줄 48px 고정(2행 없음). */}
            <span className="flex h-12 w-full items-center gap-2 px-3.5">
              <PhoneIcon name="accept-call" size={16} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{callerLabel}</span>
              <span className="shrink-0 text-[15px] tabular-nums">통화 중 · {elapsedLabel}</span>
            </span>
            <span className="sr-only">눌러서 통화로 돌아가기</span>
          </button>
          )}

          {/* ── 보기 0: 받은 문자 목록(2026-11-07 실기기 신고 — 메시지 앱 첫 화면). 보낸 번호마다 한 행: 번호 · 마지막 문자 미리보기 ·
              시각 · 안 읽음. 가장 최근 문자가 온 방이 위. 행을 누르면 그 번호의 대화방(보기 1).
              ⛔ 실제 앱의 검색 · 새 메시지 · 편집 · 더보기를 그리지 않는다(동작 없는 버튼 금지 — P-37 R-6 · 보내는 쪽 0 — AC-060 · G80).
              왼쪽 뒤로 = 통화 복귀(종전 문자함 헤더의 뒤로와 같은 자리 · 같은 이름). */}
          <div
            hidden={view !== "list"}
            className={view === "list" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
            style={{ backgroundColor: list.bg }}
          >
            <div className="flex h-12 shrink-0 items-center">
              <button
                type="button"
                onClick={requestClose}
                aria-label="통화로 돌아가기"
                className="flex h-12 w-12 shrink-0 items-center justify-center"
                style={{ color: list.chevron }}
              >
                <PhoneIcon name="chevron-back" size={24} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* 큰 제목 — iOS형 왼쪽 34px · One UI형 펼친 앱 바 가운데 30px. 낱말 = 섞인 스레드 제목과 같은 "메시지"(새 문구 0). */}
              <h2
                ref={listTitleRef}
                tabIndex={-1}
                className={
                  list.titleLayout === "ios-large"
                    ? "px-4 pb-2 pt-1 text-[34px] font-bold leading-tight outline-none"
                    : "flex h-[112px] items-center justify-center text-[30px] font-semibold outline-none"
                }
                style={{ color: list.title }}
              >
                {MIXED_THREAD_HEADER_LABEL}
              </h2>
              {threads.length === 0 ? (
                // Empty — §114(UX D-152) 이후 메시지 버튼이 처음부터 활성이라 첫 문자 전에 누르면 이 상태가 보인다(UX-027 States).
                <p role="status" className="px-5 py-6 text-base" style={{ color: list.preview }}>
                  아직 도착한 문자가 없습니다.
                </p>
              ) : (
                <ul>
                  {threads.map((item, index) => {
                    const clock = formatSmsClock(item.latest.arrivedAtMs);
                    const unread = item.unreadCount > 0;
                    return (
                      <li key={item.number}>
                        <button
                          type="button"
                          ref={(node) => {
                            if (node) rowRefs.current.set(item.number, node);
                            else rowRefs.current.delete(item.number);
                          }}
                          onClick={() => openThreadOf(item.number)}
                          className="flex min-h-[76px] w-full items-center gap-3 py-2.5 pr-4 text-left"
                          style={{ paddingLeft: list.unreadStyle === "dot" ? 6 : 16 }}
                        >
                          {list.unreadStyle === "dot" && (
                            <span aria-hidden="true" className="flex w-2.5 shrink-0 justify-center">
                              {unread && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: list.unreadBg }} />}
                            </span>
                          )}
                          <span
                            aria-hidden="true"
                            className={`flex shrink-0 items-center justify-center rounded-full text-white ${
                              list.unreadStyle === "dot" ? "h-10 w-10" : "h-12 w-12"
                            }`}
                            style={{ backgroundColor: list.avatarBg }}
                          >
                            <PhoneIcon name="person" size={list.unreadStyle === "dot" ? 24 : 28} />
                          </span>
                          <span
                            className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch"
                            style={{
                              borderBottom:
                                list.unreadStyle === "dot" && index < threads.length - 1 ? `0.5px solid ${list.divider}` : undefined,
                            }}
                          >
                            <span className="flex items-baseline gap-2">
                              <span className="min-w-0 flex-1 truncate text-[17px] font-semibold" style={{ color: list.name }}>
                                {item.title}
                              </span>
                              {clock !== null && (
                                <span
                                  className={`flex shrink-0 items-center gap-0.5 ${list.unreadStyle === "dot" ? "text-[15px]" : "text-[12px]"}`}
                                  style={{ color: list.time }}
                                >
                                  {clock}
                                  {list.unreadStyle === "dot" && <PhoneIcon name="chevron-back" size={14} className="rotate-180" />}
                                </span>
                              )}
                            </span>
                            <span className="flex items-start gap-2">
                              <span className="line-clamp-2 min-w-0 flex-1 break-words text-[15px] leading-snug" style={{ color: list.preview }}>
                                {threadPreviewText(item.latest)}
                              </span>
                              {list.unreadStyle === "count" && unread && (
                                <span
                                  aria-hidden="true"
                                  className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[12px] font-bold tabular-nums"
                                  style={{ backgroundColor: list.unreadBg, color: list.unreadText }}
                                >
                                  {item.unreadCount}
                                </span>
                              )}
                            </span>
                            {unread && <span className="sr-only">{`읽지 않은 문자 ${item.unreadCount}개`}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* ── 보기 1: 번호별 대화방(UX-027 v1.33 (1)~(5) · 2026-11-07 — 목록에서 고른 번호의 문자만). 랜딩을 보는 동안 `hidden`(접근성 트리·포커스 밖 — G460). */}
          <div
            hidden={view !== "thread"}
            className={view === "thread" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
          >
            {/* ② 대화 헤더(D-89) — 왼쪽 뒤로(2026-11-07 — = 받은 문자 목록 · 실제 메시지 앱) · 발신자(iOS형 가운데 · One UI형 왼쪽).
                ⛔ 실제 앱의 통화·영상·메뉴 아이콘을 그리지 않는다(동작 없는 버튼 금지 — P-37 R-6).
                T187(§72 · AC-086) — 세션 중 표식 0. ⚠️ 사용자 결정(2026-10-18) — 오른쪽 종료 버튼과 그것만 들던
                `justify-end` 칸(옛 G449)을 **없앴다**. 오른쪽은 비워 둔다(새 컨트롤로 채우지 않는다 — P-37 R-6).
                UX-027 v1.36 (2) ② — iOS형 가운데 발신자 칸은 좌우 대칭 `inset-x-28` 유지(오른쪽 빈 자리로 가운데 유지) ·
                One UI형·기본은 이름 칸이 오른쪽 끝 16px 앞까지 늘어난다(`pr-4`). */}
            <div
              className="relative flex min-h-[56px] shrink-0 items-center gap-1 border-b pr-4"
              style={{ backgroundColor: thread.headerBg, borderColor: thread.headerBorder }}
            >
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="메시지 목록으로"
                className="flex h-12 w-12 shrink-0 items-center justify-center"
                style={{ color: thread.chevron }}
              >
                <PhoneIcon name="chevron-back" size={24} />
              </button>
              {thread.headerLayout === "center" ? (
                <div className="pointer-events-none absolute inset-x-28 inset-y-1 flex flex-col items-center justify-center text-center">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: thread.avatarBg }}
                  >
                    <PhoneIcon name="person" size={20} />
                  </span>
                  <span className="mt-0.5 max-w-full truncate text-[13px] font-semibold" style={{ color: thread.headerText }}>
                    {headerLabel}
                  </span>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: thread.avatarBg }}
                  >
                    <PhoneIcon name="person" size={22} />
                  </span>
                  <span className="min-w-0 truncate text-[17px] font-semibold" style={{ color: thread.headerText }}>
                    {headerLabel}
                  </span>
                </div>
              )}
            </div>

            {/* ③ 스레드 — 말풍선 단위가 열람 판정 관측 대상이다(시각 구분줄은 관측 대상이 아니다 — UX-027 (7) ⓒ). */}
            <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <h2 ref={titleRef} tabIndex={-1} className="sr-only outline-none">
                문자 메시지
              </h2>
              {/* 열린 대화방이 없으면(목록 보기) 그리지 않는다 — 빈 상태 안내는 목록이 맡는다. */}
              {sorted.length === 0 ? null : (
                <ul className="flex flex-col gap-2">
                  {sorted.map((sms, index) => {
                    const previous = index > 0 ? sorted[index - 1] : null;
                    const clock = formatSmsClock(sms.arrivedAtMs);
                    const showSeparator =
                      thread.timeStyle === "separator" &&
                      clock !== null &&
                      needsTimeSeparator(previous ? previous.arrivedAtMs : null, sms.arrivedAtMs);
                    // D-90 · G459 — 본문 안 인증번호를 **정확 일치 첫 1회**로 감싼다. null이면 박스 폴백.
                    const otpSplit = sms.otpCode ? splitBodyAtOtp(sms.body, sms.otpCode) : null;
                    // D-101 — 링크 줄 = 가짜 주소(부재 = 옛 문서 → 표시 텍스트).
                    const linkText = sms.linkAddress ?? sms.linkDisplayText;
                    // ⭐ BA-1 — 계좌번호 복사 대상(서버가 계좌 줄 구조화 필드를 실은 문자 · 플래그 켜짐).
                    // ⭐ BA-1 간소화안 — 은행 앱으로 보낼 수 있는 문자(계좌 필드 + 이체 랜딩 · 플래그 켜짐). 기록은 그 랜딩 제출과 같은 경로다.
                    const sendable =
                      onSendToAccount !== undefined &&
                      Boolean(sms.bankName && sms.accountNumber && sms.fakeLandingId) &&
                      sms.landingKind !== "app-install"; // 부재 = credential-form(§15.9.1 R2)
                    const accountAt = sendable && sms.accountNumber ? sms.body.indexOf(sms.accountNumber) : -1;
                    const accountSplit =
                      accountAt >= 0 && sms.accountNumber
                        ? {
                            before: sms.body.slice(0, accountAt),
                            account: sms.accountNumber,
                            after: sms.body.slice(accountAt + sms.accountNumber.length),
                          }
                        : null;
                    // §142 — 전화번호 안내 문자의 번호(다이얼 콜백이 있을 때만 누를 수 있다).
                    const dialSplit = onDialNumber && !otpSplit && !accountSplit ? splitBodyAtDialNumber(sms.body, sms.dialNumber) : null;
                    return (
                      <li
                        key={sms.smsId}
                        data-sms-id={sms.smsId}
                        ref={(node) => {
                          // 열람 판정 대상 등록. 언마운트 시 지워 관측자가 죽은 노드를 붙들지 않게 한다.
                          if (node) bubbleRefs.current.set(sms.smsId, node);
                          else bubbleRefs.current.delete(sms.smsId);
                        }}
                        className="flex flex-col items-start gap-1"
                      >
                        {showSeparator && (
                          <p className="mb-1 mt-2.5 w-full text-center text-xs" style={{ color: thread.time }}>
                            오늘 {clock}
                          </p>
                        )}
                        <div className="flex w-full items-end gap-1.5">
                          {/* 수신 말풍선 — 본문 17px · 줄높이 1.45 · 최대폭 80%(UX-027 v1.33 (4)). */}
                          <div
                            className="flex max-w-[80%] flex-col gap-2 px-[13px] py-[9px]"
                            style={{
                              backgroundColor: thread.bubbleBg,
                              color: thread.bubbleText,
                              borderRadius: thread.bubbleRadius,
                              border: thread.bubbleBorder ? `1px solid ${thread.bubbleBorder}` : undefined,
                            }}
                          >
                            <p className="whitespace-pre-line break-words text-[17px] leading-[1.45]">
                              {otpSplit ? (
                                <>
                                  {otpSplit.before}
                                  {/* ⛔ 굵게·색·밑줄·"복사" 버튼 0(실제 폰의 코드 자동 인식·복사 제안을 재현하지 않는다 —
                                      AC-061). 스크린리더는 한 자씩 읽는 이름을 듣는다(UX-027 Accessibility). */}
                                  <span aria-hidden="true">{otpSplit.code}</span>
                                  <span className="sr-only">인증번호 {spellOutOtp(otpSplit.code)}</span>
                                  {otpSplit.after}
                                </>
                              ) : accountSplit ? (
                                <>
                                  {accountSplit.before}
                                  {/* ⭐ BA-1 간소화안 — 실기 문자 앱(삼성 메시지)이 계좌번호를 알아보고 송금을 제안하듯, 밑줄 친 계좌번호를 한 번 누르면 '송금' 메뉴. */}
                                  <button
                                    type="button"
                                    aria-haspopup="menu"
                                    onClick={() => setSendMenuSmsId(sms.smsId)}
                                    className="inline underline underline-offset-[3px]"
                                  >
                                    {accountSplit.account}
                                  </button>
                                  {accountSplit.after}
                                </>
                              ) : dialSplit ? (
                                <>
                                  {dialSplit.before}
                                  <button
                                    type="button"
                                    onClick={() => onDialNumber?.(dialSplit.number)}
                                    aria-label={`전화 걸기: ${dialSplit.number}`}
                                    className="inline underline underline-offset-[3px]"
                                    style={{ color: thread.link }}
                                  >
                                    {dialSplit.number}
                                  </button>
                                  {dialSplit.after}
                                </>
                              ) : (
                                sms.body
                              )}
                            </p>

                            {/* 인증번호 박스 — ⚠️ **폴백 전용**(G459): 본문에 코드가 없을 때만(콘텐츠 드리프트) 그린다 —
                                인증번호가 화면 어디에도 없는 상태 0(AC-061). 자동 복사·자동 전송 0. */}
                            {sms.kind === "otp" && sms.otpCode && otpSplit === null && (
                              <div className="rounded-[12px] bg-[#F2EFE9] p-4 text-center">
                                <p className="mb-1 text-xs font-semibold text-[#6B655C]">인증번호</p>
                                <p
                                  className="select-text font-mono text-3xl font-bold tracking-[0.25em] text-[#22303A]"
                                  aria-label={`인증번호 ${spellOutOtp(sms.otpCode)}`}
                                >
                                  {sms.otpCode}
                                </p>
                              </div>
                            )}

                            {/* 링크(D-37/AC-045 · D-101) — 실 URL이 없고, 탭하면 **기존** 인앱 가짜 랜딩으로만 전환된다(이 대화상자
                                안의 두 번째 보기). 링크라는 사실은 **밑줄·색·아이콘 세 겹**(색 단독 금지). 표시 = 가짜 주소.
                                스크린리더 이름 = 보이는 글과 같게 "링크: {가짜 주소}"(A3 — WCAG 2.5.3).
                                §51.6 R10/G317 — kind가 아니라 필드 존재로 판정한다. */}
                            {sms.linkDisplayText && !sendable && (
                              <button
                                type="button"
                                ref={(node) => {
                                  // 랜딩에서 돌아올 때 포커스를 되돌릴 자리(reviewer Major).
                                  if (node) linkButtonRefs.current.set(sms.smsId, node);
                                  else linkButtonRefs.current.delete(sms.smsId);
                                }}
                                onClick={() => openLanding(sms)}
                                aria-label={`링크: ${linkText}`}
                                className="flex min-h-[48px] items-center gap-1.5 text-left text-[17px] underline underline-offset-[3px] [overflow-wrap:anywhere]"
                                style={{ color: thread.link }}
                              >
                                <PhoneIcon name="link" size={16} className="shrink-0" />
                                {linkText}
                              </button>
                            )}
                          </div>
                          {thread.timeStyle === "beside" && clock !== null && (
                            <span className="shrink-0 pb-0.5 text-[11px]" style={{ color: thread.time }}>
                              {clock}
                            </span>
                          )}
                        </div>
                        {sendable && sendMenuSmsId === sms.smsId && (
                          <div role="menu" aria-label="계좌번호 메뉴" className="ml-1 flex gap-2">
                            <button
                              type="button"
                              role="menuitem"
                              autoFocus
                              onClick={() => {
                                setSendMenuSmsId(null);
                                // 구조화 필드가 없는 옛 계좌 문자는 문자에 보이는 예금주 · 금액 줄로 맞춘다(화면이 문자와 어긋나지 않게).
                                const holder = sms.accountHolder ?? holderFromSmsBody(sms.body);
                                const amount = sms.transferAmount ?? amountFromSmsBody(sms.body);
                                const spoken = demandAmountNow?.(sms.fakeLandingId);
                                onSendToAccount?.(sms.smsId, {
                                  bankName: sms.bankName!,
                                  accountNumber: sms.accountNumber!,
                                  ...(holder ? { holder } : {}),
                                  ...(amount ? { amount } : {}),
                                  // PR-A 판정표 R1 — 통화에서 마지막으로 말한 금액이 비교 기준(금액 칸은 문자 금액 그대로).
                                  ...(spoken ? { requestedAmount: spoken } : {}),
                                });
                              }}
                              className="min-h-[44px] rounded-full bg-white px-4 text-[15px] font-semibold text-[#22303A] shadow"
                            >
                              {BANK_APP_COPY.sendToAccount}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => setSendMenuSmsId(null)}
                              className="min-h-[44px] rounded-full bg-white px-4 text-[15px] text-[#22303A] shadow"
                            >
                              {BANK_APP_COPY.close}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* ── 보기 2: 랜딩(UX-023 재사용 — 그리는 곳은 여전히 MessengerFakeLanding 한 파일). 문자함과 **같은 대화상자
              안**이라 포커스 트랩 하나가 두 보기를 덮는다(랜딩에서는 맨 위 통화 표시줄 · 브라우저 바 "‹ 문자"로 복귀 —
              사용자 결정 2026-10-18로 랜딩 브라우저 바의 종료 버튼은 없다).
              T104(§19.4 #6) — `landingId`·`landingKind`를 함께 넘겨 상황에 맞는 화면이 뜨게 한다.
              ⛔ 이 파일은 콘텐츠를 하나도 갖지 않는다. */}
          {landing && (
            <div
              ref={landingViewRef}
              hidden={view !== "landing"}
              className={view === "landing" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
            >
              <MessengerFakeLanding
                key={landing.smsId}
                entrySurface="in-call-sms"
                skin={skin}
                title={landing.displayText}
                landingId={landing.landingId}
                landingKind={landing.landingKind}
                onHide={() => setView("thread")}
                onClose={closeLanding}
                // T123/AC-080 — 제출 **사실 하나**를 페이지로 중계한다. 인자는 이 문자의 id뿐이고
                // 참가자 입력값은 콜백 자체가 무인자라 여기까지 오지 않는다(G138).
                onCredentialSubmit={(amountComparison) => onLandingSubmitted(landing.smsId, amountComparison)}
                // §101 — 여러 화면 사이트의 단계 **사실 하나**(고정 값)를 페이지로 중계한다.
                onLandingStep={(step) => onLandingStep?.(landing.smsId, step)}
                // §101 추가 · D-115 — 이체 랜딩의 수취 계좌 칸(읽기 전용)을 이 문자의 계좌 줄로 채운다.
                prefilledAccount={landing.prefilledAccount}
                // ⭐ P2(X6) — 훈련용 이체 화면의 받는 분 · 금액 · 은행 미리 채움(참가자 입력 아님 — 어떤 콜백에도 싣지 않는다).
                prefilledTransfer={landing.prefilledTransfer && bankIdentity ? { ...landing.prefilledTransfer, ...bankIdentity } : landing.prefilledTransfer}
                // ⭐ PR-B — 앱 안 대출 신청 화면: 장부 열쇠(세션) · 가상 캐피탈 이름(이 문자 본문 — 서버가 세션 이름으로 바꿔 저장).
                loanContext={
                  landing.landingId === "loan-apply" && bankIdentity
                    ? { ledgerKey: bankIdentity.ledgerKey, lenderName: lenderNameFromSmsBody(messages.find((m) => m.smsId === landing.smsId)?.body) }
                    : undefined
                }
                // ⭐ 2026-11-07(Edge 시험 판 12) — 상품권 구매 화면의 결제 계좌 · 핀 발급 열쇠(계좌 문자가 아니라 `prefilledTransfer`가 없다).
                bankIdentity={bankIdentity}
                // ⭐ 2026-11-08(판정표 S) — 출금 예약 화면의 출금 계좌 은행 · 잔액 = 참가자가 말한 값(화면 안에서만).
                spokenAccountNow={spokenAccountNow}
                // T194-c-1(Q2) — 가짜 "권한 허용" 응낙 **사실 하나**를 페이지로 중계한다(인자 = 랜딩 id뿐 · 이 파일은 콜러블을 부르지 않는다).
                onInstallConsent={() => {
                  if (landing.landingKind === "app-install" && landing.landingId) onInstallConsent?.(landing.landingId);
                }}
              />
            </div>
          )}

          {/* ④ 하단 복귀 바(P-27 (3) 큰 복귀 버튼 유지 · UX-027 v1.33 (5)) — 실제 앱의 입력창 자리에 "통화로 돌아가기".
              2026-11-07 — 목록 · 대화방 두 보기가 함께 쓴다(랜딩 보기에서는 종전처럼 없다 — 표시줄 · 브라우저 바 "‹ 문자"로 복귀).
              ⛔ 입력창 모양을 흉내 내지 않는다(placeholder·전송 화살표·＋·카메라 0 — AC-060 · G80). 안내 줄도 0. */}
          {view !== "landing" && (
          <div
            className="shrink-0 pb-[env(safe-area-inset-bottom)]"
            style={{ backgroundColor: CALL_BAR_TOKENS.bg }}
          >
            <button
              type="button"
              onClick={requestClose}
              className="flex h-[52px] w-full items-center justify-center gap-2 text-base font-bold"
              style={{ color: CALL_BAR_TOKENS.text }}
            >
              <PhoneIcon name="accept-call" size={20} />
              통화로 돌아가기
            </button>
          </div>
          )}
        </div>
      </div>
    </>
  );
}
