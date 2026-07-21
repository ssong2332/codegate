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

test("isUsingMockLlm(): LLM_API_KEY 미확보 상태에서는 true를 반환한다(현재 저장소 상태 기준)", () => {
  assert.equal(isUsingMockLlm(), true);
});
