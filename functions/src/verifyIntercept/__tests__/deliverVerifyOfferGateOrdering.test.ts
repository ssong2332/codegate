// §59.7/§59.9 R5 — "Firestore write 0회"를 소스 스캔으로 고정한다(inCallSms의 동형 게이트와 같은
// 이유 — `deliverVerifyOffer`도 `onCall` 핸들러라 유닛 계층에서 직접 관측할 수 없다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";

// 테스트는 컴파일된 lib/에서 돈다(functions/lib/verifyIntercept/__tests__/) — 소스 경로를 명시적으로
// 잡는다(같은 파일의 다른 테스트가 쓰는 ROLEPLAY_SRC 관례와 동일).
const SRC = path.resolve(__dirname, "../../../src/verifyIntercept/index.ts");

test("[§59.9 R5 배선] gate.allowed===false의 return이 offerRef.create(...) 호출보다 앞에 있다", () => {
  const src = readFileSync(SRC, "utf8");
  const gateIdx = src.indexOf("resolveModelToolVerifyGate(");
  const createIdx = src.indexOf("offerRef.create(");
  assert.ok(gateIdx > -1, "resolveModelToolVerifyGate 호출이 사라졌다");
  assert.ok(createIdx > -1, "offerRef.create 호출이 사라졌다");
  assert.ok(
    gateIdx < createIdx,
    "하한 재검증이 write보다 뒤로 밀리면 too_early에서도 문서가 생겨 G391/G387 취지가 깨진다",
  );
  const between = src.slice(gateIdx, createIdx);
  assert.match(
    between,
    /if \(!gate\.allowed\) \{[\s\S]*?return \{/,
    "gate가 불허할 때 create 전에 즉시 return하는 형태가 아니다",
  );
});
