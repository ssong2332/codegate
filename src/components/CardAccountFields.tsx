"use client";

// ⭐ 2026-11-08(실기기 신고 — 검찰 고급 상품권 화면 출금 계좌에 무관한 은행 · 금액 · 사용자 결정 D1 ①) — '이번 훈련 속 내 정보' 블록 안의
// 거래 은행 · 통장 잔액 칸(둘 다 선택 · 기본 비움). 규칙 · 문면 · 저장은 `@/lib/bankapp/withdrawAccounts`(판정표 K · A). 이 파일은 그리기만 한다.
// ⛔ 은행은 목록에서 고르기만(자유 입력 0). ⭐ 2026-11-09 사용자 결정 — 실제 은행(표 R)을 '은행' 묶음으로 먼저 · 가상 은행은 '가상 은행' 묶음(판정표 K2 · P3).
// 실제 은행 이름은 서버로 보내지 않는다(판정표 P6). ⭐ 2026-11-09 — 기관형은 가상 은행 이름 · "real" 표시 · 잔액을 요청에 싣는다(판정표 RQ) → 안내 `hintKnown`.

import { CARD_ACCOUNT_BANK_GROUPS, CARD_ACCOUNT_COPY, type CardAccountForm } from "@/lib/bankapp/withdrawAccounts";

const FIELD_CLASS =
  "min-h-[52px] rounded-[8px] border-[1.5px] border-line-strong bg-white px-4 py-3 text-[18px] text-ink focus:border-brand focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-50";

export default function CardAccountFields({
  value,
  onChange,
  disabled,
  known,
}: {
  value: CardAccountForm;
  onChange: (next: CardAccountForm) => void;
  disabled?: boolean;
  /** 판정표 RQ2 ~ RQ4 — 사기범이 아는 값으로 보내는 시나리오(기관형). */
  known?: boolean;
}) {
  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-[15px] font-semibold text-ink">{CARD_ACCOUNT_COPY.bankLabel}</span>
        <select value={value.bankName} onChange={(event) => onChange({ ...value, bankName: event.target.value })} disabled={disabled} className={FIELD_CLASS}>
          <option value="">{CARD_ACCOUNT_COPY.bankNone}</option>
          {CARD_ACCOUNT_BANK_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.banks.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[15px] font-semibold text-ink">{CARD_ACCOUNT_COPY.balanceLabel}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={7}
          value={value.balanceManwon}
          onChange={(event) => onChange({ ...value, balanceManwon: event.target.value.replace(/[^\d,]/g, "") })}
          placeholder={CARD_ACCOUNT_COPY.balancePlaceholder}
          disabled={disabled}
          className={FIELD_CLASS}
        />
      </label>

      <p className="text-[15px] leading-relaxed text-ink-sub">{known ? CARD_ACCOUNT_COPY.hintKnown : CARD_ACCOUNT_COPY.hint}</p>
    </>
  );
}
