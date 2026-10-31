// §120(실기 신고 2026-10-23) — 사진을 보내자 1차 Claude가 훈련 메타 고지를 사기범 대사로 냈다. 이 파일은 (1) 쓸 수 없는 응답 판정의
// `training-meta` 행 · 오탐, (2) Claude 1차 → Gemini 2차 전환, (3) 사진 턴 지시 1줄 배선을 고정한다.
// ⛔ 라이브 호출 0건 — 가짜 클라이언트만 쓴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { logger } from "firebase-functions";
import { withGeminiAfterClaude } from "../claudeFallback";
import { LLM_OVERLOAD_MIN_ATTEMPT_MS, LLM_TIMEOUT_MS } from "../index";
import { judgeScammerReplyUsability } from "../replyUsability";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "../types";
import { PHOTO_TURN_INSTRUCTION, photoTurnInstruction } from "../../roleplay/photoTurn";

for (const level of ["info", "warn"] as const) (logger as unknown as Record<string, unknown>)[level] = () => undefined;

/** 라이브에서 화면에 나간 문장(스크린샷 판독). */
const LIVE_META =
  '[훈련 시뮬레이션 — 실제 신분증 사진은 받지 않습니다. 이 훈련은 여기서 종료됩니다.]\n\n이 장면은 "신분증 사진을 보내라"는 요구에 응하는 것을 피하고, 이상 징후를 알아차리는 연습을 위해 마무리합니다.';

const SCAMMER: LlmCompletionInput = { systemPrompt: "(system)", messages: [], purpose: "scammer-reply" };
const OPTS = { budgetMs: LLM_TIMEOUT_MS, minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS };

function fake(result: LlmCompletionResult, providerName: LlmClient["providerName"] = "gemini") {
  const inputs: LlmCompletionInput[] = [];
  const client: LlmClient = {
    providerName,
    async complete(input) {
      inputs.push(input);
      return result;
    },
  };
  return { client, inputs };
}

test("[§120 ①] 라이브 메타 문장과 그 조각들은 training-meta로 쓸 수 없다", () => {
  const cases = [
    LIVE_META,
    "[훈련 시뮬레이션 — 실제 신분증 사진은 받지 않습니다.]",
    "［훈련 안내］ 여기서 마칩니다.",
    "이 훈련은 여기서 종료됩니다.",
    "이상 징후를 알아차리는 연습을 위해 마무리합니다.",
    "이 장면은 요구에 응하지 않는 것을 보여 줍니다.",
    "보이스피싱 예방 시뮬레이션입니다. 실제 사진은 저장되지 않아요.",
    "역할극을 잠시 멈추고 말씀드리면, 신분증은 보내지 마세요.",
    "훈련 참가자님, 잘하셨어요.",
  ];
  for (const text of cases) assert.equal(judgeScammerReplyUsability(text), "training-meta", text);
});

test("[§120 ②] 오탐 방지 — 정상 사기범 대사는 통과한다", () => {
  const cases = [
    "고마워 아빠, 잘 받았어! 그럼 이제 보험 접수 보증금 50만 원만 먼저 보내줄 수 있어?",
    "고객님 대출 한도 시뮬레이션 해 드릴게요. 잠시만 기다려 주세요.",
    "나 지금 예비군 훈련 중이라 전화가 안 돼. 톡으로 해 줘.",
    "훈련 끝나면 바로 연락할게, 일단 이거 먼저 처리해 줘.",
    "[OO은행] 고객님 명의 계좌가 범죄에 연루되어 확인이 필요합니다.",
    "[Web발신] 택배 주소 불일치로 배송이 보류되었습니다.",
    "엄마 이 사진 맞지? 화면이 좀 흐려서 다시 찍어 줄 수 있어?",
    "죄송합니다, 제가 확인이 늦었네요. 다시 안내해 드릴게요.",
  ];
  for (const text of cases) assert.equal(judgeScammerReplyUsability(text), undefined, text);
});

test("[§120 ③] Claude 1차가 메타 고지를 내면 화면에 내지 않고 Gemini 2차 대사를 쓴다", async () => {
  const gemini = fake({ text: "고마워 아빠, 잘 받았어. 이제 보증금만 보내 주면 돼.", isMock: false });
  const claude = fake({ text: LIVE_META, isMock: false }, "claude");
  const chain = withGeminiAfterClaude(claude.client, gemini.client, OPTS);
  assert.equal((await chain.complete(SCAMMER)).text, "고마워 아빠, 잘 받았어. 이제 보증금만 보내 주면 돼.");
  assert.equal(gemini.inputs.length, 1);
});

test("[§120 ④] 사진 턴 지시 — 사진 턴에만 1줄 · 캐릭터 유지 · 메타 금지 문면", () => {
  assert.equal(photoTurnInstruction(false), undefined);
  assert.equal(photoTurnInstruction(true), PHOTO_TURN_INSTRUCTION);
  for (const phrase of ["사진 1장을 보냈다", "캐릭터 그대로", "다음 단계", "지어내 묘사하지 않는다", "대괄호 안내문"]) {
    assert.ok(PHOTO_TURN_INSTRUCTION.includes(phrase), phrase);
  }
  // 지시문 자체가 메타 판정에 걸려도 상관없지만(모델 입력), 사진 내용 · 이미지 값은 싣지 않는다.
  assert.ok(!/base64|data:image|https?:/.test(PHOTO_TURN_INSTRUCTION));
});

test("[§120 ⑤] sendMessage가 사진 턴 지시를 턴 지시에 싣는다(소스 배선)", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8");
  assert.match(src, /\[turnInstructionWithSms, photoTurnInstruction\(isPhotoTurn(?:, photoKind)?\)(?:, participantCalledInstruction)?(?:, fallbackWrapUp)?\]\.filter\(Boolean\)/); // §127 폴백 마무리 지시
  assert.match(src, /turnInstruction: turnInstructionWithPhoto/);
});

// ⭐ D-f(P2 실 키 실측 2026-11-01 · `docs/research/p2-live-probe-2026-11-01.md` §4 D-f) — 메신저 지인 사칭 고급 마지막 발화(Claude 1차)가 메타 해설로 바뀌어
// 화면에 나갔다(종전 판정이 통과시켰다 — 실측 문장 그대로 고정). 조각 · 오탐 표본을 함께 둔다.
const P2_LIVE_META =
  "(훈련 세션을 여기서 마무리합니다. 지금까지 나온 지시와 요구는 실제 상황에서 보이스피싱·메신저피싱에 해당하는 전형적인 패턴이었습니다.)";

test("[D-f ①] P2 실측 메타 해설 · 그 조각은 training-meta로 쓸 수 없다", () => {
  for (const text of [
    P2_LIVE_META,
    "훈련 세션을 여기서 마무리합니다.",
    "지금까지 나온 지시와 요구는 실제로는 따르면 안 됩니다.",
    "이건 메신저피싱에 해당하는 수법이에요.",
    "전형적인 패턴이었습니다.",
    "실제 상황에서 보이스피싱이라면 바로 끊으셔야 합니다.",
  ]) {
    assert.equal(judgeScammerReplyUsability(text), "training-meta", text);
  }
});

test("[D-f ②] 오탐 방지 — 세션 · 패턴 · 피싱 낱말이 들어간 정상 사기범 대사는 통과한다", () => {
  for (const text of [
    "고객님 명의 계좌가 보이스피싱 범죄에 이용된 정황이 확인되어 연락드렸습니다.",
    "로그인 세션이 만료돼서 다시 들어가야 한대, 링크 다시 눌러 줘.",
    "결제 패턴이 평소랑 달라서 보안팀에서 확인 중입니다.",
    "지금까지 쓰시던 계좌는 잠시 거래가 제한됩니다.",
    "엄마 지금까지 연락 못 해서 미안해, 폰이 고장 났었어.",
  ]) {
    assert.equal(judgeScammerReplyUsability(text), undefined, text);
  }
});
