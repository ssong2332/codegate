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
import PhoneIcon from "./PhoneIcon";
import {
  formatSmsClock,
  needsTimeSeparator,
  prefilledAccountOf,
  sortByArrival,
  spellOutOtp,
  splitBodyAtOtp,
  takeNewlyVisibleSmsIds,
  threadHeaderLabel,
  type InCallSmsView,
} from "@/lib/incallsms";
import { runExitSequence } from "@/lib/incallsms/closeSequence";
import { CALL_BAR_TOKENS, smsThreadTokensFor } from "@/lib/phone/skinTokens";
import type { MessengerSkin } from "@/lib/messenger/detectSkin";

type InCallSmsOverlayProps = {
  messages: InCallSmsView[];
  /** 통화가 살아 있다는 증거(P-20/P-27) — 통화 필의 발신자 표기. */
  callerLabel: string;
  elapsedLabel: string;
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
   * ⛔ 인자는 `smsId` 하나다 — 참가자 입력값은 이 경로에 실리지 않는다(G138/AC-045).
   */
  onLandingSubmitted: (smsId: string) => void;
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
  onClose,
  onOpened,
  onLinkTapped,
  onLandingSubmitted,
  onLandingStep,
  onInstallShown,
  onInstallConsent,
  skin = "default",
}: InCallSmsOverlayProps) {
  const sorted = sortByArrival(messages);
  const thread = smsThreadTokensFor(skin);
  // UX-027 v1.33 (3) — 모두 같은 발신처면 헤더에 그 값, 섞이면 "메시지" + 말풍선마다 발신처(D-89).
  const headerLabel = threadHeaderLabel(sorted);
  const mixedSenders = sorted.length > 0 && sorted.some((sms) => sms.senderLabel !== sorted[0].senderLabel);
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
  } | null>(null);
  const [view, setView] = useState<"thread" | "landing">("thread");
  // ⭐ reviewer Major(포커스) — 보기 전환 때 포커스가 `hidden`이 된 요소와 함께 body로 떨어지지 않게 한다.
  // 랜딩으로 가면 랜딩 영역(`role="region"` · 이름 "{제목} 화면")으로 옮겨 스크린리더가 그 이름을 읽어 전환을 안다
  // (세션 중 새 문구 0 — AC-093 (e) · 기존 이름 A5를 쓴다). 스레드로 돌아오면 그 랜딩을 연 **링크 버튼**으로 되돌린다.
  const landingViewRef = useRef<HTMLDivElement | null>(null);
  const linkButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusSmsIdRef = useRef<string | null>(null);
  const previousViewRef = useRef<"thread" | "landing">("thread");

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
    titleRef.current?.focus();
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
  const threadIds = sorted.map((sms) => sms.smsId).join(",");
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
        if (view === "landing") setView("thread");
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
    const smsId = returnFocusSmsIdRef.current;
    const trigger = smsId ? linkButtonRefs.current.get(smsId) : undefined;
    if (trigger) trigger.focus();
    else titleRef.current?.focus();
  }, [view]);


  const openLanding = (sms: InCallSmsView) => {
    onLinkTapped(sms.smsId);
    // T194-c-1(Q2) — 설치 화면이 열리는 순간을 페이지로 중계한다(서버가 `shown`을 최초 1회만 세팅 — 다시 열어도 멱등).
    if (sms.landingKind === "app-install" && sms.fakeLandingId) onInstallShown?.(sms.fakeLandingId);
    returnFocusSmsIdRef.current = sms.smsId;
    // D-94 — 같은 문자의 랜딩이 이미 있으면 그대로 다시 보인다(입력값 유지). 다르면 교체(새 마운트).
    setLanding((current) =>
      current && current.smsId === sms.smsId
        ? current
        : {
            smsId: sms.smsId,
            displayText: sms.linkDisplayText ?? "",
            landingId: sms.fakeLandingId,
            landingKind: sms.landingKind,
            prefilledAccount: prefilledAccountOf(sms),
          },
    );
    setView("landing");
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

          {/* ── 보기 1: 문자 스레드(UX-027 v1.33 (1)~(5)). 랜딩을 보는 동안 `hidden`(접근성 트리·포커스 밖 — G460). */}
          <div
            hidden={view !== "thread"}
            className={view === "thread" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
          >
            {/* ② 대화 헤더(D-89) — 왼쪽 뒤로(= 통화 복귀) · 발신자(iOS형 가운데 · One UI형 왼쪽).
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
                onClick={requestClose}
                aria-label="통화로 돌아가기"
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

              {sorted.length === 0 ? (
                // Empty — §114(UX D-152) 이후 메시지 버튼이 처음부터 활성이라 첫 문자 전에 누르면 이 상태가 보인다(UX-027 States).
                <p role="status" className="rounded-[14px] bg-white p-5 text-base text-[#5F6368]">
                  아직 도착한 문자가 없습니다.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sorted.map((sms, index) => {
                    const previous = index > 0 ? sorted[index - 1] : null;
                    const clock = formatSmsClock(sms.arrivedAtMs);
                    const showSeparator =
                      thread.timeStyle === "separator" &&
                      clock !== null &&
                      needsTimeSeparator(previous ? previous.arrivedAtMs : null, sms.arrivedAtMs);
                    // 발신처가 섞였을 때만 말풍선 위에 다시 보인다(같은 발신처가 이어지면 반복하지 않는다 — D-89).
                    const showSender =
                      mixedSenders && (previous === null || previous.senderLabel !== sms.senderLabel);
                    // D-90 · G459 — 본문 안 인증번호를 **정확 일치 첫 1회**로 감싼다. null이면 박스 폴백.
                    const otpSplit = sms.otpCode ? splitBodyAtOtp(sms.body, sms.otpCode) : null;
                    // D-101 — 링크 줄 = 가짜 주소(부재 = 옛 문서 → 표시 텍스트).
                    const linkText = sms.linkAddress ?? sms.linkDisplayText;
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
                        {showSender && (
                          <p className="ml-1 mt-1.5 text-sm font-semibold" style={{ color: thread.headerText }}>
                            {sms.senderLabel}
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
                            {sms.linkDisplayText && (
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ④ 하단 복귀 바(P-27 (3) 큰 복귀 버튼 유지 · UX-027 v1.33 (5)) — 실제 앱의 입력창 자리에 "통화로 돌아가기".
                ⛔ 입력창 모양을 흉내 내지 않는다(placeholder·전송 화살표·＋·카메라 0 — AC-060 · G80). 안내 줄도 0. */}
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
                onCredentialSubmit={() => onLandingSubmitted(landing.smsId)}
                // §101 — 여러 화면 사이트의 단계 **사실 하나**(고정 값)를 페이지로 중계한다.
                onLandingStep={(step) => onLandingStep?.(landing.smsId, step)}
                // §101 추가 · D-115 — 이체 랜딩의 수취 계좌 칸(읽기 전용)을 이 문자의 계좌 줄로 채운다.
                prefilledAccount={landing.prefilledAccount}
                // T194-c-1(Q2) — 가짜 "권한 허용" 응낙 **사실 하나**를 페이지로 중계한다(인자 = 랜딩 id뿐 · 이 파일은 콜러블을 부르지 않는다).
                onInstallConsent={() => {
                  if (landing.landingKind === "app-install" && landing.landingId) onInstallConsent?.(landing.landingId);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
