// §59.7/§59.9 R5 — "Firestore write 0회"를 소스 스캔으로 고정한다.
//
// ⚠️ **관측 불가 지점 방어**(`feedback_unobservable_behavior_gates`) — `deliverInCallSms`는
// `onCall` 핸들러라 에뮬레이터 없이 유닛 계층에서 직접 호출·관측할 수 없다. `resolveModelToolSmsGate`
// (순수 함수)는 판정 자체를 `buildDoc.test.ts`가 이미 전수로 고정했지만, "그 판정이 실제로
// `smsRef.create(...)` **앞에서** short-circuit하는가"는 호출부 소스를 읽어야만 확인된다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";

// 테스트는 컴파일된 lib/에서 돈다(functions/lib/inCallSms/__tests__/) — 소스 경로를 명시적으로
// 잡는다(`verifyIntercept/__tests__/buildDoc.test.ts`의 ROLEPLAY_SRC 관례와 동일).
const SRC = path.resolve(__dirname, "../../../src/inCallSms/index.ts");

test("[§59.9 R5 배선] gate.allowed===false의 return이 smsRef.create(...) 호출보다 앞에 있다", () => {
  const src = readFileSync(SRC, "utf8");
  const gateIdx = src.indexOf("resolveModelToolSmsGate(");
  const createIdx = src.indexOf("smsRef.create(");
  assert.ok(gateIdx > -1, "resolveModelToolSmsGate 호출이 사라졌다");
  assert.ok(createIdx > -1, "smsRef.create 호출이 사라졌다");
  assert.ok(
    gateIdx < createIdx,
    "하한 재검증이 write보다 뒤로 밀리면 too_early/already_delivered에서도 문서가 생겨 G387이 깨진다",
  );
  const between = src.slice(gateIdx, createIdx);
  assert.match(
    between,
    /if \(!gate\.allowed\) \{[\s\S]*?return \{/,
    "gate가 불허할 때 create 전에 즉시 return하는 형태가 아니다",
  );
});
