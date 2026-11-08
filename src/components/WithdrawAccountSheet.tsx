"use client";

// ⭐ 출금 계좌 선택 시트(2026-11-07 실기기 신고) — 두 이체 화면(`MessengerFakeLanding` 훈련용 이체 · `BankAppOverlay` 내 은행 송금)이 같이 쓴다.
// 목록 · 잔액 · 장부 규칙은 `@/lib/bankapp/withdrawAccounts`(판정표 W). 이 파일은 그리기만 한다.
// ⚠️ 서버 호출 0 · 저장소 0 — 고른 계좌는 호출부 state에만 있다(G138).
// ⚠️ 상대 경로로만 import한다 — `MessengerFakeLanding`의 렌더 게이트 하네스가 CJS require로 따라와 `@/` 별칭을 풀지 못한다.
// ⚠️ 모션은 CSS 키프레임만(`globals.css` `bank-sheet-*` — reduced-motion이면 정지 · G457).
import { useEffect, useRef } from "react";
import { accountLabel, availableText, bankInitial, type WithdrawAccount } from "../lib/bankapp/withdrawAccounts";

type Props = {
  accounts: readonly WithdrawAccount[];
  selectedId: WithdrawAccount["id"];
  ledgerKey: string;
  onSelect: (id: WithdrawAccount["id"]) => void;
  onClose: () => void;
};

/** 은행 머리글자 원의 색(가상 은행 · 실존 은행 브랜드 색을 흉내 내지 않는 차분한 색). */
// 가상 은행 8곳마다 다른 색(목록 = 서버 `FICTIONAL_BANK_NAMES` · 목록 밖 이름은 남색).
const BANK_DOT_COLORS: Readonly<Record<string, string>> = {
  한결은행: "#1E3A5F",
  다온은행: "#3B6E5A",
  새솔은행: "#8A3B4E",
  늘봄은행: "#7A4E2D",
  해담은행: "#2F6F8F",
  가온은행: "#5B4B8A",
  미르은행: "#4F6B2A",
  보담은행: "#6B5B3E",
};

export function bankDotColor(bankName: string): string {
  return BANK_DOT_COLORS[bankName] ?? "#1E3A5F";
}

/**
 * 이체 화면의 "출금 계좌" 줄(누르면 위 시트가 열린다). 두 화면이 같은 모양을 쓴다 — 색은 호출부 토큰을 받는다.
 */
export function WithdrawAccountRow({
  account,
  ledgerKey,
  onOpen,
  colors,
}: {
  account: WithdrawAccount;
  ledgerKey: string;
  onOpen: () => void;
  colors: { border: string; bg: string; label: string; value: string };
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="flex min-h-[60px] w-full items-center gap-3 rounded-[12px] border px-3.5 py-2.5 text-left"
      style={{ borderColor: colors.border, backgroundColor: colors.bg }}
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white"
        style={{ backgroundColor: bankDotColor(account.bankName) }}
      >
        {bankInitial(account.bankName)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px]" style={{ color: colors.label }}>
          출금 계좌
        </span>
        <span className="truncate text-[15px] font-semibold tabular-nums" style={{ color: colors.value }}>
          {accountLabel(account)}
        </span>
        <span className="truncate text-[13px] tabular-nums" style={{ color: colors.label }}>
          출금 가능 금액 {availableText(ledgerKey, account)}
        </span>
      </span>
      <span className="shrink-0 text-[14px] font-semibold" style={{ color: colors.label }}>
        변경
      </span>
    </button>
  );
}

export default function WithdrawAccountSheet({ accounts, selectedId, ledgerKey, onSelect, onClose }: Props) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
    // Esc = 이 시트만 닫는다(화면 전체 닫기 · 랜딩 닫기보다 먼저 — window 캡처 단계에서 멈춘다).
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const groups: [string, WithdrawAccount[]][] = [
    ["내 계좌", accounts.filter((account) => account.own)],
    ["다른 은행 계좌", accounts.filter((account) => !account.own)],
  ];

  return (
    <div className="fixed inset-0 z-[70] mx-auto flex w-full max-w-[430px] flex-col justify-end" role="presentation">
      <button type="button" aria-label="닫기" tabIndex={-1} onClick={onClose} className="bank-sheet-dim absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-sheet-title"
        className="bank-sheet-up relative flex max-h-[80dvh] flex-col rounded-t-[20px] bg-white pb-[env(safe-area-inset-bottom)]"
      >
        <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[#D1D5DB]" />
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <h2 ref={titleRef} id="withdraw-sheet-title" tabIndex={-1} className="text-lg font-bold text-[#111827] outline-none">
            출금 계좌 선택
          </h2>
          <button type="button" onClick={onClose} className="min-h-[44px] px-2 text-[15px] font-semibold text-[#4B5563]">
            닫기
          </button>
        </div>
        <div className="flex min-h-0 flex-col overflow-y-auto px-3 pb-4">
          {groups.map(([heading, list]) =>
            list.length === 0 ? null : (
              <section key={heading} className="flex flex-col">
                <h3 className="px-2 pb-1 pt-3 text-[13px] font-semibold text-[#6B7280]">{heading}</h3>
                <ul className="flex flex-col">
                  {list.map((account) => {
                    const selected = account.id === selectedId;
                    return (
                      <li key={account.id}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onSelect(account.id)}
                          className="flex min-h-[64px] w-full items-center gap-3 rounded-[14px] px-2 py-2.5 text-left transition-colors active:bg-[#F3F4F6]"
                          style={selected ? { backgroundColor: "#EEF2F7" } : undefined}
                        >
                          <span
                            aria-hidden="true"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white"
                            style={{ backgroundColor: bankDotColor(account.bankName) }}
                          >
                            {bankInitial(account.bankName)}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[15px] font-semibold text-[#111827]">
                              {account.bankName} {account.productName}
                            </span>
                            <span className="truncate text-[13px] tabular-nums text-[#6B7280]">{accountLabel(account)}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end">
                            <span className="text-[12px] text-[#6B7280]">출금 가능</span>
                            <span className="text-[15px] font-semibold tabular-nums text-[#111827]">{availableText(ledgerKey, account)}</span>
                          </span>
                          <span
                            aria-hidden="true"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
                            style={selected ? { backgroundColor: "#1E3A5F", borderColor: "#1E3A5F", color: "#fff" } : { borderColor: "#D1D5DB" }}
                          >
                            {selected && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                              </svg>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
