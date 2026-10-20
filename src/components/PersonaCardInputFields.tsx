"use client";

// §88(UX D-131 (1)~(3) · DECISIONS #199) — "이번 훈련 속 내 정보" / "받는 분 정보" 선택 입력 블록.
// self = UX-029 난이도 화면 · send = UX-019 챌린지 만들기 화면에서 같은 블록을 쓰고 제목 · 안내만 모드로 가른다.
// ⭐ 처음부터 펼쳐져 있고 세 칸 모두 비어 있다(접기 토글 0 — OQ-U98). 경고 표현 · 필수 표시 0(전부 선택).
import { useId } from "react";
import {
  PERSONA_INPUT_COPY,
  PERSONA_INPUT_FIELDS,
  PERSONA_REGION_OPTIONS,
  type PersonaCardForm,
} from "@/lib/personacard/personaCardInput";

type PersonaCardInputFieldsProps = {
  mode: "self" | "send";
  value: PersonaCardForm;
  onChange: (next: PersonaCardForm) => void;
  disabled?: boolean;
};

const FIELD_CLASS =
  "min-h-[52px] rounded-[12px] border-[1.5px] border-[#E2DDD3] bg-white px-4 py-3 text-[16px] text-[#22303A] outline-none focus:border-[#0E6B62] disabled:opacity-50";

export default function PersonaCardInputFields({ mode, value, onChange, disabled }: PersonaCardInputFieldsProps) {
  const id = useId();
  const titleId = `${id}-title`;
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-4"
    >
      <h2 id={titleId} className="text-[17px] font-bold leading-[1.4] text-[#22303A]">
        {mode === "self" ? PERSONA_INPUT_COPY.selfTitle : PERSONA_INPUT_COPY.sendTitle}
      </h2>
      <p className="text-[15px] leading-relaxed text-[#6B655C]">
        {mode === "self" ? PERSONA_INPUT_COPY.selfGuide : PERSONA_INPUT_COPY.sendGuide}
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-[#22303A]">{PERSONA_INPUT_FIELDS.name.label}</span>
        <input
          type="text"
          autoComplete="off"
          maxLength={20}
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder={PERSONA_INPUT_FIELDS.name.placeholder}
          disabled={disabled}
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-[#22303A]">{PERSONA_INPUT_FIELDS.birthYear.label}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={value.birthYear}
          onChange={(event) => onChange({ ...value, birthYear: event.target.value.replace(/\D/g, "") })}
          placeholder={PERSONA_INPUT_FIELDS.birthYear.placeholder}
          disabled={disabled}
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-[#22303A]">{PERSONA_INPUT_FIELDS.region.label}</span>
        <select
          value={value.region}
          onChange={(event) => onChange({ ...value, region: event.target.value })}
          disabled={disabled}
          className={FIELD_CLASS}
        >
          <option value="">{PERSONA_INPUT_FIELDS.region.noneLabel}</option>
          {PERSONA_REGION_OPTIONS.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </label>

      <p className="text-[14px] leading-relaxed text-[#6B655C]">{PERSONA_INPUT_COPY.privacy}</p>
    </section>
  );
}
