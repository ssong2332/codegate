// §66.2/§66.11 G408 — sendMessage `userText` 길이 상한 + 순서.
//
// `sendMessage`는 Firestore·시크릿에 의존하는 `onCall` 핸들러라 유닛 계층에서 직접 실행할 수 없다
// (이 디렉터리의 기존 판단 — verifyIntercept/__tests__/deliverVerifyOfferLogInvariant.test.ts:1-4와
// 동일 이유). 그래서 두 겹으로 증명한다:
//   ① 경계값 산술 — 실제로 export된 SEND_MESSAGE_MAX_LENGTH를 그대로 써서 1000/1001자 경계를
//      핸들러와 동일한 부등식(`length > MAX`)으로 재현한다(값 자체가 정본에서 온다, 지어낸 상수 아님).
//   ② 소스 스캔 — 그 부등식 검사가 실제로 `getFirestore()`보다 앞에 있다는 것을 문자열 위치로 고정한다
//      (§66.2 "위치가 설계다" — 거절되는 요청이 read·LLM을 태우지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { SEND_MESSAGE_MAX_LENGTH } from "../../shared/constants";

const SRC = path.resolve(__dirname, "../../../src/roleplay/index.ts");

test("[G408] SEND_MESSAGE_MAX_LENGTH === 1000(§66.2 정본값)", () => {
  assert.equal(SEND_MESSAGE_MAX_LENGTH, 1000);
});

test("[G408-a] 1001자(초과) ⇒ 핸들러와 동일한 부등식이 거절 조건을 참으로 판정한다", () => {
  const userText = "가".repeat(SEND_MESSAGE_MAX_LENGTH + 1);
  assert.equal(userText.length > SEND_MESSAGE_MAX_LENGTH, true);
});

test("[G408-b] 1000자(경계) ⇒ 핸들러와 동일한 부등식이 거절 조건을 거짓으로 판정한다(통과)", () => {
  const userText = "가".repeat(SEND_MESSAGE_MAX_LENGTH);
  assert.equal(userText.length > SEND_MESSAGE_MAX_LENGTH, false);
});

test("[G408-c] 소스 스캔 — sendMessage 핸들러에서 길이 검사가 getFirestore()보다 앞에 있다", () => {
  const src = readFileSync(SRC, "utf8");
  const lengthCheckIdx = src.indexOf("userText.length > SEND_MESSAGE_MAX_LENGTH");
  const firestoreIdx = src.indexOf("const db = getFirestore();");
  assert.ok(lengthCheckIdx > -1, "길이 검사(userText.length > SEND_MESSAGE_MAX_LENGTH)가 사라졌다");
  assert.ok(firestoreIdx > -1, "getFirestore() 호출이 사라졌다");
  assert.ok(
    lengthCheckIdx < firestoreIdx,
    "길이 검사가 getFirestore() 뒤로 이동했다 — 거절되는 요청도 read를 태운다(§66.2 위치 불변식 위반)",
  );
});

test("[G408-c'] 절단이 아니라 거절이다 — invalid-argument HttpsError와 함께 있다", () => {
  const src = readFileSync(SRC, "utf8");
  const gateBlockStart = src.indexOf("if (userText.length > SEND_MESSAGE_MAX_LENGTH)");
  assert.ok(gateBlockStart > -1);
  const gateBlock = src.slice(gateBlockStart, gateBlockStart + 200);
  assert.match(gateBlock, /HttpsError\(\s*\n?\s*"invalid-argument"/, "거절 코드가 invalid-argument가 아니다");
  assert.doesNotMatch(gateBlock, /\.slice\(/, "길이 초과 시 조용히 잘라 보내면 안 된다(AC-039)");
});
