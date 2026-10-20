"use client";

// §88(UX D-131 (1)~(3) · DECISIONS #199) — "이번 훈련 속 내 정보" / "받는 분 정보" 선택 입력 블록.
// self = UX-029 난이도 화면 · send = UX-019 챌린지 만들기 화면에서 같은 블록을 쓰고 제목 · 안내만 모드로 가른다.
// ⭐ 처음부터 펼쳐져 있고 모든 칸이 비어 있다(접기 토글 0 — OQ-U98). 경고 표현 · 필수 표시 0(전부 선택).
// ⭐ UX D-133 (1) — 블록이 나타나는 순간(고급 × 대상 시나리오 선택 · send 화면 진입) 블록으로 스크롤한다(reduced-motion = 즉시).
//    포커스는 옮기지 않고(키보드 팝업 0) 제목만 스크린리더에 읽힌다. "끝까지 스크롤해야 버튼 활성화" 방식은 쓰지 않는다.
import { useEffect, useId, useRef, useState } from "react";
import {
  PERSONA_BIRTH_DAY_OPTIONS,
  PERSONA_BIRTH_MONTH_OPTIONS,
  PERSONA_INPUT_COPY,
  PERSONA_INPUT_FIELDS,
  PERSONA_REGION_OPTIONS,
  personaRevealScroll,
  type PersonaCardForm,
} from "@/lib/personacard/personaCardInput";

type PersonaCardInputFieldsProps = {
  mode: "self" | "send";
  value: PersonaCardForm;
  onChange: (next: PersonaCardForm) => void;
  disabled?: boolean;
};

const FIELD_CLASS =
  "min-h-[52px] rounded-[8px] border-[1.5px] border-line-strong bg-white px-4 py-3 text-[18px] text-ink focus:border-brand focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-50";

export default function PersonaCardInputFields({ mode, value, onChange, disabled }: PersonaCardInputFieldsProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const birthdayHintId = `${id}-birthday-hint`;
  const title = mode === "self" ? PERSONA_INPUT_COPY.selfTitle : PERSONA_INPUT_COPY.sendTitle;
  const sectionRef = useRef<HTMLElement>(null);
  const [announced, setAnnounced] = useState(false);

  // UX D-133 (1) — 나타난 직후 1회: 블록이 화면 밖이면 스크롤 · 제목 낭독(포커스 이동 0).
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const section = sectionRef.current;
      if (!section) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const behavior = personaRevealScroll(section.getBoundingClientRect(), window.innerHeight, reducedMotion);
      if (behavior) section.scrollIntoView({ behavior, block: "start" });
      setAnnounced(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-labelledby={titleId}
      className="flex scroll-mt-28 flex-col gap-3 rounded-[8px] border-[1.5px] border-line bg-white p-4"
    >
      <p aria-live="polite" className="sr-only">
        {announced ? title : ""}
      </p>
      <h2 id={titleId} className="text-[17px] font-bold leading-[1.4] text-ink">
        {title}
      </h2>
      <p className="text-[17px] leading-relaxed text-ink-sub">
        {mode === "self" ? PERSONA_INPUT_COPY.selfGuide : PERSONA_INPUT_COPY.sendGuide}
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-[15px] font-semibold text-ink">{PERSONA_INPUT_FIELDS.name.label}</span>
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
        <span className="text-[15px] font-semibold text-ink">{PERSONA_INPUT_FIELDS.birthYear.label}</span>
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

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[15px] font-semibold text-ink">{PERSONA_INPUT_FIELDS.birthday.label}</legend>
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label={PERSONA_INPUT_FIELDS.birthday.monthLabel}
            aria-describedby={birthdayHintId}
            value={value.birthMonth}
            onChange={(event) => onChange({ ...value, birthMonth: event.target.value })}
            disabled={disabled}
            className={FIELD_CLASS}
          >
            <option value="">{PERSONA_INPUT_FIELDS.birthday.monthNone}</option>
            {PERSONA_BIRTH_MONTH_OPTIONS.map((month) => (
              <option key={month} value={String(month)}>
                {month}월
              </option>
            ))}
          </select>
          <select
            aria-label={PERSONA_INPUT_FIELDS.birthday.dayLabel}
            aria-describedby={birthdayHintId}
            value={value.birthDay}
            onChange={(event) => onChange({ ...value, birthDay: event.target.value })}
            disabled={disabled}
            className={FIELD_CLASS}
          >
            <option value="">{PERSONA_INPUT_FIELDS.birthday.dayNone}</option>
            {PERSONA_BIRTH_DAY_OPTIONS.map((day) => (
              <option key={day} value={String(day)}>
                {day}일
              </option>
            ))}
          </select>
        </div>
        <p id={birthdayHintId} className="text-[15px] leading-relaxed text-ink-sub">
          {PERSONA_INPUT_COPY.birthdayHint}
        </p>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-[15px] font-semibold text-ink">{PERSONA_INPUT_FIELDS.region.label}</span>
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

      <p className="text-[16px] leading-relaxed text-ink-sub">{PERSONA_INPUT_COPY.privacy}</p>
    </section>
  );
}
