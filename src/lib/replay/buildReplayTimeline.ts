// 리플레이 해설(UX-018, T33, AC-038) 타임라인 병합 — 순수 함수. Firestore SDK 타입에 의존하지
// 않아 node:test로 검증한다(functions/src/report/analyzeConversation.ts·
// src/lib/history/mapHistoryItems.ts와 동일한 "부수효과와 로직 분리" 관례).
//
// ⚠️ 이 함수는 새로운 "속았는지" 판정 로직을 도입하지 않는다(신규 분석 로직 금지, AC-038·
// UX.md UX-018 Architect Handoff "신규 분석 파이프라인을 도입하지 않는다"). 이미 T9
// (analyzeConversation)가 서버에서 계산해 reports/{sessionId}에 저장해 둔 deceivedMoments를
// turnIndex 기준으로 각 대화 메시지에 매칭시키는 표시용 병합(join)만 수행한다.

export type ReplayMessageSource = {
  id: string;
  role: "scammer" | "user";
  textMasked: string;
  turnIndex: number;
  channel?: "voice" | "messenger";
};

export type ReplayDeceivedMomentSource = {
  turnIndex: number;
  timeLabel: string;
  tactic: string;
  correctAction: string;
};

export type ReplayTimelineItem = ReplayMessageSource & {
  annotation: ReplayDeceivedMomentSource | null;
};

/** messages를 turnIndex 오름차순으로 정렬하고, deceivedMoments 중 같은 turnIndex를 가진 항목을
 * annotation으로 매칭시킨다(§13.1 "turnIndex는 채널을 넘어 단조 증가" — 교차채널 세션도 하나의
 * 시간축으로 자연 병합된다, 별도 채널 병합 로직 불필요). */
export function buildReplayTimeline(
  messages: readonly ReplayMessageSource[],
  deceivedMoments: readonly ReplayDeceivedMomentSource[],
): ReplayTimelineItem[] {
  const sorted = [...messages].sort((a, b) => a.turnIndex - b.turnIndex);
  const momentsByTurn = new Map(deceivedMoments.map((moment) => [moment.turnIndex, moment]));
  return sorted.map((message) => ({
    ...message,
    annotation: momentsByTurn.get(message.turnIndex) ?? null,
  }));
}

/** 주석(신호)이 달린 항목만 turnIndex 순서로 추출 — 스텝 내비게이션("다음/이전 신호로 점프",
 * P-13)이 이동할 대상 목록이다. */
export function getAnnotatedTurnIndexes(timeline: readonly ReplayTimelineItem[]): number[] {
  return timeline.filter((item) => item.annotation !== null).map((item) => item.turnIndex);
}
