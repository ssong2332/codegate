// 공용 입력 칸 (시안 A "공공 안심형" — UX D-132 (2)). 라벨은 칸 위에 늘 보인다(placeholder를 라벨로 쓰지 않는다).
// 경계 = line-strong(비텍스트 3:1) · 높이 56px · 글자 18px · 도움말/오류 문장은 aria-describedby로 묶는다.
import { useId, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  hint?: string;
  error?: string;
};

export default function TextField({ label, hint, error, className = "", ...rest }: Props) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[16px] font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-[56px] rounded-[8px] border-[1.5px] bg-surface px-4 text-[18px] text-ink placeholder:text-ink-sub focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-brand ${
          error ? "border-danger" : "border-line-strong"
        }`}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-[15px] leading-[1.5] text-ink-sub">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[15px] font-semibold leading-[1.5] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
