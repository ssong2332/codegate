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

test("[§59.10 D] play/page.tsx가 toolWindow의 shouldFireBackstop을 import한다", () => {
  assert.match(page, /import \{ shouldFireBackstop \} from "@\/lib\/realtime\/toolWindow";/);
});

test("[§59.10 D] shouldFireBackstop이 문자·오퍼 두 발동 효과 모두에서 쓰인다(지연 발동 전환)", () => {
  const occurrences = pageCode.split("shouldFireBackstop({").length - 1;
  assert.equal(occurrences, 2, `문자 효과 1회 + 오퍼(announce) 효과 1회 = 2회여야 한다(실측: ${occurrences})`);
});

test("[G388] SMS 효과의 toolAvailable은 credentials.liveTools?.sendPreparedSms에서 온다", () => {
  assert.ok(
    pageCode.includes('Boolean(realtime.credentials?.liveTools?.sendPreparedSms)'),
    "toolAvailable 판정이 liveTools.sendPreparedSms를 읽지 않는다",
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

test("[백스톱 발동] 서버 관측(§59.11)을 위해 backstop 발동 호출은 trigger:\"backstop\"을 명시한다", () => {
  assert.ok(
    pageCode.includes('deliverInCallSms({ sessionId, smsId: dueSmsId, trigger: "backstop" })'),
    "trigger를 명시하지 않으면 §59.11 로그가 model_tool과 이 경로를 구분하지 못한다",
  );
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

test("[toolCallFailed 배선] SMS 효과는 실패 신호(smsToolCallFailedIdRef)를 shouldFireBackstop에 넘긴다", () => {
  assert.ok(
    pageCode.includes("toolCallFailed: smsToolCallFailedIdRef.current === dueSmsId,"),
    "SMS 효과가 모델 도구 실패 신호를 백스톱 판정에 반영하지 않는다(G390)",
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

test("[배선] dispatchToolCall이 SMS 성공/실패 콜백을 각각 부른다", () => {
  assert.ok(sessionCode.includes("handlersRef.current.onModelToolSmsDelivered?.(smsId);"));
  assert.ok(sessionCode.includes("handlersRef.current.onModelToolSmsFailed?.(smsId);"));
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

test("[props 타입] GeminiVoiceSessionProps에 4개 콜백이 옵셔널로 선언돼 있다", () => {
  assert.match(sessionCode, /onModelToolSmsDelivered\?: \(smsId: string\) => void;/);
  assert.match(sessionCode, /onModelToolSmsFailed\?: \(smsId: string\) => void;/);
  assert.match(sessionCode, /onModelToolVerifyAnnounced\?: \(\) => void;/);
  assert.match(sessionCode, /onModelToolVerifyFailed\?: \(\) => void;/);
});

test("[배선] play/page.tsx가 GeminiVoiceSession에 4개 콜백을 모두 넘긴다", () => {
  assert.ok(pageCode.includes("onModelToolSmsDelivered={handleModelToolSmsDelivered}"));
  assert.ok(pageCode.includes("onModelToolSmsFailed={handleModelToolSmsFailed}"));
  assert.ok(pageCode.includes("onModelToolVerifyAnnounced={handleModelToolVerifyAnnounced}"));
  assert.ok(pageCode.includes("onModelToolVerifyFailed={handleModelToolVerifyFailed}"));
});

test("[중복 발동 방지] handleModelToolSmsDelivered는 requestedSmsRef에 더한다(pickDueInCallSms 재필터)", () => {
  assert.ok(
    pageCode.includes(
      "const handleModelToolSmsDelivered = useCallback((smsId: string) => {\nrequestedSmsRef.current.add(smsId);",
    ) || /handleModelToolSmsDelivered = useCallback\(\(smsId: string\) => \{\s*requestedSmsRef\.current\.add\(smsId\);/.test(pageCode),
    "모델이 도구로 전달한 smsId가 requestedSmsRef에 반영되지 않으면 백스톱이 같은 문자를 다시 요청할 수 있다",
  );
});

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
