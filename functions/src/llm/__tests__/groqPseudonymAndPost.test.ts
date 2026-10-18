// Groq 3차 예비(§74) — ① 가명 처리 판정표(piiPseudonymizer.ts) ② 대사 후처리가 Groq 출력에도 똑같이 걸린다.
//
// ②의 근거: sendMessage는 공급자와 무관하게 `completion.text` 하나에 같은 손질 순서를 건다
// (링크 마커 → 신호 마커 → 실존 금융회사명 치환 → 3문장 상한 → finalize — roleplay/index.ts).
// 그래서 여기서는 (a) 그 순서를 Groq형 출력(프로브 실측 형태: 5문장·실존 은행명)에 그대로 적용해 결과를 단언하고,
// (b) 호출부에 공급자별 분기가 없다는 것을 소스 스캔으로 고정한다. (c) 페이로드 가상값 규칙은 시스템 프롬프트
// 문면이라, Groq 요청의 system 메시지가 buildSystemPrompt 결과를 바이트 그대로 싣는지로 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { logger } from "firebase-functions";
import { pseudonymizeForGroq } from "../piiPseudonymizer";
import { GroqLlmClient } from "../groqClient";
import { replaceRealFinancialNames } from "../../guardrails/realFinancialNames";
import { countSentences, limitReplySentences, MAX_SCAMMER_REPLY_SENTENCES } from "../../roleplay/replyLength";
import { finalizeScammerReplyText } from "../../roleplay/scammerReplyMasking";
import { extractLinkMarker } from "../../roleplay/linkMarker";
import { extractEscalationSignal } from "../../roleplay/escalationSignal";
import { buildSystemPrompt, wrapUserInputAsData } from "../../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import type { LlmMessage } from "../types";

const user = (text: string): LlmMessage => ({ role: "user", content: wrapUserInputAsData(text) });
const scammer = (text: string): LlmMessage => ({ role: "assistant", content: text });
const joined = (messages: LlmMessage[]) => messages.map((m) => m.content).join("\n");

// ── ① 가명 처리 ──────────────────────────────────────────────────────────────────
test("① 이름 — 단서(이름은/성함은) 뒤 이름을 가명으로, 사기범이 되부른 이름도 같은 가명으로", () => {
  const r = pseudonymizeForGroq([user("제 이름은 김철수입니다"), scammer("김철수님 맞으시죠? 확인하겠습니다.")]);
  assert.ok(!joined(r.messages).includes("김철수"));
  assert.ok(r.messages[1].content.startsWith("정하윤님"), "사기범 턴의 이름도 같은 가명");
  assert.equal(r.nameCount, 1);
  assert.equal(r.restore("정하윤님, 지금 바로 하셔야 합니다."), "김철수님, 지금 바로 하셔야 합니다.");
});

test("① 이름 — 직전 사기범 턴이 성함을 물었고 답이 이름으로 시작하면 가명", () => {
  const r = pseudonymizeForGroq([scammer("성함이 어떻게 되십니까?"), user("박영희요")]);
  assert.ok(!joined(r.messages).includes("박영희"));
  assert.equal(r.nameCount, 1);
});

test("① 이름 — 흔한 말·단서 없는 발화는 바꾸지 않는다(뜻이 바뀌지 않게)", () => {
  const r = pseudonymizeForGroq([scammer("성함이 어떻게 되십니까?"), user("아니요 왜요?"), user("저는 학생입니다")]);
  assert.equal(r.nameCount, 0);
  assert.ok(r.messages[1].content.includes("아니요 왜요?"));
  assert.ok(r.messages[2].content.includes("저는 학생입니다"));
});

test("① 이름 — 리뷰 M1 음성 사례: 질문·일상어는 이름으로 잡지 않고 사기범 턴 어휘도 바뀌지 않는다", () => {
  const cueCases = [
    "성함이 어떻게 되세요?",
    "이름이 뭐예요?",
    "이름이 뭔데요",
    "이름이 뭐라고요",
    "이름이 뭡니까",
    "성함 확인 좀 할게요",
    "이름 없어요",
    "성함은 어떻게 되세요?",
    "이름은 왜요?",
  ];
  for (const text of cueCases) {
    const r = pseudonymizeForGroq([user(text), scammer("어떻게 도와드릴까요? 지금 바로 확인하겠습니다.")]);
    assert.equal(r.nameCount, 0, text);
    assert.equal(r.messages[1].content, "어떻게 도와드릴까요? 지금 바로 확인하겠습니다.", `${text}: 사기범 턴 불변`);
  }
  const leadingCases = ["은행 직원이세요?", "금감원이요", "정말요", "지금 바빠요", "그게 왜요", "진짜요?"];
  for (const text of leadingCases) {
    const r = pseudonymizeForGroq([scammer("성함이 어떻게 되십니까?"), user(text)]);
    assert.equal(r.nameCount, 0, text);
  }
});

test("① 생년월일 — 같은 턴의 두 번째 6자리(인증번호)는 날짜로 바꾸지 않는다(리뷰 m3)", () => {
  const r = pseudonymizeForGroq([scammer("생년월일과 인증번호를 불러 주세요."), user("850708 이고 인증번호는 482913")]);
  assert.equal(r.birthdateCount, 1);
  assert.ok(r.messages[1].content.includes("482913"));
  assert.ok(!r.messages[1].content.includes("850708"));
});

test("① 생년월일 — 날짜 형식 3종과 단서 있는 6자리를 가명으로, 응답은 원문으로 복원", () => {
  const r = pseudonymizeForGroq([
    user("1990년 1월 2일이에요"),
    user("90년 3월 4일생"),
    user("1985.07.08 입니다"),
    scammer("생년월일 앞자리 여섯 자리 불러 주세요."),
    user("850708"),
  ]);
  const all = joined(r.messages);
  for (const raw of ["1990년 1월 2일", "90년 3월 4일", "1985.07.08", "850708"]) assert.ok(!all.includes(raw), raw);
  assert.equal(r.birthdateCount, 4);
  assert.equal(r.restore("1971년 3월 14일 맞으시죠?"), "1990년 1월 2일 맞으시죠?");
});

test("① 6자리 숫자는 생년월일 단서가 없으면 건드리지 않는다(인증번호 등)", () => {
  const r = pseudonymizeForGroq([scammer("문자로 간 인증번호 불러 주세요."), user("482913")]);
  assert.equal(r.birthdateCount, 0);
  assert.ok(r.messages[1].content.includes("482913"));
});

test("① 전화·주민번호·계좌는 사용자 턴에서 maskPII 토큰으로, 사기범 턴의 가상 계좌는 그대로", () => {
  const r = pseudonymizeForGroq([
    user("010-1234-5678 이고 주민번호는 900101-1234567, 계좌 110-123-456789"),
    scammer("OO은행 948-2716-5093-27로 보내세요."),
  ]);
  assert.ok(r.messages[0].content.includes("[전화]"));
  assert.ok(r.messages[0].content.includes("[주민번호]"));
  assert.ok(r.messages[0].content.includes("[계좌]"));
  assert.ok(r.messages[1].content.includes("948-2716-5093-27"), "사기범 가상 계좌가 [계좌]로 바뀌면 모델이 토큰을 읊는다(2026-09-06 사고)");
});

test("① 입력 배열을 바꾸지 않는다(호출부 이력 불변)", () => {
  const messages = [user("제 이름은 김철수입니다")];
  const before = JSON.stringify(messages);
  pseudonymizeForGroq(messages);
  assert.equal(JSON.stringify(messages), before);
});

// ── ② 후처리 동일 적용 ────────────────────────────────────────────────────────────
/** roleplay/index.ts sendMessage의 손질 순서 그대로(공급자 무관). */
function shapeLikeSendMessage(text: string, scenarioId: string): string {
  const { text: linkFree } = extractLinkMarker(text, scenarioId);
  const { text: signalFree } = extractEscalationSignal(linkFree);
  const { text: realNameFree } = replaceRealFinancialNames(signalFree);
  return finalizeScammerReplyText(limitReplySentences(realNameFree).text);
}

test("② Groq형 출력(프로브 실측 5문장)에도 3문장 상한이 걸린다", () => {
  // 2026-10-18 Groq 실호출 샘플 #1 원문(§74.2) — 5문장.
  const groqSample =
    "네, 안녕하십니까. 저는 검찰청 수사팀 담당관입니다. 현재 귀하의 계좌가 최근 불법 자금 세탁 관련 수사 대상에 포함된 것으로 확인되었습니다. 절차상 바로 확인이 필요하니, 성함과 생년월일을 말씀해 주시겠습니까? 지금 바로 답변해 주셔야 진행됩니다.";
  assert.equal(countSentences(groqSample), 5);
  const shaped = shapeLikeSendMessage(groqSample, "institutional-impersonation");
  assert.equal(countSentences(shaped), MAX_SCAMMER_REPLY_SENTENCES);
});

test("② Groq 출력의 실존 은행명은 OO은행으로 치환된다(#277·#289)", () => {
  const shaped = shapeLikeSendMessage("국민은행 948-2716-5093-27로 지금 보내세요.", "institutional-impersonation");
  assert.ok(!shaped.includes("국민은행"));
  assert.ok(shaped.includes("OO은행"));
  assert.ok(shaped.includes("948-2716-5093-27"), "숫자는 그대로");
});

test("② 호출부(sendMessage)에 공급자별 분기가 없다 — 손질은 completion.text 하나에 건다", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8");
  assert.match(src, /extractLinkMarker\(\s*completion\.text,/);
  assert.doesNotMatch(src, /servedBy\s*===|providerName\s*===\s*"groq"/, "Groq 응답만 다르게 손질하는 분기가 생기면 안 된다");
});

test("② 페이로드 가상값 규칙 — Groq 요청의 system 메시지가 buildSystemPrompt 결과를 그대로 싣는다", async () => {
  const systemPrompt = buildSystemPrompt(SCENARIO_PROMPTS["institutional-impersonation"], { difficultyLevel: "advanced" });
  assert.match(systemPrompt, /페이로드는 가상값만 쓴다/);
  assert.match(systemPrompt, /은행 이름은 "OO은행"이라고 그대로 말한다/);
  let sent = "";
  const original = { info: logger.info };
  (logger as { info: unknown }).info = () => undefined;
  try {
    await new GroqLlmClient("k", async (_u, init) => {
      sent = String(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "네." } }] }), { status: 200 });
    }).complete({ systemPrompt, messages: [user("여보세요?")] });
  } finally {
    (logger as { info: unknown }).info = original.info;
  }
  assert.equal(JSON.parse(sent).messages[0].content, systemPrompt);
});
