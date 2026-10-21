"use client";

// §95.6(UX D-139) — 세션 전 화면(메신저 시작 고지 · 통화 벨 직전 고지)의 브라우저 다크 모드 안내. 판정표 = `lib/phone/webDarkNotice.ts`.
// 세션 중 화면에는 두지 않는다(몰입 유지 · 세션 중 표식 0 — AC-086). "확인했어요"를 누르면 이 기기에서 다시 보이지 않는다.
import { useState, useSyncExternalStore } from "react";
import {
  WEB_DARK_BROWSERS,
  WEB_DARK_NOTICE_STORAGE_PREFIX,
  decideWebDarkNotice,
  type WebDarkBrowserId,
} from "@/lib/phone/webDarkNotice";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isDismissed(id: WebDarkBrowserId): boolean {
  try {
    return window.localStorage.getItem(WEB_DARK_NOTICE_STORAGE_PREFIX + id) !== null;
  } catch {
    return false; // 저장소 접근 불가 = 확인 기록 없음(안내는 매번 보일 수 있다 — 비차단)
  }
}

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia?.(DARK_QUERY);
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}

const getSnapshot = () =>
  decideWebDarkNotice({
    userAgent: navigator.userAgent,
    prefersDark: window.matchMedia?.(DARK_QUERY).matches ?? false,
    dismissed: isDismissed,
  })?.id ?? "";
const getServerSnapshot = () => "";

export default function WebDarkModeNotice() {
  const activeId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [closed, setClosed] = useState(false);
  const rule = WEB_DARK_BROWSERS.find((r) => r.id === activeId);
  if (!rule || closed) return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem(WEB_DARK_NOTICE_STORAGE_PREFIX + rule.id, String(Date.now()));
    } catch {
      // 저장 실패 — 이번 화면에서만 닫는다.
    }
    setClosed(true);
  };
  return (
    <section
      aria-labelledby="web-dark-notice-title"
      className="w-full rounded-[12px] border-2 border-brand bg-brand-tint px-4 py-3 text-left"
    >
      <h2 id="web-dark-notice-title" className="text-[17px] font-bold leading-snug text-ink">
        {rule.title}
      </h2>
      <p className="mt-1 text-[16px] leading-[1.6] text-ink">{rule.body}</p>
      <ol className="mt-2 list-decimal pl-5 text-[16px] leading-[1.6] text-ink">
        {rule.settingsPath.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <button
        type="button"
        onClick={dismiss}
        className="mt-3 min-h-[48px] w-full rounded-[8px] border-2 border-brand bg-white text-[16px] font-semibold text-brand"
      >
        확인했어요
      </button>
    </section>
  );
}
