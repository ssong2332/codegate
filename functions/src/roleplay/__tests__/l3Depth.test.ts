// L3 깊이 모드 선언표 게이트 (T85, Architecture.md §17.5 강제 장치 3건 + §17.10 계약 10항,
// ADR-0011, AC-074/AC-075). node:test — 저장소에 별도 테스트 프레임워크가 없다(관례 계승).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { L3_DEPTH_TABLE, isL3Applied, isL3Procedural, l3DepthMode } from "../l3Depth";
import { PUBLIC_SCENARIOS } from "../../scenarios/publicMeta";
import { hasVerifyIntercept } from "../../scenarios/verifyIntercept";
import { DIFFICULTY_LEVELS } from "../../shared/difficulty";

// ── 강제 장치 ① 키 1:1 deepEqual 게이트 (§17.5) ───────────────────────────────
//
// ⚠️ 기본값이 `reduced`라 **표에서 빠진 시나리오는 에러 없이 고급이 축소된다**(§17.11 G63과 같은
// 부류의 조용한 실패). 그래서 §15.10.4의 T91식 게이트를 그대로 재사용해 누락을 컴파일이 아니라
// 테스트로 막는다.
test("L3_DEPTH_TABLE 키가 PUBLIC_SCENARIOS 키와 1:1이다(조용한 축소 방지, §17.5 강제 장치 1)", () => {
  assert.deepEqual(
    Object.keys(L3_DEPTH_TABLE).sort(),
    Object.keys(PUBLIC_SCENARIOS).sort(),
    "시나리오를 추가/삭제했으면 L3_DEPTH_TABLE(functions/src/roleplay/l3Depth.ts)도 함께 갱신해야 한다. " +
      "판정 질문은 하나다: 이 페르소나가 접수번호·처리 단계·기한·담당 부서를 말해도 캐릭터가 무너지지 않는가.",
  );
});

test("[역검증] 표에서 한 행을 빼면 위 게이트가 실제로 실패한다", () => {
  const withoutOne = { ...L3_DEPTH_TABLE };
  delete withoutOne["loan-refinance-scam"];
  assert.throws(
    () => assert.deepEqual(Object.keys(withoutOne).sort(), Object.keys(PUBLIC_SCENARIOS).sort()),
    /loan-refinance-scam|Expected|deepEqual/i,
    "표에서 시나리오가 빠졌는데 게이트가 통과하면 그 시나리오의 고급이 조용히 축소된다.",
  );
});

// ── 강제 장치 ② hasVerifyIntercept 일관성 (§17.5) ─────────────────────────────

test("확인 무력화 메커닉을 가진 시나리오는 전부 procedural이다(D3를 가졌는데 D4를 못 쓸 이유가 없다)", () => {
  const withMechanic = Object.keys(PUBLIC_SCENARIOS).filter((id) => hasVerifyIntercept(id));
  assert.ok(withMechanic.length >= 1, "확인 무력화 카탈로그 보유 시나리오가 최소 1종은 있어야 한다");
  for (const id of withMechanic) {
    assert.equal(
      L3_DEPTH_TABLE[id],
      "procedural",
      `${id}: 확인 무력화(D3) 메커닉을 가졌는데 L3_DEPTH_TABLE이 reduced다 — 두 표가 어긋났다(§17.5 일관성 단언)`,
    );
    assert.equal(l3DepthMode(id), "d3_and_d4");
  }
});

// ── 강제 장치 ③ 분포 고정 (§17.5) ─────────────────────────────────────────────
//
// ⚠️ **설계값과 다른 점 = 시나리오 수**(정직 고지). §17.5 표는 **13종 기준 5/4/4**로 작성됐는데,
// 그 뒤 T95가 확인 무력화 전용 시나리오(`bank-security-verify-scam`)를 병합해 라이브러리가 14종이
// 됐다. §17.10 계약 **14항**이 이 경우를 미리 규율한다 — *"T95가 시나리오를 +1종 하면
// L3_DEPTH_TABLE도 1행 늘어야 한다. 그 행은 hasVerifyIntercept가 true일 것이므로 procedural이어야
// 한다"*. 그래서 `d3_and_d4`가 5 → **6**이 되고 나머지는 설계값 그대로다(4/4).
//
// 누가 한 행을 `reduced`로 바꾸면 **이 테스트가 먼저 깨진다** — 고급이 조용히 무력해지는 것을 막는
// 장치이며, 통과시키려고 기대값을 내리기 전에 그 행이 왜 reduced가 됐는지부터 확인해야 한다.
test("L3 깊이 분포가 6/4/4다(§17.5의 13종 5/4/4 + T95 신규 1종 → d3_and_d4)", () => {
  const counts = { d3_and_d4: 0, d4_only: 0, reduced: 0 };
  for (const id of Object.keys(PUBLIC_SCENARIOS)) counts[l3DepthMode(id)] += 1;

  assert.deepEqual(counts, { d3_and_d4: 6, d4_only: 4, reduced: 4 });
  assert.equal(
    counts.d3_and_d4 + counts.d4_only + counts.reduced,
    Object.keys(PUBLIC_SCENARIOS).length,
    "모든 시나리오가 정확히 한 모드에 속해야 한다",
  );
  // 고급에서 L3가 실제로 적용되는 시나리오 = 10/14(설계의 9/13에 T95 1종이 더해진 값).
  const applied = Object.keys(PUBLIC_SCENARIOS).filter((id) => isL3Applied(id, "advanced"));
  assert.equal(applied.length, 10);
});

test("reduced 4종은 가족·지인 사칭이다 — 아들·손주·친구가 접수번호를 부르면 페르소나가 무너진다", () => {
  const reduced = Object.keys(PUBLIC_SCENARIOS)
    .filter((id) => l3DepthMode(id) === "reduced")
    .sort();
  assert.deepEqual(reduced, [
    "family-accident-deepvoice",
    "grandchild-impersonation",
    "messenger-child-impersonation-kakao",
    "messenger-friend-loan-kakao",
  ]);
});

// ── 파생 함수의 계약 (§17.7 — 저장 필드가 아니다) ─────────────────────────────

test("isL3Applied는 고급에서만 true다(초급·중급은 시나리오와 무관하게 전부 false)", () => {
  for (const id of Object.keys(PUBLIC_SCENARIOS)) {
    for (const level of DIFFICULTY_LEVELS) {
      const expected = level === "advanced" && isL3Procedural(id);
      assert.equal(isL3Applied(id, level), expected, `${id}/${level}`);
    }
    assert.equal(isL3Applied(id, "beginner"), false, `${id}: 초급은 L3를 얹지 않는다(상한 규칙)`);
    assert.equal(isL3Applied(id, "intermediate"), false, `${id}: 중급은 기준선이라 블록 자체가 없다`);
  }
});

test("l3DepthMode는 미지의 scenarioId에 reduced를 돌려준다(발명하지 않는다)", () => {
  assert.equal(l3DepthMode("no-such-scenario"), "reduced");
  assert.equal(isL3Procedural("no-such-scenario"), false);
});

// ── §17.11 G63 — 호출부 3곳 전수 게이트 ───────────────────────────────────────
//
// ⚠️ **왜 소스 텍스트를 읽는가(한계를 함께 적는다)**: `l3Procedural`을 호출부 3곳 중 하나라도
// 빠뜨리면 그 경로에서만 고급이 **에러 없이** 축소된다(기본값이 축소형). 그런데 세 경로 중
// 행동으로 단언할 수 있는 것은 Gemini Live 토큰 발급뿐이다 — `sendMessage`는 Firestore·admin에
// 묶인 콜러블이고, `generateOpeningLine`은 조립된 systemPrompt를 밖으로 내보내지 않는다(Mock
// LlmClient가 입력을 기록하지 않는다). 그래서 **행동 단언(geminiProvider.test.ts)과 소스 게이트(이
// 테스트)를 함께** 둔다. 이 게이트가 잡는 것은 "호출부에서 옵션이 사라지는 회귀"이고, 잡지 못하는
// 것은 "넘기긴 하는데 값이 틀린 경우"다 — 후자는 판정 함수를 한 곳(`isL3Procedural`)으로 묶어
// 구조적으로 막는다(그래서 리터럴 대신 함수 호출 형태까지 함께 검사한다).
//
// 선례: `scenarios.test.ts`의 미러 드리프트 검사·AC-073 신호 리터럴 검사가 같은 방식이다.
const L3_CALL_SITES = [
  "src/roleplay/index.ts", // 텍스트 턴 sendMessage
  "src/roleplay/openingLine.ts", // 오프닝 대사
  "src/realtime/geminiProvider.ts", // Gemini Live 토큰
];

test("[G63] buildSystemPrompt 호출부 3곳이 전부 l3Procedural을 같은 판정 함수로 넘긴다", () => {
  for (const relative of L3_CALL_SITES) {
    // __dirname = functions/lib/roleplay/__tests__ → ../../.. = functions
    const source = fs.readFileSync(path.resolve(__dirname, "../../..", relative), "utf-8");
    assert.ok(
      source.includes("l3Procedural: isL3Procedural("),
      `${relative}: buildSystemPrompt 호출에 \`l3Procedural: isL3Procedural(...)\`이 없다 — ` +
        `이 경로에서만 고급이 조용히 축소된다(기본값이 축소형이라 에러가 나지 않는다, §17.11 G63).`,
    );
    assert.ok(
      source.includes('from "./l3Depth"') || source.includes('from "../roleplay/l3Depth"'),
      `${relative}: 판정 함수를 l3Depth.ts에서 import해야 한다(판정 지점 단일화 — 호출부가 자체 규칙을 만들면 드리프트가 난다).`,
    );
  }
});
