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

/**
 * §66.7 — 부정 문맥 배제. ⛔ **§65.3의 P1/P2 패턴은 한 글자도 고치지 않는다**(G412가 고정).
 * 이 층은 매치 **주변**만 본다.
 *
 * ⛔ 왜 뒤를 보는가: 한국어의 부정은 후치다("…드릴 수 없다" · "…드릴 단계가 아니다").
 * ⛔ 왜 "지 마세요" 류(금지)는 넣지 않는가: 그것은 **상대에게 하는 말**이라 약속과 공존한다
 *    ("연결해 드릴게요 걱정하지 마세요"). 여기 목록은 **불가능·부인**만이다.
 */
const NEG_CLAUSE_BOUNDARY = /[.!?…。、,\n\r]/;
const NEG_SUFFIX_WINDOW = 20;
const NEG_PREFIX_WINDOW = 6;

/** 후치 부정 — 매치 **뒤** 같은 절에서 찾는다. */
const NEGATION_AFTER = /아니|아닙|아냐|없|어렵|어려워|어려우|못|않|곤란|불가|안\s*되|안\s*돼|안\s*됩/;

/** 전치 부정(짧은 부정) — 매치 **바로 앞**에 토큰으로 붙어 있을 때만. ⛔ "안내"의 "안"에 걸리지
 *  않도록 `\s*$` 앵커를 반드시 유지할 것. */
const NEGATION_BEFORE = /(?:^|[\s,.!?"'([])(?:못|안)\s*$/;

/** ⛔ export한다 — G411이 이 함수 단독으로 진리표를 친다. */
export function isNegatedPromiseMatch(text: string, start: number, end: number): boolean {
  const after = text.slice(end, end + NEG_SUFFIX_WINDOW).split(NEG_CLAUSE_BOUNDARY)[0];
  const beforeParts = text.slice(Math.max(0, start - NEG_PREFIX_WINDOW), start).split(NEG_CLAUSE_BOUNDARY);
  const before = beforeParts[beforeParts.length - 1];
  return NEGATION_AFTER.test(after) || NEGATION_BEFORE.test(before);
}

/** 한 패턴의 **모든** 매치 중 부정 문맥이 아닌 것이 1건이라도 있으면 true. */
function hasSurvivingMatch(patterns: readonly RegExp[], text: string): boolean {
  for (const p of patterns) {
    // ⛔ 정본 배열에 /g를 붙이지 말 것(lastIndex 상태 오염) — 여기서 복제본을 만든다.
    for (const m of text.matchAll(new RegExp(p.source, "g"))) {
      const start = m.index ?? 0;
      if (!isNegatedPromiseMatch(text, start, start + m[0].length)) return true;
    }
  }
  return false;
}

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
  /** §66.8 — 매치가 1건 이상 있었으나 전부 부정 문맥으로 배제된 턴 수. ⛔ 헤드라인 아님.
   * `emptyPromise`와 함께 읽지 않으면 의미 없다(`emptyPromiseWide`와 같은 취급). 이 필드의
   * 존재 자체가 §66 패치 전/후를 가르는 시기 표식이다(§66.8 (3)). */
  negatedPromiseTurns: number;
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
  let negatedPromiseTurns = 0;

  for (const turn of scannedScammerTurns) {
    // §66.6 — .test()가 아니라 매치 위치가 필요하므로 모든 매치를 순회한다(hasSurvivingMatch).
    // 한 턴에 매치가 둘일 때 "앞의 것은 거절, 뒤의 것은 약속"이 성립하므로 하나라도 살아남으면
    // 그 턴을 센다.
    const matchesConnectAny = CONNECT_PROMISE_PATTERNS.some((p) => p.test(turn.textMasked));
    const matchesVerifyAny = VERIFY_PROMISE_PATTERNS.some((p) => p.test(turn.textMasked));
    const matchesConnect = hasSurvivingMatch(CONNECT_PROMISE_PATTERNS, turn.textMasked);
    const matchesVerify = hasSurvivingMatch(VERIFY_PROMISE_PATTERNS, turn.textMasked);
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
    // §66.7 (4) — 매치는 있었으나(raw) 전부 부정 문맥으로 배제된 경우(surviving 0건)만 센다.
    if ((matchesConnectAny || matchesVerifyAny) && !matchesConnect && !matchesVerify) {
      negatedPromiseTurns += 1;
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
    negatedPromiseTurns,
  };
}
