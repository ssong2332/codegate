// §132(DECISIONS #248) — 메인 세션 라이브 확인(2026-10-24 · 기관 사칭 고급 · 텍스트 폴백 · 금 구매형) 재작업 3건 고정.
// ① "말씀하신 말씀하신 은행" 겹침 ② 문자 도착 턴의 문자 언급이 문장 상한에 잘림 ③ 금 구매형 · 현금 예탁형 루트의 '안전 계좌' 섞임.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  USER_MENTIONED_BANK,
  neutralizeUserMentionedFinancialNames,
  replaceRealFinancialNames,
} from "../../guardrails/realFinancialNames";
import { SMS_MENTION_SENTENCE, limitReplySentences, limitReplySentencesKeeping } from "../replyLength";
import { findFlowVariant } from "../../scenarios/flowVariants";

const SRC = path.resolve(__dirname, "../../../src");

test("[§132 ①] 모델이 이미 '말씀하신 국민은행'이라고 했으면 '말씀하신'을 겹쳐 붙이지 않는다", () => {
  const users = ["국민은행 계좌만 쓰는데요"];
  // 라이브 재현 — "말씀하신 말씀하신 은행 말고도 …"
  assert.equal(
    neutralizeUserMentionedFinancialNames("말씀하신 국민은행 말고도 해담은행에 계좌가 있으신가요?", users).text,
    "말씀하신 은행 말고도 해담은행에 계좌가 있으신가요?",
  );
  for (const [reply, expected] of [
    ["고객님이 말씀하신 국민은행 계좌는 동결 대상입니다.", "고객님이 말씀하신 은행 계좌는 동결 대상입니다."],
    ["말씀하셨던 국민은행요.", "말씀하셨던 은행요."],
    ["말씀하신 그 국민은행 잔액부터 보겠습니다.", "말씀하신 그 은행 잔액부터 보겠습니다."],
    ["말씀 주신 국민은행 쪽은 확인됐습니다.", "말씀 주신 은행 쪽은 확인됐습니다."],
  ] as const) {
    assert.equal(neutralizeUserMentionedFinancialNames(reply, users).text, expected, reply);
  }
  // 앞에 "말씀하신"이 없으면 종전대로 중립 표현 전체.
  assert.equal(neutralizeUserMentionedFinancialNames("국민은행에 얼마 있으세요?", users).text, `${USER_MENTIONED_BANK}에 얼마 있으세요?`);
  // 한 대답에 두 번 — 앞은 겹침 방지, 뒤는 중립 표현 전체.
  assert.equal(
    neutralizeUserMentionedFinancialNames("말씀하신 국민은행 말고, 국민은행 적금도 있으세요?", users).text,
    "말씀하신 은행 말고, 말씀하신 은행 적금도 있으세요?",
  );
  // 결과에 "말씀하신 말씀하신"이 남지 않고, 종전 치환이 다시 건드리지 않는다.
  const out = neutralizeUserMentionedFinancialNames("말씀하신 국민은행이요.", users).text;
  assert.ok(!/말씀하신\s*말씀하신/.test(out));
  assert.equal(replaceRealFinancialNames(out).replacedCount, 0);
});

test("[§132 ②] 문자 도착 턴 — 상한이 문자 언급 문장을 잘라 내지 않는다(앞 2문장 + 문자 문장) · 그 밖은 종전과 같다", () => {
  // 라이브 재현 형태 — 5문장 중 문자 언급이 4번째.
  const reply =
    "고객님 자산은 저희가 보호해 드립니다. 걱정 마십시오. 다만 절차가 하나 남았습니다. 방금 인증번호 문자를 보내 드렸습니다. 확인되시면 불러 주십시오.";
  const kept = limitReplySentencesKeeping(reply, SMS_MENTION_SENTENCE);
  assert.equal(kept.text, "고객님 자산은 저희가 보호해 드립니다. 걱정 마십시오. 방금 인증번호 문자를 보내 드렸습니다.");
  assert.equal(kept.trimmed, true);
  assert.equal(kept.keptSentences, 3);
  assert.equal(kept.originalSentences, 5);
  // 종전 상한은 문자 문장을 잘랐다(재현).
  assert.ok(!SMS_MENTION_SENTENCE.test(limitReplySentences(reply).text));
  // 남는 앞 문장에 이미 있으면 종전과 같다.
  const early = "방금 문자 보내 드렸습니다. 번호 불러 주세요. 급합니다. 서둘러 주십시오.";
  assert.deepEqual(limitReplySentencesKeeping(early, SMS_MENTION_SENTENCE), limitReplySentences(early));
  // 어디에도 없으면 종전과 같다(지어내지 않는다).
  const none = "하나. 둘. 셋. 넷.";
  assert.deepEqual(limitReplySentencesKeeping(none, SMS_MENTION_SENTENCE), limitReplySentences(none));
  // 상한 이하면 입력 그대로.
  assert.equal(limitReplySentencesKeeping("짧습니다. 문자 확인하세요.", SMS_MENTION_SENTENCE).text, "짧습니다. 문자 확인하세요.");
  // 쉼표 경계로 끝난 문자 문장은 마침표로 닫는다.
  assert.equal(
    limitReplySentencesKeeping("하나. 둘. 셋. 인증번호 문자 보냈습니다, 넷.", SMS_MENTION_SENTENCE).text,
    "하나. 둘. 인증번호 문자 보냈습니다.",
  );
  // 배선 — sendMessage는 문자 도착 턴(`sms_announce`)에만 이 함수를 쓴다.
  const src = readFileSync(path.join(SRC, "roleplay/index.ts"), "utf8");
  assert.match(
    src,
    /shouldLimitReplySentences\(turnChoice\)\s*\?\s*limitReplySentences\(\s*realNameFreeReplyText,\s*MAX_SCAMMER_REPLY_SENTENCES,\s*turnChoice === "sms_announce" \? SMS_MENTION_SENTENCE : undefined,?\s*\)/,
  );
  // 같은 결과 — 공개 함수의 keep 인자 = 전용 함수.
  assert.deepEqual(limitReplySentences(reply, 3, SMS_MENTION_SENTENCE), kept);
});

test("[§132 ③] 현금 예탁형 · 금 구매형은 안심 단계에 계좌 이체 금지 1문장 · 안전계좌 이체형은 그대로 · 단계 문면에 '안전계좌 이체' 요구 0", () => {
  const rule = "이 통화에서는 돈을 다른 계좌로 옮기라는 말(안전계좌 · 보호 계좌 · 국가 계좌)을 어느 단계에서도 하지 않는다.";
  for (const id of ["fv-q7cn", "fv-g2ld"]) {
    const v = findFlowVariant(id)!;
    assert.equal(v.stages.filter((s) => s.summary.includes(rule)).length, 1, `${id}: 1번만`);
    assert.ok(v.stages[1].summary.startsWith("협조하면 조용히 끝난다며 안심시키고"), `${id}: 안심 단계에`);
    // 이 문장을 뺀 나머지 단계 · 수법 문면에 안전계좌 요구가 없다.
    const rest = [...v.stages.map((s) => s.summary.replace(rule, "")), ...v.tactics].join("\n");
    assert.ok(!/안전\s*계좌/.test(rest), `${id}: 안전계좌 문면 0`);
    assert.ok(!/§/.test(v.stages[1].summary), `${id}: 모델 문면에 내부 표기 0`);
  }
  const c5fj = findFlowVariant("fv-c5fj")!;
  assert.ok(!c5fj.stages.some((s) => s.summary.includes(rule)), "안전계좌 이체형은 그대로");
  assert.equal(c5fj.stages[1].summary, "협조하면 조용히 끝난다며 안심시키고, 금융감독기관이 자산 보호를 돕는다고 말한다.");
});
