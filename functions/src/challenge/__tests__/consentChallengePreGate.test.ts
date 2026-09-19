// §66.5/§66.11 G414 — consentChallenge 형제 슬롯 사전 게이트: 거절·재개 경로에서 오프닝 LLM
// (generateOpeningLine) 호출이 0회여야 한다.
//
// `consentChallenge`는 Firestore·트랜잭션·시크릿에 의존하는 `onCall` 핸들러라 유닛 계층에서 직접
// 실행할 수 없다(이 디렉터리의 기존 판단 — roleplay/__tests__/sendMessageLengthGate.test.ts·
// session/__tests__/createSessionRateLimitOrdering.test.ts와 동일 이유). §66.7 (2)/G406의
// "호출부와 동형의 게이트를 스텁으로 재현" 관례를 그대로 따른다 — 판정 자체는 실제 순수 함수
// decideConsentGate를 그대로 쓰고, generateOpeningLine 자리에만 호출 횟수를 세는 스텁을 꽂는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { decideConsentGate } from "../consentGate";

const SRC = path.resolve(__dirname, "../../../src/challenge/userAccess.ts");

/** userAccess.ts의 §66.5 사전 게이트 블록과 동형 — generateOpeningLine 자리에 스텁을 꽂는다. */
function preGateLikeCallSite(
  input: Parameters<typeof decideConsentGate>[0],
  existingSessionId: string | null,
  openingStub: () => void,
): { rejected: true; message: string } | { resumed: true; sessionId: string } | { fellThrough: true } {
  const pre = decideConsentGate(input);
  if (pre.action === "reject") {
    return { rejected: true, message: pre.message };
  }
  if (pre.action === "resume") {
    return { resumed: true, sessionId: existingSessionId as string };
  }
  // action === "create" — 사전 게이트를 통과해 실제 오프닝 호출로 이어진다.
  openingStub();
  return { fellThrough: true };
}

test("[G414-a] reject 입력 ⇒ generateOpeningLine 0회 호출", () => {
  let calls = 0;
  const result = preGateLikeCallSite(
    {
      linkExpired: true,
      retentionExpired: false,
      status: "pending",
      existingSessionUid: null,
      callerUid: "uid-1",
    },
    null,
    () => {
      calls += 1;
    },
  );
  assert.equal(calls, 0, "거절 경로인데 오프닝 LLM이 호출됐다");
  assert.deepEqual(result, { rejected: true, message: "이 링크는 만료되었습니다." });
});

test("[G414-b] resume 입력 ⇒ generateOpeningLine 0회 호출 + 응답이 {sessionId} 하나뿐(바이트 동일)", () => {
  let calls = 0;
  const result = preGateLikeCallSite(
    {
      linkExpired: false,
      retentionExpired: false,
      status: "in_progress",
      existingSessionUid: "uid-2",
      callerUid: "uid-2",
    },
    "session-abc",
    () => {
      calls += 1;
    },
  );
  assert.equal(calls, 0, "재개 경로인데 오프닝 LLM이 호출됐다");
  assert.deepEqual(result, { resumed: true, sessionId: "session-abc" });
});

test("[G414-c] create 입력(신규 동의) ⇒ generateOpeningLine 1회 호출 — 정상 경로는 여전히 오프닝을 태운다", () => {
  let calls = 0;
  const result = preGateLikeCallSite(
    {
      linkExpired: false,
      retentionExpired: false,
      status: "pending",
      existingSessionUid: null,
      callerUid: "uid-3",
    },
    null,
    () => {
      calls += 1;
    },
  );
  assert.equal(calls, 1, "정상 신규 동의 경로에서 오프닝 LLM이 호출되지 않았다");
  assert.deepEqual(result, { fellThrough: true });
});

test("[G414-d] 소스 스캔 — 사전 게이트 블록이 preChallenge 존재 시에만 동작하고 generateOpeningLine 호출보다 앞이다", () => {
  const src = readFileSync(SRC, "utf8");
  const preGateIdx = src.indexOf("const preChallengeSnap = await db.collection(\"challenges\")");
  // ⛔ "generateOpeningLine(" 만으로 찾으면 시크릿 선언 주석(재사용 가능한 함정, G410류 재발)에
  // 걸릴 수 있어 실제 호출부로 좁힌다.
  const openingIdx = src.indexOf("await generateOpeningLine(");
  assert.ok(preGateIdx > -1, "§66.5 사전 게이트(preChallengeSnap) 블록이 사라졌다");
  assert.ok(openingIdx > -1, "generateOpeningLine 호출이 사라졌다");
  assert.ok(
    preGateIdx < openingIdx,
    "사전 게이트가 generateOpeningLine 호출보다 뒤로 이동했다 — §66.5 위치 불변식 위반",
  );
});

test("[G414-e] 소스 스캔 — preChallenge가 없으면 새로운 실패 사유를 만들지 않는다(if(preChallenge) 가드)", () => {
  const src = readFileSync(SRC, "utf8");
  assert.match(
    src,
    /if \(preChallenge\) \{/,
    "preChallenge 존재 가드가 사라졌다 — §66.5 불변식(부재 시 기존 경로로 떨어진다) 위반",
  );
});
