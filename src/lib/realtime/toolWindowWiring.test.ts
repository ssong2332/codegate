// §59.10 커밋 D — 배선 회귀(소스 스캔). `GeminiVoiceSession.tsx`·`session/play/page.tsx`는 마이크·
// AudioContext·WebSocket에 강결합돼 있어 이 저장소의 node:test 러너로 직접 실행·관측할 수 없다
// (`feedback_unobservable_behavior_gates` — `fallbackCredentials.test.ts`·
// `deliverInCallSmsGateOrdering.test.ts`와 같은 관례). 이 파일은 두 파일을 텍스트로 읽어 배선이
// **실제로 존재하는지**만 고정한다 — 런타임 동작 자체는 이 테스트의 검증 범위 밖이다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE_PATH = "src/app/session/play/page.tsx";
const SESSION_PATH = "src/lib/realtime/GeminiVoiceSession.tsx";

const page = readFileSync(PAGE_PATH, "utf8");
const session = readFileSync(SESSION_PATH, "utf8");

function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

const pageCode = codeOnly(page);
const sessionCode = codeOnly(session);

test("[§59.10 D → T191] play/page.tsx가 toolWindow의 shouldFireBackstop(오퍼) · shouldRequestSmsBackstop(문자)을 import한다", () => {
  assert.match(page, /import \{ shouldFireBackstop, shouldRequestSmsBackstop \} from "@\/lib\/realtime\/toolWindow";/);
});

// ⚠️ T191(문자 도달 조건) — 문자 효과는 고정 턴 지연 발동(`shouldFireBackstop`)을 더 이상 쓰지 않는다(사용자 발화 기준 ·
// 서버 판정으로 교체). 그래서 이 검사의 기대값을 2 → 1(오퍼 효과만)로 **의도적으로** 바꿨다.
test("[§59.10 D → T191] shouldFireBackstop은 오퍼(announce) 효과 1곳에서만 쓰이고, 문자 효과는 shouldRequestSmsBackstop을 쓴다", () => {
  const occurrences = pageCode.split("shouldFireBackstop({").length - 1;
  assert.equal(occurrences, 1, `오퍼 효과 1회여야 한다(실측: ${occurrences})`);
  assert.equal(pageCode.split("shouldRequestSmsBackstop({").length - 1, 1, "문자 효과 1회");
});

test("[T191] 문자 효과는 credentials.inCallSmsBackstop(서버가 변형 선언으로 붙인 표시)일 때만 서버에 묻는다", () => {
  assert.ok(
    pageCode.includes("enabled: realtime.credentials?.inCallSmsBackstop === true,"),
    "문자 백스톱 질의가 서버 표시를 읽지 않는다",
  );
});

test("[G388] 오퍼 효과의 toolAvailable은 credentials.liveTools?.offerVerificationDesk에서 온다", () => {
  assert.ok(
    pageCode.includes("Boolean(realtime.credentials?.liveTools?.offerVerificationDesk)"),
    "toolAvailable 판정이 liveTools.offerVerificationDesk를 읽지 않는다",
  );
});

test("[중복 발동 방지] SMS 효과는 result.status === \"delivered\"일 때만 announceInstruction을 큐에 넣는다", () => {
  assert.ok(
    pageCode.includes('if (result.status === "delivered" && result.announceInstruction) {'),
    "status 게이트 없이 announceInstruction만 보면 모델이 이미 전달한 문자를 앱이 다시 말하게 할 수 있다",
  );
});

test("[중복 발동 방지 역검증] status 게이트를 지운 오염본은 옛 형태(announceInstruction만 검사)로 되돌아간다", () => {
  const poisoned = pageCode.replace(
    'if (result.status === "delivered" && result.announceInstruction) {',
    "if (result.announceInstruction) {",
  );
  assert.ok(!poisoned.includes('if (result.status === "delivered" && result.announceInstruction) {'));
  assert.ok(pageCode.includes('if (result.status === "delivered" && result.announceInstruction) {'));
});

test("[백스톱 발동 · T191] 문자 백스톱 호출은 trigger:\"backstop\" · 사용자 발화 수 · 사기범 전사 수를 싣고 smsId·목적은 싣지 않는다", () => {
  const start = pageCode.indexOf("const result = await deliverInCallSms({");
  assert.ok(start > -1, "문자 백스톱 호출을 찾지 못했다");
  const call = pageCode.slice(start, pageCode.indexOf("});", start));
  assert.match(call, /trigger: "backstop",/);
  assert.match(call, /userTurns: counters\.userTurns,/);
  assert.match(call, /scammerTranscriptTurns: counters\.scammerTranscriptTurns,/);
  assert.equal(/smsId|purpose/.test(call), false, "화면이 문자 id · 목적을 고르면 안 된다(설계 금지 X1 · X4)");
});

// §61.7/G402 — verify-offer 백스톱 호출부도 SMS와 같은 방식으로 `trigger`를 명시해야 한다.
// 이전에는 이 필드 자체가 빠져 있어(§59.11 P-E 관측이 verify-offer에 대해 산출 불가였다), 서버
// 로그에서 `model_tool` 아니면 `null` 두 값만 나왔다(백스톱과 폴백/옛 번들을 구분할 수 없었다).
test("[G402] verify-offer 백스톱 호출부도 realtime 경로에서 trigger:\"backstop\"을 명시한다", () => {
  assert.ok(
    pageCode.includes('...(requestCallMode === "realtime" ? { trigger: "backstop" as const } : {}),'),
    "verify-offer 백스톱 호출부가 trigger를 보내지 않으면 §59.11 로그가 model_tool과 이 경로를 구분하지 못한다",
  );
});

test("[R8] 백스톱 게이트는 announce 단계 · realtime 경로에만 걸린다(commit·폴백은 무변경)", () => {
  const gateAt = pageCode.indexOf('if (stage === "announce" && callMode === "realtime") {');
  assert.ok(gateAt >= 0, "오퍼 백스톱 게이트 조건문을 찾지 못했다");
  const phaseAssignAt = pageCode.indexOf(
    'verifyOfferPhaseRef.current = stage === "announce" ? "announced" : "committed";',
  );
  assert.ok(phaseAssignAt >= 0, "단계 전이 대입을 찾지 못했다");
  assert.ok(
    gateAt < phaseAssignAt,
    "백스톱 게이트는 단계를 announced/committed로 굳히기 **전에** 평가돼야 한다(먼저 return할 수 있어야 한다)",
  );
});

test("[G489 · T191] 화면에 고정 턴 문자 선택이 남아 있지 않다(pickDueInCallSms · requestedSmsRef · smsToolCallFailedIdRef · inCallSmsTriggers 0)", () => {
  for (const name of ["pickDueInCallSms", "requestedSmsRef", "smsToolCallFailedIdRef", "inCallSmsTriggers"]) {
    assert.equal(pageCode.includes(name), false, `page.tsx에 ${name}이 남아 있다`);
  }
  for (const name of ["pickModelToolSmsId", "inCallSmsTriggers", "deliveredSmsIds"]) {
    assert.equal(sessionCode.includes(name), false, `GeminiVoiceSession.tsx에 ${name}이 남아 있다`);
  }
});

test("[T191 넛지] 서버 넛지는 smsNudge 표시로 큐에 들어간다(맥락 주입 · 침묵 넛지 대상 아님)", () => {
  assert.ok(
    pageCode.includes('enqueueTurnInstruction(result.nudgeInstruction, "sms", { smsNudge: true });'),
    "넛지가 문자 도착 안내와 구분되지 않으면 '방금 보낸 문자' 침묵 넛지가 거짓으로 나간다",
  );
});

test("[toolCallFailed 배선] 오퍼 효과는 실패 신호(verifyToolCallFailedRef)를 shouldFireBackstop에 넘긴다", () => {
  assert.ok(
    pageCode.includes("toolCallFailed: verifyToolCallFailedRef.current,"),
    "오퍼 효과가 모델 도구 실패 신호를 백스톱 판정에 반영하지 않는다(G390)",
  );
});

test("[새 타이머 금지] play/page.tsx의 setInterval 개수는 여전히 1개(기존 통화 경과 타이머)뿐이다", () => {
  const count = (page.match(/setInterval\(/g) ?? []).length;
  assert.equal(count, 1, "§59.10 커밋 D가 새 setInterval을 만들면 안 된다(기존 elapsedSec 타이머에 올라탄다)");
});

// ── GeminiVoiceSession.tsx — dispatchToolCall이 부모 콜백 4종을 실제로 호출하는가 ────────────

test("[배선 · T191 G487] dispatchToolCall의 send_prepared_sms는 모델 purpose · 사용자 발화 수를 넘기고 smsId를 고르지 않는다", () => {
  const start = sessionCode.indexOf('if (kind === "send_prepared_sms") {');
  assert.ok(start > -1);
  const branch = sessionCode.slice(start, sessionCode.indexOf("return failureResponse();", start));
  assert.match(branch, /purpose: readSmsPurposeArg\(call\.args\),/);
  assert.match(branch, /userTurns: modelToolUserTurns,/);
  assert.match(branch, /scammerTranscriptTurns: modelToolScammerTurns,/);
  assert.match(branch, /trigger: "model_tool",/);
  assert.equal(branch.includes("smsId"), false);
});

test("[배선] dispatchToolCall이 오퍼 announce 성공/실패 콜백을 각각 부른다", () => {
  assert.ok(sessionCode.includes("handlersRef.current.onModelToolVerifyAnnounced?.();"));
  assert.ok(sessionCode.includes("handlersRef.current.onModelToolVerifyFailed?.();"));
});

test("[배선 역검증] 오퍼 성공 콜백 호출을 지운 오염본은 같은 검사식이 잡아낸다", () => {
  const poisoned = sessionCode.replace(
    "handlersRef.current.onModelToolVerifyAnnounced?.();",
    "",
  );
  assert.ok(!poisoned.includes("handlersRef.current.onModelToolVerifyAnnounced?.();"));
  assert.ok(sessionCode.includes("handlersRef.current.onModelToolVerifyAnnounced?.();"));
});

test("[props 타입 · T191] 오퍼 콜백 2개는 옵셔널로 남고, 문자 콜백 2개(onModelToolSms*)는 폐기됐다", () => {
  assert.match(sessionCode, /onModelToolVerifyAnnounced\?: \(\) => void;/);
  assert.match(sessionCode, /onModelToolVerifyFailed\?: \(\) => void;/);
  assert.equal(/onModelToolSms(Delivered|Failed)/.test(sessionCode), false);
});

test("[배선 · T191] play/page.tsx가 GeminiVoiceSession에 오퍼 콜백 2개를 넘기고 문자 콜백은 넘기지 않는다", () => {
  assert.ok(pageCode.includes("onModelToolVerifyAnnounced={handleModelToolVerifyAnnounced}"));
  assert.ok(pageCode.includes("onModelToolVerifyFailed={handleModelToolVerifyFailed}"));
  assert.equal(/onModelToolSms(Delivered|Failed)|handleModelToolSms/.test(pageCode), false);
});

// T191 — 예전 "[중복 발동 방지] handleModelToolSmsDelivered는 requestedSmsRef에 더한다"는 대상(화면의 smsId 선택)이
// 폐기돼 지웠다. 중복 방지는 이제 서버 단일 통로의 `already_delivered`(같은 트랜잭션 안 판정)가 진다.

test("[중복 발동 방지] handleModelToolVerifyAnnounced는 idle일 때만 verifyOfferPhaseRef를 announced로 전진시킨다", () => {
  assert.match(
    pageCode,
    /if \(verifyOfferPhaseRef\.current === "idle"\) \{\s*verifyOfferPhaseRef\.current = "announced";\s*verifyAnnounceTurnsRef\.current = scammerTurnsRef\.current;\s*\}/,
  );
});

// ── §59 Critical 수정(reviewer REJECTED) — announce 요청 상호배제 슬롯 배선 ──────────────

test("[Critical 수정] play/page.tsx가 verifyAnnounceGuard의 claim/release를 import한다", () => {
  assert.match(
    page,
    /import \{\s*claimAnnounceSlot,\s*releaseAnnounceSlot,\s*type AnnounceSlotState,\s*\} from "@\/lib\/realtime\/verifyAnnounceGuard";/,
  );
});

test("[Critical 수정] 백스톱 이펙트가 shouldFireBackstop 통과 직후 claimVerifyAnnounceSlot()을 체크한다(서버 호출 전 동기 클레임)", () => {
  const fireAt = pageCode.indexOf("if (!fire) return;");
  const claimAt = pageCode.indexOf("if (!claimVerifyAnnounceSlot()) return;");
  const phaseAssignAt = pageCode.indexOf(
    'verifyOfferPhaseRef.current = stage === "announce" ? "announced" : "committed";',
  );
  assert.ok(fireAt >= 0 && claimAt >= 0 && phaseAssignAt >= 0, "세 지점을 모두 찾지 못했다");
  assert.ok(
    fireAt < claimAt && claimAt < phaseAssignAt,
    "클레임은 백스톱 발동 판정 다음, 단계를 굳히기 전에 있어야 한다(그래야 클레임 실패 시 그대로 return할 수 있다)",
  );
});

test("[Critical 수정] 오퍼 요청 완료(성공/실패 무관) 후 releaseVerifyAnnounceSlot()을 finally에서 부른다", () => {
  assert.ok(
    pageCode.includes(
      "} finally {\nif (stage === \"announce\" && requestCallMode === \"realtime\") {\nreleaseVerifyAnnounceSlot();\n}\n}",
    ) ||
      /\}\s*finally\s*\{\s*if \(stage === "announce" && requestCallMode === "realtime"\) \{\s*releaseVerifyAnnounceSlot\(\);\s*\}\s*\}/.test(
        pageCode,
      ),
    "release가 finally에 없으면 요청 실패 시 슬롯이 영원히 잠긴 채 남아 재시도가 막힌다",
  );
});

test("[Critical 수정 역검증] finally를 지운 오염본은 이 검사식이 잡아낸다", () => {
  const poisoned = pageCode.replace(
    /\}\s*finally\s*\{\s*if \(stage === "announce" && requestCallMode === "realtime"\) \{\s*releaseVerifyAnnounceSlot\(\);\s*\}\s*\}/,
    "}",
  );
  assert.ok(!/\}\s*finally\s*\{\s*if \(stage === "announce"/.test(poisoned));
  assert.ok(/\}\s*finally\s*\{\s*if \(stage === "announce"/.test(pageCode));
});

test("[Critical 수정] play/page.tsx가 GeminiVoiceSession에 claim/release 콜백을 넘긴다", () => {
  assert.ok(pageCode.includes("claimVerifyAnnounceSlot={claimVerifyAnnounceSlot}"));
  assert.ok(pageCode.includes("releaseVerifyAnnounceSlot={releaseVerifyAnnounceSlot}"));
});

test("[Critical 수정] GeminiVoiceSessionProps의 claim/release는 옵셔널이 아니다(가드 누락 마운트 방지)", () => {
  assert.match(sessionCode, /claimVerifyAnnounceSlot: \(\) => boolean;/);
  assert.match(sessionCode, /releaseVerifyAnnounceSlot: \(\) => void;/);
  assert.ok(
    !/claimVerifyAnnounceSlot\?: \(\) => boolean;/.test(sessionCode),
    "claimVerifyAnnounceSlot이 옵셔널이면 가드 없이도 컴파일이 통과해 이중 발동 방지가 조용히 빠질 수 있다",
  );
});

test("[Critical 수정] dispatchToolCall의 offer_verification_desk 분기가 deliverVerifyOffer 호출 전에 claim을 체크한다", () => {
  const claimAt = sessionCode.indexOf("if (!handlersRef.current.claimVerifyAnnounceSlot()) {");
  const deliverAt = sessionCode.indexOf("await deliverVerifyOffer({");
  assert.ok(claimAt >= 0, "claim 체크를 찾지 못했다");
  assert.ok(deliverAt >= 0, "offer_verification_desk의 deliverVerifyOffer 호출을 찾지 못했다");
  assert.equal(
    sessionCode.split("deliverVerifyOffer({").length - 1,
    1,
    "이 파일에서 deliverVerifyOffer 호출은 offer_verification_desk 분기 1곳뿐이어야 한다(그래야 이 인덱스 비교가 유효하다)",
  );
  assert.ok(claimAt < deliverAt, "claim은 서버 호출보다 먼저(동기적으로) 있어야 한다");
});

test("[Critical 수정] dispatchToolCall이 claim 실패 시 서버를 부르지 않고 즉시 리턴한다", () => {
  const claimAt = sessionCode.indexOf("if (!handlersRef.current.claimVerifyAnnounceSlot()) {");
  const nextTryAt = sessionCode.indexOf("try {", claimAt);
  // §59.6 갱신 2(G394) — claim 실패 분기는 이제 객체 리터럴이 아니라
  // buildAlreadyAnnouncedToolResponse(call, liveTools) 순수 함수 호출로 guidance를 싣는다.
  const returnAt = sessionCode.indexOf("return buildAlreadyAnnouncedToolResponse(call, liveTools);", claimAt);
  assert.ok(claimAt >= 0 && nextTryAt >= 0 && returnAt >= 0);
  assert.ok(
    returnAt < nextTryAt,
    "claim 실패 분기의 return이 그 뒤의 try(실제 서버 호출)보다 먼저 나와야 서버가 안 불린다",
  );
});

test("[Critical 수정] dispatchToolCall의 offer_verification_desk 분기가 성공/실패 무관 finally에서 release한다", () => {
  assert.match(
    sessionCode,
    /\}\s*catch\s*\{\s*handlersRef\.current\.onModelToolVerifyFailed\?\.\(\);\s*return failureResponse\(\);\s*\}\s*finally\s*\{\s*handlersRef\.current\.releaseVerifyAnnounceSlot\(\);\s*\}/,
    "release가 finally에 없으면 실패 경로에서 슬롯이 잠긴 채 남는다",
  );
});
