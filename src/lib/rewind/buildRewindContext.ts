// 즉시 되감기(UX-028, T70, AC-062) 맥락 구성 — 순수 함수. Firestore SDK 타입에 의존하지 않아
// node:test로 검증한다(src/lib/replay/buildReplayTimeline.ts와 동일한 "부수효과와 로직 분리" 관례).
//
// ⚠️ 새 판정 로직을 도입하지 않는다. 서버가 이미 계산해 리포트에 저장해 둔 deceivedMoments 중
// **한 순간**을 골라, 그 앞뒤 마스킹 대화를 표시용으로 잘라 내는 일만 한다(AC-024 — 표시되는
// 텍스트는 전부 저장 시점에 이미 마스킹된 값이다).

export type RewindMessageSource = {
  id: string;
  role: "scammer" | "user";
  textMasked: string;
  turnIndex: number;
};

export type RewindMomentSource = {
  turnIndex: number;
  timeLabel: string;
  tactic: string;
  correctAction: string;
};

export type RewindContextTurn = RewindMessageSource & {
  /**
   * `scammer-focus` = 문제의 그 대사(강조), `original-answer` = 그때 사용자가 실제로 한 답변,
   * `context` = 주변 맥락. 색이 아니라 이 라벨로 구분해 표기한다(UX-028 Accessibility).
   */
  kind: "context" | "scammer-focus" | "original-answer";
};

export type RewindContext = {
  turns: RewindContextTurn[];
  /** 문제의 사기범 대사(없으면 null — 전사 누락 등). */
  scammerLine: RewindContextTurn | null;
  /** 그때 사용자가 실제로 했던 답변(없으면 null). */
  originalAnswer: RewindContextTurn | null;
  /** 잘려 나간 앞/뒤 턴이 있는지("맥락 대화 더 보기" 노출 판단). */
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
};

export type RewindContextOptions = { before?: number; after?: number };

/**
 * `moment.turnIndex`는 **사용자 응답 턴**의 인덱스이고(functions/src/report/analyzeConversation.ts:149),
 * 짝이 되는 사기범 발화는 정렬 순서상 바로 앞의 scammer 메시지다. turnIndex 산술(−1)이 아니라 정렬
 * 위치로 찾는 이유는 채널 전이 등으로 turnIndex가 연속이 아닐 수 있기 때문이다(§13.1).
 */
export function buildRewindContext(
  messages: readonly RewindMessageSource[],
  moment: RewindMomentSource,
  options: RewindContextOptions = {},
): RewindContext {
  const before = options.before ?? 2;
  const after = options.after ?? 1;
  const sorted = [...messages].sort((a, b) => a.turnIndex - b.turnIndex);

  const answerPos = sorted.findIndex(
    (m) => m.role === "user" && m.turnIndex === moment.turnIndex,
  );
  if (answerPos < 0) {
    return {
      turns: [],
      scammerLine: null,
      originalAnswer: null,
      hasMoreBefore: false,
      hasMoreAfter: false,
    };
  }

  let scammerPos = -1;
  for (let i = answerPos - 1; i >= 0; i -= 1) {
    if (sorted[i].role === "scammer") {
      scammerPos = i;
      break;
    }
  }

  const anchorPos = scammerPos >= 0 ? scammerPos : answerPos;
  const start = Math.max(0, anchorPos - before);
  const end = Math.min(sorted.length - 1, answerPos + after);

  const turns: RewindContextTurn[] = sorted.slice(start, end + 1).map((message, i) => {
    const position = start + i;
    const kind: RewindContextTurn["kind"] =
      position === scammerPos ? "scammer-focus" : position === answerPos ? "original-answer" : "context";
    return { ...message, kind };
  });

  return {
    turns,
    scammerLine: turns.find((t) => t.kind === "scammer-focus") ?? null,
    originalAnswer: turns.find((t) => t.kind === "original-answer") ?? null,
    hasMoreBefore: start > 0,
    hasMoreAfter: end < sorted.length - 1,
  };
}
