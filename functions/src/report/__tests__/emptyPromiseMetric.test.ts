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
import { computeEmptyPromiseMetric, type EmptyPromiseScanMessage } from "../emptyPromiseMetric";

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
