// 시나리오별 화자 성별 배정표 게이트 (Architecture.md §50.3.3, G299). node:test — 저장소에 별도
// 테스트 프레임워크가 없다(l3Depth.test.ts 관례 계승).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIO_SPEAKER_GENDER, speakerGenderFor } from "../scenarioVoice";
import { PUBLIC_SCENARIOS } from "../../scenarios/publicMeta";

// ── 강제 장치 ① 키 1:1 deepEqual 게이트(G299) ─────────────────────────────────
test("SCENARIO_SPEAKER_GENDER 키가 PUBLIC_SCENARIOS 키와 1:1이다(조용한 축소 방지, §50.3.3 G299)", () => {
  assert.deepEqual(
    Object.keys(SCENARIO_SPEAKER_GENDER).sort(),
    Object.keys(PUBLIC_SCENARIOS).sort(),
    "시나리오를 추가/삭제했으면 SCENARIO_SPEAKER_GENDER(functions/src/realtime/scenarioVoice.ts)도 " +
      "함께 갱신해야 한다.",
  );
});

test("[역검증] 표에서 한 행을 빼면 위 게이트가 실제로 실패한다", () => {
  const withoutOne = { ...SCENARIO_SPEAKER_GENDER };
  delete withoutOne["tax-refund-scam"];
  assert.throws(
    () => assert.deepEqual(Object.keys(withoutOne).sort(), Object.keys(PUBLIC_SCENARIOS).sort()),
    /tax-refund-scam|Expected|deepEqual/i,
    "표에서 시나리오가 빠졌는데 게이트가 통과하면 그 시나리오의 음성 배정이 조용히 미정 상태가 된다.",
  );
});

// ── 강제 장치 ② 분포 고정 — male 4 / female 5 / notApplicable 5 ──────────────────
test("분포가 §50.3.3 확정값과 같다(male 4 · female 5 · notApplicable 5)", () => {
  const counts = { male: 0, female: 0, notApplicable: 0 };
  for (const v of Object.values(SCENARIO_SPEAKER_GENDER)) counts[v] += 1;
  assert.deepEqual(counts, { male: 4, female: 5, notApplicable: 5 });
});

test("speakerGenderFor: notApplicable은 undefined를 반환한다(either가 아니다 — §50.3.3)", () => {
  for (const [id, assignment] of Object.entries(SCENARIO_SPEAKER_GENDER)) {
    if (assignment === "notApplicable") {
      assert.equal(speakerGenderFor(id), undefined, `${id}: notApplicable인데 값이 나왔다`);
    } else {
      assert.equal(speakerGenderFor(id), assignment, id);
    }
  }
});

test("존재하지 않는 scenarioId는 speakerGenderFor가 undefined를 반환한다(안전한 기본값)", () => {
  assert.equal(speakerGenderFor("does-not-exist"), undefined);
});
