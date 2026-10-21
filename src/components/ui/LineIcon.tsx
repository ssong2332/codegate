// 공용 선 아이콘 (시안 A "공공 안심형" — UX D-132 (2)). 자체 도형만 쓴다(상표 · 플랫폼 아이콘 복제 금지 — 감사 안전선 표).
// 색은 `currentColor` — 부모의 `text-*` 토큰을 따른다. 장식 아이콘이므로 늘 aria-hidden.
export type LineIconName = "phone" | "chat" | "gift" | "shield" | "check" | "user" | "lock" | "clock" | "alert" | "mic" | "speaker" | "list";

const PATHS: Record<LineIconName, string> = {
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  chat: "M4 5h16v11H9l-5 4z",
  gift: "M4 10h16v10H4z M3 7h18v3H3z M12 7v13 M12 7c-2-4-6-3-5 0 M12 7c2-4 6-3 5 0",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5",
  check: "M5 12.5l4.5 4.5L19 7",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7",
  lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  alert: "M12 3l10 18H2z M12 10v5 M12 18v.5",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M5 11a7 7 0 0 0 14 0 M12 18v3",
  speaker: "M4 9h4l5-4v14l-5-4H4z M16.5 8.5a5 5 0 0 1 0 7 M19 6a8.5 8.5 0 0 1 0 12",
  list: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h.5 M4.5 12h.5 M4.5 18h.5",
};

export default function LineIcon({ name, size = 22, className = "" }: { name: LineIconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d={PATHS[name]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
