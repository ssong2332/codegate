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
// ⚠️ **AC-006**: 포커스 트랩이 통화 셸 하단의 종료 버튼을 가두므로, 이 오버레이 **안에** 자체
// "훈련 종료"를 둔다(선례: MessengerFakeLanding). 트랩을 푸는 방식은 쓰지 않는다.
// 표식(AC-022)·종료(AC-006)는 스크롤과 무관한 `shrink-0` 헤더에 남는다 — 말풍선 스레드 안으로
// 넣어 함께 스크롤되게 만들지 않는다(§23.4).
//
// ⚠️ **퇴장 연출은 이 컴포넌트 내부 상태로만 처리한다**(§23.6 A4 / G89) — 호출부에 두 번째 상태를
// 만들어 언마운트를 지연시키면 **한도 도달 시 종료 고지가 연출 시간만큼 가려진다**(AC-059).
// 호출부가 `setSmsOverlayOpen(false)`를 부르는 경로(한도 자동 종료·훈련 종료)는 이 상태를 거치지
// 않고 **즉시 언마운트**된다(§23.6 A5).
import { useCallback, useEffect, useRef, useState } from "react";
import EndTrainingButton from "./EndTrainingButton";
import MessengerFakeLanding from "./MessengerFakeLanding";
import SyntheticLabel from "./SyntheticLabel";
import { sortByArrival, spellOutOtp, takeNewlyVisibleSmsIds, type InCallSmsView } from "@/lib/incallsms";
import { runExitSequence } from "@/lib/incallsms/closeSequence";

type InCallSmsOverlayProps = {
  messages: InCallSmsView[];
  /** 통화가 살아 있다는 증거(P-20/P-27) — 통화 필의 발신자 표기. */
  callerLabel: string;
  elapsedLabel: string;
  /**
   * 통화 필에 이어 붙이는 **최신 사기범 자막**(P-27 (2) ④ · OQ-U27 (a)).
   * 문자함이 전면이 되면 통화 셸의 자막이 시각에서 사라지므로, 자막을 필로 옮기지 않으면
   * *"사기범 음성 대사는 항상 자막 동시 제공"* 규약이 깨진다(청각 접근성 회귀).
   * ⛔ **참가자 턴은 오지 않는다** — 호출부가 `role === "scammer"` 턴만 넣는다(G79/G93:
   * 참가자가 말한 계좌·생년월일이 마스킹 없이 화면에 남는 것을 막는 **안전 조건**이다).
   */
  scammerCaption?: string | null;
  onClose: () => void;
  onEndTraining: () => void;
  /** 문자를 열어본 시각 기록(fire-and-forget — 실패해도 훈련을 막지 않는다). */
  onOpened: (smsId: string) => void;
  /** 링크 칩 탭 기록. */
  onLinkTapped: (smsId: string) => void;
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
  scammerCaption,
  onClose,
  onEndTraining,
  onOpened,
  onLinkTapped,
}: InCallSmsOverlayProps) {
  const sorted = sortByArrival(messages);
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
  const [fakeLanding, setFakeLanding] = useState<{
    smsId: string;
    displayText: string;
    landingId?: string;
    landingKind?: "credential-form" | "app-install";
  } | null>(null);

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

  // Esc 닫기 + 포커스 트랩(AC-006 — 트랩 안에 "훈련 종료"가 포함돼 있어 종료는 항상 도달 가능).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
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
  }, [requestClose]);

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="통화 중 도착한 문자 — 훈련용 모의 문자함"
        className={`fixed inset-0 z-40 flex items-stretch justify-center bg-black/55 ${
          closing ? "sms-dim-exit" : "sms-dim-enter"
        }`}
      >
        {/* 바깥 탭으로 닫기(UX-027 Exit). 세 브레이크포인트 전부에서 문자함이 주 표면이라
            "뒤의 통화 셸이 주변에 보인다"는 v1.11 규칙은 v1.13 Responsive 노트로 대체됐다 —
            통화가 살아 있다는 신호는 이제 상단 통화 필이 상시·실시간으로 맡는다. */}
        <button
          type="button"
          aria-label="문자 닫고 통화로 돌아가기"
          onClick={requestClose}
          className="absolute inset-0 h-full w-full cursor-default"
          tabIndex={-1}
        />

        {/* 폰 폭 단일 컬럼 · 세 브레이크포인트 동일 규칙(Responsive v1.13 — 데스크톱에서도 폰 폭
            컨테이너 중앙 정렬, 메신저 셸 UX-022와 같은 규칙). 브레이크포인트마다 갈리던 모서리·
            여백 이중 규칙(`sm:rounded-[20px]` 등)을 두지 않는다(D-57 ㄹ). */}
        <div
          ref={panelRef}
          className={`relative mx-auto flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-[#FAF8F5] ${
            closing ? "sms-surface-exit" : "sms-surface-enter"
          }`}
        >
          <p aria-live="polite" className="sr-only">
            {entryNotice}
          </p>

          {/* ── 통화 필(P-27 (2)) — 스크롤·목록 길이와 무관하게 상단 고정. 5요소를 모두 담는다:
              ① 상대 표기 ② 초 단위로 도는 경과 시간 ③ "통화 중" **텍스트**(색·아이콘 단독 금지)
              ④ 최신 사기범 자막(aria-live, 2줄 클램프) ⑤ 탭 = 통화 복귀.
              ⛔ 발신자는 호출부가 이미 계산해 넘긴 `callerLabel` prop **하나만** 읽는다(G87/§23.7
              C1·C2) — `scenario`·`verifyOffer`·`reconnectedCallerLabel`을 직접 참조하지 않는다.
              아래 스레드의 발신번호(`senderLabel`)는 **문자의 발신자**이고 통화 발신자와 다른 값이
              정상이다 — 두 값을 섞지 않는다(§23.7 C3). */}
          <button
            type="button"
            onClick={requestClose}
            className="flex min-h-[48px] shrink-0 items-center justify-between gap-3 bg-[#22303A] px-4 py-2.5 text-left text-white"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{callerLabel}</span>
              <span className="block text-xs text-[#C9D4DB]">통화 중 · 경과 {elapsedLabel}</span>
              {scammerCaption ? (
                <span
                  aria-live="polite"
                  className="mt-1 line-clamp-2 block text-xs leading-snug text-[#E4EAEE]"
                >
                  “{scammerCaption}”
                </span>
              ) : null}
            </span>
            <span className="shrink-0 rounded-full bg-[#41525E] px-2.5 py-1 text-xs font-semibold text-[#C9D4DB]">
              통화로
            </span>
            <span className="sr-only">눌러서 통화로 돌아가기</span>
          </button>

          {/* ── 상시 표식(AC-022) + 상시 종료(AC-006). 스크롤과 무관하게 항상 보인다. */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#E2DDD3] bg-white px-4 py-3">
            <SyntheticLabel label="AI 훈련용 모의 문자" />
            <EndTrainingButton onClick={onEndTraining} />
          </div>

          {/* ── 말풍선 스레드(D-57 ㄴ) — 아코디언 카드·▼/▲ 토글을 없애 탭 1회가 줄어든다.
              ⚠️ 상단 설명 문단("통화는 그대로 연결돼 있습니다…")은 제거했다(D-57 ㄷ) — 그 사실은
              위 통화 필이 상시·실시간으로 증명한다. 제목은 스크린리더용 접근 이름으로만 남긴다. */}
          <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4">
            <h2 ref={titleRef} tabIndex={-1} className="sr-only outline-none">
              문자 메시지
            </h2>

            {sorted.length === 0 ? (
              // Empty — 진입점이 없어 보통은 열리지 않지만, 예외적 진입 시 명시한다(UX-027 States).
              <p role="status" className="rounded-[14px] bg-white p-5 text-base text-[#6B655C]">
                아직 도착한 문자가 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {sorted.map((sms, index) => {
                  // 발신번호는 스레드 헤더로 한 번만 — 같은 번호가 이어지면 반복하지 않는다
                  // (실제 문자앱의 묶음 표시). 색이 아니라 **텍스트 라벨**로 구분한다.
                  const showSender = index === 0 || sorted[index - 1].senderLabel !== sms.senderLabel;
                  return (
                    <li
                      key={sms.smsId}
                      data-sms-id={sms.smsId}
                      ref={(node) => {
                        // 열람 판정 대상 등록. 언마운트 시 지워 관측자가 죽은 노드를 붙들지 않게 한다.
                        if (node) bubbleRefs.current.set(sms.smsId, node);
                        else bubbleRefs.current.delete(sms.smsId);
                      }}
                      className="flex flex-col items-start gap-1.5"
                    >
                      {showSender && (
                        <p className="font-mono text-xs font-semibold text-[#6B655C]">
                          {sms.senderLabel}
                        </p>
                      )}

                      {/* 수신 말풍선 — 링크 칩·인증번호 블록은 말풍선 **안**에 들어간다(D-57 ㄴ). */}
                      <div className="flex max-w-[92%] flex-col gap-3 rounded-[18px] rounded-tl-[6px] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(34,48,58,0.08)]">
                        <p className="whitespace-pre-line text-base leading-relaxed text-[#22303A]">
                          {sms.body}
                        </p>

                        {/* 인증번호형(D-38/AC-061) — 6자리 모의 코드를 실제로 보여준다.
                            ⚠️ **자동 클립보드 복사·자동 전송을 하지 않는다**(AC-061) — 앱이
                            "복사해서 붙여 넣는" 실행 동선을 대신 만들어 주지 않는다. 사용자가
                            길게 눌러 직접 선택할 수는 있다(브라우저 기본 동작, select-text). */}
                        {sms.kind === "otp" && sms.otpCode && (
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

                        {/* 링크형(D-37/AC-045) — 실 URL이 없고, 탭하면 **기존** 인앱 가짜 랜딩으로만
                            전환된다. 신규 랜딩을 만들지 않는다. 스크린리더에는 "모의 링크"로 안내. */}
                        {sms.kind === "link" && sms.linkDisplayText && (
                          <button
                            type="button"
                            onClick={() => {
                              onLinkTapped(sms.smsId);
                              setFakeLanding({
                                smsId: sms.smsId,
                                displayText: sms.linkDisplayText ?? "",
                                landingId: sms.fakeLandingId,
                                landingKind: sms.landingKind,
                              });
                            }}
                            aria-label={`모의 링크: ${sms.linkDisplayText}`}
                            className="flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[#0E6B62] bg-[#E4F0EC] px-4 py-2 text-sm font-bold text-[#0E6B62] underline decoration-2 underline-offset-2"
                          >
                            <span aria-hidden="true">🔗</span>
                            {sms.linkDisplayText}
                            <span className="rounded-full bg-[#0E6B62] px-2 py-0.5 text-xs font-bold text-white">
                              모의
                            </span>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 큰 복귀 버튼은 **유지**한다(P-27 (3)) — 필은 어르신 기준 작은 보조 컨트롤이라
              큰 1차 동선을 대체할 수 없다. 자리·문구 무변경. */}
          <div className="shrink-0 border-t border-[#E2DDD3] bg-white px-4 py-3">
            <button
              type="button"
              onClick={requestClose}
              className="min-h-[52px] w-full rounded-[14px] bg-[#0E6B62] text-base font-bold text-white"
            >
              통화로 돌아가기
            </button>
          </div>
        </div>
      </div>

      {/* UX-023 재사용(무개정) — 닫으면 이 문자 오버레이로 복귀하고, 거기서 다시 통화로 돌아간다.
          "훈련 종료"는 가짜 랜딩 안에서도 그대로 도달 가능하다(AC-006).
          T104(§19.4 #6) — `landingId`·`landingKind`를 함께 넘겨 **상황에 맞는 화면**이 뜨게 한다.
          ⛔ 이 파일은 콘텐츠를 하나도 갖지 않는다(그리는 곳은 여전히 MessengerFakeLanding 한 파일). */}
      {fakeLanding && (
        <MessengerFakeLanding
          title={fakeLanding.displayText}
          landingId={fakeLanding.landingId}
          landingKind={fakeLanding.landingKind}
          onClose={() => setFakeLanding(null)}
          onEndTraining={onEndTraining}
        />
      )}
    </>
  );
}
