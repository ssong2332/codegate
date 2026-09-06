// §59.9 R1(G371 집행) — Live 도구 **허용목록** 회귀 그물.
//
// ⭐ 이 파일은 원래 §59.10 커밋 A·B(도구 선언 0줄 변경)를 지키는 소스 스캔 가드였다. 이제 §59
// 커밋 C(이 패스)가 그 도구 선언 자체를 구현하므로, 예전 가드("tools:[]가 살아 있어야 한다")는
// **의도적으로 폐기**하고 R1이 요구하는 형태(허용목록과의 정확한 집합 동등 비교)로 교체한다 —
// docs/Architecture.md §59.9 R1: "오늘의 geminiProvider.test.ts:104(body.includes("tools") — 도구를
// 넣어도 초록)를 대체한다."
//
// ⚠️ **관측 불가 지점 방어를 유지한다**(`feedback_unobservable_behavior_gates`) — 실제 토큰 발급
// 요청 본문 검증은 `geminiProvider.test.ts`가 network mock으로 이미 커버한다(§59.5 도구 스키마
// 회귀). 이 파일은 `buildLiveToolDeclarations`/`buildLiveToolNames`(순수 함수)를 직접 단언해
// **허용목록 자체가 뚫리지 않는지**를 기계로 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildLiveToolDeclarations,
  buildLiveToolNames,
  LIVE_TOOL_SEND_PREPARED_SMS,
  LIVE_TOOL_OFFER_VERIFICATION_DESK,
  verifySeriesFor,
} from "../liveTools";

const ALLOWED_NAMES = new Set([LIVE_TOOL_SEND_PREPARED_SMS, LIVE_TOOL_OFFER_VERIFICATION_DESK]);

function declaredNames(scenarioId: string, difficultyLevel?: "beginner" | "intermediate" | "advanced"): Set<string> {
  const tools = buildLiveToolDeclarations(scenarioId, difficultyLevel);
  const names = new Set<string>();
  for (const tool of tools) {
    for (const decl of tool.functionDeclarations ?? []) {
      if (decl.name) names.add(decl.name);
    }
  }
  return names;
}

// R1 ① — 카탈로그·게이트 둘 다 없는 시나리오 ⇒ tools가 빈 배열이다(회귀 0, G388의 유일한 레버).
test("[§59.9 R1①] 카탈로그·확인 무력화 둘 다 없는 시나리오(kidnapping-threat) — tools는 빈 배열", () => {
  for (const difficultyLevel of ["beginner", "intermediate", "advanced"] as const) {
    const tools = buildLiveToolDeclarations("kidnapping-threat", difficultyLevel);
    assert.deepEqual(tools, [], `difficulty=${difficultyLevel}에서도 빈 배열이어야 한다`);
  }
  // difficultyLevel 부재(폴백 강등 등)에서도 동일하다.
  assert.deepEqual(buildLiveToolDeclarations("kidnapping-threat", undefined), []);
});

// R1 ② — 문자 카탈로그만 있는 시나리오 ⇒ 이름 집합이 정확히 {send_prepared_sms}다.
test("[§59.9 R1②] 문자 카탈로그만 있는 시나리오(reputation-blackmail-scam) — 이름 집합이 정확히 {send_prepared_sms}", () => {
  for (const difficultyLevel of ["beginner", "intermediate", "advanced"] as const) {
    assert.deepEqual(
      declaredNames("reputation-blackmail-scam", difficultyLevel),
      new Set([LIVE_TOOL_SEND_PREPARED_SMS]),
      `difficulty=${difficultyLevel}`,
    );
  }
});

// R1 ③ — bank-security-verify-scam(계열 A) && advanced ⇒ 이름 집합이 정확히 두 도구 전부다.
test("[§59.9 R1③] bank-security-verify-scam(계열 A) + advanced — 이름 집합이 정확히 {send_prepared_sms, offer_verification_desk}", () => {
  assert.deepEqual(
    declaredNames("bank-security-verify-scam", "advanced"),
    new Set([LIVE_TOOL_SEND_PREPARED_SMS, LIVE_TOOL_OFFER_VERIFICATION_DESK]),
  );
});

// G392/OQ-A73 — bank-security-verify-scam도 advanced가 아니면 offer 도구는 아직 선언되지 않는다.
test("[§59.9 R1③ 계열A/난이도] bank-security-verify-scam — advanced가 아니면 offer_verification_desk는 없다", () => {
  for (const difficultyLevel of ["beginner", "intermediate"] as const) {
    assert.deepEqual(
      declaredNames("bank-security-verify-scam", difficultyLevel),
      new Set([LIVE_TOOL_SEND_PREPARED_SMS]),
      `difficulty=${difficultyLevel} — SMS 도구는 난이도 무관하게 선언되지만 offer는 advanced 전용이다`,
    );
  }
});

// G392/OQ-A73 — 계열 B 5종은 advanced에서도 offer_verification_desk를 선언하지 않는다(User 확정 전).
test("[§59.9 R1③ 계열B] 확인 무력화 계열 B 5종 — advanced에서도 offer_verification_desk를 선언하지 않는다", () => {
  const SERIES_B_SCENARIOS = [
    "institutional-impersonation",
    "card-company-impersonation",
    "loan-refinance-scam",
    "tax-refund-scam",
    "courier-customs-scam",
  ];
  assert.equal(SERIES_B_SCENARIOS.length, 5, "계열 B는 5종이어야 한다(OQ-A73 확장 전)");
  for (const scenarioId of SERIES_B_SCENARIOS) {
    assert.equal(verifySeriesFor(scenarioId), "B", `${scenarioId}는 계열 B여야 한다`);
    const names = declaredNames(scenarioId, "advanced");
    assert.ok(
      !names.has(LIVE_TOOL_OFFER_VERIFICATION_DESK),
      `${scenarioId}(계열 B, advanced)에 offer_verification_desk가 선언되면 안 된다(G392)`,
    );
    // 이 5종도 문자 카탈로그를 함께 가지므로 send_prepared_sms는 정상 선언된다(§59.7 표).
    assert.ok(names.has(LIVE_TOOL_SEND_PREPARED_SMS), `${scenarioId}는 문자 카탈로그도 가진다`);
  }
});

// R1 ④ — 선언된 모든 함수의 parameters.properties가 빈 객체다(G384 기계 집행 — 인자 없음).
test("[§59.9 R1④/G384] 선언된 모든 함수는 인자가 없다(parameters.properties === {})", () => {
  const scenarioDifficultyPairs: [string, "beginner" | "intermediate" | "advanced" | undefined][] = [
    ["reputation-blackmail-scam", "advanced"],
    ["bank-security-verify-scam", "advanced"],
    ["loan-refinance-scam", "advanced"],
    ["kidnapping-threat", undefined],
  ];
  let checked = 0;
  for (const [scenarioId, difficultyLevel] of scenarioDifficultyPairs) {
    const tools = buildLiveToolDeclarations(scenarioId, difficultyLevel);
    for (const tool of tools) {
      for (const decl of tool.functionDeclarations ?? []) {
        assert.deepEqual(
          decl.parameters?.properties,
          {},
          `${scenarioId}/${decl.name}의 parameters.properties는 빈 객체여야 한다(G384)`,
        );
        assert.equal(decl.parameters?.type, "OBJECT");
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 4, "선언된 함수를 최소 4개 이상 실제로 검사해야 한다");
});

// R1 ⑤ — 허용목록 밖 이름 0건(집합 동등 비교이므로 전 시나리오 × 전 난이도 순회로 자동 검증).
test("[§59.9 R1⑤/G371] 전 시나리오 × 전 난이도에서 선언된 이름은 허용목록 2개를 벗어나지 않는다", () => {
  // §59.5/§59.6이 아는 6개 확인 무력화 카탈로그 + 7개 문자 카탈로그 시나리오 전부 + 카탈로그 없는
  // 대조군 1종(kidnapping-threat) — R1이 "전 조합"이라 부르는 범위를 시나리오 축으로 훑는다.
  const SCENARIO_IDS = [
    "loan-refinance-scam",
    "institutional-impersonation",
    "card-company-impersonation",
    "tax-refund-scam",
    "courier-customs-scam",
    "reputation-blackmail-scam",
    "bank-security-verify-scam",
    "kidnapping-threat",
  ];
  for (const scenarioId of SCENARIO_IDS) {
    for (const difficultyLevel of ["beginner", "intermediate", "advanced", undefined] as const) {
      const names = declaredNames(scenarioId, difficultyLevel);
      for (const name of names) {
        assert.ok(ALLOWED_NAMES.has(name), `${scenarioId}/${difficultyLevel}에서 허용목록 밖 이름: ${name}`);
      }
    }
  }
});

// createRealtimeCall 응답 liveTools 필드(§59.6 ②/G385) — 선언 조건과 정확히 같은 판정이어야 한다.
test("[§59.6 liveTools] buildLiveToolNames의 부착 조건은 buildLiveToolDeclarations와 항상 일치한다", () => {
  const SCENARIO_IDS = [
    "loan-refinance-scam",
    "institutional-impersonation",
    "reputation-blackmail-scam",
    "bank-security-verify-scam",
    "kidnapping-threat",
  ];
  for (const scenarioId of SCENARIO_IDS) {
    for (const difficultyLevel of ["beginner", "intermediate", "advanced", undefined] as const) {
      const declared = declaredNames(scenarioId, difficultyLevel);
      const names = buildLiveToolNames(scenarioId, difficultyLevel);
      if (declared.size === 0) {
        assert.equal(names, undefined, `${scenarioId}/${difficultyLevel} — 선언 0건이면 liveTools도 없어야 한다`);
        continue;
      }
      assert.ok(names, `${scenarioId}/${difficultyLevel} — 선언이 있으면 liveTools도 있어야 한다`);
      assert.equal(
        names!.sendPreparedSms !== undefined,
        declared.has(LIVE_TOOL_SEND_PREPARED_SMS),
        `${scenarioId}/${difficultyLevel} sendPreparedSms 정합`,
      );
      assert.equal(
        names!.offerVerificationDesk !== undefined,
        declared.has(LIVE_TOOL_OFFER_VERIFICATION_DESK),
        `${scenarioId}/${difficultyLevel} offerVerificationDesk 정합`,
      );
      assert.ok(names!.failureInstruction.length > 0, "failureInstruction은 항상 채워져야 한다(G386)");
    }
  }
});

// G389 계승 — deliverVerifyReconnect(호 전환 실행)는 절대 Live 도구로 노출하지 않는다. 그 콜러블의
// 계약은 이 패스에서 0줄 변경이다(§59.0 4 — 원인은 참가자의 탭이지 모델이 아니다).
test("[§59.9 G389] 허용목록·liveTools.ts 어디에도 deliverVerifyReconnect가 도구로 등장하지 않는다", () => {
  assert.ok(
    !ALLOWED_NAMES.has("deliverVerifyReconnect") && !ALLOWED_NAMES.has("offer_verification_reconnect"),
    "reconnect 계열 이름이 허용목록에 들어오면 안 된다",
  );
  // ⚠️ 컴파일된 테스트는 `functions/lib/realtime/__tests__/`에서 돈다 — `.ts` 원본은 `lib`가 아니라
  // `src`에 있으므로 세 단계 위로 올라가 `src`로 되짚어야 한다(geminiProvider.ts 스캔 테스트와 동일
  // 관례, 아래 커밋 C 소스 스캔 테스트 참고).
  const liveToolsSrc = readFileSync(
    path.resolve(__dirname, "../../../src/realtime/liveTools.ts"),
    "utf8",
  );
  assert.ok(
    !liveToolsSrc.includes("deliverVerifyReconnect") && !liveToolsSrc.toLowerCase().includes("reconnect"),
    "liveTools.ts가 reconnect(호 전환 실행)를 참조하면 안 된다(G389)",
  );
  // 콜러블 자체는 이 패스에서 0줄 변경이다 — verifyIntercept/index.ts가 여전히 그 이름으로
  // export하는지만 확인한다(존재 확인이지 내용 회귀 검증이 아니다 — 내용은 git diff가 진다).
  const verifyIndexSrc = readFileSync(
    path.resolve(__dirname, "../../../src/verifyIntercept/index.ts"),
    "utf8",
  );
  assert.ok(
    verifyIndexSrc.includes("deliverVerifyReconnect"),
    "deliverVerifyReconnect 콜러블이 사라지면 안 된다",
  );
});

// G382 반대쪽 위험 방어 — 이 커밋 이후에도 geminiProvider.ts가 실제로 buildLiveToolDeclarations를
// 쓰는지(소스 스캔). 런타임 조립은 에뮬레이터 없이 관측 불가라(feedback_unobservable_behavior_gates)
// 소스 리터럴로 고정한다.
test("[§59.10 커밋 C] geminiProvider.ts의 tools는 buildLiveToolDeclarations의 결과를 그대로 쓴다", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../../../src/realtime/geminiProvider.ts"),
    "utf8",
  );
  assert.match(src, /tools:\s*liveToolDeclarations/, "tools가 더 이상 빈 배열 리터럴로 고정돼 있지 않아야 한다");
  assert.ok(src.includes("buildLiveToolDeclarations"), "buildLiveToolDeclarations를 import·호출해야 한다");
  assert.ok(src.includes("toolDrivenTiming: true"), "toolDrivenTiming을 이 호출부에서 true로 넘겨야 한다(§59.3)");
});

// §59.6 ②/G385 — `createRealtimeCall` 응답에 `liveTools`가 실제로 담기는가(docs/API.md 부록 C).
// ⚠️ **관측 불가 지점 방어**(`feedback_unobservable_behavior_gates`) — `createRealtimeCall`은
// `onCall` 핸들러라 에뮬레이터 없이 유닛 계층에서 직접 호출·관측할 수 없다(`deliverInCallSms`
// 게이트 순서 테스트와 같은 제약). `credentials.liveTools`는 `GeminiRealtimeProvider`에서만
// 채워지고(위 `geminiProvider.test.ts` 두 테스트가 그 값 자체를 고정한다), 이 파일은 그 값이
// `realtime/index.ts`의 두 `return` 경로에서 **필드별로 재구성되지 않고 스프레드로 통째로
// 전달되는가**만 소스 스캔으로 고정한다 — 재구성 형태(`{ provider: credentials.provider, ... }`
// 처럼 필드를 하나씩 나열하는 형태)로 바뀌면 옵셔널 필드인 `liveTools`가 조용히 누락될 수 있다.
test("[§59.6 liveTools 배선] realtime/index.ts의 두 반환 경로 모두 credentials를 스프레드해 전달한다", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/realtime/index.ts"), "utf8");
  assert.match(
    src,
    /return withVerifyOffer\(withSmsTriggers\(\{ \.\.\.credentials, voiceId: "" \}\)\);/,
    "challenge 세션 경로가 credentials를 스프레드하지 않는다 — liveTools 등 옵셔널 필드가 누락될 수 있다",
  );
  assert.match(
    src,
    /return withVerifyOffer\(withSmsTriggers\(credentials\)\);/,
    "일반 경로가 credentials를 그대로 넘기지 않는다 — liveTools 등 옵셔널 필드가 누락될 수 있다",
  );
  // withSmsTriggers/withVerifyOffer 자신도 `<T extends object>(x: T): T` 형태의 스프레드/항등
  // 래퍼여야 한다(필드를 나열해 재구성하면 같은 위험이 생긴다).
  assert.match(src, /const withSmsTriggers = <T extends object>\(credentials: T\): T =>/);
  assert.match(src, /const withVerifyOffer = <T extends \{ provider: RealtimeProviderName \}>\(credentials: T\): T =>/);
});
