// §66.3/§66.11 G410 — createSession 호출 순서. 롤링 윈도우 게이트가
// `generateOpeningLine`(LLM 호출)보다 앞에 있어야 한다 — 뒤에 두면 거절되는 요청도 LLM 1호출을
// 이미 태운 뒤다(§66.3 "위치가 설계다" ②).
// SEC-05(외부 보안 점검 2차) — 게이트는 `createSlot.ts`의 트랜잭션 예약(`reserveCreateSessionSlot`)으로 바뀌었다. 판정 자체는 여전히
// `isCreateSessionRateLimited`(rateLimit.ts)가 하고, 호출부 앵커는 예약 호출이다.
//
// `createSession`은 Firestore·시크릿에 의존하는 `onCall` 핸들러라 유닛 계층에서 직접 실행할 수 없다
// (roleplay/__tests__/sendMessageLengthGate.test.ts와 동일 이유·동일 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const SRC = path.resolve(__dirname, "../../../src/session/index.ts");
const SLOT_SRC = path.resolve(__dirname, "../../../src/session/createSlot.ts");
const GATE = "await reserveCreateSessionSlot(";

test("[G410] 롤링 윈도우 게이트(슬롯 예약) 호출이 generateOpeningLine 호출보다 앞이다", () => {
  const src = readFileSync(SRC, "utf8");
  const gateIdx = src.indexOf(GATE);
  // ⛔ "generateOpeningLine(" 만으로 찾으면 그 위의 시크릿 선언 주석(`:55`,
  // "generateOpeningLine()이 getLlmClient()를…")에 먼저 걸린다(자기 언급 함정, G407류 재발) —
  // 실제 호출부인 `await generateOpeningLine(`로 좁힌다.
  const openingIdx = src.indexOf("await generateOpeningLine(");
  assert.ok(gateIdx > -1, "reserveCreateSessionSlot 호출이 사라졌다");
  assert.ok(openingIdx > -1, "generateOpeningLine 호출이 사라졌다");
  assert.ok(
    gateIdx < openingIdx,
    "뒤에 두면 거절되는 요청이 LLM 1호출을 이미 태운다(§66.3) — reserveCreateSessionSlot을 " +
      "generateOpeningLine 호출 앞으로 옮길 것",
  );
});

test("[G410] 거절 코드는 resource-exhausted다(challenge/index.ts:122-125·rewind/attemptSlot.ts와 동일)", () => {
  const src = readFileSync(SLOT_SRC, "utf8");
  assert.ok(src.includes("isCreateSessionRateLimited({"), "판정이 rateLimit.ts 순수 함수를 거치지 않는다");
  // 보안 점검 후속(2026-11-02) — 판정 결과가 객체(`decision`)가 됐다(중복 시작 판정 추가).
  const gateIdx = src.indexOf("if (decision.limited) {");
  assert.ok(gateIdx > -1);
  const afterGate = src.slice(gateIdx, gateIdx + 600);
  assert.match(afterGate, /HttpsError\(\s*\n?\s*"resource-exhausted"/, "롤링 윈도우 거절 코드가 resource-exhausted가 아니다");
});

test("[G410] 동의 게이트(consents) 뒤에 배치된다 — 동의 오류가 먼저 나와야 한다", () => {
  const src = readFileSync(SRC, "utf8");
  const consentIdx = src.indexOf('"훈련 참여 동의가 필요합니다."');
  const gateIdx = src.indexOf(GATE);
  assert.ok(consentIdx > -1 && gateIdx > -1);
  assert.ok(consentIdx < gateIdx, "롤링 윈도우 게이트가 동의 게이트보다 앞에 있다");
});
