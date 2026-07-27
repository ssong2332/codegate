"use client";

// UX-027 통화 중 문자(SMS) 오버레이 — 인앱 문자함 (T68, UF-008, D-35~D-38, AC-059/060/061).
//
// ⚠️ **이것은 라우트가 아니라 통화 화면(UX-014) 위에 겹치는 계층이다**(D-35, 이 기능의 전부).
// `/session/play`와 `/session/messenger`가 별도 라우트라 이동하면 통화 컴포넌트가 언마운트되어
// 실시간 세션·마이크·타이머가 끊긴다 — 그래서 호출부(session/play/page.tsx)는 이 컴포넌트를
// 세션 컴포넌트의 **형제 노드로 조건부 렌더**하며, early return·래퍼 추가·router.push를 하지 않는다.
//
// ⚠️ **읽기 전용(AC-060)**: 답장·전달·전송 UI가 없고, 이 파일은 전송 계열 API를 import하지 않는다.
// 링크는 `linkDisplayText`(모의 표기) + `fakeLandingId`로만 표현되며 **실 URL 필드가 없다** —
// 탭하면 기존 인앱 가짜 랜딩(UX-023 `MessengerFakeLanding`)으로만 전환된다(AC-032/045, D-37).
//
// ⚠️ **AC-006**: 포커스 트랩이 통화 셸 하단의 종료 버튼을 가두므로, 이 오버레이 **안에** 자체
// "훈련 종료"를 둔다(선례: MessengerFakeLanding). 트랩을 푸는 방식은 쓰지 않는다.
import { useEffect, useRef, useState } from "react";
import EndTrainingButton from "./EndTrainingButton";
import MessengerFakeLanding from "./MessengerFakeLanding";
import SyntheticLabel from "./SyntheticLabel";
import { latestSmsId, sortByArrival, spellOutOtp, type InCallSmsView } from "@/lib/incallsms";

type InCallSmsOverlayProps = {
  messages: InCallSmsView[];
  /** 통화가 살아 있다는 증거(P-20) — 발신자 라벨과 경과 시간을 오버레이 위에 계속 보여준다. */
  callerLabel: string;
  elapsedLabel: string;
  onClose: () => void;
  onEndTraining: () => void;
  /** 문자를 열어본 시각 기록(fire-and-forget — 실패해도 훈련을 막지 않는다). */
  onOpened: (smsId: string) => void;
  /** 링크 칩 탭 기록. */
  onLinkTapped: (smsId: string) => void;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function InCallSmsOverlay({
  messages,
  callerLabel,
  elapsedLabel,
  onClose,
  onEndTraining,
  onOpened,
  onLinkTapped,
}: InCallSmsOverlayProps) {
  const sorted = sortByArrival(messages);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(() => latestSmsId(messages));
  // T104 — 상황별 랜딩을 열려면 `fakeLandingId`(조회 키)와 서버가 확정한 `landingKind`가 함께
  // 필요하다. 둘 다 문자 문서에서 온 값이며 **클라가 문자열로 분류하지 않는다**(§15.9.1 R3/R8).
  const [fakeLanding, setFakeLanding] = useState<{
    smsId: string;
    displayText: string;
    landingId?: string;
    landingKind?: "credential-form" | "app-install";
  } | null>(null);

  // 열릴 때 포커스를 오버레이 제목으로 이동한다(UX-027 Focus Order). 닫을 때의 복귀는 호출부가
  // 직전 트리거(배너/"문자함" 버튼)로 되돌린다.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // 기본 펼침 = 가장 최근 도착 건. 오버레이가 열려 있는 동안 새 문자가 도착하면 그쪽으로 옮긴다.
  // 인라인 async IIFE로 감싼다(react-hooks/set-state-in-effect 회피 — 이 코드베이스의 관례).
  const newestId = latestSmsId(messages);
  useEffect(() => {
    (async () => {
      if (newestId) setExpandedId(newestId);
    })();
  }, [newestId]);

  // 펼쳐진 문자는 "열어봤다"로 기록한다(UX-027 Data Operations Update). 서버가 최초 1회만 세팅한다.
  useEffect(() => {
    if (expandedId) onOpened(expandedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  // Esc 닫기 + 포커스 트랩(AC-006 — 트랩 안에 "훈련 종료"가 포함돼 있어 종료는 항상 도달 가능).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
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
  }, [onClose]);

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="통화 중 도착한 문자 — 훈련용 모의 문자함"
        className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/55 sm:items-center sm:p-6"
      >
        {/* 바깥 탭으로 닫기(UX-027 Exit). 데스크톱/태블릿에서는 뒤의 통화 셸(타이머·발신자)이
            주변에 보여 "통화가 살아 있다"는 신호가 시각적으로 강화된다(Responsive Rules). */}
        <button
          type="button"
          aria-label="문자 닫고 통화로 돌아가기"
          onClick={onClose}
          className="absolute inset-0 h-full w-full cursor-default"
          tabIndex={-1}
        />

        <div
          ref={panelRef}
          className="relative flex h-full w-full flex-col overflow-hidden bg-[#FAF8F5] sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-[20px] sm:shadow-2xl"
        >
          {/* ── 통화 축소 바(P-20) — 모바일 전체화면 시트에서도 통화가 끊기지 않았음을 상시 보여준다.
              색·아이콘 단독이 아니라 **텍스트로도** 안내한다("통화 연결 중 · 경과 1:12"). */}
          <div className="flex shrink-0 items-center justify-between gap-3 bg-[#22303A] px-4 py-2.5 text-white">
            <p className="min-w-0 text-sm leading-tight">
              <span className="block truncate font-semibold">{callerLabel}</span>
              <span role="status" className="block text-xs text-[#C9D4DB]">
                통화 연결 중 · 경과 {elapsedLabel}
              </span>
            </p>
            <span className="shrink-0 rounded-full bg-[#41525E] px-2.5 py-1 text-xs font-semibold text-[#C9D4DB]">
              통화 중
            </span>
          </div>

          {/* ── 상시 표식(AC-022) + 상시 종료(AC-006). 스크롤과 무관하게 항상 보인다. */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#E2DDD3] bg-white px-4 py-3">
            <SyntheticLabel label="AI 훈련용 모의 문자" />
            <EndTrainingButton onClick={onEndTraining} />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <h2
              ref={titleRef}
              tabIndex={-1}
              className="mb-1 text-xl font-bold text-[#22303A] outline-none"
            >
              문자 메시지
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-[#6B655C]">
              통화는 그대로 연결돼 있습니다. 문자를 확인한 뒤 &ldquo;통화로 돌아가기&rdquo;를 누르면
              같은 통화가 이어집니다.
            </p>

            {sorted.length === 0 ? (
              // Empty — 진입점이 없어 보통은 열리지 않지만, 예외적 진입 시 명시한다(UX-027 States).
              <p role="status" className="rounded-[14px] bg-white p-5 text-base text-[#6B655C]">
                아직 도착한 문자가 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {sorted.map((sms) => {
                  const expanded = expandedId === sms.smsId;
                  return (
                    <li
                      key={sms.smsId}
                      className="overflow-hidden rounded-[14px] border-[1.5px] border-[#E2DDD3] bg-white"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : sms.smsId)}
                        aria-expanded={expanded}
                        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span className="min-w-0">
                          <span className="block font-mono text-sm font-semibold text-[#22303A]">
                            {sms.senderLabel}
                          </span>
                          <span className="block truncate text-sm text-[#6B655C]">
                            {sms.body.split("\n")[0]}
                          </span>
                        </span>
                        <span aria-hidden="true" className="shrink-0 text-[#6B655C]">
                          {expanded ? "▲" : "▼"}
                        </span>
                      </button>

                      {expanded && (
                        <div className="flex flex-col gap-3 border-t border-[#E2DDD3] px-4 py-4">
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
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-[#E2DDD3] bg-white px-4 py-3">
            <button
              type="button"
              onClick={onClose}
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
