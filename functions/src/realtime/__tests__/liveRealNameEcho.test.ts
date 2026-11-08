// 2026-11-08(라이브 재시험 9 · 기관 사칭 고급 · Gemini Live) — 참가자 "거래 은행은 새솔은행이고요"(가상 은행)가 음성 인식에서 실존 상호금융 이름
// "새마을금고"로 바뀌었고, 사기범이 "말씀하신 새마을금고 계좌의 잔액 상황은 확인했습니다"로 그 실존 이름을 따라 말했다(00:58 · 01:08).
// 판정표(정본 = `realtime/liveTranscriptGuard.ts` 머리 주석 · 사용자 결정 2026-11-08 S2c 안 B):
// | 행 | If | Then |
// |---|---|---|
// | P(L4) | Live 프롬프트 | 상대가 말한 은행 · 카드사 · 회사 이름을 되풀이하지 않고 이름 없이 받는다(소리의 유일한 층) |
// | S2b | 사기범 줄의 실존 은행 · 카드사 ∧ 앞선(같은 flush 포함) 참가자 줄에 같은 이름(오인식 포함) | "말씀하신 은행/카드사" |
// | S2c | 사기범 줄의 실존 은행 · 카드사 ∧ 참가자가 말한 적 없음 | "OO은행/OO카드" |
// | S3 | 검찰 · 금융감독원 등 사칭 대상 · 가상 은행명 | 원문 그대로 |
// | U2 | 참가자 줄의 실존 이름(오인식 포함) | 원문 그대로(기록) |
// 한계: 이미 소리로 나간 대사는 되돌리지 못한다 — 이 시험은 자막 · 저장 전사(= 리포트 원천) · 재연결 주입만 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { guardLiveScammerLine, guardLiveUserLine } from "../liveTranscriptGuard";
import { prepareTranscriptTurns } from "../transcriptRequest";
import { REAL_FINANCIAL_NAME_RULES } from "../../guardrails/realFinancialNames";
import { REAL_COMPANY_NAME_RULES, compileCompanyRule } from "../../guardrails/realCompanyNames";
import {
  buildLiveCallSafetyBlock,
  buildSystemPrompt,
  LIVE_CALL_SAFETY_HEAD,
  LIVE_CALL_USER_NAME_RULE,
} from "../../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { asksIdentityCheck } from "../../roleplay/personaAuthority";

/** 문장에 남은 실존 은행 · 카드사 · 회사 이름(규칙 라벨). */
function realNamesIn(text: string): string[] {
  const hits: string[] = [];
  for (const rule of REAL_FINANCIAL_NAME_RULES) {
    if (new RegExp(rule.pattern.source, rule.pattern.flags.replace("g", "")).test(text)) hits.push(rule.label);
  }
  for (const rule of REAL_COMPANY_NAME_RULES) {
    const pattern = compileCompanyRule(rule);
    pattern.lastIndex = 0;
    if (pattern.test(text)) hits.push(rule.label);
  }
  return hits;
}

const ASR_USER_LINE = "거래 은행은 새마을금고고요, 잔액은 천이백만 원 정도 있어요.";
const ECHO_LINE = "네, 말씀하신 새마을금고 계좌의 잔액 상황은 확인했습니다.";

test("[재시험 9 재현] 오인식된 참가자 줄 뒤 사기범 자막 · 전사에 실존 이름 0 — \"말씀하신 은행\"으로", () => {
  assert.deepEqual(realNamesIn(ECHO_LINE), ["새마을금고"], "전제 — 재현 문장에 실존 이름이 있다");
  const guarded = guardLiveScammerLine(ECHO_LINE, [ASR_USER_LINE]);
  assert.equal(guarded, "네, 말씀하신 은행 계좌의 잔액 상황은 확인했습니다.");
  assert.deepEqual(realNamesIn(guarded), []);
  // 재시험 9의 두 번째 줄(01:08)도 같은 판정이다.
  const second = guardLiveScammerLine("새마을금고 쪽 잔액이 그대로라 보호 조치가 필요합니다.", [ASR_USER_LINE, "네네."]);
  assert.equal(second, "말씀하신 은행 쪽 잔액이 그대로라 보호 조치가 필요합니다.");
});

test("S2b — 참가자가 먼저 말한 실존 은행 · 카드사는 이름 없이(같은 flush의 참가자 줄도 입력)", () => {
  assert.equal(
    guardLiveScammerLine("신한카드 결제 내역이 확인됩니다.", ["저는 신한카드 하나만 써요."]),
    "말씀하신 카드사 결제 내역이 확인됩니다.",
  );
  assert.equal(
    guardLiveScammerLine("국민은행 계좌라고 하셨죠?", ["국민은행이요."]),
    "그 은행 계좌라고 하셨죠?",
  );
});

test("S2c — 참가자가 말한 적 없는 실존 은행 · 카드사는 OO은행 · OO카드로(사용자 결정 안 B)", () => {
  assert.equal(
    guardLiveScammerLine("농협은행 948-2716-5093-27로 옮기시면 됩니다.", ["네, 어디로요?"]),
    "OO은행 948-2716-5093-27로 옮기시면 됩니다.",
  );
  assert.equal(guardLiveScammerLine("현대카드 승인 문자 받으셨죠?"), "OO카드 승인 문자 받으셨죠?");
  // 참가자가 다른 은행을 말했어도, 그 은행이 아닌 실존 이름은 S2c다.
  assert.equal(
    guardLiveScammerLine("말씀하신 국민은행 말고 우리은행으로 보내셔야 합니다.", ["국민은행이요."]),
    "말씀하신 은행 말고 OO은행으로 보내셔야 합니다.",
  );
});

test("S3 — 사칭 대상 기관 · 가상 은행명 · 이름 없는 되받기는 원문 그대로(참가자가 그 이름을 말했어도)", () => {
  const users = ["금융감독원이요? 검찰이요? 새솔은행 쓰는데요."];
  for (const line of [
    "네, 금융감독원 조사관입니다.",
    "서울중앙지검 검찰 수사관 박정우입니다.",
    "말씀하신 새솔은행 계좌는 지금 보호 대상입니다.",
    "말씀하신 은행 계좌의 잔액 상황은 확인했습니다.",
  ]) {
    assert.equal(guardLiveScammerLine(line, users), line, line);
  }
});

test("U2 — 참가자 줄의 실존 이름(오인식 포함)은 원문 그대로 기록한다", () => {
  assert.equal(guardLiveUserLine(ASR_USER_LINE, "거래하시는 은행이 어디세요?"), ASR_USER_LINE);
});

test("저장 정규화(리포트 원천) — 사기범 줄은 그 줄보다 앞선 참가자 줄만 보고, 다시 걸러도 같다(멱등)", () => {
  const prepared = prepareTranscriptTurns([
    { role: "scammer", text: "혹시 농협은행 쓰시나요?" },
    { role: "user", text: ASR_USER_LINE },
    { role: "scammer", text: ECHO_LINE },
  ]);
  const texts = prepared.map((t) => t.textMasked);
  assert.equal(texts[0], "혹시 OO은행 쓰시나요?", "참가자가 말하기 전 = S2c");
  assert.ok(texts[1]!.includes("새마을금고"), "참가자 줄 = U2 원문");
  assert.equal(texts[2], "네, 말씀하신 은행 계좌의 잔액 상황은 확인했습니다.");
  for (const t of prepared.filter((x) => x.role === "scammer")) assert.deepEqual(realNamesIn(t.textMasked), [], t.textMasked);
  const again = prepareTranscriptTurns(prepared.map((t) => ({ role: t.role, text: t.textMasked })));
  assert.deepEqual(again.map((t) => t.textMasked), texts);
});

test("[L4] Live 프롬프트 — 상대가 말한 이름을 되풀이하지 않는 줄이 모든 시나리오 Live에만 있고, 실제 이름 예시가 없다", () => {
  const block = buildLiveCallSafetyBlock(false);
  assert.ok(block.includes(LIVE_CALL_USER_NAME_RULE));
  assert.deepEqual(realNamesIn(LIVE_CALL_USER_NAME_RULE), [], "예시가 그 이름을 부르지 않게");
  assert.match(LIVE_CALL_USER_NAME_RULE, /되풀이/);
  assert.match(LIVE_CALL_USER_NAME_RULE, /말씀하신 은행/);
  assert.match(LIVE_CALL_USER_NAME_RULE, /잘못 알아들었을/);
  assert.match(LIVE_CALL_USER_NAME_RULE, /검찰 · 금융감독원/);
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const identityCheckAllowed = asksIdentityCheck(id);
    const live = buildSystemPrompt(prompt, { difficultyLevel: "advanced", identityCheckAllowed, liveSpeechStyle: true });
    assert.equal(live.split(LIVE_CALL_USER_NAME_RULE).length - 1, 1, `${id}: Live에 1회`);
    assert.ok(live.indexOf(LIVE_CALL_SAFETY_HEAD) < live.indexOf(LIVE_CALL_USER_NAME_RULE), `${id}: 블록 안`);
    const base = buildSystemPrompt(prompt, { difficultyLevel: "advanced", identityCheckAllowed });
    assert.ok(!base.includes(LIVE_CALL_USER_NAME_RULE), `${id}: 폴백 · 오프닝 · 메신저에는 없다`);
  }
});
