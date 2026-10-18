// T191 S7 — 릴레이 다른 목소리 재연결(서버 · 라우팅 · 폴백) 게이트. PRD AC-101 (a)(b)(d)(e)(f)(i)(j) · AC-098 갱신 고지 1.
// 설계: Architecture T191 절 "릴레이 다른 목소리 재연결" · 게이트 표의 인계(G493) · 음성(G494) · 라우팅(G495) ·
// 경계(G496) · 시크릿(G499) — 테스트 이름에는 번호 대신 의미를 쓴다(번호는 나중에 재번호될 수 있다).
//
// ⚠️ 역방향 확인(AC-101 (j))은 **테스트 코드 안에서만** 오염 샘플을 만든다(callContinuity.test.ts 관례) —
//    정본 소스를 고쳤다 되돌리지 않는다. 오염 샘플과 정상 샘플은 같은 실행 출력에 나란히 나온다(t.diagnostic).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import {
  FLOW_VARIANTS,
  findFlowVariant,
  isRelayVariant,
  legStageRange,
  relaySpeakerLabel,
  resolveVariantPrompt,
  RELAY_LEG_ROLE_HEADER,
  type FlowVariant,
} from "../../scenarios/flowVariants";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { buildRelayHandoff, RELAY_HANDOFF_HEADER, RELAY_HANDOFF_MAX_CHARS, selectRecentTurns } from "../relayHandoff";
import {
  checkRelayAdvance,
  countLegUserTurns,
  decideFallbackRelayTurn,
  extractRelayTransferSignal,
  relayLiveCeiling,
  RELAY_FALLBACK_NUDGE_INSTRUCTION,
  RELAY_FALLBACK_WINDOW_INSTRUCTION,
  RELAY_TRANSFER_SIGNAL,
} from "../relayTransfer";
import { appendMaskedTranscriptTurns, countMaskedUserTurns, MAX_TRANSCRIPT_TURNS, type TranscriptTurn } from "../transcriptAppend";
import {
  GeminiRealtimeProvider,
  pickGeminiVoiceName,
  pickRelayVoiceName,
  relayLegVoiceNames,
  RELAY_FEMALE_VOICES,
  RELAY_MALE_VOICES,
} from "../geminiProvider";
import { buildLiveToolDeclarations, buildLiveToolNames, LIVE_TOOL_TRANSFER_CALL } from "../liveTools";
import { isRelayCapable, RELAY_CAPABLE_PROVIDERS, selectRealtimeProviderName } from "../provider";
import { wrapUserInputAsData } from "../../roleplay/promptAssembly";
import type { MessageDoc, SessionDoc } from "../../shared/types";

const SRC = path.resolve(__dirname, "../../../src");
const readSrc = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const codeOnly = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");

const RELAY_VARIANTS: FlowVariant[] = FLOW_VARIANTS.filter((v) => isRelayVariant(v));
const CARD_DELIVERY = RELAY_VARIANTS.find((v) => v.scenarioId === "card-delivery-call") as FlowVariant;

// ── 가짜 트랜잭션(코어 함수 입력) ─────────────────────────────────────────────
function fakeTx() {
  const created: MessageDoc[] = [];
  const updated: Record<string, unknown>[] = [];
  return {
    tx: {
      create: (_ref: unknown, data: MessageDoc) => created.push(data),
      update: (_ref: unknown, data: Record<string, unknown>) => updated.push(data),
    },
    created,
    updated,
  };
}
const FAKE_REF = {} as FirebaseFirestore.DocumentReference;
const FAKE_MESSAGES = { doc: () => ({}) } as unknown as FirebaseFirestore.CollectionReference;
const SESSION = {
  createdAt: Timestamp.fromMillis(1_000_000),
  answeredAt: Timestamp.fromMillis(1_000_500),
} as unknown as SessionDoc;

/** 원문 PII 샘플(참가자 발화) — 저장 · 인계에 원문이 남으면 안 된다. */
const RAW_PII_TURNS: TranscriptTurn[] = [
  { role: "scammer", text: "검사입니다. 본인 확인 부탁드립니다." },
  { role: "user", text: "제 번호는 010-1234-5678이고 계좌는 110-123-456789예요" },
  { role: "scammer", text: "네, 확인됐습니다. 담당자에게 연결해 드리겠습니다." },
];
const RAW_FRAGMENTS = ["010-1234-5678", "110-123-456789", "456789"];

function containsRawPii(text: string): string[] {
  return RAW_FRAGMENTS.filter((f) => text.includes(f));
}

// ═══ 인계 블록(G493 의미) ═════════════════════════════════════════════════════

test("[T191 S7 인계] 델타는 마스킹 코어로 저장되고, 인계 블록은 그 저장본으로만 만든다 — 원문 PII 0 · 역방향(원문으로 만든 샘플은 검사에 걸린다)", (t) => {
  const { tx, created } = fakeTx();
  const appended = appendMaskedTranscriptTurns(tx, {
    sessionRef: FAKE_REF,
    messagesRef: FAKE_MESSAGES,
    historyDocs: [],
    session: SESSION,
    turns: RAW_PII_TURNS,
    nowMs: 2_000_000,
  });
  assert.equal(appended.count, 3);
  for (const doc of created) assert.deepEqual(containsRawPii(doc.textMasked), [], "저장본에 원문 PII");
  const handoff = buildRelayHandoff({ variant: CARD_DELIVERY, fromLegIndex: 0, maskedMessages: appended.written });
  // 정상 샘플: 원문 0 · 마스킹 토큰은 있다
  assert.deepEqual(containsRawPii(handoff), []);
  assert.ok(handoff.includes("[전화]") && handoff.includes("[계좌]"), "마스킹 토큰이 인계에 실린다");
  // 오염 샘플(테스트 안에서만): 원문을 저장본 자리에 넣으면 같은 검사가 걸린다
  const polluted = buildRelayHandoff({
    variant: CARD_DELIVERY,
    fromLegIndex: 0,
    maskedMessages: RAW_PII_TURNS.map((turn) => ({ role: turn.role, textMasked: turn.text })),
  });
  t.diagnostic(`정상 인계 원문 PII=${JSON.stringify(containsRawPii(handoff))} | 오염(원문 입력) 인계 원문 PII=${JSON.stringify(containsRawPii(polluted))}`);
  assert.ok(containsRawPii(polluted).length > 0, "역방향: 원문 입력 샘플이 검사에 걸려야 한다(죽은 검사 아님)");
});

test("[T191 S7 인계] 결정론(같은 입력 = 같은 문자열) · 참가자 턴은 데이터 표기 · 최근 12턴 · 1,500자 상한 · 앞 leg 단계와 문자 목적", () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: (i % 2 === 0 ? "scammer" : "user") as "scammer" | "user",
    textMasked: `${i}번째 발화 ${"가".repeat(80)}`,
  }));
  const a = buildRelayHandoff({ variant: CARD_DELIVERY, fromLegIndex: 0, maskedMessages: messages, deliveredSmsIds: [] });
  const b = buildRelayHandoff({ variant: CARD_DELIVERY, fromLegIndex: 0, maskedMessages: messages, deliveredSmsIds: [] });
  assert.equal(a, b, "LLM 없이 결정론");
  assert.ok(a.startsWith(RELAY_HANDOFF_HEADER));
  const recent = selectRecentTurns(messages);
  assert.ok(recent.length <= 12);
  assert.ok(recent.reduce((n, m) => n + m.textMasked.length, 0) <= RELAY_HANDOFF_MAX_CHARS);
  assert.ok(recent[recent.length - 1]!.textMasked.startsWith("29번째"), "가장 최근 턴은 남는다");
  assert.ok(!a.includes(`${CARD_DELIVERY.legs[0]!.callerLabel}: 0번째 발화`), "오래된 턴은 버린다");
  const userLine = recent.find((m) => m.role === "user")!;
  assert.ok(a.includes(wrapUserInputAsData(userLine.textMasked)), "참가자 턴은 데이터 구분자로 감싼다");
  const { from, to } = legStageRange(CARD_DELIVERY, 0);
  for (let n = from; n <= to; n += 1) assert.ok(a.includes(CARD_DELIVERY.stages[n - 1]!.summary), `앞 leg 단계 ${n}`);
  assert.ok(a.includes("이미 보낸 문자: 없음"));
  assert.ok(a.includes("새 요구를 하지 않는다"), "첫마디 경계(AC-098 갱신 고지 1 ⓙ)");
  assert.ok(!/예:\s*"/.test(a), "인용 예시 문장 0(S1 §3.4)");
});

test("[T191 S7 인계] 교대 뒤 leg 프롬프트 — 역할 블록 · 인계 블록이 난이도 블록 앞 · 가드레일 최후미 · 역방향 ⓑ(인계 없이 시작한 샘플은 검사에 걸린다)", (t) => {
  const handoff = buildRelayHandoff({ variant: CARD_DELIVERY, fromLegIndex: 0, maskedMessages: [{ role: "user", textMasked: "네" }] });
  const base = SCENARIO_PROMPTS[CARD_DELIVERY.scenarioId]!;
  const hasHandoff = (prompt: string) => prompt.includes(RELAY_HANDOFF_HEADER);
  const leg1 = resolveVariantPrompt(base, CARD_DELIVERY, 1, { handoff, transferVia: "tool" });
  const assembled = buildSystemPrompt(leg1, { difficultyLevel: "advanced" });
  assert.ok(assembled.includes(RELAY_LEG_ROLE_HEADER) && hasHandoff(assembled));
  assert.ok(assembled.trimEnd().endsWith(base.guardrailPreamble.trimEnd()), "가드레일 최후미(AC-065)");
  assert.ok(assembled.indexOf(RELAY_HANDOFF_HEADER) < assembled.lastIndexOf(base.guardrailPreamble));
  assert.ok(leg1.personaPrompt.includes(CARD_DELIVERY.legs[1]!.personaPrompt!), "leg 페르소나");
  assert.ok(!leg1.personaPrompt.includes("[교대] 너는"), "마지막 leg에는 다음 교대 규칙이 없다");
  // 역방향 ⓑ — 인계 없이 시작한 샘플
  const noHandoff = resolveVariantPrompt(base, CARD_DELIVERY, 1, { transferVia: "tool" });
  t.diagnostic(`정상 leg1 인계 블록=${hasHandoff(leg1.personaPrompt)} | 오염(인계 없음) 인계 블록=${hasHandoff(noHandoff.personaPrompt)}`);
  assert.equal(hasHandoff(noHandoff.personaPrompt), false, "역방향 ⓑ가 실제로 구분된다");
  // leg 0에는 인계를 넣지 않는다(넘겨받은 사람이 아니다)
  assert.equal(hasHandoff(resolveVariantPrompt(base, CARD_DELIVERY, 0, { handoff }).personaPrompt), false);
});

test("[T191 S7 인계] startRelayLeg 응답 · sendMessage 응답에 인계문 · 프롬프트가 실리지 않는다(X2 — 소스 스캔)", () => {
  const relay = codeOnly(readSrc("realtime/startRelayLeg.ts"));
  const typeBlock = relay.slice(relay.indexOf("export type StartRelayLegResponse"), relay.indexOf("type LegContext"));
  assert.ok(typeBlock.length > 50);
  assert.ok(!/handoff|systemInstruction|personaPrompt|prompt\s*:/.test(typeBlock), "응답 타입에 인계 · 프롬프트 필드");
  for (const block of relay.split("return {").slice(1)) {
    const body = block.slice(0, block.indexOf("}"));
    assert.ok(!/\bhandoff\b/.test(body), `return 블록에 handoff: ${body.slice(0, 80)}`);
  }
  // 인계 입력은 저장본(마스킹 코어 결과)뿐 — 클라 turns를 직접 넘기지 않는다
  assert.ok(relay.includes("maskedMessages: committed.messages.filter"));
  assert.ok(!/maskedMessages:\s*turns/.test(relay));
  const roleplay = codeOnly(readSrc("roleplay/index.ts"));
  assert.ok(roleplay.includes("maskedMessages: storedHistory.filter((m) => m.turnIndex < relayLegStart)"));
});

// ═══ 음성(G494 의미) ══════════════════════════════════════════════════════════

test("[T191 S7 음성] 릴레이 변형 × 세션 200개 — leg마다 음성이 서로 다르다 · leg 0은 기존 선택과 같다 · 역방향 ⓐ(같은 음성 샘플은 걸린다)", (t) => {
  const allDistinct = (names: readonly string[]) => new Set(names).size === names.length;
  for (const v of RELAY_VARIANTS) {
    for (let i = 0; i < 200; i += 1) {
      const sid = `session-${i}`;
      const names = relayLegVoiceNames(v, v.scenarioId, sid);
      assert.equal(names.length, v.legs.length);
      assert.equal(names[0], pickGeminiVoiceName(v.scenarioId, sid), "leg 0 = 기존 음성(회귀 0)");
      assert.ok(allDistinct(names), `${v.variantId}/${sid}: ${names.join(",")}`);
      for (let leg = 1; leg < names.length; leg += 1) {
        const pool: readonly string[] = v.legs[leg]!.speakerGender === "male" ? RELAY_MALE_VOICES : RELAY_FEMALE_VOICES;
        assert.ok(pool.includes(names[leg]!), "leg 성별 풀 안");
      }
    }
  }
  assert.ok(RELAY_MALE_VOICES.length >= 3 && RELAY_FEMALE_VOICES.length >= 3, "풀 확장 — 성별당 ≥ 3(OQ-A113)");
  // 성별 풀이 다 쓰여도 같은 음성을 다시 고르지 않는다
  const exhausted = pickRelayVoiceName("male", "s", 3, [...RELAY_MALE_VOICES]);
  assert.ok(!(RELAY_MALE_VOICES as readonly string[]).includes(exhausted));
  const polluted = ["Puck", "Puck"];
  t.diagnostic(`정상 샘플 distinct=${allDistinct(relayLegVoiceNames(CARD_DELIVERY, CARD_DELIVERY.scenarioId, "x"))} | 오염(같은 음성) distinct=${allDistinct(polluted)}`);
  assert.equal(allDistinct(polluted), false);
});

function captureTokenRequest() {
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    if (init?.body) bodies.push(String(init.body));
    return new Response(JSON.stringify({ name: "auth_tokens/test-token" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return { restore: () => (globalThis.fetch = originalFetch), bodies: () => bodies };
}

test("[T191 S7 음성 · 발급] leg 1 토큰 — 다른 음성 · leg 페르소나 + 인계가 systemInstruction에 · 클론 voiceId 미사용 · 마지막 leg는 transfer_call 없음", async () => {
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key");
    const common = {
      sessionId: "sess-relay",
      scenarioId: CARD_DELIVERY.scenarioId,
      voiceId: "clone-voice-id-should-not-be-used",
      difficultyLevel: "advanced" as const,
      flowVariantId: CARD_DELIVERY.variantId,
    };
    const leg0 = await provider.createCallCredentials(common);
    const handoff = buildRelayHandoff({ variant: CARD_DELIVERY, fromLegIndex: 0, maskedMessages: [{ role: "user", textMasked: "네" }] });
    const leg1 = await provider.createCallCredentials({ ...common, relayLeg: { legIndex: 1, handoff } });
    const [body0, body1] = capture.bodies();
    const voiceOf = (body: string) => /"voiceName":"([^"]+)"/.exec(body)?.[1];
    const names = relayLegVoiceNames(CARD_DELIVERY, CARD_DELIVERY.scenarioId, "sess-relay");
    assert.equal(voiceOf(body0!), names[0]);
    assert.equal(voiceOf(body1!), names[1]);
    assert.notEqual(voiceOf(body0!), voiceOf(body1!));
    assert.ok(!body0!.includes("clone-voice-id") && !body1!.includes("clone-voice-id"), "클론 voiceId 미사용");
    assert.equal(leg0.voiceId, "");
    assert.ok(body1!.includes("통화 인계"), "인계 블록이 토큰에 고정");
    assert.ok(!body0!.includes("통화 인계"), "leg 0에는 인계 없음");
    // 도구 — leg 0만 transfer_call
    assert.ok(body0!.includes(LIVE_TOOL_TRANSFER_CALL));
    assert.ok(!body1!.includes(LIVE_TOOL_TRANSFER_CALL));
    assert.equal(leg0.liveTools?.transferCall, LIVE_TOOL_TRANSFER_CALL);
    assert.equal(leg1.liveTools?.transferCall, undefined);
    // 응답(클라로 가는 것)에는 인계 · 프롬프트 0
    assert.ok(!JSON.stringify(leg1).includes("통화 인계") && !JSON.stringify(leg1).includes("보이스피싱"));
  } finally {
    capture.restore();
  }
});

test("[T191 S7 도구] transfer_call은 relayTransfer일 때만 · 맨 뒤에 · 인자 없음 · BLOCKING — 기존 선언은 그대로", () => {
  for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
    for (const level of ["beginner", "intermediate", "advanced", undefined] as const) {
      const without = buildLiveToolDeclarations(scenarioId, level);
      const withRelay = buildLiveToolDeclarations(scenarioId, level, true);
      const names = (tools: typeof without) => tools.flatMap((x) => x.functionDeclarations ?? []).map((d) => d.name);
      assert.ok(!names(without).includes(LIVE_TOOL_TRANSFER_CALL));
      assert.deepEqual(names(withRelay), [...names(without), LIVE_TOOL_TRANSFER_CALL]);
      const decl = withRelay.flatMap((x) => x.functionDeclarations ?? []).find((d) => d.name === LIVE_TOOL_TRANSFER_CALL)!;
      assert.deepEqual(decl.parameters?.properties, {});
      assert.equal(decl.behavior, "BLOCKING");
    }
  }
  const ceiling = relayLiveCeiling(CARD_DELIVERY, 0)!;
  const names = buildLiveToolNames("kidnapping-threat", "advanced", ceiling)!;
  assert.equal(names.transferCall, LIVE_TOOL_TRANSFER_CALL, "다른 도구가 없어도 교대 도구 이름은 내려간다");
  assert.deepEqual(names.transferCeiling, ceiling);
  assert.equal(buildLiveToolNames("kidnapping-threat", "advanced"), undefined, "교대 없으면 종전과 같다");
});

// ═══ 라우팅(G495 의미 · DECISIONS #139) ════════════════════════════════════════

test("[T191 S7 라우팅] 릴레이 변형은 ElevenLabs로 가지 않는다 — 허용목록 [gemini, none] · 역검증(목록을 바꾸면 판정이 뒤집힌다)", (t) => {
  assert.deepEqual([...RELAY_CAPABLE_PROVIDERS], ["gemini", "none"]);
  const ready = { elevenLabsReady: true, geminiReady: true, voiceMode: "generic" as const };
  assert.equal(selectRealtimeProviderName({ ...ready, relayVariant: false }), "elevenlabs", "릴레이 없음 = 종전(ElevenLabs 우선)");
  assert.equal(selectRealtimeProviderName({ ...ready, relayVariant: true }), "gemini", "릴레이 = Gemini");
  assert.equal(
    selectRealtimeProviderName({ elevenLabsReady: true, geminiReady: true, voiceMode: "clone", relayVariant: true }),
    "none",
    "클론 시나리오 + 릴레이 = 텍스트 폴백(Gemini는 generic 전용)",
  );
  assert.equal(selectRealtimeProviderName({ elevenLabsReady: false, geminiReady: false, relayVariant: true }), "none");
  // 역검증 — 같은 함수에 다른 허용목록을 주입
  const narrowed = selectRealtimeProviderName({ ...ready, relayVariant: true }, ["none"]);
  const widened = selectRealtimeProviderName({ ...ready, relayVariant: true }, ["elevenlabs", "gemini", "none"]);
  t.diagnostic(`정본 [gemini,none] → gemini | 좁힘 [none] → ${narrowed} | 넓힘(+elevenlabs) → ${widened}`);
  assert.equal(narrowed, "none");
  assert.equal(widened, "elevenlabs");
  assert.equal(isRelayCapable("elevenlabs"), false);
  // 배선 — createRealtimeCall이 세션 변형으로 relayVariant를 넘긴다
  const index = codeOnly(readSrc("realtime/index.ts"));
  assert.ok(index.includes("const relayVariant = isRelayVariant(findFlowVariant(session.flowVariantId));"));
  assert.ok(index.includes("getRealtimeProvider(session.scenarioId, effectiveVoiceMode, { relayVariant })"));
  // 클론 2종(가족 사고 · 손주)은 릴레이 변형이 없다 — ElevenLabs 경로는 현행 프롬프트(#139)
  for (const id of ["family-accident-deepvoice", "grandchild-impersonation"]) {
    assert.equal(FLOW_VARIANTS.filter((v) => v.scenarioId === id && isRelayVariant(v)).length, 0, id);
  }
});

// ═══ 교대 시점 · 경계(G496 의미) ═══════════════════════════════════════════════

test("[T191 S7 교대 판정] 판정표 — 하한 · 창 · 넛지 · 강제 · 확인 창구 · 릴레이 아님 · 순번 불일치", () => {
  const v = CARD_DELIVERY;
  const leg = v.legs[0]!;
  const base = { variant: v, currentLegIndex: 0, toLegIndex: 1 };
  assert.deepEqual(checkRelayAdvance({ ...base, userTurnsInLeg: leg.minUserTurns - 1 }), { ok: false, reason: "below-min" });
  assert.deepEqual(checkRelayAdvance({ ...base, userTurnsInLeg: leg.minUserTurns }), { ok: true });
  assert.deepEqual(checkRelayAdvance({ ...base, userTurnsInLeg: 9, verify: { announced: true, placed: false } }), { ok: false, reason: "verify-pending" });
  assert.deepEqual(checkRelayAdvance({ ...base, userTurnsInLeg: 9, verify: { announced: true, placed: true } }), { ok: false, reason: "verify-placed" });
  assert.deepEqual(checkRelayAdvance({ ...base, toLegIndex: 2, userTurnsInLeg: 9 }), { ok: false, reason: "leg-mismatch" });
  assert.deepEqual(checkRelayAdvance({ variant: v, currentLegIndex: 1, toLegIndex: 2, userTurnsInLeg: 9 }), { ok: false, reason: "no-next-leg" });
  const oneLeg = FLOW_VARIANTS.find((x) => x.legs.length === 1)!;
  assert.deepEqual(checkRelayAdvance({ variant: oneLeg, currentLegIndex: 0, toLegIndex: 1, userTurnsInLeg: 9 }), { ok: false, reason: "not-relay" });
  const fb = (n: number) => decideFallbackRelayTurn({ variant: v, legIndex: 0, userTurnsInLeg: n });
  assert.deepEqual(fb(leg.minUserTurns - 1), { acceptSignal: false, force: false });
  assert.deepEqual(fb(leg.minUserTurns), { instruction: RELAY_FALLBACK_WINDOW_INSTRUCTION, acceptSignal: true, force: false });
  assert.deepEqual(fb(leg.maxUserTurns), { instruction: RELAY_FALLBACK_NUDGE_INSTRUCTION, acceptSignal: true, force: false });
  assert.deepEqual(fb(leg.maxUserTurns + 2), { instruction: RELAY_FALLBACK_NUDGE_INSTRUCTION, acceptSignal: true, force: true });
  assert.deepEqual(relayLiveCeiling(v, 0), {
    nudgeAfterUserTurns: leg.maxUserTurns,
    forceAfterUserTurns: leg.maxUserTurns + 2,
    nudgeInstruction: relayLiveCeiling(v, 0)!.nudgeInstruction,
  });
  assert.equal(relayLiveCeiling(v, 1), undefined, "마지막 leg는 천장 없음");
});

test("[T191 S7 교대 시점 3경로] 실시간 check와 폴백이 같은 판정 함수 — n=0..15 전부 허락 여부 일치 · 역방향 ⓒ(경로별로 어긋난 샘플은 걸린다)", (t) => {
  const v = CARD_DELIVERY;
  const live = (n: number) => checkRelayAdvance({ variant: v, currentLegIndex: 0, toLegIndex: 1, userTurnsInLeg: n }).ok;
  const fallback = (n: number) => decideFallbackRelayTurn({ variant: v, legIndex: 0, userTurnsInLeg: n }).acceptSignal;
  const mismatches = (a: (n: number) => boolean, b: (n: number) => boolean) =>
    Array.from({ length: 16 }, (_, n) => n).filter((n) => a(n) !== b(n));
  assert.deepEqual(mismatches(live, fallback), []);
  // 오염 샘플: 폴백만 하한을 1 늦게 보는 경로
  const offByOne = (n: number) => fallback(n - 1);
  t.diagnostic(`정상 불일치=${JSON.stringify(mismatches(live, fallback))} | 오염(폴백 하한 +1) 불일치=${JSON.stringify(mismatches(live, offByOne))}`);
  assert.ok(mismatches(live, offByOne).length > 0);
  // 배선 — 두 호출부가 같은 함수를 쓴다(판정 사본 0)
  assert.ok(codeOnly(readSrc("realtime/startRelayLeg.ts")).includes("checkRelayAdvance({"));
  assert.ok(codeOnly(readSrc("roleplay/index.ts")).includes("decideFallbackRelayTurn({"));
  assert.ok(codeOnly(readSrc("realtime/relayTransfer.ts")).includes("const check = checkRelayAdvance({"), "폴백 판정이 공용 함수를 거친다");
});

test("[T191 S7 경계] startRelayLeg — 델타 append와 relay 경계 갱신이 같은 트랜잭션 · 경계 = append 직후 인덱스 · 멱등 재요청은 append 0", () => {
  const src = codeOnly(readSrc("realtime/startRelayLeg.ts"));
  const txStart = src.indexOf("const committed = await db.runTransaction(async (tx) => {");
  const txEnd = src.indexOf("const { ctx } = committed;");
  assert.ok(txStart > 0 && txEnd > txStart);
  const txBody = src.slice(txStart, txEnd);
  const appendAt = txBody.indexOf("appendMaskedTranscriptTurns(tx, {");
  const relayAt = txBody.indexOf("tx.update(sessionRef, { relay: { legIndex: toLegIndex, legStartTurnIndex } });");
  assert.ok(appendAt > 0 && relayAt > appendAt, "같은 트랜잭션 안에서 append 뒤 경계 기록");
  assert.ok(txBody.includes("appended.nextIndex]"), "경계 = append 직후 인덱스");
  const idempotentAt = txBody.indexOf("if (toLegIndex === ctx.currentLegIndex) {");
  assert.ok(idempotentAt > 0 && idempotentAt < appendAt, "멱등 분기가 append보다 먼저");
  // 코어 — 경계 인덱스 계산
  const { tx } = fakeTx();
  const history = [0, 1, 2].map((i) => ({ ref: FAKE_REF, data: () => ({ role: "user", textMasked: "x", turnIndex: i }) }));
  const result = appendMaskedTranscriptTurns(tx, {
    sessionRef: FAKE_REF,
    messagesRef: FAKE_MESSAGES,
    historyDocs: history,
    session: SESSION,
    turns: [{ role: "scammer", text: "연결해 드리겠습니다" }, { role: "user", text: "   " }],
    nowMs: 3_000_000,
  });
  assert.equal(result.nextIndex, 4, "빈 턴은 저장 · 인덱스에서 빠진다");
  assert.equal(countLegUserTurns([{ role: "user", turnIndex: 1 }, { role: "user", turnIndex: 5 }, { role: "scammer", turnIndex: 6 }], 4, 2), 3);
});

test("[T191 S7 화자 표기] 교대 뒤 사기범 줄만 speakerLabel — 교대 전 · 참가자 · 릴레이 없는 세션은 부재(C-8)", () => {
  const v = CARD_DELIVERY;
  assert.equal(relaySpeakerLabel(v, 0), undefined);
  assert.equal(relaySpeakerLabel(v, 1), v.legs[1]!.callerLabel);
  assert.equal(relaySpeakerLabel(FLOW_VARIANTS.find((x) => x.legs.length === 1), 1), undefined);
  assert.equal(relaySpeakerLabel(undefined, 1), undefined);
  const { tx, created } = fakeTx();
  appendMaskedTranscriptTurns(tx, {
    sessionRef: FAKE_REF,
    messagesRef: FAKE_MESSAGES,
    historyDocs: [],
    session: SESSION,
    turns: [{ role: "scammer", text: "조사 담당입니다" }, { role: "user", text: "네" }],
    scammerSpeakerLabel: "금융감독원 직원",
    nowMs: 3_000_000,
  });
  assert.equal(created[0]!.speakerLabel, "금융감독원 직원");
  assert.equal(created[1]!.speakerLabel, undefined, "참가자 줄에는 붙지 않는다");
  // 라벨 없는 호출(교대 없는 세션) — 문서 필드 집합이 종전과 같다(회귀 0)
  const plain = fakeTx();
  appendMaskedTranscriptTurns(plain.tx, {
    sessionRef: FAKE_REF,
    messagesRef: FAKE_MESSAGES,
    historyDocs: [],
    session: SESSION,
    turns: [{ role: "scammer", text: "안녕하세요" }],
    nowMs: 3_000_000,
  });
  assert.deepEqual(Object.keys(plain.created[0]!), ["role", "textMasked", "turnIndex", "createdAt", "channel"]);
  // 세 저장 지점이 서버 세션 leg로 라벨을 정한다(클라 라벨 미수신)
  assert.ok(codeOnly(readSrc("realtime/submitTranscript.ts")).includes("relaySpeakerLabel("));
  assert.ok(codeOnly(readSrc("realtime/startRelayLeg.ts")).includes("relaySpeakerLabel(ctx.variant, ctx.currentLegIndex)"));
  assert.ok(codeOnly(readSrc("roleplay/index.ts")).includes("relaySpeakerLabel(relayVariant, relayLegIndex)"));
});

test("[T191 S7 마스킹 코어] submitRealtimeTranscript와 startRelayLeg가 같은 코어를 쓴다 · 턴 상한 같은 값 · 마스킹 없는 원문 저장 경로 0", () => {
  const submit = codeOnly(readSrc("realtime/submitTranscript.ts"));
  const relay = codeOnly(readSrc("realtime/startRelayLeg.ts"));
  assert.ok(submit.includes("appendMaskedTranscriptTurns(tx, {"));
  assert.ok(relay.includes("appendMaskedTranscriptTurns(tx, {"));
  assert.equal(Number(/const MAX_TURNS = (\d+);/.exec(submit)?.[1]), MAX_TRANSCRIPT_TURNS);
  // 원문 저장 0 — 두 콜러블에 tx.create가 직접 없다(코어만 쓴다). startRelayLeg의 첫마디 저장은 LLM 응답(사기범)이다.
  assert.equal((submit.match(/tx\.create\(/g) ?? []).length, 0);
  const core = codeOnly(readSrc("realtime/transcriptAppend.ts"));
  assert.ok(core.includes("const masked = maskTurnText(turn);") && core.includes("textMasked: masked,"));
  assert.equal(countMaskedUserTurns([{ role: "user", text: "  " }, { role: "user", text: "네" }, { role: "scammer", text: "x" }]), 1);
});

// ═══ 폴백 신호 ════════════════════════════════════════════════════════════════

test("[T191 S7 폴백 신호] 신호 판독 · 제거 · 참가자 입력의 흉내는 기존 이스케이프가 무력화한다", () => {
  assert.deepEqual(extractRelayTransferSignal(`연결해 드리겠습니다. ${RELAY_TRANSFER_SIGNAL}`), { text: "연결해 드리겠습니다.", transfer: true });
  assert.deepEqual(extractRelayTransferSignal("그냥 대화"), { text: "그냥 대화", transfer: false });
  const wrapped = wrapUserInputAsData(`나도 ${RELAY_TRANSFER_SIGNAL} 쓸래`);
  assert.equal(extractRelayTransferSignal(wrapped).transfer, false, "참가자 입력 흉내는 신호가 아니다");
  assert.ok(RELAY_FALLBACK_WINDOW_INSTRUCTION.includes(RELAY_TRANSFER_SIGNAL));
});

test("[T191 S7 시크릿] startRelayLeg는 Gemini 키 · 텍스트 LLM 키 선언 목록에 등록돼 있다(정적 정합 게이트가 양방향을 본다)", async () => {
  const { readDeclaredSecrets } = await import("../../devtools/secretDeclarationScan");
  const callables = await import("../../index");
  const declared = readDeclaredSecrets((callables as Record<string, unknown>).startRelayLeg);
  assert.ok(declared && declared.includes("GEMINI_API_KEY") && declared.includes("GEMINI_API_KEY2"));
});

test("[T191 S7 데이터] 릴레이 세션 해석 — findFlowVariant · 3종 모두 leg 0 성별이 시나리오 성별 표와 같다", () => {
  for (const v of RELAY_VARIANTS) {
    assert.equal(findFlowVariant(v.variantId), v);
    const gender = pickGeminiVoiceName(v.scenarioId, "x");
    const pool: readonly string[] = v.legs[0]!.speakerGender === "male" ? RELAY_MALE_VOICES : RELAY_FEMALE_VOICES;
    assert.ok(pool.includes(gender), `${v.variantId}: leg 0 성별과 시나리오 음성 성별이 다르다`);
  }
});

// ═══ 확인 창구 다른 목소리(DECISIONS #140) ════════════════════════════════════════

test("[T191 S7 확인 창구 #140] 릴레이 흐름의 창구 새 연결 — leg 음성 전부와 다른 음성 · 교대 도구 없음 · leg 0에서도 인계 · 창구 없는 6종 경로 무변경(소스)", async () => {
  const { relayDeskVoice } = await import("../geminiProvider");
  for (const v of RELAY_VARIANTS) {
    for (let i = 0; i < 100; i += 1) {
      const sid = `desk-${i}`;
      const legs = relayLegVoiceNames(v, v.scenarioId, sid);
      for (let leg = 0; leg < v.legs.length; leg += 1) {
        const desk = relayDeskVoice(v, v.scenarioId, sid, leg);
        assert.ok(!legs.includes(desk.voiceName), `${v.variantId}/${sid}/leg${leg}: 창구 음성이 leg 음성과 같다`);
        assert.notEqual(desk.gender, v.legs[leg]!.speakerGender, "반대 성별(판단값)");
      }
    }
  }
  const capture = captureTokenRequest();
  try {
    const provider = new GeminiRealtimeProvider("test-key");
    const handoff = buildRelayHandoff({ variant: CARD_DELIVERY, fromLegIndex: 0, maskedMessages: [{ role: "user", textMasked: "확인해 볼게요" }] });
    await provider.createCallCredentials({
      sessionId: "sess-desk",
      scenarioId: CARD_DELIVERY.scenarioId,
      voiceId: "",
      difficultyLevel: "advanced",
      flowVariantId: CARD_DELIVERY.variantId,
      relayLeg: { legIndex: 0, handoff, verifyDesk: true },
    });
    const body = capture.bodies()[0]!;
    const voice = /"voiceName":"([^"]+)"/.exec(body)?.[1];
    assert.equal(voice, relayDeskVoice(CARD_DELIVERY, CARD_DELIVERY.scenarioId, "sess-desk", 0).voiceName);
    assert.ok(!body.includes(LIVE_TOOL_TRANSFER_CALL), "창구 토큰에는 교대 도구가 없다");
    assert.ok(body.includes("통화 인계"), "leg 0에서도 인계 블록");
  } finally {
    capture.restore();
  }
  const relay = codeOnly(readSrc("realtime/startRelayLeg.ts"));
  assert.ok(relay.includes('reason: "verify-not-placed"'), "창구 연결(placed) 전에는 거부");
  assert.ok(relay.includes("greetingTrigger: verifyItem.reconnectInstruction"), "첫마디 = 카탈로그 재연결 지시(서버 소유)");
  assert.ok(relay.includes('typeof ctx.session.relay?.verifyDeskTurnIndex === "number"'), "멱등 표지");
});
