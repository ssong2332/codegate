// §65(OQ-A76 ⓒ) — "빈 약속" 사후 지표(D-6). ⛔ 순수 함수다 — 서버 SDK·런타임 패키지(Admin/
// Functions) import 금지(호출부가 이미 read한 값을 넘긴다, verifyTimeline.ts·smsTimeline.ts·
// reportLlmProvider.ts와 동일 관례, §65.7 6).
//
// ⛔ 적용 대상 판정(`verifyInterceptEnabled` = `hasVerifyIntercept(scenarioId) && advanced`)은
// 이 파일에서 재계산하지 않는다 — 호출부가 계산해 불리언으로 넘긴다(G400 선례, §65.9).

/**
 * P1 — **연결(이관) 약속**. 헤드라인 판정(`emptyPromise`)이 쓰는 유일한 집합.
 * G403의 프롬프트측 금지 리터럴 3종(`연결해 드리겠습니다`·`연결해 드릴`·`확인해 드리겠습니다`)에서
 * 출발하되, **전사는 모델 자유 발화라 어미가 갈린다**(드리/드릴/주겠/줄게)는 것만 넓혔다.
 * ⛔ 넓히기는 **어미 축 하나뿐**이다 — 동사(연결/넘기기/바꾸기)는 실제 관측·카탈로그 어휘에서만 왔다.
 */
const CONNECT_PROMISE_PATTERNS: readonly RegExp[] = [
  /연결\s*해?\s*(드리|드릴|주겠|줄게)/,
  /연결\s*하겠/,
  /연결\s*시켜\s*(드리|드릴|주겠|줄게)/,
  /(넘겨|돌려|바꿔)\s*(드리|드릴|주겠|줄게)/,
];

/**
 * P2 — **"확인해 주겠다" 약속**. ⚠️ 정밀도가 낮다(확인의 목적어가 창구가 아닐 수 있다).
 * 헤드라인에서 제외하고 `verifyPromiseTurns`로만 센다(§65.2 부수 판정).
 */
const VERIFY_PROMISE_PATTERNS: readonly RegExp[] = [
  /확인\s*해?\s*(드리|드릴|주겠|줄게)/,
];

export type EmptyPromiseScanMessage = {
  role: "user" | "scammer";
  textMasked: string;
  turnIndex: number;
  notSpoken?: true;
};

export type EmptyPromiseMetric = {
  applicable: boolean;
  verifyOfferDocs: number;
  scammerTurns: number;
  connectPromiseTurns: number;
  verifyPromiseTurns: number;
  firstPromiseTurnIndex: number | null;
  emptyPromise: boolean;
  emptyPromiseWide: boolean;
};

/**
 * §65.2 4조건(C1~C4)을 계산한다. ⛔ `applicable === false`여도 카운트 필드는 정상 산출한다 —
 * 게이트는 `emptyPromise*` 두 불리언에만 건다(스캔 로직을 독립으로 검증할 수 있어야 한다, §65.9).
 */
export function computeEmptyPromiseMetric(input: {
  /** ⛔ 여기서 재계산하지 말 것 — 호출부가 `hasVerifyIntercept && advanced`로 넘긴다(G400 선례). */
  verifyInterceptEnabled: boolean;
  verifyOfferDocs: number;
  messages: readonly EmptyPromiseScanMessage[];
}): EmptyPromiseMetric {
  const { verifyInterceptEnabled, verifyOfferDocs, messages } = input;

  // C3/C4 — role==="scammer" && notSpoken !== true 인 문서만 스캔한다(§65.6 제외 표 · §65.9 계산 규칙).
  const scannedScammerTurns = messages.filter(
    (m) => m.role === "scammer" && m.notSpoken !== true,
  );

  let connectPromiseTurns = 0;
  let verifyPromiseTurns = 0;
  let firstPromiseTurnIndex: number | null = null;

  for (const turn of scannedScammerTurns) {
    const matchesConnect = CONNECT_PROMISE_PATTERNS.some((p) => p.test(turn.textMasked));
    const matchesVerify = VERIFY_PROMISE_PATTERNS.some((p) => p.test(turn.textMasked));
    if (matchesConnect) {
      connectPromiseTurns += 1;
      if (firstPromiseTurnIndex === null) {
        firstPromiseTurnIndex = turn.turnIndex;
      }
    }
    if (matchesVerify) {
      verifyPromiseTurns += 1;
      if (firstPromiseTurnIndex === null) {
        firstPromiseTurnIndex = turn.turnIndex;
      }
    }
  }

  const applicable = verifyInterceptEnabled;
  // C1(applicable) ∧ C2(verifyOfferDocs===0) ∧ C3(connectPromiseTurns>0) — C4는 위 스캔 필터에 이미 반영.
  const emptyPromise = applicable && verifyOfferDocs === 0 && connectPromiseTurns > 0;
  const emptyPromiseWide =
    applicable && verifyOfferDocs === 0 && connectPromiseTurns + verifyPromiseTurns > 0;

  return {
    applicable,
    verifyOfferDocs,
    scammerTurns: scannedScammerTurns.length,
    connectPromiseTurns,
    verifyPromiseTurns,
    firstPromiseTurnIndex,
    emptyPromise,
    emptyPromiseWide,
  };
}
