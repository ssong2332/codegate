// 리플레이 해설(UX-018, T33, AC-038) 타임라인 병합 — 순수 함수. Firestore SDK 타입에 의존하지
// 않아 node:test로 검증한다(functions/src/report/analyzeConversation.ts·
// src/lib/history/mapHistoryItems.ts와 동일한 "부수효과와 로직 분리" 관례).
//
// ⚠️ 이 함수는 새로운 "속았는지" 판정 로직을 도입하지 않는다(신규 분석 로직 금지, AC-038·
// UX.md UX-018 Architect Handoff "신규 분석 파이프라인을 도입하지 않는다"). 이미 T9
// (analyzeConversation)가 서버에서 계산해 reports/{sessionId}에 저장해 둔 deceivedMoments를
// turnIndex 기준으로 각 대화 메시지에 매칭시키는 표시용 병합(join)만 수행한다.
//
// T89(§15.1.5 (4)) — 통화 중 문자 이벤트도 같은 타임라인에 병합한다. **병합 축은 시계가 아니라
// 턴 앵커**이며(§15.6 G15), 문자는 언제나 같은 앵커의 메시지 **뒤**에 놓이고 메시지끼리의 상대
// 순서는 불변이다(문자가 0건이면 결과가 도입 전과 완전히 동일 — 회귀 테스트로 고정).

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

/** `reports/{rid}.smsTimeline[]`의 클라 표현(읽기 전용, 표시 전용). 서버가 이미 **최종 표시
 * 순서로 정렬해** 내려주므로 화면·이 함수는 순서를 다시 해석하지 않는다(§15.1.5 (6)). */
export type ReplaySmsSource = {
  smsId: string;
  kind: "account" | "link" | "otp";
  senderLabel: string;
  body: string;
  linkDisplayText?: string;
  anchorTurnIndex: number;
  anchorResolved: boolean;
  timeLabel?: string;
  events: { event: string; what: string; correctAction?: string }[];
};

export type ReplayTimelineMessageItem = ReplayMessageSource & {
  kind: "message";
  annotation: ReplayDeceivedMomentSource | null;
};

export type ReplayTimelineSmsItem = {
  kind: "sms";
  /** React key 전용. 메시지 id와 충돌하지 않도록 접두사를 붙인다. */
  id: string;
  /** 정렬·배치에 쓰는 값 = 서버가 해결한 `anchorTurnIndex`(이 turnIndex의 메시지 '뒤'에 놓인다). */
  turnIndex: number;
  sms: ReplaySmsSource;
};

export type ReplayTimelineItem = ReplayTimelineMessageItem | ReplayTimelineSmsItem;

/** messages를 turnIndex 오름차순으로 정렬하고, deceivedMoments 중 같은 turnIndex를 가진 항목을
 * annotation으로 매칭시킨다(§13.1 "turnIndex는 채널을 넘어 단조 증가" — 교차채널 세션도 하나의
 * 시간축으로 자연 병합된다, 별도 채널 병합 로직 불필요). 문자 이벤트(T89)는 같은 축에 얹되
 * **주석 매칭 대상이 아니다**(§15.6 G17 — turnIndex 하나로 Map을 조회하면 앵커 메시지와 값이 같아
 * 같은 주석 카드가 두 번 렌더된다). */
export function buildReplayTimeline(
  messages: readonly ReplayMessageSource[],
  deceivedMoments: readonly ReplayDeceivedMomentSource[],
  smsTimeline: readonly ReplaySmsSource[] = [],
): ReplayTimelineItem[] {
  const momentsByTurn = new Map(deceivedMoments.map((moment) => [moment.turnIndex, moment]));
  // 정렬 키 = (turnIndex | anchorTurnIndex, kindRank, seq). 메시지는 rank 0, 문자는 rank 1이라
  // 같은 앵커에서 문자가 **항상 메시지 뒤**에 온다. seq는 서버가 준 배열 순서를 그대로 보존한다.
  const keyed: { sortKey: [number, number, number]; item: ReplayTimelineItem }[] = [
    ...messages.map((message, seq) => ({
      sortKey: [message.turnIndex, 0, seq] as [number, number, number],
      item: {
        ...message,
        kind: "message" as const,
        annotation: momentsByTurn.get(message.turnIndex) ?? null,
      },
    })),
    ...smsTimeline.map((sms, seq) => ({
      sortKey: [sms.anchorTurnIndex, 1, seq] as [number, number, number],
      item: { kind: "sms" as const, id: `sms-${sms.smsId}`, turnIndex: sms.anchorTurnIndex, sms },
    })),
  ];
  keyed.sort(
    (a, b) =>
      a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || a.sortKey[2] - b.sortKey[2],
  );
  return keyed.map((entry) => entry.item);
}

/** 주석(신호)이 달린 항목만 turnIndex 순서로 추출 — 스텝 내비게이션("다음/이전 신호로 점프",
 * P-13)이 이동할 대상 목록이다.
 *
 * ⚠️ **문자 항목을 절대 포함하지 않는다**(§15.6 G16). 이 배열의 인덱스는 리포트 `deceivedMoments`
 * 배열 인덱스와 **1:1이라는 전제**로 되감기 딥링크(`/report/rewind?moment=`)와 진입 조건
 * (`resolveRewindEntry({ deceivedMomentCount })`)에 그대로 쓰인다 — 문자를 섞으면 되감기가 엉뚱한
 * 순간을 열고, 속은 순간 0건 세션에 되감기 진입점이 떠 AC-062가 깨진다(T70/T74 동반 파손). */
export function getAnnotatedTurnIndexes(timeline: readonly ReplayTimelineItem[]): number[] {
  return timeline
    .filter((item): item is ReplayTimelineMessageItem => item.kind === "message")
    .filter((item) => item.annotation !== null)
    .map((item) => item.turnIndex);
}
