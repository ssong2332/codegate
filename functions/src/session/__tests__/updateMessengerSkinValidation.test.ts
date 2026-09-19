// 자체 감사 결함 4 — updateMessengerSkin의 messengerSkin/skinSource enum 런타임 검증.
//
// §60의 `turn.role` 신뢰 경계 판정과 동일한 함정: 클라 TS 타입은 컴파일 시점 계약일 뿐이라
// 실제 JSON 페이로드는 임의 문자열을 실어 나를 수 있다. 기존엔 truthy 체크만 있어 "SAMSUNG"
// 같은 오탈자·임의 문자열이 조용히 통과해 Firestore에 그대로 저장됐다. 이 저장소의 기존 패턴
// (verifyIntercept/index.ts의 readOfferStage/readTrigger — "알 수 없는 값을 조용히 통과시키지
// 않고 거절한다")을 그대로 재사용한다.
//
// `updateMessengerSkin`은 Firestore·시크릿에 의존하는 `onCall` 핸들러라 유닛 계층에서 직접
// 실행할 수 없다(이 디렉터리의 기존 판단 — createSessionRateLimitOrdering.test.ts와 동일 이유).
// 검증 함수(readMessengerSkin/readSkinSource)는 모듈 내부 함수라 export되지 않으므로, ①
// 소스 스캔으로 실제 배선을 고정하고 ② 같은 판정 로직을 리터럴로 재현해 값 공간을 진리표로 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const SRC = path.resolve(__dirname, "../../../src/session/index.ts");

// readMessengerSkin/readSkinSource와 바이트 동일한 판정(소스 스캔이 실제 정의를 따로 고정한다).
const VALID_SKINS = ["ios", "samsung", "default"];
const VALID_SOURCES = ["auto", "manual", "fallback"];

for (const skin of VALID_SKINS) {
  test(`[messengerSkin enum] "${skin}"은 유효한 값이다`, () => {
    assert.ok(VALID_SKINS.includes(skin));
  });
}

for (const invalid of ["SAMSUNG", "ios ", "android", "", "iOS", "null", "undefined"]) {
  test(`[messengerSkin enum] "${invalid}"은 유효하지 않은 값이다(거절 대상)`, () => {
    assert.ok(!VALID_SKINS.includes(invalid));
  });
}

for (const source of VALID_SOURCES) {
  test(`[skinSource enum] "${source}"은 유효한 값이다`, () => {
    assert.ok(VALID_SOURCES.includes(source));
  });
}

for (const invalid of ["AUTO", "manual ", "user", ""]) {
  test(`[skinSource enum] "${invalid}"은 유효하지 않은 값이다(거절 대상)`, () => {
    assert.ok(!VALID_SOURCES.includes(invalid));
  });
}

test("[소스 스캔] readMessengerSkin/readSkinSource가 실제로 정의돼 있고 ios·samsung·default / auto·manual·fallback을 검증한다", () => {
  const src = readFileSync(SRC, "utf8");
  assert.match(
    src,
    /function readMessengerSkin\(value: unknown\): MessengerSkin \{\s*\n\s*if \(value === "ios" \|\| value === "samsung" \|\| value === "default"\) return value;\s*\n\s*throw new HttpsError\("invalid-argument"/,
    "readMessengerSkin 검증 함수가 사라졌거나 값 공간이 바뀌었다",
  );
  assert.match(
    src,
    /function readSkinSource\(value: unknown\): MessengerSkinSource \{\s*\n\s*if \(value === "auto" \|\| value === "manual" \|\| value === "fallback"\) return value;\s*\n\s*throw new HttpsError\("invalid-argument"/,
    "readSkinSource 검증 함수가 사라졌거나 값 공간이 바뀌었다",
  );
});

test("[소스 스캔] updateMessengerSkin 핸들러가 원본 request.data 값이 아니라 readMessengerSkin/readSkinSource의 반환값을 Firestore에 쓴다", () => {
  const src = readFileSync(SRC, "utf8");
  const start = src.indexOf("export const updateMessengerSkin = onCall<");
  const nextExport = src.indexOf("export const requestEscalation = onCall<");
  assert.ok(start > -1 && nextExport > start, "updateMessengerSkin 정의를 찾을 수 없다");
  const body = src.slice(start, nextExport);

  assert.match(body, /const messengerSkin = readMessengerSkin\(request\.data\.messengerSkin\);/);
  assert.match(body, /const skinSource = readSkinSource\(request\.data\.skinSource\);/);
  assert.match(
    body,
    /await sessionRef\.update\(\{ messengerSkin, skinSource \}/,
    "검증된 messengerSkin/skinSource가 아니라 다른 값을 write한다",
  );
});
