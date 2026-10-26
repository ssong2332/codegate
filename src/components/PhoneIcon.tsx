// T190-1 — 기기 재현 표면용 단색 라인 아이콘 (docs/Architecture.md §74.4 · §74.3 표 A A-2/A-5 · AC-095 (a)).
//
// ⛔ **OS 아이콘(SF Symbols · One UI 아이콘)·오픈 라이선스 세트를 쓰지 않는다** — 전부 이 파일에서 자체 제작한
// 인라인 SVG다(획 2px · `currentColor`). 의존성·라이선스 고지 의무 0(§74.3 A-7 — 바꾸려면 README 고지가 같은
// 커밋에 필요하다).
// ⛔ **텍스트 노드 0 · 전부 `aria-hidden`**(장식) — 이름은 아이콘을 감싼 버튼이 가진다. 세션 중 표면이라
// 등록부 2벌(G436 `in-session` · T86 `false`)에 등록돼 있다. ⛔ 이 파일을 `src/components/` 하위 디렉터리로
// 옮기지 않는다(G451 — 등록부가 최상위만 훑는다).

export type PhoneIconName =
  | "mute"
  | "keypad"
  | "speaker"
  | "message"
  | "chat"
  | "end-call"
  | "accept-call"
  | "person"
  | "chevron-back"
  | "link"
  | "globe"
  | "shield"
  | "send-up"
  // 사용자 결정(2026-10-18 · UX D-116) — 메신저에서 연 가짜 랜딩 브라우저 바 왼쪽 ✕(닫기).
  | "close"
  // §113.2(UX D-151 (2)) — 대화방 입력줄 왼쪽 '+'(사진 보내기).
  | "plus"
  // 2026-10-27 — One UI 9 통화 화면(`OneUiCallControls`) 재현용. 녹음 · 블루투스 · 반짝이 · 영상 · 자막 · 대기는 장식(동작 없음).
  | "record"
  | "bluetooth"
  | "more"
  | "sparkle"
  | "video"
  | "caption"
  | "pause"
  | "contact"
  | "send-message";

type PhoneIconProps = {
  name: PhoneIconName;
  /** 한 변 px(정사각). */
  size?: number;
  className?: string;
};

const HANDSET =
  "M5 3.5h3.2l1.9 4.6-2.4 1.6a11.5 11.5 0 0 0 6.6 6.6l1.6-2.4 4.6 1.9v3.2a2 2 0 0 1-2.1 2A17 17 0 0 1 3 5.6a2 2 0 0 1 2-2.1z";

const KEYPAD_DOTS: Array<[number, number]> = [
  [6, 4.5],
  [12, 4.5],
  [18, 4.5],
  [6, 10],
  [12, 10],
  [18, 10],
  [6, 15.5],
  [12, 15.5],
  [18, 15.5],
  [12, 21],
];

function glyph(name: PhoneIconName) {
  switch (name) {
    case "mute":
      return (
        <>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
          <path d="M12 17.5V21" />
          <path d="M4 4l16 16" />
        </>
      );
    case "keypad":
      return (
        <>
          {KEYPAD_DOTS.map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.4" fill="currentColor" stroke="none" />
          ))}
        </>
      );
    case "speaker":
      return (
        <>
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
          <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
          <path d="M18.3 6.5a8 8 0 0 1 0 11" />
        </>
      );
    case "message":
      return <path d="M5 4.5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-8.5L6 20.5V17H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z" />;
    case "chat":
      return (
        <>
          <path d="M4 5.5h11a2 2 0 0 1 2 2V13a2 2 0 0 1-2 2H9l-4 3.5V15H4a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2z" />
          <path d="M19 9h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-3.5-3" />
        </>
      );
    case "end-call":
      return (
        <g transform="rotate(135 12 12)">
          <path d={HANDSET} />
        </g>
      );
    case "accept-call":
      return <path d={HANDSET} />;
    case "person":
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
        </>
      );
    case "chevron-back":
      return <path d="M15 5l-7 7 7 7" />;
    case "link":
      return (
        <>
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" />
        </>
      );
    case "globe":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17" />
          <path d="M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z" />
        </>
      );
    case "shield":
      return <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.4-7.5 9.5-4.4-1.1-7.5-4.9-7.5-9.5V6z" />;
    case "send-up":
      return (
        <>
          <path d="M12 19V5" />
          <path d="M6 11l6-6 6 6" />
        </>
      );
    case "close":
      return (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      );
    case "plus":
      return (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      );
    case "record":
      return (
        <>
          <path d="M14 18H5.5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
          <circle cx="7.6" cy="9.8" r="1.8" />
          <circle cx="12.4" cy="9.8" r="1.8" />
          <path d="M7.6 11.6h4.8" />
          <path d="M15 14h6.5" />
          <path d="M18.2 14v7" />
        </>
      );
    case "bluetooth":
      return <path d="M7 7.5l10 9-5 4.5V3l5 4.5-10 9" />;
    case "more":
      return (
        <>
          <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
        </>
      );
    case "sparkle":
      return (
        <g fill="currentColor" stroke="none">
          <path d="M10 6l1.6 4.4L16 12l-4.4 1.6L10 18l-1.6-4.4L4 12l4.4-1.6z" />
          <path d="M17 3l.7 1.8 1.8.7-1.8.7L17 8l-.7-1.8-1.8-.7 1.8-.7z" />
          <path d="M18 15.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
        </g>
      );
    case "video":
      return (
        <g fill="currentColor" stroke="none">
          <rect x="2" y="6" width="14" height="12" rx="2.5" />
          <path d="M17 10.5l5-3v9l-5-3z" />
        </g>
      );
    case "caption":
      return (
        <>
          <path d="M12 3.5a8.5 8.5 0 0 1 0 17H4.5l1.6-2.6A8.5 8.5 0 0 1 12 3.5z" />
          <path d="M10.6 10.3a2 2 0 1 0 0 3.4" />
          <path d="M15.6 10.3a2 2 0 1 0 0 3.4" />
        </>
      );
    case "pause":
      return (
        <>
          <path d="M9 5v14" />
          <path d="M15 5v14" />
        </>
      );
    case "contact":
      return (
        <>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0z" />
        </>
      );
    case "send-message":
      return (
        <>
          <path d="M12 3.5a8.5 8.5 0 0 1 0 17H4.5l1.6-2.6A8.5 8.5 0 0 1 12 3.5z" />
          <path d="M8.5 12.5l7-3.5-2.5 7-1.5-2.5z" />
        </>
      );
  }
}

export default function PhoneIcon({ name, size = 28, className }: PhoneIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {glyph(name)}
    </svg>
  );
}
