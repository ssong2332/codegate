// 2026-11-07 실기기 신고(카드사 고급 R1) — 다통화 세션의 **전화 앱**(통화 사이 · 통화를 끊은 뒤) 순수 로직(브라우저 API · React 0).
//
// 사용자 지적 원문: "내 연락처에 왜 윤슬카드 고객센터와 금융감독기관 대표번호, 한빛지방검찰청 대표번호가 저장되어 있는 건데"
// → 기관 번호를 연락처에 미리 넣지 않는다. 실제 휴대폰에 있는 것만 둔다:
// | 화면 | 내용 | 원천 |
// |---|---|---|
// | 최근 기록 | 이번 세션에서 받은 · 건 · 거절한 전화 + 문자 온 번호 | 화면이 기록한 통화(`PhoneCallLog`) + 받은 문자(`arrivedAtMs`) |
// | 키패드 | 번호 입력 | 참가자 입력 · 문자 속 번호 누름 |
// | 인터넷 검색(홈 화면) | 기관 이름으로 검색 → 공식 번호 | `OFFICIAL_LISTINGS`(서버 번호부 `dialDirectory.ts`의 진짜 안내 항목 미러) |
// ⛔ 검색 결과에 문자로 받은 가짜 번호(02-0762-5513)는 없다 — 공식 번호만. ⛔ 실제 기관 번호 · 실제 주소(도메인) 0.
// ⛔ 세션 중 화면 문구에 '모의' · '훈련용' 0(G437).
// 잎(leaf) 모듈 — import 0(테스트가 node로 직접 부른다).

const digitsOf = (number: string) => number.replace(/[^0-9*#]/g, "");

/** 공식 번호 검색 결과 한 줄(가상 기관 · 가상 번호). */
export type OfficialListing = {
  /** 결과 제목(기관 이름 + 창구). */
  title: string;
  /** 결과 아래 설명 한 줄. */
  snippet: string;
  number: string;
  /** 이 낱말 중 하나가 검색어에 있으면 결과에 나온다(공백 무시). */
  keywords: readonly string[];
};

/**
 * 공식 번호 검색 결과 = 서버 번호부(`functions/src/scenarios/dialDirectory.ts`)의 **진짜 기관 안내가 있는 항목** 미러.
 * 드리프트는 `phoneApp.test.ts`가 서버 파일과 대조한다. 이 번호로 걸면 서버가 판정한다(가로채기 조건 · 진짜 안내 — 화면은 판정 0).
 */
export const OFFICIAL_LISTINGS: Readonly<Record<string, readonly OfficialListing[]>> = {
  "card-company-impersonation": [
    {
      title: "윤슬카드 고객센터",
      snippet: "카드 분실 · 도난 신고, 발급 · 배송 문의 — 24시간 상담",
      number: "02-0715-8800",
      keywords: ["윤슬", "카드사", "카드고객센터", "카드배송", "카드발급"],
    },
    {
      title: "금융감독기관 대표번호",
      snippet: "금융 민원 · 불법 금융 신고 상담",
      number: "02-0700-3324",
      keywords: ["금융감독", "감독기관", "금감", "금융민원"],
    },
    {
      title: "한빛지방검찰청 대표번호",
      snippet: "민원실 · 사건 조회 안내",
      number: "02-0746-2108",
      keywords: ["한빛", "검찰", "검사", "지검"],
    },
  ],
};

const compact = (text: string) => text.replace(/\s+/g, "").toLowerCase();

/** 검색 결과(제출한 검색어 기준). 빈 검색어 = 결과 0. 순서 = 표 순서. */
export function searchOfficialListings(scenarioId: string, query: string): readonly OfficialListing[] {
  const q = compact(query);
  if (q.length === 0) return [];
  return (OFFICIAL_LISTINGS[scenarioId] ?? []).filter(
    (listing) => listing.keywords.some((word) => q.includes(compact(word))) || compact(listing.title).includes(q),
  );
}

/** 입력 중 추천 검색어(제목이 입력을 포함하거나 입력이 낱말을 포함). 2자 미만 = 0. */
export function searchSuggestions(scenarioId: string, typed: string): readonly string[] {
  const q = compact(typed);
  if (q.length < 2) return [];
  return (OFFICIAL_LISTINGS[scenarioId] ?? [])
    .filter((listing) => compact(listing.title).includes(q) || listing.keywords.some((word) => q.includes(compact(word))))
    .map((listing) => listing.title);
}

/** 공식 번호 검색 결과 제목 → 번호(서버 레그 라벨 "금융감독기관 대표번호" 등을 번호로 — `callDisplayNumber` 3행). 없으면 null. */
export function officialNumberForTitle(scenarioId: string, title: string): string | null {
  return (OFFICIAL_LISTINGS[scenarioId] ?? []).find((item) => item.title === title)?.number ?? null;
}

/** 화면이 기록하는 통화 한 건(이번 세션 · 메모리에만). */
export type PhoneCallLog = {
  number: string;
  /** in = 받은 전화 · out = 건 전화 · declined = 거절한 전화. */
  direction: "in" | "out" | "declined";
  atMs: number;
  /** 통화 길이(초) — 연결되지 않은 통화는 부재. */
  durationSec?: number;
};

export type RecentEntry =
  | { kind: "call"; number: string; direction: PhoneCallLog["direction"]; atMs: number; durationSec?: number }
  | { kind: "sms"; number: string; atMs: number };

/**
 * 최근 기록 = 통화 + 문자 온 번호, 최근 것이 위. 문자는 보낸 번호마다 가장 최근 1건만(문자 앱 대화방 목록과 같은 묶음).
 * 시각 0(서버 시각 반영 전) 문자는 빼지 않고 맨 아래로 간다.
 */
export function buildRecents(calls: readonly PhoneCallLog[], sms: readonly { senderLabel: string; arrivedAtMs: number }[]): RecentEntry[] {
  const latestSms = new Map<string, number>();
  for (const item of sms) {
    const prev = latestSms.get(item.senderLabel);
    if (prev === undefined || item.arrivedAtMs > prev) latestSms.set(item.senderLabel, item.arrivedAtMs);
  }
  const entries: RecentEntry[] = [
    ...calls.map((call): RecentEntry => ({ kind: "call", ...call })),
    ...[...latestSms.entries()].map(([number, atMs]): RecentEntry => ({ kind: "sms", number, atMs })),
  ];
  return entries.sort((a, b) => b.atMs - a.atMs);
}

/** 최근 기록 시각(오전/오후 h:mm — 오늘 일만 있다). */
export function formatRecentTime(atMs: number): string {
  if (!Number.isFinite(atMs) || atMs <= 0) return "";
  const date = new Date(atMs);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours < 12 ? "오전" : "오후"} ${hours % 12 === 0 ? 12 : hours % 12}:${minutes}`;
}

/** 통화 길이 표기(1분 미만 = "N초" · 그 밖 "N분 N초"). */
export function formatCallDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s}초`;
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

/** 최근 기록 한 줄의 보조 글(방향 · 길이). */
export function recentSubtitle(entry: RecentEntry): string {
  if (entry.kind === "sms") return "문자 메시지";
  if (entry.direction === "declined") return "거절한 전화";
  const way = entry.direction === "in" ? "수신" : "발신";
  return entry.durationSec !== undefined ? `${way} · ${formatCallDuration(entry.durationSec)}` : `${way} · 연결 안 됨`;
}

/** 최근 기록 · 키패드에서 걸 수 있는 번호인가(숫자 모양만 — 라벨 문자열은 걸 수 없다). */
export function dialableDigits(number: string): string | null {
  const digits = digitsOf(number);
  return /^[0-9]{3,}$/.test(digits) ? digits : null;
}
