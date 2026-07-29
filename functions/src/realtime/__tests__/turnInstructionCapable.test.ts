import { test } from "node:test";
import assert from "node:assert/strict";
import { isTurnInstructionCapable, TURN_INSTRUCTION_CAPABLE_PROVIDERS } from "../index";
import type { RealtimeCallCredentials, RealtimeProviderName } from "../types";

// ══════════════════════════════════════════════════════════════════════════════════════════
// §43.7 ⓑ / **G234** — 확인 오퍼 1차 게이트의 판별자를 `credentials.difficultyApplied === true`에서
// **프로바이더 허용목록**으로 교체했다. 판별자 교체는 **무약화 증명이 있어야 성립**하므로,
// §43.7 (3) 표(현행 4경로)를 **그대로 재현**하고 역검증까지 같은 파일에 둔다.
//
// **왜 교체했나**: `difficultyApplied`는 한 이름으로 두 가지를 말한다 —
//   **M1** 난이도가 프롬프트에 실렸는가(클라 배지가 쓴다) / **M2** 서버가 턴 지시를 넣을 수 있는가.
// 오늘 두 값이 같은 것은 **하나의 구조적 사실**(ElevenLabs는 프롬프트가 에이전트 쪽에 있다)이 두
// 성질을 동시에 만들기 때문일 뿐이다. §15.3.3 확장 경로가 구현되면 **M1=true·M2=false**가 되어
// 게이트가 조용히 열리고, §16.6 G23이 막던 *"컨트롤은 뜨는데 사기범이 아무 말도 하지 않는"*
// 불일치가 되살아난다.
//
// ⛔ **T133/§41의 1차 게이트를 약화시키지 않는다** — 아래 4/4 표가 그 증명이고, 역검증 2건이
// *"게이트가 아무것도 잡지 않는 상태"* 를 배제한다.
// ⛔ **2차 게이트(`verifyIntercept/index.ts` 재검증 5종)는 이 패스에서 손대지 않았다 — G235.**
// ══════════════════════════════════════════════════════════════════════════════════════════

/**
 * §43.7 (3) 표 — **현행 4경로 전수**. `difficultyApplied`는 교체 **전** 판별자가 무엇을 봤는지
 * 보이기 위해 함께 싣는다(값 출처: `geminiProvider.ts` · `elevenLabsProvider.ts` ·
 * `mockProvider.ts` · `realtime/index.ts`의 catch 폴백).
 */
const CURRENT_PATHS: readonly {
  label: string;
  provider: RealtimeProviderName;
  difficultyApplied: boolean;
  expected: boolean;
}[] = [
  { label: "Gemini Live", provider: "gemini", difficultyApplied: true, expected: true },
  { label: "ElevenLabs", provider: "elevenlabs", difficultyApplied: false, expected: false },
  { label: "Mock", provider: "none", difficultyApplied: true, expected: true },
  { label: "텍스트 폴백(catch)", provider: "none", difficultyApplied: true, expected: true },
];

test("[§43/G234] 판별자 교체 전후 판정이 **4/4 동일**하다 — 행동 변화 0, 회귀 0", (t) => {
  for (const path of CURRENT_PATHS) {
    // 교체 **전** 판별자(그대로 재현) ↔ 교체 **후** 판별자.
    const before = path.difficultyApplied === true;
    const after = isTurnInstructionCapable(path.provider);
    assert.equal(
      after,
      before,
      `${path.label}: 판별자 교체로 판정이 달라졌다(before=${before}, after=${after}) — ` +
        "§43.7 (3)이 요구한 것은 **의미 정정이지 동작 변경이 아니다**.",
    );
    assert.equal(after, path.expected, `${path.label}: 기대 판정과 다르다`);
    t.diagnostic(
      `${path.label} ▸ provider="${path.provider}" difficultyApplied=${path.difficultyApplied} ` +
        `⇒ before=${before} after=${after} (기대 ${path.expected})`,
    );
  }
});

test("[§43/G234-역검증] 허용목록을 좁히면 **이 함수 자신의** 판정이 뒤집힌다(게이트가 아무것도 안 잡는 상태 배제)", (t) => {
  // ⭐ *"교체해도 4/4 동일"* 만 재면 **항상 true를 돌려주는 함수도 3/4을 통과**한다. 그래서
  // 오염 허용목록을 **이 함수에 실제로 주입**해 판정이 뒤집히는 것을 본다(테스트 안에 같은 모양의
  // 사본을 만들어 재면 정작 정본 함수가 목록을 안 봐도 초록이 난다 — 그 함정을 피한 형태다).
  for (const removed of ["gemini", "none"] as const) {
    const narrowed = TURN_INSTRUCTION_CAPABLE_PROVIDERS.filter((p) => p !== removed);
    assert.equal(
      isTurnInstructionCapable(removed, narrowed),
      false,
      `허용목록에서 "${removed}"를 뺐는데도 통과한다 — 게이트가 프로바이더를 보지 않는다`,
    );
    t.diagnostic(`역검증 ▸ 허용목록 [${narrowed.join(", ")}] 주입 ⇒ "${removed}" 판정 false(빨간불 재현)`);
  }
  // 빈 목록이면 4경로가 전부 차단된다(판정이 목록에 완전히 종속임을 보인다).
  for (const path of CURRENT_PATHS) {
    assert.equal(isTurnInstructionCapable(path.provider, []), false, `빈 허용목록에서 ${path.label}이 통과했다`);
  }
  // 정본은 오염되지 않는다(주입은 인자 한정).
  assert.equal(isTurnInstructionCapable("gemini"), true, "역검증이 정본 허용목록을 오염시켰다");
  assert.deepEqual([...TURN_INSTRUCTION_CAPABLE_PROVIDERS], ["gemini", "none"]);
});

test("[§43/G233] **허용목록**이라 새 프로바이더는 기본 차단된다 — 차단목록이면 기본 통과가 된다", () => {
  // ⛔ `provider !== "elevenlabs"` 로 썼다면 아래 미등록 값이 **통과**한다. 그것이 G233이 기각한
  // 방향이다(새 외부 에이전트 프로바이더가 추가되면 같은 결함이 재발한다).
  const unregistered = "some-future-agent-provider" as RealtimeProviderName;
  assert.equal(
    isTurnInstructionCapable(unregistered),
    false,
    "미등록 프로바이더가 기본 통과했다 — 허용목록이 아니라 차단목록으로 동작하고 있다(G233).",
  );
  // 차단목록이었다면 통과했을 것임을 나란히 보인다(방향 대조).
  assert.equal(unregistered !== "elevenlabs", true, "대조군 전제가 깨졌다");
});

test("[§43/G236] 허용목록은 `difficultyApplied`와 독립이다 — 난이도 반영 ≠ 턴 지시 주입 자격", () => {
  // ⛔ **G236 하드 규칙**: §15.3.3 확장 경로(난이도별 ElevenLabs 에이전트)를 구현할 때
  // `difficultyApplied`만 `true`로 올리고 이 허용목록은 건드리지 말 것. 그 순간이 바로 두 의미가
  // 갈라지는 지점이며, 아래가 **그때도 게이트가 닫혀 있음**을 미리 고정한다.
  const futureElevenLabs: Pick<RealtimeCallCredentials, "provider" | "difficultyApplied"> = {
    provider: "elevenlabs",
    difficultyApplied: true, // ← §15.3.3 확장이 구현된 가상의 미래 값
  };
  assert.equal(futureElevenLabs.difficultyApplied, true, "가상 시나리오 전제가 깨졌다");
  assert.equal(
    isTurnInstructionCapable(futureElevenLabs.provider),
    false,
    "난이도가 반영됐다는 이유로 게이트가 열렸다 — ElevenLabs 경로에는 여전히 턴 지시 주입 지점이 " +
      "없어 컨트롤만 뜨고 사기범이 아무 말도 하지 않는다(§16.6 G23 / G236).",
  );
});

test("[§43/G234] 허용목록의 원소가 실재하는 프로바이더 이름이다(오타로 조용히 차단되지 않는다)", () => {
  const known: readonly RealtimeProviderName[] = ["elevenlabs", "gemini", "none"];
  for (const provider of TURN_INSTRUCTION_CAPABLE_PROVIDERS) {
    assert.ok(known.includes(provider), `허용목록에 없는 프로바이더 이름이 있다 — "${provider}"`);
  }
  assert.deepEqual([...TURN_INSTRUCTION_CAPABLE_PROVIDERS], ["gemini", "none"]);
});
