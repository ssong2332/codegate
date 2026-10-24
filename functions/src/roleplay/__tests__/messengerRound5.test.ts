// §131(2026-10-24 메인 세션 라이브 확인 — 자녀 사칭 카톡 고급 · 텍스트 폴백 · 빌드 J39YKqt8FXuO5H3siBBQo) — 재작업 2건.
// (1) 신분증 사진 순간의 수법 라벨이 비었다(숨김 폴백) (2) 통화 불가 핑계 직후 전화 · 사기범이 끊은 통화를 "끊겼다"고 둘러댐.
// ⛔ 라이브 호출 0건. ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { analyzeConversation, resolveDemandFallbackTactic, type AnalysisMessage } from "../../report/analyzeConversation";
import { resolveTacticCategory } from "../../report/tacticCategory";
import { FLOW_VARIANTS, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { extractTacticLabel } from "../../scenarios/tacticFlavor";
import {
  CALL_AFTER_EXCUSE_INSTRUCTION,
  CALL_EXCUSE_LOOKBACK,
  saidCallUnavailableRecently,
} from "../callAnnouncement";
import {
  CALL_RETURN_AFTER_SCAMMER_HANGUP_INSTRUCTION,
  CALL_RETURN_AFTER_SCAMMER_HANGUP_TRIGGER_TURN,
  stripSelfDroppedCallSentences,
} from "../callReturnLine";
import { MESSENGER_OPENING_TURN_INSTRUCTION, OPENING_TURN_INSTRUCTION, stripPhoneGreeting } from "../openingLine";

const SRC = path.resolve(__dirname, "../../../src");
const readSrc = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
/** 서버 숨김 폴백 라벨(화면 `reportSummaryCopy.ts` A1 — 그리지 않는다). */
const FALLBACK_TACTIC_LABEL = "약화된 사기 수법";
const tactics = resolveSessionScenarioPrompt("messenger-child-impersonation-kakao", "fv-tdgg")?.weakenedTactics ?? [];

function conversation(lines: [AnalysisMessage["role"], string, Partial<AnalysisMessage>?][]): AnalysisMessage[] {
  return lines.map(([role, textMasked, extra], i) => ({ role, textMasked, turnIndex: i, createdAtMs: i * 10_000, ...(extra ?? {}) }));
}

const photoMoment = (demand: string, weakened: readonly string[] = tactics) => {
  const result = analyzeConversation(
    conversation([
      ["scammer", "아빠 나야 ㅠㅠ 폰 액정이 깨져서 친구 폰으로 톡해"],
      ["user", "무슨 일이야?"],
      ["scammer", demand],
      ["user", "", { photo: true, channel: "messenger" }],
    ]),
    0,
    [...weakened],
  );
  return { moment: result.deceivedMoments.find((m) => m.turnIndex === 3), tacticsUsed: result.tacticsUsed };
};

test("[§131(1)] 사진 순간 — 보내기만 요구한 어형(찍어 없음)도 '신원정보 직접 요구' 라벨 · 수법 목록에도 오른다", () => {
  for (const demand of ["아빠 신분증 사진 한 장만 보내줘", "보험 접수하게 신분증 좀 올려 줄 수 있어?"]) {
    const { moment, tacticsUsed } = photoMoment(demand);
    assert.ok(moment, demand);
    assert.equal(moment.tactic, "신원정보 직접 요구", demand);
    assert.ok(tacticsUsed.includes("신원정보 직접 요구"), demand);
  }
});

test("[§131(1) 3행] 요구 대사가 어형 표에도 안 걸리게 바꿔 말해도 사진을 보냈으면 세션 목록의 개인정보 요구 라벨", () => {
  const { moment } = photoMoment("보험 처리하려면 아빠 신분증이 꼭 있어야 한대ㅠㅠ 사진으로 부탁해");
  assert.equal(moment?.tactic, "신원정보 직접 요구");
  // 세션 목록에 개인정보 요구 범주가 없으면 새 라벨을 만들지 않는다(종전 폴백).
  const noInfo = tactics.filter((t) => resolveTacticCategory(extractTacticLabel(t)) !== "personal_info_demand");
  assert.equal(photoMoment("보험 처리하려면 아빠 신분증이 꼭 있어야 한대ㅠㅠ 사진으로 부탁해", noInfo).moment?.tactic, FALLBACK_TACTIC_LABEL);
});

test("[§131(1) 오탐] 5b행은 신분증 + 보내기 요구에만 — 받았다는 말 · 사진 일반 · 돈 송금은 열지 않는다", () => {
  assert.equal(resolveDemandFallbackTactic("사진 잘 받았어 고마워", tactics), undefined);
  assert.equal(resolveDemandFallbackTactic("신분증 사진 보내줘서 고마워", tactics), undefined);
  assert.equal(resolveDemandFallbackTactic("50만원만 보내줘", tactics), "송금 직접 요구");
});

test("[§131(1) 점검] 사진 · 신분증을 요구하는 전 변형 — 바꿔 말한 요구 뒤 사진 순간의 라벨이 숨김 폴백이 아니다", () => {
  const photoVariants = FLOW_VARIANTS.filter((v) => v.tactics.some((t) => /신분증|사진/.test(t)));
  assert.ok(photoVariants.length > 0);
  const blank = photoVariants
    .filter((v) => photoMoment("그거 사진으로 하나만 부탁해", v.tactics).moment?.tactic === FALLBACK_TACTIC_LABEL)
    .map((v) => `${v.scenarioId}:${v.variantId}`);
  assert.deepEqual(blank, []);
  // 대상이 다른 사진 — 손주 사칭은 상품권 뒷면 사진(송금 대체) · 자녀 사칭은 신분증 사진(개인정보).
  const grandchild = FLOW_VARIANTS.find((v) => v.variantId === "fv-cx5y")!;
  assert.equal(photoMoment("상품권 산 거 뒷면 사진으로 하나만 부탁해요", grandchild.tactics).moment?.tactic, "상품권 대체 요구");
  assert.equal(photoMoment("보험 때문에 신분증 그거 하나만 부탁해").moment?.tactic, "신원정보 직접 요구");
});

test("[§131(2) 복귀] 사기범이 끊은 뒤 복귀 지시 · 트리거 — 저절로 끊긴 것처럼 둘러대라는 문면 0", () => {
  assert.equal(/전화 상태가 안 좋았다거나/.test(CALL_RETURN_AFTER_SCAMMER_HANGUP_INSTRUCTION), false);
  assert.match(CALL_RETURN_AFTER_SCAMMER_HANGUP_INSTRUCTION, /네가 직접 끊은 것이다/);
  assert.match(CALL_RETURN_AFTER_SCAMMER_HANGUP_INSTRUCTION, /둘러대지 않는다/);
  assert.equal(/끊겼/.test(CALL_RETURN_AFTER_SCAMMER_HANGUP_TRIGGER_TURN), false);
  const src = readSrc("roleplay/callReturnLine.ts");
  assert.match(src, /content: by === "scammer" \? CALL_RETURN_AFTER_SCAMMER_HANGUP_TRIGGER_TURN : CALL_RETURN_TRIGGER_TURN/);
  assert.match(src, /const text = stripSelfDroppedCallSentences\(finalizeScammerReplyText\(shaped\), by\)\.trim\(\);/);
});

test("[§131(2) 복귀 손질 표] 사기범 끊기면 '끊겼다 · 전화 상태 안 좋다' 문장만 지운다 · 참가자 끊기는 무변경 · 다 지워지면 빈 문자열", () => {
  const live = "아까 통화가 끊겼어ㅠㅠ 전화 상태가 안 좋았나 봐. 톡으로 계속하자, 보증금 50만원만 더 보내줘.";
  assert.equal(stripSelfDroppedCallSentences(live, "scammer"), "톡으로 계속하자, 보증금 50만원만 더 보내줘.");
  assert.equal(stripSelfDroppedCallSentences("급하게 끊어서 미안해. 친구 폰이라 오래 못 써.", "scammer"), "급하게 끊어서 미안해. 친구 폰이라 오래 못 써.");
  assert.equal(stripSelfDroppedCallSentences(live, "user"), live);
  assert.equal(stripSelfDroppedCallSentences("통화 연결이 안 좋았나 봐.", "scammer"), "");
});

test("[§131(2) 판정표 K] 직전 사기범 메시지의 통화 불가 핑계 → 전화로 넘어가면 이유를 함께 · 범위 밖이면 없음", () => {
  assert.equal(saidCallUnavailableRecently(["폰 액정이 깨져서 통화가 안 돼, 톡으로만 말해줘"]), true);
  assert.equal(saidCallUnavailableRecently(["보증금 50만원만 더 보내줘"]), false);
  const old = ["지금은 통화가 안 돼", ...Array.from({ length: CALL_EXCUSE_LOOKBACK }, () => "아빠 빨리 보내줘")];
  assert.equal(saidCallUnavailableRecently(old), false, "되돌아보는 범위 밖");
  assert.match(CALL_AFTER_EXCUSE_INSTRUCTION, /걸 수 있게 된 이유/);
  assert.equal(/["“]/.test(CALL_AFTER_EXCUSE_INSTRUCTION), false, "따옴표 대사 예시 0");
  const index = readSrc("roleplay/index.ts");
  assert.match(
    index,
    /session\.channel === "messenger" &&\n\s*turnChoice === "none" &&\n\s*saidCallUnavailableRecently\(storedHistory\.filter\(\(m\) => m\.role === "scammer"\)\.map\(\(m\) => m\.textMasked\)\)\n\s*\? CALL_AFTER_EXCUSE_INSTRUCTION/,
  );
  assert.match(index, /repeatBreakInstruction\(repeatBreakKind\), callAfterExcuseInstruction\]/);
});

test("[§131(4) 판정표 O] 메신저 첫 메시지 — 전용 지시(전화 인사말 금지) · 맨 앞 '여보세요' 삭제 · 통화 시나리오 지시는 종전 그대로", () => {
  assert.match(MESSENGER_OPENING_TURN_INSTRUCTION, /메시지 대화의 첫 메시지다/);
  assert.ok(MESSENGER_OPENING_TURN_INSTRUCTION.includes("전화 인사말(여보세요 등)로 시작하지 않는다"));
  assert.ok(OPENING_TURN_INSTRUCTION.startsWith("[오프닝 지침] 지금이 이 통화/대화의 첫 마디다."), "통화 시나리오 지시 종전 그대로");
  assert.equal(stripPhoneGreeting("여보세요? 엄마, 나야. 나 지금 친구 폰으로 연락하는 거야."), "엄마, 나야. 나 지금 친구 폰으로 연락하는 거야.");
  assert.equal(stripPhoneGreeting("여보세요, 엄마 나야"), "엄마 나야");
  assert.equal(stripPhoneGreeting("엄마 나야. 여보세요 하고 전화하려다 톡해"), "엄마 나야. 여보세요 하고 전화하려다 톡해", "맨 앞만");
  assert.equal(stripPhoneGreeting("여보세요?"), "여보세요?", "지우면 빈 메시지면 원문");
  const src = readSrc("roleplay/openingLine.ts");
  assert.ok(src.includes('const isMessengerOpening = PUBLIC_SCENARIOS[scenarioId]?.channel === "messenger";'));
  assert.ok(src.includes("turnInstruction: isMessengerOpening ? MESSENGER_OPENING_TURN_INSTRUCTION : OPENING_TURN_INSTRUCTION,"));
  assert.ok(src.includes("const lengthLimited = limitReplySentences(isMessengerOpening ? stripPhoneGreeting(realNameFreeText) : realNameFreeText);"));
});
