// §65(OQ-A76 ⓒ) D-6 "빈 약속" 사후 지표 — G405~G407(§65.10).
//
// 이 파일이 고정하는 것 세 가지:
//   G405 — 양방향 역검증(오염 샘플은 잡히고, 오퍼가 실제로 떴으면 무죄가 된다).
//   G406 — 적용 범위(`applicable` 게이트) + 방출 조건(분모 오염 금지 — `applicable:false`면
//          호출부가 로그를 찍지 않는다는 것을 소스 스캔으로도 고정).
//   G407 — 스캔 대상 제외(`role:"user"`·`notSpoken:true`) + 순수성(같은 입력 → 같은 출력,
//          부수효과 없음, `firebase-admin`/`firebase-functions` 무의존).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  computeEmptyPromiseMetric,
  computeEmptyPromiseMetric as computeMetric,
  isNegatedPromiseMatch,
  type EmptyPromiseScanMessage,
} from "../emptyPromiseMetric";

// 테스트는 컴파일된 lib/에서 돈다(functions/lib/report/__tests__/) — 소스 경로를 명시적으로
// 잡는다(`verifyIntercept/__tests__/deliverVerifyOfferLogInvariant.test.ts`와 같은 관례).
const METRIC_SRC = path.resolve(__dirname, "../../../src/report/emptyPromiseMetric.ts");
const CORE_SRC = path.resolve(__dirname, "../../../src/report/generateReportCore.ts");

const scammer = (turnIndex: number, textMasked: string, notSpoken?: true): EmptyPromiseScanMessage => ({
  role: "scammer",
  textMasked,
  turnIndex,
  ...(notSpoken ? { notSpoken } : {}),
});
const user = (turnIndex: number, textMasked: string): EmptyPromiseScanMessage => ({
  role: "user",
  textMasked,
  turnIndex,
});

// §65.3 어휘 출처 대조 — 옛 TOOL_DRIVEN 보류 문구(promptAssembly.ts:266 옛 값), 라이브 관측 L-2,
// 카탈로그 어휘(verifyIntercept.ts:130). 지어낸 문장이 아니라 정본 출처에서 그대로 옮긴다.
const OLD_TOOL_DRIVEN_LINE = "잠시만요, 확인 부서를 연결해 드리겠습니다.";
const LIVE_L2_LINE = "바로 연결하겠습니다.";
const CATALOG_LINE = "제가 여신확인창구로 바로 넘겨 드리겠습니다.";

// ── G405 — 양방향 역검증 ────────────────────────────────────────────────────

test("[G405] 오염 샘플(옛 약속 문장 + verifyOfferDocs:0) ⇒ emptyPromise === true", () => {
  const result = computeEmptyPromiseMetric({
    verifyInterceptEnabled: true,
    verifyOfferDocs: 0,
    messages: [scammer(0, OLD_TOOL_DRIVEN_LINE)],
  });
  assert.equal(result.applicable, true);
  assert.equal(result.connectPromiseTurns, 1);
  assert.equal(result.emptyPromise, true, "옛 TOOL_DRIVEN 약속 문장이 잡히지 않았다");
});

test("[G405] 같은 입력에 verifyOfferDocs:1을 주면 emptyPromise === false (C2가 무죄를 만든다)", () => {
  const result = computeEmptyPromiseMetric({
    verifyInterceptEnabled: true,
    verifyOfferDocs: 1,
    messages: [scammer(0, OLD_TOOL_DRIVEN_LINE)],
  });
  assert.equal(result.connectPromiseTurns, 1, "문구 매치 자체는 여전히 세어져야 한다");
  assert.equal(result.emptyPromise, false, "오퍼가 실제로 떴는데도 빈 약속으로 오판했다");
  assert.equal(result.emptyPromiseWide, false);
});

test("[G405] 라이브 관측 L-2 대사도 오염 샘플과 같은 결과(verifyOfferDocs:0 ⇒ true / :1 ⇒ false)", () => {
  const base = { verifyInterceptEnabled: true, messages: [scammer(0, LIVE_L2_LINE)] } as const;
  assert.equal(computeEmptyPromiseMetric({ ...base, verifyOfferDocs: 0 }).emptyPromise, true);
  assert.equal(computeEmptyPromiseMetric({ ...base, verifyOfferDocs: 1 }).emptyPromise, false);
});

test("[G405] 카탈로그 어휘(넘겨 드리겠습니다)도 오염 샘플과 같은 결과", () => {
  const base = { verifyInterceptEnabled: true, messages: [scammer(0, CATALOG_LINE)] } as const;
  assert.equal(computeEmptyPromiseMetric({ ...base, verifyOfferDocs: 0 }).emptyPromise, true);
  assert.equal(computeEmptyPromiseMetric({ ...base, verifyOfferDocs: 1 }).emptyPromise, false);
});

// ── G406 — 적용 범위 + 무로그(분모 오염 금지) ────────────────────────────────

test("[G406] verifyInterceptEnabled:false ⇒ 약속 문장이 있어도 applicable===false && emptyPromise===false", () => {
  const result = computeEmptyPromiseMetric({
    verifyInterceptEnabled: false,
    verifyOfferDocs: 0,
    messages: [scammer(0, OLD_TOOL_DRIVEN_LINE)],
  });
  assert.equal(result.applicable, false);
  // ⛔ §65.9 — applicable===false여도 카운트 필드는 정상 산출한다(게이트만 두 불리언에 건다).
  assert.equal(result.connectPromiseTurns, 1);
  assert.equal(result.emptyPromise, false);
  assert.equal(result.emptyPromiseWide, false);
});

test("[G406] 호출부 스텁 — applicable===false면 로그 콜백이 0회 호출된다(분모 오염 금지, §65.5)", () => {
  // generateReportCore.ts의 실제 호출 지점(`if (emptyPromise.applicable) { logger.info(...) }`)과
  // 동형의 게이트를 스텁 로거로 재현한다. 이 파일은 firebase-admin/-functions를 import하지 않는다
  // (순수성 유지) — 구조적 동형은 아래 CORE_SRC 소스 스캔으로 별도 고정한다.
  let logCalls = 0;
  const logStub = (_msg: string, _payload: unknown) => {
    logCalls += 1;
  };
  const emitLikeCallSite = (result: ReturnType<typeof computeEmptyPromiseMetric>) => {
    if (result.applicable) {
      logStub("[§65.5] 빈 약속 지표", result);
    }
  };

  emitLikeCallSite(
    computeEmptyPromiseMetric({
      verifyInterceptEnabled: false,
      verifyOfferDocs: 0,
      messages: [scammer(0, OLD_TOOL_DRIVEN_LINE)],
    }),
  );
  assert.equal(logCalls, 0, "applicable===false인데 로그가 찍혔다 — 분모가 오염된다");

  emitLikeCallSite(
    computeEmptyPromiseMetric({
      verifyInterceptEnabled: true,
      verifyOfferDocs: 0,
      messages: [scammer(0, OLD_TOOL_DRIVEN_LINE)],
    }),
  );
  assert.equal(logCalls, 1, "applicable===true인데 로그가 안 찍혔다 — emptyPromise:false도 반드시 찍혀야 한다(§65.5)");
});

test("[G406] 소스 스캔 — generateReportCore.ts 호출부가 `emptyPromise.applicable` 게이트 뒤에서만 로그를 찍는다", () => {
  const src = readFileSync(CORE_SRC, "utf8");
  assert.match(
    src,
    /if \(emptyPromise\.applicable\) \{\s*\n\s*logger\.info\(\s*"\[§65\.5\] 빈 약속 지표"/,
    "호출부가 applicable 게이트 없이(또는 다른 조건으로) logger.info를 찍는다 — §65.5 방출 조건 위반",
  );
});

// ── G407 — 스캔 대상 제외 + 순수성 ───────────────────────────────────────────

test("[G407] role:\"user\" 턴의 약속 문장은 세지 않는다", () => {
  const result = computeEmptyPromiseMetric({
    verifyInterceptEnabled: true,
    verifyOfferDocs: 0,
    messages: [user(0, OLD_TOOL_DRIVEN_LINE)],
  });
  assert.equal(result.connectPromiseTurns, 0);
  assert.equal(result.scammerTurns, 0);
  assert.equal(result.emptyPromise, false, "참가자 발화가 약속으로 오인됐다");
});

test("[G407] notSpoken:true 턴은 세지 않는다(C4) — scammerTurns 분모에서도 제외된다", () => {
  const result = computeEmptyPromiseMetric({
    verifyInterceptEnabled: true,
    verifyOfferDocs: 0,
    messages: [
      scammer(0, OLD_TOOL_DRIVEN_LINE, true),
      scammer(1, "다른 발화입니다."),
    ],
  });
  assert.equal(result.connectPromiseTurns, 0, "낭독되지 않은 턴의 약속 문장이 세어졌다");
  assert.equal(result.scammerTurns, 1, "notSpoken 문서가 scammerTurns 분모에서 빠지지 않았다");
  assert.equal(result.emptyPromise, false);
});

test("[G407] 혼합 턴 — notSpoken 제외 후에도 남은 사기범 턴의 매치만 정확히 센다", () => {
  const result = computeEmptyPromiseMetric({
    verifyInterceptEnabled: true,
    verifyOfferDocs: 0,
    messages: [
      scammer(0, "안녕하세요, 은행입니다."),
      user(1, "네."),
      scammer(2, OLD_TOOL_DRIVEN_LINE),
      scammer(3, LIVE_L2_LINE, true), // notSpoken — 제외
      user(4, CATALOG_LINE), // user 턴 — 제외
    ],
  });
  assert.equal(result.scammerTurns, 2, "scammer(0)·scammer(2)만 세어져야 한다(scammer(3)은 notSpoken)");
  assert.equal(result.connectPromiseTurns, 1, "scammer(2)만 매치해야 한다");
  assert.equal(result.firstPromiseTurnIndex, 2);
  assert.equal(result.emptyPromise, true);
});

test("[G407] 순수성 — 같은 입력을 두 번 호출해도 동일한 출력, 입력 배열에 부수효과 없음", () => {
  const messages: readonly EmptyPromiseScanMessage[] = Object.freeze([
    scammer(0, OLD_TOOL_DRIVEN_LINE),
    user(1, "네, 알겠습니다."),
    scammer(2, CATALOG_LINE),
  ]);
  const input = { verifyInterceptEnabled: true, verifyOfferDocs: 0, messages };
  const first = computeEmptyPromiseMetric(input);
  const second = computeEmptyPromiseMetric(input);
  assert.deepEqual(first, second, "같은 입력인데 다른 결과가 나왔다 — 부수효과가 있다는 뜻이다");
  // `Object.freeze`된 입력 배열을 건드렸다면(엄격 모드에서) 이미 위에서 TypeError로 실패했을 것이다.
});

test("[G407] 모듈이 firebase-admin·firebase-functions를 import하지 않는다(순수 함수 보증)", () => {
  const src = readFileSync(METRIC_SRC, "utf8");
  // ⛔ 주석 본문이 금지 대상 이름을 **설명하며 인용**하므로(§65.9 순수성 근거 주석), 단순 문자열
  // 포함 검사는 그 주석 자신에 걸린다(자기 참조 함정). 실제 `import ... from "firebase-..."`
  // 문(import statement)만 대상으로 좁힌다 — 주석은 백틱을 쓰고 실제 import는 따옴표를 쓴다.
  assert.doesNotMatch(
    src,
    /from\s+["']firebase-(admin|functions)/,
    "emptyPromiseMetric.ts가 firebase-admin/-functions를 실제로 import한다 — §65.9가 금지한 순수성 위반",
  );
});

// ── §66.11 G411 — 부정 필터 진리표(§66.7 (3) 표 14행) ────────────────────────

// #1~#9 — 배제되어야 한다(부정 문맥). #10~#14 — 계상되어야 한다(§66.7 (3) 표와 바이트 동일 발화).
const NEGATION_TRUTH_TABLE: ReadonlyArray<{ readonly n: number; readonly line: string; readonly excluded: boolean }> = [
  { n: 1, line: "아직 확인 부서로 연결해 드릴 단계가 아닙니다", excluded: true },
  { n: 2, line: "연결해 드릴 단계는 아직 아니에요", excluded: true },
  { n: 3, line: "연결해 드릴 수는 없습니다", excluded: true },
  { n: 4, line: "연결해 드리기 어렵습니다", excluded: true },
  { n: 5, line: "연결해 드리지 못합니다", excluded: true },
  { n: 6, line: "연결하겠다는 말씀은 드릴 수 없습니다", excluded: true },
  { n: 7, line: "연결해 주겠다는 말을 아직 하지 않았다면", excluded: true },
  { n: 9, line: "못 연결해 드릴 것 같습니다", excluded: true },
  { n: 10, line: OLD_TOOL_DRIVEN_LINE, excluded: false },
  { n: 11, line: LIVE_L2_LINE, excluded: false },
  { n: 12, line: CATALOG_LINE, excluded: false },
  { n: 13, line: "연결해 드리겠습니다, 문제 없습니다", excluded: false },
  { n: 14, line: "연결해 드릴게요 걱정하지 마세요", excluded: false },
];

for (const row of NEGATION_TRUTH_TABLE) {
  test(`[G411] #${row.n} "${row.line}" ⇒ ${row.excluded ? "미계상(부정 배제)" : "계상 유지"}`, () => {
    const result = computeMetric({
      verifyInterceptEnabled: true,
      verifyOfferDocs: 0,
      messages: [scammer(0, row.line)],
    });
    if (row.excluded) {
      assert.equal(result.connectPromiseTurns, 0, `#${row.n}이 부정 문맥인데도 계상됐다`);
      assert.equal(result.emptyPromise, false, `#${row.n}이 부정 문맥인데도 emptyPromise===true가 됐다`);
      assert.equal(result.negatedPromiseTurns, 1, `#${row.n}의 negatedPromiseTurns가 1이 아니다`);
    } else {
      assert.equal(result.connectPromiseTurns, 1, `#${row.n}이 부정 필터에 잘못 걸려 계상되지 않았다`);
      assert.equal(result.emptyPromise, true, `#${row.n}이 부정 필터에 걸려 emptyPromise===false가 됐다`);
      assert.equal(result.negatedPromiseTurns, 0, `#${row.n}이 부정 배제로 오분류됐다`);
    }
  });
}

// #8 — P1·P2 양쪽 매치가 한 턴에 같이 나오는 유일한 행(창 20의 근거). 개별 검사한다.
test('[G411] #8 "…연결해 주겠다거나 확인해 주겠다는 말을 하지 않는다"(D-1 금지문 누출) ⇒ P1·P2 둘 다 배제(창 20의 근거)', () => {
  const line = "연결해 주겠다거나 확인해 주겠다는 말을 하지 않는다";
  const result = computeMetric({
    verifyInterceptEnabled: true,
    verifyOfferDocs: 0,
    messages: [scammer(0, line)],
  });
  assert.equal(result.connectPromiseTurns, 0, "#8의 P1(연결해 주겠)이 배제되지 않았다");
  assert.equal(result.verifyPromiseTurns, 0, "#8의 P2(확인해 주겠)가 배제되지 않았다");
  assert.equal(result.negatedPromiseTurns, 1, "#8의 negatedPromiseTurns가 1이 아니다");
  assert.equal(result.emptyPromise, false);
  assert.equal(result.emptyPromiseWide, false);
});

test("[G411] #10~#12는 여전히 emptyPromise===true다(기존 G405 게이트 무회귀 — 위 for 루프와 이 파일 상단 G405 테스트가 이중으로 고정한다)", () => {
  for (const line of [OLD_TOOL_DRIVEN_LINE, LIVE_L2_LINE, CATALOG_LINE]) {
    const result = computeMetric({ verifyInterceptEnabled: true, verifyOfferDocs: 0, messages: [scammer(0, line)] });
    assert.equal(result.emptyPromise, true, `"${line}"이 §66 패치 후 emptyPromise===false로 회귀했다`);
  }
});

test("[isNegatedPromiseMatch] 매치 위치를 직접 넘겼을 때도 같은 판정을 낸다(단독 진리표)", () => {
  const text = "연결해 드릴 수는 없습니다";
  const start = text.indexOf("연결해 드릴");
  const end = start + "연결해 드릴".length;
  assert.equal(isNegatedPromiseMatch(text, start, end), true);

  const text2 = "바로 연결하겠습니다.";
  const start2 = text2.indexOf("연결하겠");
  const end2 = start2 + "연결하겠".length;
  assert.equal(isNegatedPromiseMatch(text2, start2, end2), false);
});

// ── §66.11 G412 — 정본 트립와이어 ────────────────────────────────────────────

test("[G412] CONNECT_PROMISE_PATTERNS가 §65.3 정본 4개와 바이트 일치한다(순서·개수 포함)", () => {
  // ⛔ 이 값을 바꾸지 말 것 — §65.3/§66.7이 "패턴 원문은 한 글자도 고치지 않는다"고 고정했다.
  // 소스를 직접 임포트해 대조한다(내부 상수는 export되지 않으므로 소스 텍스트로 확인).
  const src = readFileSync(METRIC_SRC, "utf8");
  const canonical = [
    "/연결\\s*해?\\s*(드리|드릴|주겠|줄게)/",
    "/연결\\s*하겠/",
    "/연결\\s*시켜\\s*(드리|드릴|주겠|줄게)/",
    "/(넘겨|돌려|바꿔)\\s*(드리|드릴|주겠|줄게)/",
  ];
  for (const literal of canonical) {
    assert.ok(
      src.includes(literal),
      `CONNECT_PROMISE_PATTERNS 정본 리터럴이 소스에서 사라졌거나 바뀌었다: ${literal}`,
    );
  }
});

test("[G412] VERIFY_PROMISE_PATTERNS가 §65.3 정본 1개와 바이트 일치한다", () => {
  const src = readFileSync(METRIC_SRC, "utf8");
  assert.ok(
    src.includes("/확인\\s*해?\\s*(드리|드릴|주겠|줄게)/"),
    "VERIFY_PROMISE_PATTERNS 정본 리터럴이 소스에서 사라졌거나 바뀌었다",
  );
});

test("[G412] P1·P2 정본 패턴 전부 flags가 빈 문자열이다(/g가 붙으면 lastIndex 오염으로 턴마다 다른 답이 나온다)", () => {
  // 모듈이 배열을 export하지 않으므로, 소스에서 정본 리터럴 직후에 `/g` 등 플래그 문자가
  // 곧바로 붙어 있지 않은지(RegExp 리터럴 뒤에 식별자 문자가 오면 안 된다) 확인한다.
  const src = readFileSync(METRIC_SRC, "utf8");
  const patternLines = [
    "/연결\\s*해?\\s*(드리|드릴|주겠|줄게)/",
    "/연결\\s*하겠/",
    "/연결\\s*시켜\\s*(드리|드릴|주겠|줄게)/",
    "/(넘겨|돌려|바꿔)\\s*(드리|드릴|주겠|줄게)/",
    "/확인\\s*해?\\s*(드리|드릴|주겠|줄게)/",
  ];
  for (const literal of patternLines) {
    const idx = src.indexOf(literal);
    assert.ok(idx > -1, `정본 리터럴을 찾을 수 없다: ${literal}`);
    const charAfter = src[idx + literal.length];
    assert.ok(
      charAfter === "," || charAfter === "\n" || charAfter === " ",
      `정본 패턴에 플래그가 붙어 있다(빈 문자열이어야 한다): ${literal}${charAfter}`,
    );
  }
});

// ── §66.11 G413 — 필드 + 순수성 ──────────────────────────────────────────────

test("[G413-a] 전부 배제된 턴이 1건이면 negatedPromiseTurns === 1이다", () => {
  const result = computeMetric({
    verifyInterceptEnabled: true,
    verifyOfferDocs: 0,
    messages: [scammer(0, "연결해 드릴 수는 없습니다")],
  });
  assert.equal(result.negatedPromiseTurns, 1);
});

test("[G413-b] 같은 입력에서 connectPromiseTurns === 0이다(부정 배제가 헤드라인 카운트를 오염시키지 않는다)", () => {
  const result = computeMetric({
    verifyInterceptEnabled: true,
    verifyOfferDocs: 0,
    messages: [scammer(0, "연결해 드릴 수는 없습니다")],
  });
  assert.equal(result.connectPromiseTurns, 0);
});

test("[G413-c] 모듈이 firebase-admin·firebase-functions를 import하지 않는다(§65.10 G407 ⓓ와 같은 형태로 재확인)", () => {
  const src = readFileSync(METRIC_SRC, "utf8");
  assert.doesNotMatch(src, /from\s+["']firebase-(admin|functions)/);
});
