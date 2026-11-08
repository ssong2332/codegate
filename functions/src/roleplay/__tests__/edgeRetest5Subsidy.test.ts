// ⭐ Edge 재시험 5(2026-11-08 · main `010acaab` · 정부지원금 스미싱 고급 · 세션 `f77fe096`) —
// D2 설치 뒤 "전화로 이어서 신청 절차를 안내해 드릴게요. 곧 연결해 드리겠습니다." → 45초 동안 전화 0(예고 정규식 밖).
// D3 넘어온 통화에서 "문자로 보내 드린 링크 화면 열어 주시면 …" → "화면에서 신청하기 버튼을 눌러 …"(설치 화면에 그런 버튼 0).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { announcesIncomingCall, decideCallAnnouncement } from "../callAnnouncement";
import { CALL_SCREENS_DONE_RULE, callScreensDoneRule, linkScreensAllDone } from "../callScreensDone";
import { CALL_PHASE_NO_LINK_LINE } from "../escalatedCall";
import { buildPriorChatContext, priorChatActions, type PriorChatMessage } from "../../realtime/priorChatContext";
import { GeminiRealtimeProvider } from "../../realtime/geminiProvider";
import { routeEndsWithoutAccount } from "../../scenarios/flowVariants";
import { sessionDeclaresInCallSms } from "../../inCallSms/smsGate";

const SRC = path.resolve(__dirname, "../../../src");
const read = (file: string) => readFileSync(path.join(SRC, file), "utf8").replace(/\r\n/g, "\n");

const SUBSIDY = "messenger-subsidy-smishing-sms";
const VARIANT = "fv-hu8w";
// 재시험 5 대화방 구간(메인 보고 원문 · 참가자 줄은 가림 저장 형태와 같다).
const ANNOUNCE = "확인이 끝났으니 이제 담당자가 전화로 이어서 신청 절차를 안내해 드릴게요. 곧 연결해 드리겠습니다.";
const CHAT: PriorChatMessage[] = [
  { role: "scammer", textMasked: "정부 지원금 대상자로 확인되셨습니다. 신청 접수를 위해 확인 앱을 먼저 설치해 주세요.", channel: "messenger" },
  { role: "user", textMasked: "네 설치할게요", channel: "messenger" },
  { role: "scammer", textMasked: ANNOUNCE, channel: "messenger" },
  { role: "user", textMasked: "네, 전화 기다릴게요.", channel: "messenger" },
];

test("[재시험5 A] 실측 예고 문장은 곧 걸려 올 전화 예고다 → 지금 전환 가능하면 전환 · 나중 · 다른 뜻 연결은 아니다", () => {
  assert.equal(announcesIncomingCall(ANNOUNCE), true);
  assert.equal(announcesIncomingCall("담당자가 전화로 이어서 신청 절차를 안내해 드릴게요."), true, "A1");
  assert.equal(announcesIncomingCall("곧 연결해 드리겠습니다."), true, "A2");
  assert.equal(announcesIncomingCall("지금 바로 담당 상담원과 연결해 드릴게요."), true, "A2");
  assert.deepEqual(decideCallAnnouncement({ replyText: ANNOUNCE, signalAccepted: false, canEscalateNow: true }), { action: "escalate" });
  for (const no of [
    "나중에 다시 연결해 드릴게요.",
    "계좌 연결해 드릴게요.",
    "신청 절차를 안내해 드릴게요.",
    "나중에 전화로 이어서 안내해 드릴게요.",
    "확인 앱 설치를 마치시면 접수가 완료됩니다.",
  ]) {
    assert.equal(announcesIncomingCall(no), false, no);
  }
});

test("[재시험5 S] 판정표 S — 넘어온 통화 ∧ 링크 화면 결말 루트 ∧ 통화 중 문자 없음 ∧ 연 화면 전부 마침일 때만", () => {
  const base = { escalatedCall: true, noAccountRoute: true, inCallSms: false, allScreensDone: true };
  assert.equal(callScreensDoneRule(base), CALL_SCREENS_DONE_RULE);
  for (const [key, value] of [["escalatedCall", false], ["noAccountRoute", false], ["inCallSms", true], ["allScreensDone", false]] as const) {
    assert.equal(callScreensDoneRule({ ...base, [key]: value }), undefined, key);
  }
  assert.equal(linkScreensAllDone([{ shownAt: 1, consentedAt: 2 }]), true);
  assert.equal(linkScreensAllDone([{ shownAt: 1, submittedAt: 2 }]), true);
  assert.equal(linkScreensAllDone([{ shownAt: 1 }]), false, "열기만 함");
  assert.equal(linkScreensAllDone([{ shownAt: 1, consentedAt: 2 }, { shownAt: 3 }]), false, "하나라도 남음");
  assert.equal(linkScreensAllDone([]), false, "연 화면 0");
  assert.equal(routeEndsWithoutAccount(SUBSIDY, VARIANT), true, "전제 — 지원금 고급은 링크 화면 결말");
  assert.equal(sessionDeclaresInCallSms(SUBSIDY, VARIANT), false, "전제 — 통화 중 문자 없음");
  assert.match(CALL_SCREENS_DONE_RULE, /신청하기 · 최종 확인 · 승인 · 완료/, "실측 버튼 이름 둘 다");
  assert.match(CALL_SCREENS_DONE_RULE, /\[진행 강제\] · \[실시간 통화\]의 화면 · 링크 안내보다 이 절이 우선/);
  assert.equal(/["“”]|모의|훈련/.test(CALL_SCREENS_DONE_RULE), false, "따옴표 대사 예시 · 모의 · 훈련 어휘 0");
});

/** Live 토큰 발급 요청의 시스템 프롬프트(GeminiRealtimeProvider 실경로 · 네트워크는 가짜 fetch). */
async function liveSystemPrompt(priorChatContext: string): Promise<string> {
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    if (init?.body) bodies.push(init.body);
    return new Response(JSON.stringify({ name: "auth_tokens/test-token" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  try {
    await new GeminiRealtimeProvider("test-key").createCallCredentials({
      sessionId: "sess",
      scenarioId: SUBSIDY,
      voiceId: "ignored",
      difficultyLevel: "advanced",
      flowVariantId: VARIANT,
      channel: "voice",
      hangupRelay: undefined,
      speakerGender: "female",
      personaCard: undefined,
      priorChatContext,
      escalatedCall: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const setup = JSON.parse(bodies[0]!) as { bidiGenerateContentSetup?: { systemInstruction?: { parts?: { text?: string }[] } } };
  return setup.bidiGenerateContentSetup?.systemInstruction?.parts?.[0]?.text ?? "";
}

/** `realtime/index.ts` 넘어온 통화 갈래와 같은 조립(앞선 대화 → 판정표 S 규칙을 뒤에). */
function escalatedContext(mockDocs: Record<string, unknown>[]): string {
  const prior = buildPriorChatContext(CHAT, priorChatActions(mockDocs), "scammer")!;
  const rule = callScreensDoneRule({
    escalatedCall: true,
    noAccountRoute: routeEndsWithoutAccount(SUBSIDY, VARIANT),
    inCallSms: sessionDeclaresInCallSms(SUBSIDY, VARIANT),
    allScreensDone: linkScreensAllDone(mockDocs),
  });
  return rule ? `${prior}\n${rule}` : prior;
}

test("[재시험5 S · Live 실경로] 재시험 5 대화 · 설치 마침 상태로 만든 Live 시스템 프롬프트 — 남은 일 절이 [진행 강제] · [실시간 통화] 뒤 · 가드레일 앞에 실린다", async () => {
  const sent = await liveSystemPrompt(escalatedContext([{ shownAt: 1, consentedAt: 2, consentAnnouncedAt: 3 }]));
  const at = (needle: string) => sent.indexOf(needle);
  assert.ok(at(CALL_PHASE_NO_LINK_LINE) > 0, "#532 통화 단계 줄도 실려 있다(재현 — 실렸는데도 결함이 났다)");
  assert.ok(at(CALL_SCREENS_DONE_RULE) > 0, "남은 일 절이 실린다");
  assert.ok(at(CALL_SCREENS_DONE_RULE) > at("[진행 강제"), "[진행 강제]보다 뒤");
  assert.ok(at(CALL_SCREENS_DONE_RULE) > at("[실시간 통화"), "[실시간 통화]보다 뒤");
  assert.ok(at(CALL_SCREENS_DONE_RULE) < at("[안전 지침"), "가드레일은 여전히 맨 끝");
  assert.ok(sent.includes(`나(메시지): ${ANNOUNCE}`), "앞선 대화 원문");
  assert.ok(sent.includes("링크로 연 화면에서 설치 · 권한 허용을 눌렀다"), "화면 행동");
});

test("[재시험5 S · Live 실경로] 설치 화면을 열기만 한 통화에는 남은 일 절이 없다(그 화면에서 마치라는 N1이 그대로 맡는다)", async () => {
  const sent = await liveSystemPrompt(escalatedContext([{ shownAt: 1 }]));
  assert.equal(sent.includes(CALL_SCREENS_DONE_RULE), false);
  assert.ok(sent.includes(CALL_PHASE_NO_LINK_LINE));
});

test("[재시험5 S 배선] Live 토큰 · 폴백 턴 둘 다 같은 판정을 부른다", () => {
  const realtime = read("realtime/index.ts");
  assert.match(
    realtime,
    /priorChatContext = `\$\{priorChatContext\}\\n\$\{CLONE_SHORT_CALL_RULE\}`;\n\s*\}\n[^\n]*\n\s*const screensDoneRule = callScreensDoneRule\(\{\n\s*escalatedCall: true,\n\s*noAccountRoute: routeEndsWithoutAccount\(session\.scenarioId, session\.flowVariantId\),\n\s*inCallSms: sessionDeclaresInCallSms\(session\.scenarioId, session\.flowVariantId\),\n\s*allScreensDone: linkScreensAllDone\(mockSnap\.docs\.map\(\(d\) => d\.data\(\)\)\),/,
  );
  assert.match(realtime, /if \(screensDoneRule\) priorChatContext = priorChatContext \? `\$\{priorChatContext\}\\n\$\{screensDoneRule\}` : screensDoneRule;/);
  const roleplay = read("roleplay/index.ts");
  assert.match(roleplay, /linkScreensDone = linkScreensAllDone\(mockSnap\.docs\.map\(\(doc\) => doc\.data\(\)\)\);/);
  assert.match(roleplay, /escalatedCallInstruction,\n[^\n]*\n\s*callScreensDoneRule\(\{\n\s*escalatedCall,\n\s*noAccountRoute: routeEndsWithoutAccount\(session\.scenarioId, session\.flowVariantId\),\n\s*inCallSms: sessionDeclaresInCallSms\(session\.scenarioId, session\.flowVariantId\),\n\s*allScreensDone: linkScreensDone,/);
});
