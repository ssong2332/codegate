// §62.6 D-5 reviewer Major #1/#2 — [§59.11] 관측 로그의 "콜러블 1회 호출당 로그 1건" 불변을
// 소스 스캔으로 고정한다. `deliverVerifyOffer`는 Firestore·시크릿에 의존하는 `onCall` 핸들러라
// 유닛 계층에서 직접 실행/모킹할 수 없다는 것이 이 디렉터리의 기존 판단이다
// (`deliverVerifyOfferGateOrdering.test.ts:1-2` 참고 — 같은 이유로 같은 방식을 쓴다).
//
// 이 파일이 고정하는 것:
//   1) `logOfferOutcome` 정의 이후 함수가 끝날 수 있는 4개 지점(scammerTurns 유효성 실패 ·
//      too_early 조기 반환 · persist 실패 · 최종 반환) 각각에 로그 호출이 정확히 1개씩 있다
//      (총 4곳 — 5곳도 3곳도 아니다).
//   2) too_early·최종 반환 두 갈래에서, 로그에 실리는 `status` 값이 응답 바디에 실리는
//      `status` 값과 **같은 리터럴/변수**다(값이 갈라질 여지 자체를 구조적으로 없앤다).
//   3) 두 예외 경로(scammerTurns 유효성 실패 · persist 실패)는 로그 호출이 **throw보다 먼저**
//      실행된다(로그 없는 종료가 없다는 것의 직접 증거).
//   4) `status === "error"`는 `logger.error`로, 그 외에는 `logger.info`로 라우팅된다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";

// 테스트는 컴파일된 lib/에서 돈다(functions/lib/verifyIntercept/__tests__/) — 소스 경로를 명시적으로
// 잡는다(같은 디렉터리의 다른 테스트가 쓰는 관례와 동일).
const SRC = path.resolve(__dirname, "../../../src/verifyIntercept/index.ts");

/** `deliverVerifyOffer` 함수 본문만 잘라낸다(다음 콜러블 `deliverVerifyReconnect`와 섞이지 않게). */
function extractDeliverVerifyOfferBody(src: string): string {
  const start = src.indexOf("export const deliverVerifyOffer = onCall<");
  const end = src.indexOf("export const deliverVerifyReconnect = onCall<");
  assert.ok(start > -1, "deliverVerifyOffer 정의가 사라졌다");
  assert.ok(end > start, "deliverVerifyReconnect 정의가 사라졌다(또는 순서가 바뀌었다)");
  return src.slice(start, end);
}

/** `logOfferOutcome` 정의 이후만 잘라낸다(그 이전 조기 검증 throw는 이번 수정의 범위가 아니다). */
function extractAfterLogDefinition(body: string): string {
  const defIdx = body.indexOf("const logOfferOutcome = ");
  assert.ok(defIdx > -1, "logOfferOutcome 정의가 사라졌다");
  return body.slice(defIdx);
}

test("[§62.6 D-5] logOfferOutcome 호출 지점이 정확히 4곳이다(scammerTurns 무효 · too_early · persist 실패 · 최종)", () => {
  const src = readFileSync(SRC, "utf8");
  const afterDef = extractAfterLogDefinition(extractDeliverVerifyOfferBody(src));
  // 정의 자체(`const logOfferOutcome = (status...) => {` 안의 `logger.info`/`logger.error` 호출)는
  // `logOfferOutcome(` 형태로 스스로를 호출하지 않으므로 카운트에 섞이지 않는다.
  const callSites = afterDef.match(/logOfferOutcome\(/g) ?? [];
  assert.equal(
    callSites.length,
    4,
    "호출 지점 수가 4가 아니다 — reviewer Major #1이 지적한 두 예외 경로 중 하나가 로그 없이 " +
      "종료하거나, 반대로 같은 경로에서 중복 호출돼 '호출당 로그 1건' 불변이 깨졌을 수 있다.",
  );
});

test("[§62.6 D-5] scammerTurns 유효성 실패 — 로그가 throw보다 먼저, status는 응답에 새지 않는 'error'", () => {
  const src = readFileSync(SRC, "utf8");
  const body = extractDeliverVerifyOfferBody(src);
  assert.match(
    body,
    /logOfferOutcome\("error", "invalid_scammerTurns"\);\s*\n\s*throw new HttpsError\(\s*\n\s*"invalid-argument",/,
    "scammerTurns 무효 분기에서 로그가 throw 직전에 있지 않다 — reviewer Major #1 gap 1이 재발했다.",
  );
});

test("[§62.6 D-5] persist 실패 — resolveAnchorScammerTurn·offerRef.create가 try 안에 있고 catch가 로그 후 rethrow한다", () => {
  const src = readFileSync(SRC, "utf8");
  const body = extractDeliverVerifyOfferBody(src);
  const tryIdx = body.indexOf("try {");
  const anchorIdx = body.indexOf("resolveAnchorScammerTurn(sessionId, callMode, scammerTurns)");
  const createIdx = body.indexOf("offerRef.create(");
  const catchIdx = body.indexOf("} catch (err) {");
  assert.ok(tryIdx > -1 && anchorIdx > -1 && createIdx > -1 && catchIdx > -1, "try/catch 또는 두 호출이 사라졌다");
  assert.ok(
    tryIdx < anchorIdx && anchorIdx < catchIdx,
    "resolveAnchorScammerTurn 호출이 try 블록 밖에 있다 — 그쪽이 던지면 로그 없이 종료한다(gap 2 재발).",
  );
  assert.ok(
    tryIdx < createIdx && createIdx < catchIdx,
    "offerRef.create 호출이 try 블록 밖에 있다 — write 실패가 로그 없이 종료한다(gap 2 재발).",
  );
  const catchBody = body.slice(catchIdx);
  assert.match(
    catchBody,
    /\} catch \(err\) \{\s*\n\s*logOfferOutcome\("error", "persist_failed"\);\s*\n\s*throw err;/,
    "catch 블록이 로그를 찍고 재던지는 형태가 아니다 — 예외가 삼켜지거나(§16.1.5 위반) 로그가 없다.",
  );
});

test("[§62.6 D-5] too_early — 로그와 응답의 status가 같은 리터럴이다", () => {
  const src = readFileSync(SRC, "utf8");
  const body = extractDeliverVerifyOfferBody(src);
  assert.match(
    body,
    /logOfferOutcome\("too_early"\);\s*\n\s*return \{ offerId: item\.offerId, status: "too_early", declineInstruction: VERIFY_DECLINE_TOO_EARLY \};/,
    "too_early 로그 직후의 return이 같은 형태가 아니다 — 로그된 status와 응답 status가 갈릴 수 있다.",
  );
});

test("[§62.6 D-5] 최종 반환 — 로그와 응답이 같은 `status` 변수를 공유한다(값이 두 곳에서 따로 계산되지 않는다)", () => {
  const src = readFileSync(SRC, "utf8");
  const body = extractDeliverVerifyOfferBody(src);
  assert.match(
    body,
    /const status: DeliverVerifyOfferStatus = plan\.includeInstruction \? "announced" : "already_announced";\s*\n\s*logOfferOutcome\(status\);\s*\n\s*return \{\s*\n\s*\.\.\.response,\s*\n\s*status,/,
    "status 계산 → logOfferOutcome(status) → return { ...status } 순서가 아니다 — " +
      "로그된 값과 응답값이 같은 변수라는 보장이 깨졌다(announced/already_announced 갈래 모두 영향).",
  );
});

test("[§62.6 D-5] 심각도 라우팅 — status===\"error\"만 logger.error로, 나머지는 logger.info로 나간다", () => {
  const src = readFileSync(SRC, "utf8");
  const body = extractDeliverVerifyOfferBody(src);
  assert.match(
    body,
    /if \(status === "error"\) \{\s*\n\s*logger\.error\("\[§59\.11\] deliverVerifyOffer 발동 경로", payload\);\s*\n\s*\} else \{\s*\n\s*logger\.info\("\[§59\.11\] deliverVerifyOffer 발동 경로", payload\);\s*\n\s*\}/,
    "logOfferOutcome의 심각도 분기가 사라지거나 형태가 바뀌었다.",
  );
});
