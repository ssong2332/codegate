import { test } from "node:test";
import assert from "node:assert/strict";
import { generateOpeningLine, isUsingMockLlm } from "../openingLine";
import { FAMILY_ACCIDENT_SCENARIO_ID } from "../../scenarios";

test("generateOpeningLine(): 유효한 scenarioId면 scammer 역할의 오프닝 대사를 반환한다(AC-003)", async () => {
  const opening = await generateOpeningLine(FAMILY_ACCIDENT_SCENARIO_ID);

  assert.equal(opening.role, "scammer");
  assert.ok(opening.text.length > 0);
});

test("generateOpeningLine(): 존재하지 않는 scenarioId면 invalid-argument HttpsError를 던진다", async () => {
  await assert.rejects(
    () => generateOpeningLine("no-such-scenario"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as { code?: string }).code, "invalid-argument");
      return true;
    },
  );
});

// 2026-07-24 갱신 — getLlmClient()가 GEMINI_API_KEY 존재 시 실 Gemini로 격상되도록 바뀌었지만
// (llm/index.ts), defineSecret은 Functions 런타임 바인딩 밖(이 node:test 프로세스처럼)에서는
// .value() 호출 시 throw하므로 readSecret이 "미설정"으로 처리해 여기서는 항상 Mock으로 남는다 —
// GEMINI_API_KEY가 .env에 실제로 들어있어도 이 단위 테스트의 결과는 바뀌지 않는다(의도된 안전망,
// realtime/provider.ts의 동일 readSecret 패턴과 동일한 이유).
test("isUsingMockLlm(): Functions 런타임 secret 바인딩이 없는 단위 테스트 컨텍스트에서는 항상 true를 반환한다", () => {
  assert.equal(isUsingMockLlm(), true);
});
