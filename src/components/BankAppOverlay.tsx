"use client";

// ⭐ BA-1(2026-11-01 · docs/research/in-service-bank-app-design-2026-11-01.md §2 · 사용자 결정 BA0~BA12 "권고대로") — 통화 중 **훈련용 홈 화면 +
// 가상 "내 은행 앱"**(B0~B7). 순수 규칙은 `@/lib/bankapp/bankApp`에 있다.
//
// ⚠️ **이것은 라우트가 아니라 통화 화면 위에 겹치는 계층이다**(D-35 — `InCallSmsOverlay`와 같은 자리의 형제 노드). 호출부(session/play/page.tsx)는
// 조건부 렌더만 하고 router.push · 상위 래퍼 · `key` 변경을 하지 않는다 — 통화 세션 · 마이크 · 타이머가 그대로 이어진다(G10).
// ⚠️ **서버 호출 0 · 기록 0**(BA-1). 받는 계좌 · 금액은 이 컴포넌트 state를 벗어나지 않는다(G138 — 콜백 인자 · 네트워크 · 저장소 0).
// ⛔ 비밀번호 · 인증번호 숫자 입력 칸 0(BA3 — 참가자가 습관대로 실제 비밀번호를 치지 않게). 잠금 해제 · 인증은 버튼 하나.
// ⛔ 주소창 0 — 앱에는 주소창이 없다(설계 §3.1). 실존 은행명 · 로고 0(가상 은행명 · 자체 SVG 아이콘).
import { useEffect, useRef, useState } from "react";
import {
  BANK_APP_COPY as COPY,
  FICTIONAL_BANK_NAMES,
  accountNumberError,
  balanceError,
  balanceText,
  myAccountLabelFor,
  nextBankAppStage,
  normalizeAccountNumber,
  recipientHolderFor,
  wonText,
  type BankAppAction,
  type BankAppStage,
  type CopiedAccount,
} from "@/lib/bankapp/bankApp";
import { TRANSFER_LIMIT_NOTE, amountError, amountHint, transferLimitError } from "@/lib/landing/amountInput";
import { CALL_BAR_TOKENS } from "@/lib/phone/skinTokens";
import PhoneIcon from "./PhoneIcon";

type Props = {
  /** 통화 화면 스킨이 iOS형인가(홈 화면 · 홈 막대 모양만 갈린다 — iOS형 · One UI형). */
  ios: boolean;
  callerLabel: string;
  elapsedLabel: string;
  /** 참가자의 "내 은행"(가상 · 세션마다 결정적). */
  myBankName: string;
  /** 고정 가상 잔액(BA4 — 화면에만 · 서버 0). */
  balance: number;
  /** 내 계좌 표기 · 받는 분 이름 결정의 씨앗(세션 id). */
  seed: string;
  /** 문자에서 복사해 둔 계좌(부재 = 붙여넣기 줄 0). */
  copiedAccount: CopiedAccount | null;
  /** 통화로 돌아가기(통화 필 · 홈의 전화 아이콘 · Esc). */
  onClose: () => void;
  /** 홈의 메시지 아이콘 = 통화 중 문자함. */
  onOpenMessages: () => void;
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

export default function BankAppOverlay({
  ios,
  callerLabel,
  elapsedLabel,
  myBankName,
  balance,
  seed,
  copiedAccount,
  onClose,
  onOpenMessages,
}: Props) {
  const [stage, setStage] = useState<BankAppStage>("home");
  // G138 — 입력값은 여기 state에만 있다(콜백 · 네트워크 · 저장소에 싣지 않는다).
  const [bank, setBank] = useState<string>("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  const go = (action: BankAppAction) => {
    setError(undefined);
    const next = nextBankAppStage(stage, action);
    if (stage === "done" && next === "account") {
      // S9 — 새 이체(앞 입력값 폐기).
      setBank("");
      setAccount("");
      setAmount("");
    }
    setStage(next);
  };

  // 단계가 바뀌면 그 화면 제목으로 초점을 옮긴다(스크린리더가 전환을 안다).
  useEffect(() => {
    titleRef.current?.focus();
  }, [stage]);

  // Esc = 통화로 돌아가기 · Tab 초점 가두기(aria-modal — 복귀 컨트롤은 전부 패널 안에 있다).
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

  const paste = () => {
    if (!copiedAccount) return;
    setBank(copiedAccount.bankName);
    setAccount(copiedAccount.accountNumber);
    setError(undefined);
  };

  const submitRecipient = () => {
    if (!bank) {
      setError("받는 분 은행을 골라 주세요.");
      return;
    }
    const message = accountNumberError(account);
    if (message) {
      setError(message);
      return;
    }
    go("next");
  };

  const submitAmount = () => {
    const message = amountError(amount) ?? transferLimitError(amount) ?? balanceError(amount, balance);
    if (message) {
      setError(message);
      return;
    }
    go("next");
  };

  const holder = recipientHolderFor(account, copiedAccount);
  const amountWon = wonText(amount);

  // 통화 필(D-35 — 통화가 살아 있다는 증거 · 탭 = 통화 복귀). 문자함과 같은 토큰.
  const callPill = (
    <button
      type="button"
      onClick={onClose}
      aria-label={COPY.callPill}
      className="flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 px-4 text-[15px] font-semibold"
      style={{ backgroundColor: CALL_BAR_TOKENS.bg, color: CALL_BAR_TOKENS.text, paddingTop: "env(safe-area-inset-top)" }}
    >
      <PhoneIcon name="accept-call" size={16} />
      <span className="truncate">{callerLabel}</span>
      <span className="tabular-nums">{elapsedLabel}</span>
    </button>
  );

  const appBar = (title: string, back?: () => void) => (
    <div className="flex h-14 shrink-0 items-center gap-2 px-3" style={{ backgroundColor: APP.bar, color: APP.barText }}>
      {back ? (
        <button type="button" onClick={back} aria-label="뒤로" className="flex h-11 w-11 items-center justify-center">
          <PhoneIcon name="chevron-back" size={24} />
        </button>
      ) : (
        <span className="w-2" />
      )}
      <span className="truncate text-base font-semibold">{title}</span>
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
  if (stage === "home") {
    // B0 — 훈련용 홈 화면. 은행 앱 · 메시지 · 전화만 동작하고 그 밖 아이콘은 그림뿐이다(누름 대상 0 — 초점도 받지 않는다).
    const icon = (label: string, glyph: React.ReactNode, color: string, onClick?: () => void) => {
      const tile = (
        <span
          className={`flex h-[60px] w-[60px] items-center justify-center ${ios ? "rounded-[16px]" : "rounded-full"}`}
          style={{ backgroundColor: color, color: "#FFFFFF" }}
        >
          {glyph}
        </span>
      );
      return onClick ? (
        <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 text-[13px]" style={{ color: "#FFFFFF" }}>
          {tile}
          <span>{label}</span>
        </button>
      ) : (
        <span aria-hidden="true" className="flex flex-col items-center gap-1.5 text-[13px] opacity-80" style={{ color: "#FFFFFF" }}>
          {tile}
          <span>{label}</span>
        </span>
      );
    };
    body = (
      <div
        className="flex min-h-0 flex-1 flex-col justify-between px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-10"
        style={{ background: ios ? "linear-gradient(160deg,#3B4C7A,#1C2440)" : "linear-gradient(170deg,#24425E,#101C2B)" }}
      >
        <h2 ref={titleRef} tabIndex={-1} className="sr-only outline-none">
          홈 화면
        </h2>
        <div className="grid grid-cols-4 gap-x-4 gap-y-6">
          {icon(myBankName, <span className="text-[22px] font-bold">{myBankName.slice(0, 1)}</span>, APP.primary, () => go("open"))}
          {icon(COPY.appCamera, <PhoneIcon name="video" size={26} />, "#6B7280")}
          {icon(COPY.appSettings, <PhoneIcon name="more" size={26} />, "#6B7280")}
        </div>
        {/* 아래 줄(독 · 즐겨찾기) — 전화 = 통화 복귀 · 메시지 = 통화 중 문자함. */}
        <div
          className={`grid grid-cols-4 gap-x-4 px-2 py-3 ${ios ? "rounded-[28px]" : ""}`}
          style={{ backgroundColor: ios ? "rgba(255,255,255,0.18)" : "transparent" }}
        >
          {icon(COPY.appPhone, <PhoneIcon name="accept-call" size={26} />, "#22A559", onClose)}
          {icon(COPY.appMessages, <PhoneIcon name="message" size={26} />, "#2F80ED", onOpenMessages)}
        </div>
      </div>
    );
  } else if (stage === "lock") {
    // B1 — 잠금 해제(BA3 — 숫자 입력 칸 0).
    body = (
      <>
        {appBar(`${myBankName} 모바일뱅킹`)}
        <div className="flex flex-1 flex-col gap-5 px-5 pb-6 pt-8" style={{ backgroundColor: APP.bg }}>
          {title(COPY.lockTitle)}
          <p className="text-[15px] leading-relaxed" style={{ color: APP.sub }}>
            {COPY.lockBody}
          </p>
          <div className="flex justify-center py-6" style={{ color: APP.primary }} aria-hidden="true">
            <PhoneIcon name="shield" size={64} />
          </div>
          {primaryButton(COPY.lockButton, () => go("unlock"))}
        </div>
      </>
    );
  } else if (stage === "account") {
    // B2 — 내 계좌 · 잔액(BA4).
    body = (
      <>
        {appBar(`${myBankName} 모바일뱅킹`)}
        <div className="flex flex-1 flex-col gap-4 px-5 pb-6 pt-5" style={{ backgroundColor: APP.bg }}>
          {title("내 계좌")}
          <div className="flex flex-col gap-3 rounded-[16px] p-5" style={{ backgroundColor: APP.card }}>
            <p className="text-[15px]" style={{ color: APP.sub }}>
              {myAccountLabelFor(seed)}
            </p>
            <p className="text-[26px] font-bold tabular-nums" style={{ color: APP.text }}>
              {balanceText(balance)}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {secondaryButton(COPY.historyButton, () => setError("거래 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."))}
              {primaryButton(COPY.transferButton, () => go("transfer"))}
            </div>
          </div>
          {errorLine}
        </div>
      </>
    );
  } else if (stage === "recipient") {
    // B3 — 받는 계좌(붙여넣기 · 직접 입력). 입력값은 이 state뿐(G138).
    body = (
      <>
        {appBar("이체", () => go("back"))}
        <div className="flex flex-1 flex-col gap-4 px-5 pb-6 pt-5" style={{ backgroundColor: APP.bg }}>
          {title(COPY.recipientTitle)}
          {copiedAccount && (
            <button
              type="button"
              onClick={paste}
              className="flex min-h-[52px] items-center justify-between gap-3 rounded-[12px] px-4 text-left text-[15px]"
              style={{ backgroundColor: APP.notice, color: APP.text }}
            >
              <span className="font-semibold">{COPY.pasteLabel}</span>
              <span className="truncate tabular-nums" style={{ color: APP.sub }}>
                {copiedAccount.bankName} {copiedAccount.accountNumber}
              </span>
            </button>
          )}
          <label className="flex flex-col gap-1.5 text-[15px]" style={{ color: APP.sub }}>
            {COPY.bankLabel}
            <select
              value={bank}
              onChange={(event) => setBank(event.target.value)}
              className="min-h-[52px] rounded-[12px] border px-3 text-[17px]"
              style={{ borderColor: APP.line, backgroundColor: APP.card, color: APP.text }}
            >
              <option value="">은행 선택</option>
              {FICTIONAL_BANK_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[15px]" style={{ color: APP.sub }}>
            {COPY.accountLabel}
            <input
              value={account}
              onChange={(event) => setAccount(normalizeAccountNumber(event.target.value))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="숫자만 입력"
              className="min-h-[52px] rounded-[12px] border px-3 text-[17px] tabular-nums"
              style={{ borderColor: APP.line, backgroundColor: APP.card, color: APP.text }}
            />
          </label>
          {errorLine}
          <div className="mt-auto">{primaryButton(COPY.next, submitRecipient)}</div>
        </div>
      </>
    );
  } else if (stage === "amount") {
    // B4 — 금액 · 한도 · 출금 가능 금액.
    const hint = amountHint(amount);
    body = (
      <>
        {appBar("이체", () => go("back"))}
        <div className="flex flex-1 flex-col gap-4 px-5 pb-6 pt-5" style={{ backgroundColor: APP.bg }}>
          {title(COPY.amountTitle)}
          <p className="text-[15px]" style={{ color: APP.sub }}>
            {bank} {account}
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
  } else if (stage === "confirm") {
    // B5 — 받는 분 확인(설계 W1 · W2). 제출 전 확인 화면이라 G255(완료 화면 되비추기) 밖이다.
    const rows: [string, string][] = [
      ["받는 분", holder],
      ["받는 계좌", `${bank} ${account}`],
      ["보내는 금액", amountWon],
      ["수수료", "면제"],
      ["받는 분 통장 표시", "내 이름"],
      ["내 통장 표시", holder],
    ];
    body = (
      <>
        {appBar("이체")}
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
          {primaryButton(COPY.send, () => go("send"))}
          {secondaryButton(COPY.cancel, () => go("cancel"))}
        </div>
      </>
    );
  } else if (stage === "auth") {
    // B6 — 본인 인증(버튼 하나 · 입력 칸 0). BA-2에서 이 버튼이 속은 순간 기록(`landing_submitted`)을 맡는다 — BA-1은 기록 0.
    body = (
      <>
        {appBar("이체")}
        <div className="flex flex-1 flex-col gap-5 px-5 pb-6 pt-8" style={{ backgroundColor: APP.bg }}>
          {title(COPY.authTitle)}
          <p className="text-[15px] leading-relaxed" style={{ color: APP.sub }}>
            {COPY.authBody}
          </p>
          <div className="flex justify-center py-4" style={{ color: APP.primary }} aria-hidden="true">
            <PhoneIcon name="shield" size={64} />
          </div>
          {primaryButton(COPY.authButton, () => go("authenticate"))}
          {secondaryButton(COPY.cancel, () => go("cancel"))}
        </div>
      </>
    );
  } else {
    // B7 — 완료(BA5 — 받는 분 · 금액 재표시 허용 · 값은 이 state뿐 · 서버 0).
    body = (
      <>
        {appBar(`${myBankName} 모바일뱅킹`)}
        <div className="flex flex-1 flex-col items-center gap-4 px-5 pb-6 pt-12 text-center" style={{ backgroundColor: APP.bg }}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: APP.primary, color: APP.primaryText }} aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          {title(`${holder}님께 ${amountWon}을 보냈어요`)}
          <p className="text-[15px]" style={{ color: APP.sub }}>
            {bank} {account}
          </p>
          <div className="mt-auto w-full">{primaryButton(COPY.doneButton, () => go("finish"))}</div>
        </div>
      </>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={stage === "home" ? "홈 화면" : `${myBankName} 모바일뱅킹`}
      className="fixed inset-0 z-50 mx-auto flex h-dvh w-full max-w-[430px] flex-col"
      style={{ backgroundColor: APP.bg }}
    >
      {callPill}
      {body}
      {/* 홈 막대(iOS형) · 탐색 막대(One UI형) — 앱 안에서는 홈으로, 홈에서는 그대로. 통화 복귀는 위 통화 필이 맡는다. */}
      {stage !== "home" && (
        <HomeBar ios={ios} onHome={() => setStage("home")} />
      )}
    </div>
  );
}

/**
 * 홈으로 가는 막대 — 통화 화면 · 은행 앱 아래에 같은 모양으로 쓴다.
 * iOS형 = 가는 홈 막대(실기의 위로 쓸기 대신 누름) · One UI형 = 3버튼 탐색 막대(최근 앱 · 홈 · 뒤로) 중 가운데 홈 버튼. ⛔ 실제 OS 제스처 · 상표 아이콘 0.
 * 2026-11-01 실기 신고(BA-1 배포본 — "홈 버튼이 보이지 않았다") — One UI형은 18px 테두리 사각형 하나뿐이라 홈 버튼으로 읽히지 않았다(추정 ·
 * 로컬 재현에서는 그려져 있었다). 실기 탐색 막대처럼 세 아이콘 줄로 그린다. 최근 앱 · 뒤로는 모양만(누를 수 없음 · 스크린리더 대상 밖).
 */
export function HomeBar({ ios, onHome, color = "rgba(17,24,39,0.75)" }: { ios: boolean; onHome: () => void; color?: string }) {
  if (ios) {
    return (
      <div className="flex shrink-0 items-center justify-center pb-[env(safe-area-inset-bottom)]">
        <button type="button" onClick={onHome} aria-label={COPY.homeAria} className="flex min-h-[44px] min-w-[160px] items-center justify-center">
          <span aria-hidden="true" className="block h-[5px] w-[134px] rounded-full" style={{ backgroundColor: color }} />
        </button>
      </div>
    );
  }
  return (
    <div
      className="grid w-full shrink-0 grid-cols-3 items-center justify-items-center pb-[env(safe-area-inset-bottom)]"
      style={{ color }}
    >
      {/* 최근 앱(세로줄 셋) — 모양만. */}
      <span aria-hidden="true" className="flex h-[48px] items-center gap-[4px] opacity-80">
        <span className="block h-[16px] w-[2.5px] rounded-full bg-current" />
        <span className="block h-[16px] w-[2.5px] rounded-full bg-current" />
        <span className="block h-[16px] w-[2.5px] rounded-full bg-current" />
      </span>
      <button type="button" onClick={onHome} aria-label={COPY.homeAria} className="flex min-h-[48px] min-w-[72px] items-center justify-center">
        <span aria-hidden="true" className="block h-[22px] w-[22px] rounded-[8px] border-[2.5px] border-current" />
      </button>
      {/* 뒤로(왼쪽 꺾쇠) — 모양만. */}
      <span aria-hidden="true" className="flex h-[48px] items-center opacity-80">
        <span className="block h-[13px] w-[13px] -rotate-45 rounded-[2px] border-l-[2.5px] border-t-[2.5px] border-current" />
      </span>
    </div>
  );
}
