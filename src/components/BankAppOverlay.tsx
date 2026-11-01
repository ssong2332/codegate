"use client";

// ⭐ BA-1 간소화안(2026-11-01 · 사용자 승인 "간소화안으로" · 규칙 표는 `@/lib/bankapp/bankApp`) — 가상 "내 은행" **송금 화면**.
// 문자 속 계좌번호 '송금' · 메신저 송금 칩이 받는 계좌를 채운 채 바로 연다: 받는 분 확인 → 금액 → 지문 인증 → 완료.
// 훈련용 홈 · 탐색 막대 · 앱 안 클립보드 · 잠금 해제 · 내 계좌 화면은 뺐다(실기기 확인 "절차가 복잡").
//
// ⚠️ **이것은 라우트가 아니라 화면 위에 겹치는 계층이다**(D-35 — 통화 중에는 `InCallSmsOverlay`와 같은 자리의 형제 노드). 호출부는
// 조건부 렌더만 하고 router.push · 상위 래퍼 · `key` 변경을 하지 않는다 — 통화 세션 · 마이크 · 타이머가 그대로 이어진다(G10).
// ⚠️ **서버 호출 0** — 기록은 호출부가 한다(인증 버튼 = 무인자 `onSubmitted` 하나 · 종전 이체 화면 제출과 같은 경로).
// 금액은 이 컴포넌트 state를 벗어나지 않는다(G138 — 콜백 인자 · 네트워크 · 저장소 0).
// ⛔ 비밀번호 · 인증번호 숫자 입력 칸 0(BA3 — 참가자가 습관대로 실제 비밀번호를 치지 않게). 인증은 버튼 하나.
// ⛔ 주소창 0 — 앱에는 주소창이 없다(설계 §3.1). 실존 은행명 · 로고 0(가상 은행명 · 자체 SVG 아이콘).
import { useEffect, useRef, useState } from "react";
import {
  BANK_APP_COPY as COPY,
  balanceError,
  balanceText,
  nextBankAppStage,
  recipientHolderFor,
  wonText,
  type BankAppAction,
  type BankAppStage,
  type TransferTarget,
} from "@/lib/bankapp/bankApp";
import { TRANSFER_LIMIT_NOTE, amountError, amountHint, transferLimitError } from "@/lib/landing/amountInput";
import { CALL_BAR_TOKENS } from "@/lib/phone/skinTokens";
import PhoneIcon from "./PhoneIcon";

type Props = {
  /** 통화 중이면 맨 위 통화 띠(탭 = 통화로 돌아가기). 통화 밖(메신저)이면 부재. */
  call?: { callerLabel: string; elapsedLabel: string };
  /** 참가자의 "내 은행"(가상 · 세션마다 결정적). */
  myBankName: string;
  /** 고정 가상 잔액(BA4 — 화면에만 · 서버 0). */
  balance: number;
  /** 받는 계좌(문자 · 칩의 구조화 필드 — 참가자 입력 아님). */
  target: TransferTarget;
  /** 앱 닫기(통화 띠 · 닫기 · 완료 확인 · Esc). */
  onClose: () => void;
  /** 인증 버튼(= 송금 완료) **사실 하나**. ⛔ 무인자 — 금액은 여기 실리지 않는다(G138). */
  onSubmitted: () => void;
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 은행 앱 색(가상 은행 · 단일 팔레트 — 실존 은행 브랜드 색을 흉내 내지 않는다). */
const APP = {
  bg: "#F4F6FA",
  card: "#FFFFFF",
  bar: "#1E3A5F",
  barText: "#FFFFFF",
  text: "#111827",
  sub: "#4B5563",
  line: "#E5E7EB",
  primary: "#1E3A5F",
  primaryText: "#FFFFFF",
  error: "#B42318",
  notice: "#EEF2F7",
} as const;

export default function BankAppOverlay({ call, myBankName, balance, target, onClose, onSubmitted }: Props) {
  const [stage, setStage] = useState<BankAppStage>("recipient");
  // G138 — 금액은 여기 state에만 있다(문자 금액은 처음 값으로만 채운다 · 고칠 수 있다).
  const [amount, setAmount] = useState(target.amount ?? "");
  const [error, setError] = useState<string | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  const go = (action: BankAppAction) => {
    setError(undefined);
    setStage(nextBankAppStage(stage, action));
  };

  // 단계가 바뀌면 그 화면 제목으로 초점을 옮긴다(스크린리더가 전환을 안다).
  useEffect(() => {
    titleRef.current?.focus();
  }, [stage]);

  // Esc = 앱 닫기 · Tab 초점 가두기(aria-modal — 닫기 컨트롤은 전부 패널 안에 있다).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submitAmount = () => {
    const message = amountError(amount) ?? transferLimitError(amount) ?? balanceError(amount, balance);
    if (message) {
      setError(message);
      return;
    }
    go("next");
  };

  const authenticate = () => {
    // S3 — 송금 완료 기록은 이 한 번뿐이다(완료 화면에서 다시 누를 버튼 0).
    onSubmitted();
    go("authenticate");
  };

  const holder = recipientHolderFor(target);
  const account = `${target.bankName} ${target.accountNumber}`;
  const amountWon = wonText(amount);

  // 통화 띠(D-35 — 통화가 살아 있다는 증거 · 탭 = 통화 복귀). 문자함과 같은 토큰.
  const callPill = call ? (
    <button
      type="button"
      onClick={onClose}
      aria-label={COPY.callPill}
      className="flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 px-4 text-[15px] font-semibold"
      style={{ backgroundColor: CALL_BAR_TOKENS.bg, color: CALL_BAR_TOKENS.text, paddingTop: "env(safe-area-inset-top)" }}
    >
      <PhoneIcon name="accept-call" size={16} />
      <span className="truncate">{call.callerLabel}</span>
      <span className="tabular-nums">{call.elapsedLabel}</span>
    </button>
  ) : null;

  const appBar = (back?: () => void) => (
    <div
      className="flex h-14 shrink-0 items-center gap-2 px-3"
      style={{ backgroundColor: APP.bar, color: APP.barText, ...(call ? null : { paddingTop: "env(safe-area-inset-top)" }) }}
    >
      {back ? (
        <button type="button" onClick={back} aria-label="뒤로" className="flex h-11 w-11 items-center justify-center">
          <PhoneIcon name="chevron-back" size={24} />
        </button>
      ) : (
        <span className="w-2" />
      )}
      <span className="min-w-0 flex-1 truncate text-base font-semibold">{myBankName} 송금</span>
      {stage !== "done" && (
        <button type="button" onClick={onClose} className="min-h-[44px] px-3 text-[15px] font-semibold">
          {COPY.close}
        </button>
      )}
    </div>
  );

  const primaryButton = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[52px] w-full rounded-[12px] text-base font-semibold"
      style={{ backgroundColor: APP.primary, color: APP.primaryText }}
    >
      {label}
    </button>
  );

  const secondaryButton = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[48px] w-full rounded-[12px] border text-base font-semibold"
      style={{ borderColor: APP.line, color: APP.text, backgroundColor: APP.card }}
    >
      {label}
    </button>
  );

  const errorLine = error ? (
    <p role="alert" className="text-[14px]" style={{ color: APP.error }}>
      {error}
    </p>
  ) : null;

  const title = (text: string) => (
    <h2 ref={titleRef} tabIndex={-1} className="text-xl font-bold leading-snug outline-none [word-break:keep-all]" style={{ color: APP.text }}>
      {text}
    </h2>
  );

  let body: React.ReactNode;
  if (stage === "recipient") {
    // ① 받는 분 확인(설계 W1 — 예금주 이름이 사기범이 말한 기관과 다른 개인 이름이다).
    body = (
      <>
        {appBar()}
        <div className="flex flex-1 flex-col gap-4 px-5 pb-6 pt-5" style={{ backgroundColor: APP.bg }}>
          {title(COPY.recipientTitle)}
          <div className="flex flex-col gap-1.5 rounded-[16px] p-5" style={{ backgroundColor: APP.card }}>
            <p className="text-[14px]" style={{ color: APP.sub }}>
              받는 분
            </p>
            <p className="text-[24px] font-bold" style={{ color: APP.text }}>
              {holder}
            </p>
            <p className="text-[15px] tabular-nums" style={{ color: APP.sub }}>
              {account}
            </p>
          </div>
          <p role="note" className="rounded-[12px] px-4 py-3 text-[14px] leading-relaxed" style={{ backgroundColor: APP.notice, color: APP.sub }}>
            {COPY.recipientNote}
          </p>
          <div className="mt-auto flex flex-col gap-2">
            {primaryButton(COPY.next, () => go("next"))}
            {secondaryButton(COPY.cancel, onClose)}
          </div>
        </div>
      </>
    );
  } else if (stage === "amount") {
    // ② 금액 · 1회 한도 · 출금 가능 금액(잔액은 이 한 줄뿐).
    const hint = amountHint(amount);
    body = (
      <>
        {appBar(() => go("back"))}
        <div className="flex flex-1 flex-col gap-4 px-5 pb-6 pt-5" style={{ backgroundColor: APP.bg }}>
          {title(COPY.amountTitle)}
          <p className="text-[15px]" style={{ color: APP.sub }}>
            {holder} · {account}
          </p>
          <label className="flex flex-col gap-1.5 text-[15px]" style={{ color: APP.sub }}>
            보낼 금액
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d,]/g, ""))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="금액 입력"
              className="min-h-[56px] rounded-[12px] border px-3 text-[22px] font-semibold tabular-nums"
              style={{ borderColor: APP.line, backgroundColor: APP.card, color: APP.text }}
            />
          </label>
          {hint && (
            <p className="text-[15px]" style={{ color: APP.text }}>
              {hint}
            </p>
          )}
          <p className="text-[14px]" style={{ color: APP.sub }}>
            {COPY.balanceLabel} {balanceText(balance)} · {TRANSFER_LIMIT_NOTE}
          </p>
          {errorLine}
          <div className="mt-auto">{primaryButton(COPY.next, submitAmount)}</div>
        </div>
      </>
    );
  } else if (stage === "auth") {
    // ③ 보낼 내용 요약 + 지문 인증(버튼 하나 · 입력 칸 0). 제출 전 확인 화면이라 G255(완료 화면 되비추기) 밖이다.
    const rows: [string, string][] = [
      ["받는 분", holder],
      ["받는 계좌", account],
      ["보내는 금액", amountWon],
      ["수수료", "면제"],
    ];
    body = (
      <>
        {appBar()}
        <div className="flex flex-1 flex-col gap-4 px-5 pb-6 pt-5" style={{ backgroundColor: APP.bg }}>
          {title(`${holder}님께 ${amountWon}을 보낼까요?`)}
          <dl className="flex flex-col divide-y rounded-[12px] border" style={{ borderColor: APP.line, backgroundColor: APP.card }}>
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 px-4 py-3 text-[15px]" style={{ borderColor: APP.line }}>
                <dt style={{ color: APP.sub }}>{label}</dt>
                <dd className="break-all text-right font-semibold" style={{ color: APP.text }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p role="note" className="rounded-[12px] px-4 py-3 text-[14px] leading-relaxed" style={{ backgroundColor: APP.notice, color: APP.sub }}>
            {COPY.confirmCaution}
          </p>
          <p className="text-[15px]" style={{ color: APP.sub }}>
            {COPY.authBody}
          </p>
          <div className="mt-auto flex flex-col gap-2">
            {primaryButton(COPY.authButton, authenticate)}
            {secondaryButton(COPY.cancel, () => go("cancel"))}
          </div>
        </div>
      </>
    );
  } else {
    // ④ 완료(BA5 — 받는 분 · 금액 재표시 허용 · 값은 이 state뿐 · 서버 0). 참가자가 이 화면을 캡처할 수 있다.
    body = (
      <>
        {appBar()}
        <div className="flex flex-1 flex-col items-center gap-4 px-5 pb-6 pt-12 text-center" style={{ backgroundColor: APP.bg }}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: APP.primary, color: APP.primaryText }} aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          {title(`${holder}님께 ${amountWon}을 보냈어요`)}
          <p className="text-[15px] tabular-nums" style={{ color: APP.sub }}>
            {account}
          </p>
          <div className="mt-auto w-full">{primaryButton(COPY.doneButton, onClose)}</div>
        </div>
      </>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${myBankName} 송금`}
      className="fixed inset-0 z-50 mx-auto flex h-dvh w-full max-w-[430px] flex-col"
      style={{ backgroundColor: APP.bg }}
    >
      {callPill}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]">{body}</div>
    </div>
  );
}
