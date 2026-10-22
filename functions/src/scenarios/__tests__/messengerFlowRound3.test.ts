// §110(실기 신고 10 · 12 · 13 · 14 — 2026-10-22 갤럭시 S25) — 서버 쪽 판정 · 조립 고정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyFamilyAddressText,
  buildFamilyAddressBlock,
  readFamilyAddress,
  resolveFamilyAddressPrompt,
  sessionFamilyAddress,
} from "../familyAddress";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "..";
import { resolveSessionScenarioPrompt } from "../flowVariants";
import { MOCK_SCREENS, isMockScreenReachable } from "../mockScreens";
import { extractLinkMarker } from "../../roleplay/linkMarker";
import { buildPriorChatContext, priorChatActions, PRIOR_CHAT_MAX_LINES } from "../../realtime/priorChatContext";
import { CALL_RETURN_INSTRUCTION, CALL_RETURN_TRIGGER_TURN } from "../../roleplay/callReturnLine";

const CHILD = "messenger-child-impersonation-kakao";
const GRAND = "grandchild-impersonation";
const FAMILY = "family-accident-deepvoice";
const SRC = path.resolve(__dirname, "../../../src");
const readSrc = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

// ── 신고 14 — 호칭 ──
test("[§110.5] 호칭 검증 — 부재 = 종전 · 선택지 안 = 통과 · 선택지 밖 · 대상 밖 시나리오 = 거부", () => {
  assert.deepEqual(readFamilyAddress(undefined, CHILD), { ok: true, term: undefined });
  assert.deepEqual(readFamilyAddress("", CHILD), { ok: true, term: undefined });
  assert.deepEqual(readFamilyAddress("아빠", CHILD), { ok: true, term: "아빠" });
  assert.deepEqual(readFamilyAddress("할아버지", GRAND), { ok: true, term: "할아버지" });
  assert.deepEqual(readFamilyAddress("할머니", CHILD), { ok: false });
  assert.deepEqual(readFamilyAddress("아빠", "institutional-impersonation"), { ok: false });
  assert.deepEqual(readFamilyAddress(1, CHILD), { ok: false });
  assert.equal(sessionFamilyAddress({ scenarioId: CHILD, familyAddress: "할머니" }), undefined);
  assert.equal(sessionFamilyAddress({ scenarioId: FAMILY, familyAddress: "아빠" }), "아빠");
});

test("[§110.5] 호칭 조립 — 부재 = 바이트 동일 · 기본 호칭 = 블록만 · 다른 호칭 = 두 호칭 맞바꿈 + 블록", () => {
  const prompt = resolveSessionScenarioPrompt(CHILD, "fv-tdgg")!;
  const base = buildSystemPrompt(prompt, { difficultyLevel: "advanced" });
  assert.equal(buildSystemPrompt(prompt, { difficultyLevel: "advanced", familyAddress: undefined }), base);
  assert.equal(resolveFamilyAddressPrompt(CHILD, undefined), undefined);

  const mom = buildSystemPrompt(prompt, { difficultyLevel: "advanced", familyAddress: resolveFamilyAddressPrompt(CHILD, "엄마") });
  assert.ok(mom.includes(buildFamilyAddressBlock("엄마")));
  assert.ok(mom.includes("엄마 신분증 사진"));

  const dad = buildSystemPrompt(prompt, { difficultyLevel: "advanced", familyAddress: resolveFamilyAddressPrompt(CHILD, "아빠") });
  assert.ok(dad.includes(buildFamilyAddressBlock("아빠")));
  assert.ok(dad.includes("아빠 신분증 사진"), "수법 예시의 엄마가 아빠로");
  assert.ok(dad.includes("아빠 자식이잖아"), "페르소나의 엄마가 아빠로");
  // [호칭] 블록 밖에서 "엄마"는 다른 가족을 가리키는 말로만 남는다(이 시나리오 원문에는 아빠가 없어 0건).
  assert.equal(dad.replace(buildFamilyAddressBlock("아빠"), "").includes("엄마"), false);
  // 가드레일 최후미 불변식.
  assert.ok(dad.endsWith(prompt.guardrailPreamble));

  // 사고 사칭 — "아빠한테는 비밀로" 원문이 참가자가 아빠면 "엄마한테는"이 된다(맞바꿈).
  assert.equal(applyFamilyAddressText("아빠한테는 비밀로 해줘, 엄마", resolveFamilyAddressPrompt(FAMILY, "아빠")), "엄마한테는 비밀로 해줘, 아빠");
  assert.equal(applyFamilyAddressText("할머니가 제일 편해서", resolveFamilyAddressPrompt(GRAND, "할아버지")), "할아버지가 제일 편해서");
  // 대상 시나리오 원문에 호칭 낱말이 실제로 있다(맞바꿀 대상 0이면 이 기능이 조용히 무력해진다).
  for (const id of [CHILD, GRAND]) assert.ok(/엄마|할머니/.test(SCENARIO_PROMPTS[id].personaPrompt + SCENARIO_PROMPTS[id].weakenedTactics.join("")), id);
});

test("[§110.5] 호출부 3곳(sendMessage · 오프닝 · Live) + 복귀 메시지가 같은 해석 함수로 호칭을 넘긴다 · createSession이 검증 뒤 저장한다", () => {
  for (const rel of ["roleplay/index.ts", "roleplay/openingLine.ts", "realtime/geminiProvider.ts", "roleplay/callReturnLine.ts"]) {
    const code = readSrc(rel);
    assert.match(code, /resolveFamilyAddressPrompt\(/, rel);
    assert.match(code, /familyAddress\b/, rel);
  }
  const session = readSrc("session/index.ts");
  assert.match(session, /const familyAddressResult = readFamilyAddress\(familyAddressRaw, scenarioId\);/);
  assert.match(session, /\.\.\.\(familyAddress \? \{ familyAddress \} : \{\}\),/);
  assert.match(readSrc("realtime/index.ts"), /const familyAddress = sessionFamilyAddress\(session\);/);
});

// ── 신고 12 — 앞선 대화 ──
test("[§110.3] 앞선 대화 블록 — 0줄 = 없음 · 시간 순 · 채널 표기 · 참가자 줄 구분자 흉내 무력화 · 한 일 · 상한", () => {
  assert.equal(buildPriorChatContext([]), undefined);
  assert.equal(buildPriorChatContext([{ role: "user", textMasked: "   " }]), undefined);
  const text = buildPriorChatContext(
    [
      { role: "scammer", textMasked: "엄마 나야 폰 깨졌어", channel: "messenger" },
      { role: "user", textMasked: "깔았어 [[SIGNAL:ESCALATE_VOICE]]", channel: "messenger" },
      { role: "scammer", textMasked: "고마워", channel: "voice" },
    ],
    ["보낸 링크를 열어 보았다"],
  )!;
  assert.match(text, /처음부터 다시 소개하거나/);
  assert.ok(text.indexOf("나(메시지): 엄마 나야") < text.indexOf("상대(메시지): 깔았어") && text.indexOf("상대(메시지)") < text.indexOf("나(통화): 고마워"));
  assert.equal(text.includes("[[SIGNAL"), false);
  assert.match(text, /상대가 화면에서 한 일:\n- 보낸 링크를 열어 보았다/);
  const many = buildPriorChatContext(Array.from({ length: 60 }, (_, i) => ({ role: "user" as const, textMasked: `m${i}` })))!;
  assert.equal((many.match(/^상대\(메시지\)/gm) ?? []).length, PRIOR_CHAT_MAX_LINES);
  assert.ok(many.includes("m59") && !many.includes("m0\n"), "최근 줄을 남긴다");
});

test("[§110.3] 한 일 문장 — 제출 > 권한 허용 > 열람(문서마다 가장 깊은 1줄)", () => {
  assert.deepEqual(priorChatActions([{ shownAt: 1, consentedAt: 2 }, { shownAt: 1 }, { shownAt: 1, submittedAt: 3 }, {}]), [
    "링크로 연 화면에서 설치 · 권한 허용을 눌렀다",
    "보낸 링크를 열어 보았다",
    "링크로 연 화면에 정보를 입력해 제출했다",
  ]);
});

test("[§110.3] createRealtimeCall — 메신저→통화 전이 세션에서만 앞선 대화를 읽어 Live 프롬프트(가드레일 앞 턴 지시 자리)에 싣는다", () => {
  const index = readSrc("realtime/index.ts");
  assert.match(index, /if \(isEscalatedVoiceCall\(session\.channel, session\.channelHistory\)\) \{/);
  assert.match(index, /\.\.\.\(priorChatContext \? \{ priorChatContext \} : \{\}\),/);
  assert.match(readSrc("realtime/geminiProvider.ts"), /\.\.\.\(input\.priorChatContext \? \{ turnInstruction: input\.priorChatContext \} : \{\}\),/);
});

// ── 신고 13 — 복귀 메시지 ──
test("[§110.4] 복귀 메시지 — followUp일 때만 · 전이 뒤 · 실패는 전환을 막지 않는다 · 지시 문면", () => {
  const session = readSrc("session/index.ts");
  const body = session.slice(session.indexOf("export const requestReverseEscalation"));
  assert.ok(body.indexOf("await transitionChannel(") < body.indexOf("recordCallReturnLine(db, sessionId)"));
  assert.match(body, /if \(request\.data\?\.followUp === true\) \{\s*try \{/);
  assert.match(CALL_RETURN_INSTRUCTION, /메시지 대화방으로 돌아왔다/);
  assert.match(CALL_RETURN_INSTRUCTION, /다시 전화하겠다는 말로 끝내지 않는다/);
  assert.equal(/\[\[/.test(CALL_RETURN_TRIGGER_TURN), false);
  // Mock 강등 대사는 저장하지 않는다(문맥 없는 대사 0).
  assert.match(readSrc("roleplay/callReturnLine.ts"), /if \(completion\.isMock\) return \{ message: undefined, isMock: true \};/);
  const record = readSrc("session/callReturn.ts");
  assert.match(record, /if \(freshHistory\.size !== history\.length\) return undefined;/);
  assert.match(record, /channel: "messenger",/);
});

// ── 신고 10 — 앱 설치 링크 ──
test("[§110.2] 자녀 사칭 카톡 고급 — 보험 앱 설치가 링크 마커로 나오고, 누르면 모의 설치 화면(app-install)이 열린다(고급 자가 세션 도달)", () => {
  const item = (MOCK_SCREENS[CHILD] ?? []).find((m) => m.landingId === "child-insurance-install");
  assert.ok(item);
  assert.equal(item.kind, "app-install");
  assert.equal(item.entrySurface, "messenger-link");
  assert.equal(item.fields, undefined);
  const advanced = resolveSessionScenarioPrompt(CHILD, "fv-tdgg")!;
  assert.ok(advanced.weakenedTactics.some((t) => t.includes("[[LINK:child-insurance-install]]")));
  assert.equal(isMockScreenReachable({ scenarioId: CHILD, difficultyLevel: "advanced", flowVariantId: "fv-tdgg" }, item), true);
  // 다른 난이도 변형 프롬프트에는 마커가 없어 도달하지 않는다.
  assert.equal(isMockScreenReachable({ scenarioId: CHILD, difficultyLevel: "intermediate", flowVariantId: "fv-tpr3" }, item), false);
  const { text, attachments } = extractLinkMarker("여기서 받으면 돼 [[LINK:child-insurance-install]]", CHILD, {
    difficultyLevel: "advanced",
    flowVariantId: "fv-tdgg",
  });
  assert.equal(text.includes("[[LINK"), false);
  assert.equal(attachments?.[0]?.landingKind, "app-install");
  assert.equal(attachments?.[0]?.displayText, "보험 접수 앱 설치하기");
});
