// PR-A2(2026-10-20 · audit-A 공회전) — 실시간 `end_call`이 꺼진 상태(`END_CALL_LIVE_AVAILABLE=false` — main #326 운영값)에서도
// 공회전을 푸는 서버 쪽 재료가 모두 살아 있는가. 클라 쪽(넛지 · 결과 주입 · 호 전환 재시도)은 루트
// `src/lib/realtime/stallRecovery.test.ts`가 같은 조건으로 고정한다.
//
// ⛔ 이 파일은 상수의 **값을 단언하지 않는다**(운영값은 liveTools.ts 소유 · 바뀔 수 있다). 끔(`false`)을 생성자 인자로 주입하고,
// 모듈 운영값으로도 같은 판정을 돌려 두 경우가 같은 재료를 갖는지 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GeminiRealtimeProvider } from "../geminiProvider";
import { END_CALL_LIVE_AVAILABLE } from "../liveTools";
import { HANGUP_RULE_NONE, NO_STALL_RULE } from "../../roleplay/promptAssembly";
import { FLOW_VARIANTS } from "../../scenarios/flowVariants";
import { buildConfirmResultField } from "../../inCallSms/buildDoc";
import { buildLiveConfirmResultInstruction } from "../../inCallSms/confirmResult";
import { resolveDeclaredSms } from "../../inCallSms/smsGate";

const VOICE_SCOPE = { channel: undefined, hangupRelay: undefined } as const;
const LOAN = "loan-refinance-scam";

function captureTokenRequest(): { restore: () => void; bodies: () => unknown[] } {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    if (init?.body) bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ name: "auth_tokens/test-token" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return { restore: () => (globalThis.fetch = originalFetch), bodies: () => bodies };
}
function sentSystemPrompt(body: unknown): string {
  const setup = (body as { bidiGenerateContentSetup?: { systemInstruction?: { parts?: { text?: string }[] } } })
    .bidiGenerateContentSetup;
  return setup?.systemInstruction?.parts?.[0]?.text ?? "";
}
function sentToolNames(body: unknown): (string | undefined)[] {
  const setup = (body as { bidiGenerateContentSetup?: { tools?: { functionDeclarations?: { name?: string }[] }[] } })
    .bidiGenerateContentSetup;
  return (setup?.tools ?? []).flatMap((t) => t.functionDeclarations ?? []).map((d) => d.name);
}

const LEVELS = ["beginner", "intermediate", "advanced"] as const;

test("[PR-A2 · end_call 끔] loan 3난이도 Live — end_call 0 · NONE 문면 · 확인 결과 규칙(NO_STALL_RULE) · 문자 도구는 그대로 · 결과 신호가 가리키는 [진행 강제] 끊기 항목이 NONE으로 해석된다", async () => {
  const capture = captureTokenRequest();
  try {
    for (const level of LEVELS) {
      const variant = FLOW_VARIANTS.find((v) => v.scenarioId === LOAN && v.level === level);
      assert.ok(variant, `loan ${level} 변형이 없다`);
      const creds = await new GeminiRealtimeProvider("test-key", false).createCallCredentials({
        ...VOICE_SCOPE,
        sessionId: "sess",
        scenarioId: LOAN,
        voiceId: "",
        difficultyLevel: level,
        flowVariantId: variant.variantId,
      });
      const body = capture.bodies()[capture.bodies().length - 1];
      const prompt = sentSystemPrompt(body);
      // 끔 = 끊기 도구 · 이름 · TOOL 문면 0(넛지 · 결과 주입이 이것에 기대면 공회전이 안 풀린다).
      assert.equal(sentToolNames(body).includes("end_call"), false, `${level}: end_call 선언`);
      assert.equal(creds.liveTools?.endCall, undefined, `${level}: liveTools.endCall`);
      assert.ok(prompt.includes(HANGUP_RULE_NONE), `${level}: NONE 문면이 아니다`);
      // 공회전을 푸는 재료 — 결과를 내놓으라는 규칙과, 결과 신호를 실어 올 문자 도구.
      assert.ok(prompt.includes(NO_STALL_RULE), `${level}: NO_STALL_RULE이 없다`);
      assert.ok(NO_STALL_RULE.includes("아니면 비밀 유지 당부처럼 상황에 맞는 말로 대화를 이어 둔다"), "끊을 수 없을 때의 갈래가 문면에 없다");
      assert.equal(sentToolNames(body).includes("send_prepared_sms"), true, `${level}: 문자 도구가 없다`);
      // 결과 신호 문면은 "[진행 강제]의 통화 끝내기 항목"을 가리킨다 — 끔이면 그 항목은 NONE이고 [진행 강제] 블록 안에 있다.
      const head = prompt.indexOf("[진행 강제");
      const none = prompt.indexOf(HANGUP_RULE_NONE);
      const stall = prompt.indexOf(NO_STALL_RULE);
      assert.ok(head >= 0 && head < none && none < stall, `${level}: [진행 강제] → 끊기 항목(NONE) → NO_STALL 순서가 아니다`);
    }
  } finally {
    capture.restore();
  }
});

test("[PR-A2 · end_call 끔 · 리뷰 Minor 3] 끔(주입) · 모듈 운영값 각각으로 세션을 만들어도 결과 신호가 지나갈 문자 도구가 선언되고, 결과 신호 필드는 스위치와 무관하게 같은 1줄이다", async () => {
  // 결과 신호 필드 조립 함수는 스위치를 입력으로 받지 않는다(인자 2개 — 전환 여부 · 선언 항목).
  assert.equal(buildConfirmResultField.length, 2);
  const capture = captureTokenRequest();
  try {
    const seen = new Map<boolean, string[]>();
    for (const liveAvailable of [false, END_CALL_LIVE_AVAILABLE]) {
      const fields: string[] = [];
      for (const level of LEVELS) {
        const variant = FLOW_VARIANTS.find((v) => v.scenarioId === LOAN && v.level === level);
        assert.ok(variant);
        const creds = await new GeminiRealtimeProvider("test-key", liveAvailable).createCallCredentials({
          ...VOICE_SCOPE,
          sessionId: "sess",
          scenarioId: LOAN,
          voiceId: "",
          difficultyLevel: level,
          flowVariantId: variant.variantId,
        });
        const tag = `liveAvailable=${liveAvailable} ${level}`;
        // 스위치가 실제로 반영됐다(값을 쓴다는 증거) — 끊기 도구 유무가 값을 따른다.
        assert.equal(creds.liveTools?.endCall !== undefined, liveAvailable, `${tag}: end_call 유무가 스위치를 따르지 않는다`);
        // 결과 신호가 실려 오는 경로(send_prepared_sms → deliverInCallSms 응답)는 스위치와 무관하게 있다.
        assert.equal(creds.liveTools?.sendPreparedSms, "send_prepared_sms", `${tag}: 문자 도구가 없다`);
        const required = resolveDeclaredSms(LOAN, variant.variantId).declared.filter(
          (d) => d.required && (d.purpose === "transfer" || d.purpose === "link"),
        );
        assert.ok(required.length > 0, `${tag}: 필수 계좌 · 링크 문자 선언이 없다(표본 전제)`);
        for (const item of required) {
          const field = buildConfirmResultField({ placed: false }, item);
          assert.equal(field.confirmResultInstruction, buildLiveConfirmResultInstruction(item.purpose as "transfer" | "link"), `${tag}/${item.smsId}`);
          fields.push(`${level}/${item.smsId}:${field.confirmResultInstruction}`);
        }
      }
      seen.set(liveAvailable, fields);
    }
    assert.deepEqual(seen.get(false), seen.get(END_CALL_LIVE_AVAILABLE), "끔과 운영값에서 결과 신호가 다르다");
  } finally {
    capture.restore();
  }
});
