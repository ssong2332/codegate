// 페르소나 권한 판별표 게이트 (Architecture.md §50.4.4, G299). node:test — 저장소에 별도 테스트
// 프레임워크가 없다(l3Depth.test.ts 관례 계승).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PERSONA_AUTHORITY, asksIdentityCheck } from "../personaAuthority";
import { PUBLIC_SCENARIOS } from "../../scenarios/publicMeta";

// ── 강제 장치 ① 키 1:1 deepEqual 게이트(G299) ─────────────────────────────────
test("PERSONA_AUTHORITY 키가 PUBLIC_SCENARIOS 키와 1:1이다(조용한 축소 방지, §50.4.4 G299)", () => {
  assert.deepEqual(
    Object.keys(PERSONA_AUTHORITY).sort(),
    Object.keys(PUBLIC_SCENARIOS).sort(),
    "시나리오를 추가/삭제했으면 PERSONA_AUTHORITY(functions/src/roleplay/personaAuthority.ts)도 " +
      "함께 갱신해야 한다. 판정 질문은 하나다: 이 페르소나가 신원을 밝히는 기관·기업·서비스의 " +
      "담당자인가, 지인인가, 신원을 밝히지 않는 협박범인가.",
  );
});

test("[역검증] 표에서 한 행을 빼면 위 게이트가 실제로 실패한다", () => {
  const withoutOne = { ...PERSONA_AUTHORITY };
  delete withoutOne["kidnapping-threat"];
  assert.throws(
    () => assert.deepEqual(Object.keys(withoutOne).sort(), Object.keys(PUBLIC_SCENARIOS).sort()),
    /kidnapping-threat|Expected|deepEqual/i,
    "표에서 시나리오가 빠졌는데 게이트가 통과하면 그 시나리오의 페르소나 조건화가 조용히 축소된다.",
  );
});

// ── 강제 장치 ② 분포 고정 — institution 8 / acquaintance 4 / anonymous 2 ──────────
test("분포가 §50.4.4 확정값과 같다(institution 8 · acquaintance 4 · anonymous 2)", () => {
  const counts = { institution: 0, acquaintance: 0, anonymous: 0 };
  for (const v of Object.values(PERSONA_AUTHORITY)) counts[v] += 1;
  assert.deepEqual(counts, { institution: 8, acquaintance: 4, anonymous: 2 });
});

test("asksIdentityCheck: institution만 true다(나머지 6종은 false)", () => {
  for (const [id, authority] of Object.entries(PERSONA_AUTHORITY)) {
    assert.equal(
      asksIdentityCheck(id),
      authority === "institution",
      `${id}: authority=${authority}인데 asksIdentityCheck 결과가 어긋난다`,
    );
  }
});

test("존재하지 않는 scenarioId는 asksIdentityCheck가 false를 반환한다(안전한 기본값)", () => {
  assert.equal(asksIdentityCheck("does-not-exist"), false);
});
