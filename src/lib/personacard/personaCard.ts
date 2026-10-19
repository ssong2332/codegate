// T194-b(docs/Architecture.md §84.3.3 · §84.3.7 · PRD AC-104 · UX-014 v1.38 (1)(3) · UX-008 v1.38 (1) · UX-018 v1.38 ① · D-118~D-120)
// 훈련용 가상 신상 카드 — 클라이언트 쪽 **표시 전용** 순수 함수 · 정본 문면.
//
// ⛔ 클라이언트는 카드 값을 만들거나 고치지 않는다(AC-104 (d)) — 세션 문서 · 리포트 문서에 서버가 쓴 값을 그대로 그린다.
//    클라 → 서버로 카드 값을 보내는 경로 0(이 파일은 어떤 API도 부르지 않는다).
// ⛔ 문면은 `docs/UX.md` 정본 글자 그대로(`personaCard.test.ts`가 UX.md 원문과 대조한다). 의역 금지.

/** 화면에 그리는 카드 행(라벨 · 값). 서버 `PersonaCardItem`의 표시 부분. */
export type PersonaCardRow = { label: string; value: string };

/** UX-014 v1.38 (1) — `pre-call-notice` 안 카드 블록 정본. */
export const PERSONA_CARD_COPY = {
  title: "이번 훈련 속 내 정보",
  guide: "훈련하는 동안 아래 정보를 내 정보라고 생각해 주세요.",
  noticeVirtual: "모두 훈련을 위해 지어낸 가상 정보입니다. 내 실제 이름이나 계정 정보는 쓰지 않았습니다.",
  noticeNoRevisit: "통화가 시작되면 이 정보는 다시 볼 수 없습니다.",
} as const;

/** 항목 상한(D-119 — 5행 초과 0). */
export const PERSONA_CARD_MAX_ROWS = 5;

function readRows(raw: unknown): PersonaCardRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > PERSONA_CARD_MAX_ROWS) return null;
  const rows: PersonaCardRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const { label, value } = item as { label?: unknown; value?: unknown };
    if (typeof label !== "string" || typeof value !== "string" || !label || !value) return null;
    rows.push({ label, value });
  }
  return rows;
}

/**
 * 세션 문서 `personaCard` → 그릴 행. 그리지 않을 때는 `null`:
 * - 필드 부재 · 모양이 다름(UF-014 Failure (a) — 카드 블록만 빠지고 나머지 고지는 그대로)
 * - 세션 난이도가 고급이 아님(UF-014 Failure (c) 클라 방어 — ⛔ 충족 수단은 서버 술어다)
 */
export function readSessionPersonaCard(raw: unknown, difficultyLevel: unknown): PersonaCardRow[] | null {
  if (difficultyLevel !== "advanced") return null;
  if (!raw || typeof raw !== "object") return null;
  const { v, items } = raw as { v?: unknown; items?: unknown };
  if (v !== 1) return null;
  return readRows(items);
}

/** 가림 표기("○○")를 화면용 조각으로 나눈다 — 화면에는 "○○", 스크린리더에는 "가려진 이름"(UX-014 v1.38 (3)). */
export const MASK_TOKEN = "○○";
export const MASK_ACCESSIBLE_NAME = "가려진 이름";
export type MaskedSegment = { text: string; masked: boolean };
export function splitMaskedValue(value: string): MaskedSegment[] {
  const out: MaskedSegment[] = [];
  value.split(MASK_TOKEN).forEach((part, i) => {
    if (i > 0) out.push({ text: MASK_TOKEN, masked: true });
    if (part) out.push({ text: part, masked: false });
  });
  return out;
}

// ── 리포트(UX-008 v1.38 (1)) · 리플레이(UX-018 v1.38 ①) ─────────────────────

export type PersonaBlockState = "R-1" | "R-2" | "R-3";
export type PersonaBlockRow = PersonaCardRow & { scammerTurnIndex?: number };
export type PersonaBlockView = { state: PersonaBlockState; items: PersonaBlockRow[] };

/** UX-008 v1.38 (1) 정본 문면(글자 단위). */
export const PERSONA_REPORT_COPY = {
  r1Title: "상대가 먼저 꺼낸 '내 정보'",
  r1Fact: "통화에서 상대가 아래 정보를 내가 말하기 전에 먼저 말했습니다.",
  r1Explanation:
    "이름·나이·거래 은행·가족을 알고 있다는 것은 진짜 기관이나 회사라는 증거가 아닙니다. 이런 정보는 이미 다른 곳에서 새어 나갔을 수 있습니다.",
  r2Title: "이번 훈련 속 내 정보",
  r2Fact: "이번 훈련에서는 아래 가상 정보를 내 정보로 정해 두었습니다.",
  r2Explanation:
    "전화한 사람이 내 정보를 알고 있더라도 진짜 기관이나 회사라는 증거가 아닙니다. 이런 정보는 이미 다른 곳에서 새어 나갔을 수 있습니다.",
  action: "내 정보를 먼저 말하는 전화라도 일단 끊고, 내가 알고 있는 번호로 직접 확인하세요.",
  r3Action: "내 정보를 먼저 말하는 전화라도 일단 끊고, 다른 휴대폰이나 집 전화로 내가 알고 있는 번호에 직접 확인하세요.",
  tail: "위 정보는 훈련을 위해 지어낸 가상 정보입니다.",
} as const;

/** UX-018 v1.38 ① — R-1 세션에서 사기범이 카드 값을 처음 말한 줄의 주석. */
export const PERSONA_REPLAY_NOTE = "이 말이 '상대가 먼저 꺼낸 내 정보' 신호였습니다";

/** 리포트 문서 `personaBlock` → 뷰(부재 · 모양이 다르면 `null` = R-4 · 블록 0). */
export function readPersonaBlock(raw: unknown): PersonaBlockView | null {
  if (!raw || typeof raw !== "object") return null;
  const { state, items } = raw as { state?: unknown; items?: unknown };
  if (state !== "R-1" && state !== "R-2" && state !== "R-3") return null;
  const rows = readRows(items);
  if (!rows) return null;
  const withAnchors = rows.map((row, i) => {
    const anchor = (items as Array<{ scammerTurnIndex?: unknown }>)[i]!.scammerTurnIndex;
    return typeof anchor === "number" && Number.isInteger(anchor) && anchor >= 0 ? { ...row, scammerTurnIndex: anchor } : row;
  });
  return { state, items: withAnchors };
}

/** 이 블록에 "먼저 말한" 기록이 있는가(R-1, 또는 기록이 있는 R-3 — 서버가 앵커를 실은 항목만). */
function hasFirstMentions(block: PersonaBlockView): boolean {
  return block.items.some((item) => item.scammerTurnIndex !== undefined);
}

/** 상태 → 문면(위에서부터 첫 일치 — R-3은 제목 · 사실 · 설명이 R-1/R-2 그대로, 대처만 "다른 전화로"). */
export function resolvePersonaBlockCopy(block: PersonaBlockView): {
  title: string;
  fact: string;
  action: string;
  explanation: string;
  tail: string;
} {
  const mentioned = block.state === "R-1" || (block.state === "R-3" && hasFirstMentions(block));
  return {
    title: mentioned ? PERSONA_REPORT_COPY.r1Title : PERSONA_REPORT_COPY.r2Title,
    fact: mentioned ? PERSONA_REPORT_COPY.r1Fact : PERSONA_REPORT_COPY.r2Fact,
    action: block.state === "R-3" ? PERSONA_REPORT_COPY.r3Action : PERSONA_REPORT_COPY.action,
    explanation: mentioned ? PERSONA_REPORT_COPY.r1Explanation : PERSONA_REPORT_COPY.r2Explanation,
    tail: PERSONA_REPORT_COPY.tail,
  };
}

/**
 * 리플레이 주석 앵커 — 기록이 있을 때만 사기범이 카드 값을 **처음** 말한 줄(가장 이른 앵커). 기록이 없으면(R-2) `null`
 * (근거 없는 지목 금지 — UX-018 v1.38 ①).
 */
export function personaReplayAnchor(block: PersonaBlockView | null): number | null {
  if (!block) return null;
  const anchors = block.items.map((i) => i.scammerTurnIndex).filter((t): t is number => t !== undefined);
  return anchors.length > 0 ? Math.min(...anchors) : null;
}

// ── 이벤트(T194-C10) — 클라 구조화 로그 1줄(숫자 · 종류만 · G432 형식 — 카드 값 · 식별자 0) ──

export function personaEventLogLine(
  event: { kind: "persona_card_shown"; rows: number } | { kind: "persona_report_block_shown"; state: PersonaBlockState; rows: number },
): string {
  return `[persona-card] ${JSON.stringify({ v: 1, ...event })}`;
}
