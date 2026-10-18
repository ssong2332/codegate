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
  declaresEndCall,
  END_CALL_LIVE_AVAILABLE,
  LIVE_TOOL_END_CALL,
  LIVE_TOOL_SEND_PREPARED_SMS,
  LIVE_TOOL_OFFER_VERIFICATION_DESK,
  verifySeriesFor,
  declaresOfferVerificationDesk,
  type EndCallScope,
} from "../liveTools";
import { FLOW_VARIANTS } from "../../scenarios/flowVariants";
import { SCAMMER_HANGUP_FAILURE_INSTRUCTION } from "../../scammerHangup/guidance";
import { VERIFY_DECLINE_ALREADY } from "../../scenarios/verifyIntercept";
import { Behavior } from "@google/genai";
import { SCENARIO_PROMPTS } from "../../scenarios";

// T192 C3 — `end_call`이 허용목록에 들어온다(§79.3 · §79.19 (5) 3).
const ALLOWED_NAMES = new Set([LIVE_TOOL_SEND_PREPARED_SMS, LIVE_TOOL_OFFER_VERIFICATION_DESK, LIVE_TOOL_END_CALL]);

/**
 * ⚠️ T192 C3(G556) — 이 파일의 §59 · §61 단언(문자 · 확인 도구의 선언 조건)은 **`end_call` 거짓 입력**(메신저)으로 돈다.
 * 그 범위에서 출력이 S5b 판정과 바이트 동일해야 한다는 것이 G556이고, 음성 통화(`end_call` 참)와의 관계는 아래
 * [T192/C3 G556] 테스트가 "기존 선언 뒤에 1개"로 따로 고정한다.
 */
// ⚠️ PR A 리뷰 M1 — 아래 판정 로직 단언은 **켬 입력**(`liveAvailable: true`)으로 돈다. 운영값(끔) 단언은 파일 끝
// [M1 운영값] 테스트가 따로 고정한다.
const NO_END_CALL: EndCallScope = { channel: "messenger", relay: undefined, liveAvailable: true };
const VOICE: EndCallScope = { channel: undefined, relay: undefined, liveAvailable: true };
/** 운영값 그대로의 음성 범위(`geminiProvider` 기본 생성자와 같은 값). */
const VOICE_OPERATIONAL: EndCallScope = { channel: undefined, relay: undefined, liveAvailable: END_CALL_LIVE_AVAILABLE };

function declaredNames(
  scenarioId: string,
  difficultyLevel?: "beginner" | "intermediate" | "advanced",
  scope: EndCallScope = NO_END_CALL,
): Set<string> {
  const tools = buildLiveToolDeclarations(scenarioId, difficultyLevel, undefined, scope);
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
    const tools = buildLiveToolDeclarations("kidnapping-threat", difficultyLevel, undefined, NO_END_CALL);
    assert.deepEqual(tools, [], `difficulty=${difficultyLevel}에서도 빈 배열이어야 한다`);
  }
  // difficultyLevel 부재(폴백 강등 등)에서도 동일하다.
  assert.deepEqual(buildLiveToolDeclarations("kidnapping-threat", undefined, undefined, NO_END_CALL), []);
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

// §61(OQ-A73 User 확정) — 계열 B 5종은 advanced에서 {send_prepared_sms, offer_verification_desk}
// 둘 다 선언한다. `verifySeriesFor(scenarioId)==="B"` 단언은 남긴다 — "계열 B인데도 도구는
// 선언된다"가 이 설계의 핵심이라 그 단언이 D-C 회귀(§61.4)를 잡는 그물이 된다.
test("[§61 R1③ 계열B] 확인 무력화 계열 B 5종 — advanced에서 send_prepared_sms·offer_verification_desk 둘 다 선언한다", () => {
  const SERIES_B_SCENARIOS = [
    "institutional-impersonation",
    "card-company-impersonation",
    "loan-refinance-scam",
    "tax-refund-scam",
    "courier-customs-scam",
  ];
  assert.equal(SERIES_B_SCENARIOS.length, 5, "계열 B는 5종이어야 한다(OQ-A73 확장 대상 전수)");
  for (const scenarioId of SERIES_B_SCENARIOS) {
    assert.equal(verifySeriesFor(scenarioId), "B", `${scenarioId}는 계열 B여야 한다(§61 이후에도 분류는 무변경, G399)`);
    const names = declaredNames(scenarioId, "advanced");
    assert.ok(
      names.has(LIVE_TOOL_OFFER_VERIFICATION_DESK),
      `${scenarioId}(계열 B, advanced)에 offer_verification_desk가 선언돼야 한다(§61)`,
    );
    assert.ok(names.has(LIVE_TOOL_SEND_PREPARED_SMS), `${scenarioId}는 문자 카탈로그도 가진다`);
  }
});

// §61.6 T-2 — 난이도 절이 살아 있는지(확대가 난이도까지 열지 않았는지)의 역검증. beginner·
// intermediate에는 offer_verification_desk가 여전히 없다(카탈로그 보유 계열 B 시나리오 1종 대표).
test("[§61 T-2 역검증] tax-refund-scam(계열 B) — beginner·intermediate에는 offer_verification_desk가 없다", () => {
  for (const difficultyLevel of ["beginner", "intermediate"] as const) {
    const names = declaredNames("tax-refund-scam", difficultyLevel);
    assert.ok(
      !names.has(LIVE_TOOL_OFFER_VERIFICATION_DESK),
      `tax-refund-scam/${difficultyLevel}에 offer_verification_desk가 선언되면 안 된다(advanced 전용)`,
    );
    assert.ok(names.has(LIVE_TOOL_SEND_PREPARED_SMS), `tax-refund-scam/${difficultyLevel}는 문자 카탈로그를 가진다`);
  }
});

// §61.6 T-3/G400 — declaresOfferVerificationDesk()의 결과가 buildLiveToolDeclarations/
// buildLiveToolNames의 실제 부착 여부와 전 시나리오 × 전 난이도에서 3자 동일해야 한다(술어가 두
// 벌이 되면 여기서 빨간불).
test("[§61 T-3/G400] declaresOfferVerificationDesk가 선언·liveTools 이름 부착과 전 조합에서 3자 동일하다", () => {
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
  let checked = 0;
  for (const scenarioId of SCENARIO_IDS) {
    for (const difficultyLevel of ["beginner", "intermediate", "advanced", undefined] as const) {
      const predicate = declaresOfferVerificationDesk(scenarioId, difficultyLevel);
      const declared = declaredNames(scenarioId, difficultyLevel).has(LIVE_TOOL_OFFER_VERIFICATION_DESK);
      const names = buildLiveToolNames(scenarioId, difficultyLevel, undefined, NO_END_CALL);
      const namesAttached = names?.offerVerificationDesk !== undefined;
      assert.equal(predicate, declared, `${scenarioId}/${difficultyLevel} — 술어와 선언이 갈렸다`);
      assert.equal(predicate, namesAttached, `${scenarioId}/${difficultyLevel} — 술어와 liveTools 이름이 갈렸다`);
      checked += 1;
    }
  }
  assert.ok(checked >= 30, "전 조합을 충분히 검사해야 한다");
});

// R1 ④ — 인자 계약. ⚠️ T191(문자 도달 조건 · G538)이 **G384 "인자 없음" 단언을 의도적으로 바꿨다**:
// `send_prepared_sms`는 이제 `purpose` enum(identity|transfer|link) 1개가 필수다(모델이 무엇을 보낼지 고르고 서버가
// 재검증 — PRD AC-099 (b)). `offer_verification_desk`는 여전히 인자 없음(G384 그대로). BLOCKING 유지(G430)도 함께 본다.
test("[§59.9 R1④/G384→G538] send_prepared_sms = purpose enum 필수 · offer_verification_desk = 인자 없음 · 둘 다 BLOCKING", () => {
  const scenarioDifficultyPairs: [string, "beginner" | "intermediate" | "advanced" | undefined][] = [
    ["reputation-blackmail-scam", "advanced"],
    ["bank-security-verify-scam", "advanced"],
    ["loan-refinance-scam", "advanced"],
    ["kidnapping-threat", undefined],
  ];
  let checked = 0;
  for (const [scenarioId, difficultyLevel] of scenarioDifficultyPairs) {
    const tools = buildLiveToolDeclarations(scenarioId, difficultyLevel, undefined, NO_END_CALL);
    for (const tool of tools) {
      for (const decl of tool.functionDeclarations ?? []) {
        assert.equal(decl.parameters?.type, "OBJECT");
        assert.equal(decl.behavior, "BLOCKING", `${scenarioId}/${decl.name} — G430 BLOCKING 유지`);
        if (decl.name === LIVE_TOOL_SEND_PREPARED_SMS) {
          assert.deepEqual(Object.keys(decl.parameters?.properties ?? {}), ["purpose"], "인자는 purpose 1개");
          const purpose = decl.parameters?.properties?.purpose;
          assert.equal(purpose?.type, "STRING");
          assert.deepEqual(purpose?.enum, ["identity", "transfer", "link"]);
          assert.deepEqual(decl.parameters?.required, ["purpose"], "purpose는 필수");
        } else {
          assert.deepEqual(
            decl.parameters?.properties,
            {},
            `${scenarioId}/${decl.name}의 parameters.properties는 빈 객체여야 한다(G384)`,
          );
        }
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 4, "선언된 함수를 최소 4개 이상 실제로 검사해야 한다");
});

test("[G538 역검증] purpose를 필수에서 뺀 오염본 · enum 밖 값을 넣은 오염본은 같은 검사식에 걸린다", () => {
  const [tool] = buildLiveToolDeclarations("reputation-blackmail-scam", "advanced", undefined, NO_END_CALL);
  const decl = (tool.functionDeclarations ?? []).find((d) => d.name === LIVE_TOOL_SEND_PREPARED_SMS);
  assert.ok(decl, "send_prepared_sms 선언이 있어야 한다");
  const requiredOk = (d: typeof decl) => JSON.stringify(d?.parameters?.required) === JSON.stringify(["purpose"]);
  const enumOk = (d: typeof decl) =>
    JSON.stringify(d?.parameters?.properties?.purpose?.enum) === JSON.stringify(["identity", "transfer", "link"]);
  const noRequired = { ...decl!, parameters: { ...decl!.parameters, required: [] } };
  const extraEnum = {
    ...decl!,
    parameters: {
      ...decl!.parameters,
      properties: { purpose: { ...decl!.parameters!.properties!.purpose, enum: ["identity", "transfer", "link", "any"] } },
    },
  };
  assert.equal(requiredOk(decl), true, "정상 선언은 통과");
  assert.equal(enumOk(decl), true, "정상 선언은 통과");
  assert.equal(requiredOk(noRequired), false, "필수에서 뺀 오염본은 실패");
  assert.equal(enumOk(extraEnum), false, "enum을 넓힌 오염본은 실패");
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
      // T192 C3 — 음성 범위(`end_call` 참)도 함께 훑는다.
      for (const scope of [NO_END_CALL, VOICE]) {
        for (const name of declaredNames(scenarioId, difficultyLevel, scope)) {
          assert.ok(ALLOWED_NAMES.has(name), `${scenarioId}/${difficultyLevel}에서 허용목록 밖 이름: ${name}`);
        }
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
      const names = buildLiveToolNames(scenarioId, difficultyLevel, undefined, NO_END_CALL);
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

// §59.6 갱신 2(G394) — verifyAlreadyAnnouncedInstruction의 부착 조건은 offerVerificationDesk와
// 정확히 1:1이어야 한다(별도 if 신설 금지 — 술어가 두 벌이 되면 부착 조건 패리티가 깨진다).
test("[§59.6 갱신 2/G394] verifyAlreadyAnnouncedInstruction — offerVerificationDesk와 정확히 같은 조건에서만 존재하고 값이 VERIFY_DECLINE_ALREADY와 동일하다", () => {
  const SCENARIO_IDS = [
    "loan-refinance-scam",
    "institutional-impersonation",
    "reputation-blackmail-scam",
    "bank-security-verify-scam",
    "kidnapping-threat",
  ];
  let checkedWithOffer = 0;
  for (const scenarioId of SCENARIO_IDS) {
    for (const difficultyLevel of ["beginner", "intermediate", "advanced", undefined] as const) {
      const names = buildLiveToolNames(scenarioId, difficultyLevel, undefined, NO_END_CALL);
      const hasOffer = names?.offerVerificationDesk !== undefined;
      const hasAlready = names?.verifyAlreadyAnnouncedInstruction !== undefined;
      assert.equal(
        hasAlready,
        hasOffer,
        `${scenarioId}/${difficultyLevel} — verifyAlreadyAnnouncedInstruction 부착 조건은 offerVerificationDesk와 1:1이어야 한다`,
      );
      if (hasOffer) {
        assert.equal(
          names!.verifyAlreadyAnnouncedInstruction,
          VERIFY_DECLINE_ALREADY,
          `${scenarioId}/${difficultyLevel} — 값은 VERIFY_DECLINE_ALREADY와 문자열 동등이어야 한다(리터럴 복사 드리프트 금지)`,
        );
        checkedWithOffer += 1;
      }
    }
  }
  assert.ok(
    checkedWithOffer >= 1,
    "offerVerificationDesk가 존재하는 조합을 최소 1개 이상 실제로 검사해야 한다(bank-security-verify-scam advanced)",
  );
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

// ⭐ §71 D2(G430) — 3.8은 behavior를 생략하면 NON_BLOCKING이라 도구 호출과 함께 턴을 끝낸다(2026-10-17 프로브).
// 전 시나리오 × 전 난이도에서 선언된 모든 함수가 BLOCKING을 명시하는지 고정한다.
test("[§71 G430] 선언된 모든 함수는 behavior: BLOCKING을 명시한다", () => {
  let checked = 0;
  for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
    for (const difficultyLevel of [undefined, "beginner", "intermediate", "advanced"] as const) {
      // T192 C3(G503) — 음성 범위의 `end_call`도 이 전수 단언에 들어온다.
      for (const scope of [NO_END_CALL, VOICE]) {
        for (const tool of buildLiveToolDeclarations(scenarioId, difficultyLevel, undefined, scope)) {
          for (const decl of tool.functionDeclarations ?? []) {
            assert.equal(decl.behavior, Behavior.BLOCKING, `${scenarioId}/${difficultyLevel}/${decl.name}`);
            checked += 1;
          }
        }
      }
    }
  }
  assert.ok(checked > 0, "검사한 선언이 0개다 — 시나리오 목록이 비었다");
});

// ── T192 C3 — G556 · G527 · G502 · G503: `end_call` 선언(Architecture.md §79.3 · §79.19 (5) 1~6 · §79.19 (8)) ──────────

/** 릴레이 범위 표 — 오늘(S7 전) 실제 값은 항상 `undefined`지만 선언 술어는 값 자체로 판정한다(G527). */
const END_CALL_SCOPES: ReadonlyArray<readonly [string, EndCallScope, boolean]> = [
  ["음성 · 릴레이 없음", VOICE, true],
  ["음성 명시", { channel: "voice", relay: undefined, liveAvailable: true }, true],
  ["메신저", NO_END_CALL, false],
  ["중간 leg 0/2", { channel: undefined, relay: { legIndex: 0, legCount: 2 }, liveAvailable: true }, false],
  ["가운데 leg 1/3", { channel: "voice", relay: { legIndex: 1, legCount: 3 }, liveAvailable: true }, false],
  ["마지막 leg 1/2", { channel: undefined, relay: { legIndex: 1, legCount: 2 }, liveAvailable: true }, true],
  ["단일 leg 0/1", { channel: undefined, relay: { legIndex: 0, legCount: 1 }, liveAvailable: true }, true],
  ["메신저 + 마지막 leg", { channel: "messenger", relay: { legIndex: 1, legCount: 2 }, liveAvailable: true }, false],
  // M1 — 스위치가 꺼지면 다른 입력과 무관하게 거짓(운영값).
  ["음성 · 스위치 끔", { channel: undefined, relay: undefined, liveAvailable: false }, false],
  ["마지막 leg · 스위치 끔", { channel: "voice", relay: { legIndex: 1, legCount: 2 }, liveAvailable: false }, false],
];

test("[T192/C3 G527] declaresEndCall — 메신저 · 중간 leg = false · 음성 · 마지막 leg · 릴레이 없음 = true", () => {
  for (const [label, scope, expected] of END_CALL_SCOPES) {
    assert.equal(declaresEndCall("kidnapping-threat", scope.channel, scope.relay, scope.liveAvailable), expected, label);
  }
});

/** 같은 시나리오 · 난이도 · 변형 조합 전수(변형 부재 포함). */
function* allToolInputs(): Generator<readonly [string, "beginner" | "intermediate" | "advanced" | undefined, string | undefined]> {
  for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
    for (const difficultyLevel of [undefined, "beginner", "intermediate", "advanced"] as const) {
      yield [scenarioId, difficultyLevel, undefined];
    }
  }
  for (const v of FLOW_VARIANTS) yield [v.scenarioId, v.level, v.variantId];
}

test("[T192/C3 G556] end_call 거짓이면 선언 · 이름 출력이 메신저와 바이트 동일 · 참이면 기존 선언 **뒤에** end_call 1개 + 이름 쌍", () => {
  let checked = 0;
  for (const [scenarioId, difficultyLevel, flowVariantId] of allToolInputs()) {
    const base = buildLiveToolDeclarations(scenarioId, difficultyLevel, flowVariantId, NO_END_CALL);
    const baseNames = buildLiveToolNames(scenarioId, difficultyLevel, flowVariantId, NO_END_CALL);
    for (const [label, scope, expected] of END_CALL_SCOPES) {
      const tag = `${scenarioId}/${difficultyLevel}/${flowVariantId ?? "-"}/${label}`;
      const decls = buildLiveToolDeclarations(scenarioId, difficultyLevel, flowVariantId, scope);
      const names = buildLiveToolNames(scenarioId, difficultyLevel, flowVariantId, scope);
      if (!expected) {
        assert.equal(JSON.stringify(decls), JSON.stringify(base), `${tag}: 선언이 S5b 판정과 다르다`);
        assert.equal(JSON.stringify(names), JSON.stringify(baseNames), `${tag}: 이름이 S5b 판정과 다르다`);
        continue;
      }
      const flat = decls.flatMap((t) => t.functionDeclarations ?? []);
      const baseFlat = base.flatMap((t) => t.functionDeclarations ?? []);
      assert.equal(decls.length, 1, `${tag}: Tool 묶음은 1개`);
      assert.equal(JSON.stringify(flat.slice(0, -1)), JSON.stringify(baseFlat), `${tag}: 기존 선언이 앞에 그대로 있어야 한다`);
      assert.equal(flat[flat.length - 1]?.name, LIVE_TOOL_END_CALL, `${tag}: end_call은 맨 뒤 1개`);
      assert.equal(flat.filter((d) => d.name === LIVE_TOOL_END_CALL).length, 1, `${tag}: end_call 중복`);
      assert.ok(names, `${tag}: liveTools가 있어야 한다`);
      assert.deepEqual(
        { ...names },
        {
          ...(baseNames ?? { failureInstruction: names!.failureInstruction }),
          endCall: LIVE_TOOL_END_CALL,
          endCallFailureInstruction: SCAMMER_HANGUP_FAILURE_INSTRUCTION,
        },
        `${tag}: 이름은 기존 값 + endCall 쌍뿐`,
      );
      checked += 1;
    }
  }
  assert.ok(checked > 0, "end_call 참 조합을 하나도 검사하지 않았다");
});

test("[T192/C3 G556 · G503] end_call 선언 — reason enum(goal · give_up) 필수 · BLOCKING · 설명에 숫자 0", () => {
  const decl = buildLiveToolDeclarations("kidnapping-threat", "advanced", undefined, VOICE)
    .flatMap((t) => t.functionDeclarations ?? [])
    .find((d) => d.name === LIVE_TOOL_END_CALL);
  assert.ok(decl, "end_call 선언이 있어야 한다");
  assert.equal(decl!.behavior, Behavior.BLOCKING);
  assert.equal(decl!.parameters?.type, "OBJECT");
  assert.deepEqual(Object.keys(decl!.parameters?.properties ?? {}), ["reason"]);
  assert.equal(decl!.parameters?.properties?.reason?.type, "STRING");
  assert.deepEqual(decl!.parameters?.properties?.reason?.enum, ["goal", "give_up"]);
  assert.deepEqual(decl!.parameters?.required, ["reason"]);
  assert.equal(/[0-9０-９]/.test(decl!.description ?? ""), false, "설명 문면에 숫자(G130)");
  assert.equal(
    decl!.description,
    "네 쪽에서 통화를 먼저 끝내기로 했을 때, 작별 인사를 하기 전에 먼저 부른다. reason은 goal(원하던 것을 얻었다) 또는 give_up(상대가 거절이나 의심을 되풀이해 더 진행할 수 없다) 중 하나다. 결과가 허락하지 않으면 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어간다.",
    "§79.19 (5) 5 정본 문면",
  );
});

test("[T192/C3 G556 역검증] end_call을 맨 앞에 넣은 사본 · 메신저에서도 선언한 사본은 같은 판정식에 걸린다", () => {
  const voice = buildLiveToolDeclarations("loan-refinance-scam", "advanced", undefined, VOICE);
  const base = buildLiveToolDeclarations("loan-refinance-scam", "advanced", undefined, NO_END_CALL);
  const flat = voice.flatMap((t) => t.functionDeclarations ?? []);
  const baseFlat = base.flatMap((t) => t.functionDeclarations ?? []);
  const prefixOk = (list: typeof flat) => JSON.stringify(list.slice(0, -1)) === JSON.stringify(baseFlat);
  assert.equal(prefixOk(flat), true, "정본은 통과");
  assert.equal(prefixOk([flat[flat.length - 1]!, ...flat.slice(0, -1)]), false, "end_call을 앞에 둔 사본은 실패");
  const leaked = [{ functionDeclarations: [...baseFlat, flat[flat.length - 1]!] }];
  assert.notEqual(JSON.stringify(leaked), JSON.stringify(base), "메신저 선언에 end_call이 샌 사본은 실패");
});

test("[T192/C3 G502 배선] 선언 · 이름 · 프롬프트 세 자리가 declaresEndCall 하나를 부른다 · 릴레이 인자는 resolveHangupRelay에서만", () => {
  const liveSrc = readFileSync(path.resolve(__dirname, "../../../src/realtime/liveTools.ts"), "utf8");
  const provSrc = readFileSync(path.resolve(__dirname, "../../../src/realtime/geminiProvider.ts"), "utf8");
  const indexSrc = readFileSync(path.resolve(__dirname, "../../../src/realtime/index.ts"), "utf8");
  const declBody = liveSrc.slice(liveSrc.indexOf("export function buildLiveToolDeclarations("), liveSrc.indexOf("export const LIVE_TOOL_FAILURE_INSTRUCTION"));
  const namesBody = liveSrc.slice(liveSrc.indexOf("export function buildLiveToolNames("));
  // M1 — 세 자리가 같은 범위(스위치 포함)로 같은 술어를 부른다. 줄바꿈은 공백 클래스로 잇는다(CRLF 안전).
  const CALL = /declaresEndCall\(\s*scenarioId,\s*endCallScope\.channel,\s*endCallScope\.relay,\s*endCallScope\.liveAvailable,?\s*\)/;
  assert.match(declBody, CALL, "선언 빌더");
  assert.match(namesBody, CALL, "이름 빌더");
  assert.match(
    provSrc,
    /hangupMode: declaresEndCall\(input\.scenarioId, endCallScope\.channel, endCallScope\.relay, endCallScope\.liveAvailable\)\s*\?\s*"tool"\s*:\s*"none"/,
    "프롬프트 TOOL 변형이 같은 술어 · 같은 범위를 부르지 않는다",
  );
  assert.match(provSrc, /liveAvailable: this\.endCallLiveAvailable,/, "프로바이더 범위가 생성자 스위치를 쓰지 않는다");
  assert.match(
    provSrc,
    /private readonly endCallLiveAvailable: boolean = END_CALL_LIVE_AVAILABLE,/,
    "프로바이더 스위치 기본값이 운영 상수가 아니다",
  );
  const providerFactory = readFileSync(path.resolve(__dirname, "../../../src/realtime/provider.ts"), "utf8");
  assert.match(providerFactory, /new GeminiRealtimeProvider\(geminiKey\)/, "운영 생성자가 스위치를 직접 넘긴다(켬 우회)");
  assert.ok(indexSrc.includes("hangupRelay: resolveHangupRelay(session)"), "발급 입력의 릴레이가 resolveHangupRelay에서 오지 않는다");
  assert.equal(provSrc.includes("resolveHangupRelay("), false, "프로바이더 안에서 릴레이를 다시 해석한다(G527)");
});

// ── T192 PR A 리뷰 M1 — 운영값(끔): C5 전에는 실시간 setup · 이름 · 프롬프트에 end_call이 0 ─────────────────────────
test("[M1 운영값] END_CALL_LIVE_AVAILABLE === false — ⚠️ C5(PR B)가 켤 때 이 테스트와 아래 운영값 단언을 함께 바꾼다", () => {
  assert.equal(END_CALL_LIVE_AVAILABLE, false, "클라 end_call 라우팅(C5) 전에 실시간 end_call이 켜졌다");
});

test("[M1 운영값 · G556] 끔이면 음성 범위의 선언 · 이름이 전 조합에서 end_call 거짓 입력(S5b 판정)과 바이트 동일", () => {
  let checked = 0;
  for (const [scenarioId, difficultyLevel, flowVariantId] of allToolInputs()) {
    const tag = `${scenarioId}/${difficultyLevel}/${flowVariantId ?? "-"}`;
    assert.equal(
      JSON.stringify(buildLiveToolDeclarations(scenarioId, difficultyLevel, flowVariantId, VOICE_OPERATIONAL)),
      JSON.stringify(buildLiveToolDeclarations(scenarioId, difficultyLevel, flowVariantId, NO_END_CALL)),
      `${tag}: 운영값 선언에 end_call이 샜다`,
    );
    assert.equal(
      JSON.stringify(buildLiveToolNames(scenarioId, difficultyLevel, flowVariantId, VOICE_OPERATIONAL)),
      JSON.stringify(buildLiveToolNames(scenarioId, difficultyLevel, flowVariantId, NO_END_CALL)),
      `${tag}: 운영값 liveTools에 endCall이 샜다`,
    );
    checked += 1;
  }
  assert.ok(checked > 0);
  // 대조군 — 같은 입력을 켬으로 돌리면 갈린다(위 단언이 공허하지 않다).
  assert.notEqual(
    JSON.stringify(buildLiveToolDeclarations("kidnapping-threat", "advanced", undefined, VOICE)),
    JSON.stringify(buildLiveToolDeclarations("kidnapping-threat", "advanced", undefined, VOICE_OPERATIONAL)),
  );
});
