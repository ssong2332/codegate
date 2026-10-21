// T194-b(docs/Architecture.md §84.3.3 · §84.3.7 · PRD AC-104 · UX-014 v1.38 (1)(3) · UX-008 v1.38 (1) · UX-018 v1.38 ① · D-118~D-120)
// 훈련용 가상 신상 카드 — 클라이언트 쪽 **표시 전용** 순수 함수 · 정본 문면.
//
// ⛔ 클라이언트는 카드 값을 만들거나 고치지 않는다(AC-104 (d)) — 세션 문서 · 리포트 문서에 서버가 쓴 값을 그대로 그린다.
//    클라 → 서버로 완성 카드를 보내는 경로 0(이 파일은 어떤 API도 부르지 않는다). §88 — 사용자가 넣는 원값은 `personaCardInput.ts`가
//    다루고, 서버 검증기만 카드를 만든다.
// ⛔ 문면은 `docs/UX.md` 정본 글자 그대로(`personaCard.test.ts`가 UX.md 원문과 대조한다). 의역 금지.

/** 화면에 그리는 카드 행(라벨 · 값). 서버 `PersonaCardItem`의 표시 부분. */
export type PersonaCardRow = { label: string; value: string };

/** UX-014 v1.38 (1) — `pre-call-notice` 안 카드 블록 정본. */
export const PERSONA_CARD_COPY = {
  title: "이번 훈련 속 내 정보",
  guide: "훈련하는 동안 아래 정보를 내 정보라고 생각해 주세요.",
  noticeVirtual: "모두 훈련을 위해 지어낸 가상 정보입니다. 내 실제 이름이나 계정 정보는 쓰지 않았습니다.",
  noticeNoRevisit: "통화가 시작되면 이 정보는 다시 볼 수 없습니다.",
  /** §88(UX D-131 (5)) — 사용자가 넣은 카드(v2 · self)의 고지 ⓐ(`noticeVirtual` 대신). */
  noticeInput: "훈련 시작 전에 직접 넣은 정보입니다.",
} as const;

/** 벨 직전 고지에 그릴 카드 — 행 + 고지 ⓐ 문면(v1 = 가상 정보 · v2 self = 직접 넣은 정보). */
export type PersonaCardView = { rows: PersonaCardRow[]; notice: string };

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
 * 세션 문서 `personaCard` → 그릴 카드. 그리지 않을 때는 `null`:
 * - 필드 부재 · 모양이 다름(UF-014 Failure (a) — 카드 블록만 빠지고 나머지 고지는 그대로)
 * - 세션 난이도가 고급이 아님(UF-014 Failure (c) 클라 방어 — ⛔ 충족 수단은 서버 술어다)
 * - ⭐ §88(UX D-131 (6)) — 챌린지를 보낸 사람이 넣은 카드(`v: 2` · `inputBy: "sender"`) = 받는 사람 화면 · 통화 전 노출 0
 */
export function readSessionPersonaCard(raw: unknown, difficultyLevel: unknown): PersonaCardView | null {
  if (difficultyLevel !== "advanced") return null;
  if (!raw || typeof raw !== "object") return null;
  const { v, inputBy, items } = raw as { v?: unknown; inputBy?: unknown; items?: unknown };
  let notice: string;
  if (v === 1) notice = PERSONA_CARD_COPY.noticeVirtual;
  else if (v === 2 && inputBy === "self") notice = PERSONA_CARD_COPY.noticeInput;
  else return null;
  const rows = readRows(items);
  return rows ? { rows, notice } : null;
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
/** §88 — `inputBy`: 사용자가 넣은 카드(v2)에서 온 블록이면 누가 넣었는지(문면 분기 · UX D-131 (6)(7)). 부재 = 옛 v1 카드. */
/** §93 — `context`: 협박형 시나리오의 카드(교훈 문면 분기 · UX D-136). 부재 = 기관형(종전 문면). */
export type PersonaBlockContext = "child-threat" | "self-threat";
export type PersonaBlockView = {
  state: PersonaBlockState;
  items: PersonaBlockRow[];
  inputBy?: "self" | "sender";
  context?: PersonaBlockContext;
};

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
  // §88(UX D-131 (6)(7)) — 사용자가 넣은 카드(v2)의 R-2 사실 문장 · 꼬리. R-1 · R-3 제목 · 사실 · 대처 · 설명은 무변경.
  r2FactSelfInput: "이번 훈련에서는 아래 정보를 내 정보로 정해 두었습니다.",
  r2FactSender: "이번 훈련에서는 보낸 분이 아래 정보를 내 정보로 넣어 두었습니다.",
  tailSelfInput: "위 정보는 훈련 시작 전에 직접 넣은 정보입니다.",
  tailSender: "위 정보는 이 훈련을 보낸 분이 넣은 정보입니다.",
  // §93(UX D-136) — 협박형 2종의 설명 · 대처(제목 · 사실 · 꼬리는 위 문면 그대로). R-1 · R-2 공통.
  childExplanation:
    "상대가 자녀 이름·학년·학원을 안다고 해서 진짜 납치라는 증거가 되지는 않습니다. 이런 정보는 이미 다른 곳에서 새어 나갔을 수 있습니다.",
  childAction:
    "자녀가 위험하다는 전화를 받으면 돈을 보내지 말고 일단 끊은 뒤, 자녀나 학원·학교에 직접 전화해 안전을 확인하세요. 연락이 닿지 않으면 112에 신고하세요.",
  selfThreatExplanation:
    "상대가 내 이름·생일·사는 곳·하는 일을 안다고 해서 그 말이 사실이라는 증거가 되지는 않습니다. 이런 정보는 이미 다른 곳에서 새어 나갔을 수 있습니다.",
  selfThreatAction: "신상을 대며 협박하는 전화라도 돈을 보내지 말고 일단 끊은 뒤, 112에 신고해 도움을 받으세요.",
} as const;

// ── 되짚어보기(UX-018) — 받는 사람 화면의 "보낸 분이 넣은 정보" 블록(D-131 (6) 갱신 · D-133 (5) · 사용자 요청 2026-10-20) ──

/** 블록 문면 — 새 문장 0 · 리포트 R-2 제목 · `r2FactSender` · `tailSender` 재사용(UX D-133 (5)). */
export type ReplaySenderPersonaView = { title: string; fact: string; rows: PersonaCardRow[]; tail: string };

/**
 * 세션 문서 `personaCard` → 되짚어보기 블록. 그릴 때만 값, 그 밖 `null`:
 * - 챌린지 수신 세션(`session.challengeId` 있음)이고 카드가 `v: 2` · `inputBy: "sender"`일 때만
 * - 카드 없음 · 모양 이상 · self 카드 · 옛 v1 카드 · 자가 세션 = `null`(self 되짚어보기는 무변경 — OQ-U103)
 * 행은 **세션 문서의 카드 전부**다(리포트 R-1 블록은 먼저 말한 항목만 담아 "넣어 두었습니다" 문장과 어긋날 수 있다).
 * ⭐ 이 화면은 통화가 끝난 뒤에만 열린다(되짚어보기 = 세션 종료 뒤) — 통화 전 숨김(D-131 (6) · G628)과 충돌하지 않는다.
 */
export function readReplaySenderPersona(raw: unknown, isChallengeSession: boolean): ReplaySenderPersonaView | null {
  if (!isChallengeSession || !raw || typeof raw !== "object") return null;
  const { v, inputBy, items } = raw as { v?: unknown; inputBy?: unknown; items?: unknown };
  if (v !== 2 || inputBy !== "sender") return null;
  const rows = readRows(items);
  if (!rows) return null;
  return {
    title: PERSONA_REPORT_COPY.r2Title,
    fact: PERSONA_REPORT_COPY.r2FactSender,
    rows,
    tail: PERSONA_REPORT_COPY.tailSender,
  };
}

/** UX-018 v1.38 ① — R-1 세션에서 사기범이 카드 값을 처음 말한 줄의 주석. */
export const PERSONA_REPLAY_NOTE = "이 말이 '상대가 먼저 꺼낸 내 정보' 신호였습니다";

/** 리포트 문서 `personaBlock` → 뷰(부재 · 모양이 다르면 `null` = R-4 · 블록 0). */
export function readPersonaBlock(raw: unknown): PersonaBlockView | null {
  if (!raw || typeof raw !== "object") return null;
  const { state, items, inputBy, context } = raw as { state?: unknown; items?: unknown; inputBy?: unknown; context?: unknown };
  if (state !== "R-1" && state !== "R-2" && state !== "R-3") return null;
  const rows = readRows(items);
  if (!rows) return null;
  const withAnchors = rows.map((row, i) => {
    const anchor = (items as Array<{ scammerTurnIndex?: unknown }>)[i]!.scammerTurnIndex;
    return typeof anchor === "number" && Number.isInteger(anchor) && anchor >= 0 ? { ...row, scammerTurnIndex: anchor } : row;
  });
  // §88 — 모르는 값은 버린다(= 옛 v1 문면 — 사실과 다른 "넣은 정보" 문장을 만들지 않는 쪽).
  return {
    state,
    items: withAnchors,
    ...(inputBy === "self" || inputBy === "sender" ? { inputBy } : {}),
    // §93 — 모르는 값은 버린다(= 기관형 문면).
    ...(context === "child-threat" || context === "self-threat" ? { context } : {}),
  };
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
  // §88(UX D-131 (6)(7)) — 사용자가 넣은 카드면 R-2 사실 문장 · 꼬리만 갈린다(부재 = 옛 v1 문면 그대로).
  const r2Fact =
    block.inputBy === "sender"
      ? PERSONA_REPORT_COPY.r2FactSender
      : block.inputBy === "self"
        ? PERSONA_REPORT_COPY.r2FactSelfInput
        : PERSONA_REPORT_COPY.r2Fact;
  const tail =
    block.inputBy === "sender"
      ? PERSONA_REPORT_COPY.tailSender
      : block.inputBy === "self"
        ? PERSONA_REPORT_COPY.tailSelfInput
        : PERSONA_REPORT_COPY.tail;
  // §93(UX D-136) — 협박형은 설명 · 대처만 갈린다(기관 · 회사 이야기가 아니다 · 자녀 안전 확인 방법). 상태와 무관하게 같은 문면.
  if (block.context === "child-threat" || block.context === "self-threat") {
    const child = block.context === "child-threat";
    return {
      title: mentioned ? PERSONA_REPORT_COPY.r1Title : PERSONA_REPORT_COPY.r2Title,
      fact: mentioned ? PERSONA_REPORT_COPY.r1Fact : r2Fact,
      action: child ? PERSONA_REPORT_COPY.childAction : PERSONA_REPORT_COPY.selfThreatAction,
      explanation: child ? PERSONA_REPORT_COPY.childExplanation : PERSONA_REPORT_COPY.selfThreatExplanation,
      tail,
    };
  }
  return {
    title: mentioned ? PERSONA_REPORT_COPY.r1Title : PERSONA_REPORT_COPY.r2Title,
    fact: mentioned ? PERSONA_REPORT_COPY.r1Fact : r2Fact,
    action: block.state === "R-3" ? PERSONA_REPORT_COPY.r3Action : PERSONA_REPORT_COPY.action,
    explanation: mentioned ? PERSONA_REPORT_COPY.r1Explanation : PERSONA_REPORT_COPY.r2Explanation,
    tail,
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
