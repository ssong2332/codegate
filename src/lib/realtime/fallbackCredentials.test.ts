// D2/F1(docs/Architecture.md §54.2 (1)·(2) · §54.9 (4) 1·2·5·6, **G342**) —
// **폴백으로 내려가도 확인 오퍼 트리거를 잃지 않는다.**
//
// 이 파일이 증명하는 것:
//   ① 낮춰 보관한 값이 `shouldOfferVerify`를 **실제로 통과시킨다** — 게이트 함수 정본을 그대로
//      불러서 잰다(사본을 만들어 재면 정작 정본이 안 봐도 초록이 난다, 이 저장소의 DI 게이트 관례).
//   ② 오늘의 결함(자격증명 폐기 = credentials가 null)이 **같은 게이트에서 false**임을 나란히 보인다.
//   ③ E3(`provider:"none"`) 응답에는 낮춤이 **무효과**다 — §54.9 (4) 1이 지정한 *"issued를 그대로
//      보관"* 과 결과가 같다(회귀 0).
//   ④ 배선 — `useRealtimeCall.ts`의 폴백 입구 3곳(E1·E2·E3)이 실제로 보관을 부르고, **실시간 성공
//      경로는 낮추지 않는다**(§54.9 (4) 6 역검증). 이 저장소에는 React 훅 러너가 없어 배선은 소스
//      수준으로 고정한다(같은 관례: `src/lib/verifyintercept/verifyCallContinuity.test.ts` 헤더).
//      ⭐ 그 검사식에는 오염본 역검증을 붙인다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toFallbackCredentials } from "./fallbackCredentials.ts";
import { shouldOfferVerify } from "../verifyintercept/verifyIntercept.ts";
import type { CreateRealtimeCallResponse } from "../api/types.ts";

const GEMINI_ISSUED: CreateRealtimeCallResponse = {
  provider: "gemini",
  signedUrl: "",
  geminiToken: "auth_tokens/abc123",
  geminiModel: "gemini-live-x",
  voiceId: "",
  language: "ko",
  isMock: false,
  difficultyApplied: true,
  verifyOffer: { availableAfterScammerTurns: 2 },
};

const MOCK_ISSUED: CreateRealtimeCallResponse = {
  provider: "none",
  signedUrl: "",
  geminiToken: "",
  geminiModel: "",
  voiceId: "",
  language: "ko",
  isMock: true,
  difficultyApplied: true,
  verifyOffer: { availableAfterScammerTurns: 2 },
};

test("[G342] 낮춰 보관해도 verifyOffer 트리거는 남는다 — 폴백 게이트가 턴 수를 실제로 본다", () => {
  const retained = toFallbackCredentials(GEMINI_ISSUED);

  assert.deepEqual(retained.verifyOffer, { availableAfterScammerTurns: 2 });
  assert.equal(
    shouldOfferVerify({
      trigger: retained.verifyOffer!,
      scammerTurns: 2,
      alreadyRequested: false,
    }),
    true,
    "트리거가 있으면 사기범 턴 수가 게이트 값에 도달했을 때 오퍼가 열려야 한다",
  );
  assert.equal(
    shouldOfferVerify({
      trigger: retained.verifyOffer!,
      scammerTurns: 1,
      alreadyRequested: false,
    }),
    false,
    "게이트 값(2) 미만에서는 여전히 닫혀 있다 — 값 판정은 무변경이다(G263)",
  );
});

test("[G342 대조] 오늘의 결함(자격증명 폐기)은 턴 수를 아무리 쌓아도 false다 — 구조적 0회", () => {
  // 폐기 = `realtime.credentials`가 null ⇒ `credentials?.verifyOffer`가 undefined.
  assert.equal(
    shouldOfferVerify({ scammerTurns: 99, alreadyRequested: false }),
    false,
    "이것이 라이브에서 관측된 '6턴 내내 전환 0회'의 정확한 모양이다(G341)",
  );
});

test("[§54.9 (4) 1] 실시간 세션을 마운트할 수 있는 값은 남기지 않는다(마이크 없이 Live 마운트 금지)", () => {
  const retained = toFallbackCredentials(GEMINI_ISSUED);

  assert.equal(retained.provider, "none");
  assert.equal(retained.geminiToken, "");
  assert.equal(retained.signedUrl, "");
  assert.equal(retained.geminiModel, "");
  // 텍스트 폴백은 서버가 매 턴 난이도를 반영한다(서버 폴백 계약과 동일).
  assert.equal(retained.difficultyApplied, true);
});

test("[회귀 0] E3(provider:\"none\") 응답에는 낮춤이 무효과다 — issued를 그대로 보관한 것과 같다", () => {
  assert.deepEqual(toFallbackCredentials(MOCK_ISSUED), MOCK_ISSUED);
  // 멱등: 두 번 낮춰도 같다.
  assert.deepEqual(
    toFallbackCredentials(toFallbackCredentials(GEMINI_ISSUED)),
    toFallbackCredentials(GEMINI_ISSUED),
  );
  // isMock 신호는 손대지 않는다(AC-084 강등 고지의 입력).
  assert.equal(toFallbackCredentials(MOCK_ISSUED).isMock, true);
  assert.equal(toFallbackCredentials(GEMINI_ISSUED).isMock, false);
});

// --- ④ 배선(소스 수준) ---

const hook = readFileSync("src/lib/realtime/useRealtimeCall.ts", "utf8");

function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

/** 폴백 입구 3곳이 각자 보관을 부르는가(상태 마커 주변 창에서 확인). */
function retainsAtEveryFallbackExit(source: string): boolean {
  const code = codeOnly(source);
  const exits: Array<[string, string]> = [
    ['setStatus("unsupported")', "retainFallbackCredentials(sessionId)"], // E2
    ['setStatus("permission-denied")', "retainFallbackCredentials(sessionId)"], // E1
    ['setStatus("fallback")', "setCredentials(toFallbackCredentials(issued))"], // E3
  ];
  return exits.every(([marker, retain]) => {
    const at = code.indexOf(marker);
    if (at < 0) return false;
    return code.slice(Math.max(0, at - 400), at + 400).includes(retain);
  });
}

test("[G342 배선] 폴백 입구 3곳(E1·E2·E3)이 전부 자격증명을 보관한다", () => {
  assert.equal(retainsAtEveryFallbackExit(hook), true);
});

test("[G342 배선 역검증] 보관 호출을 지운 오염본은 같은 검사식이 잡아낸다", () => {
  const poisoned = hook
    .split("\n")
    .filter((line) => !line.includes("retainFallbackCredentials(sessionId)"))
    .join("\n")
    .replace("setCredentials(toFallbackCredentials(issued));", "");

  assert.equal(retainsAtEveryFallbackExit(poisoned), false, "오염본을 통과시키면 게이트가 공회전이다");
  assert.equal(retainsAtEveryFallbackExit(hook), true, "정본은 같은 검사식을 통과한다");
});

test("[§54.9 (4) 6 역검증] 실시간 성공 경로는 오늘과 완전히 같다 — 발급 응답을 낮추지 않는다", () => {
  const code = codeOnly(hook);
  // 성공 경로의 마지막 줄은 종전 그대로 `setCredentials(issued);` 여야 한다.
  assert.ok(
    /\n\s*setCredentials\(issued\);\s*\n/.test(code),
    "실시간 성공 경로에서 낮추면 Live 세션이 영영 마운트되지 않는다",
  );
  // 실시간 세션 컴포넌트의 마운트 판별자(provider)를 건드리지 않았다.
  const page = readFileSync("src/app/session/play/page.tsx", "utf8");
  assert.ok(page.includes('realtime.credentials?.provider === "elevenlabs" && ('));
  assert.ok(page.includes('realtime.credentials?.provider === "gemini" && ('));
});
