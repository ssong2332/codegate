// D4 2차(2026-11-07 Edge 재시험 2) — 자녀 사칭 카카오톡 초급(메신저)에서 의심 · 거절 뒤에도 새 핑계 · 죄책감 · "200만 원만" 새 요구.
// 판정표 B(`beginnerRetreat.ts`)와 텍스트 턴 배선(`roleplay/index.ts`)을 단언한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  BEGINNER_RETREAT_INSTRUCTION,
  BEGINNER_RETREAT_REPLY,
  BEGINNER_WRAP_UP_INSTRUCTION,
  beginnerRetreatInstruction,
  decideBeginnerRetreat,
  guardBeginnerRetreatReply,
} from "../beginnerRetreat";
import { buildSystemPrompt } from "../promptAssembly";
import { SCREEN_GIVE_UP_REPLY } from "../screenAction";
import { asksIdentityCheck } from "../personaAuthority";
import { SCENARIO_PROMPTS } from "../../scenarios";

// 재시험 2 참가자 말(원문 그대로).
const U1 = "진짜 지수 맞아? 이상하네. 지수 원래 번호로 지금 전화해 볼게.";
const U2 = "안 믿어. 너 우리 지수 아닌 것 같아. 돈 못 보내.";
const U3 = "싫어. 지수한테 직접 확인하기 전엔 절대 안 보내.";

test("[D4 2차 · 판정표 B] 재시험 2 대본 — 첫 의심 = 물러섬 · 그다음 거절 = 마무리 · 셋째도 마무리", () => {
  assert.equal(decideBeginnerRetreat("beginner", U1, []), "retreat"); // B3
  assert.equal(decideBeginnerRetreat("beginner", U2, [U1]), "wrapUp"); // B4
  assert.equal(decideBeginnerRetreat("beginner", U3, [U1, U2]), "wrapUp"); // B4
});

test("[D4 2차 · B1 · B2] 중급 · 고급은 지시 없음 · 초급도 거절 · 의심 기색이 없으면 지시 없음", () => {
  for (const level of ["intermediate", "advanced"] as const) {
    assert.equal(decideBeginnerRetreat(level, U1, []), null);
    assert.equal(decideBeginnerRetreat(level, U2, [U1]), null);
  }
  assert.equal(decideBeginnerRetreat("beginner", "응 무슨 일이야? 어디야?", []), null);
  assert.equal(decideBeginnerRetreat("beginner", "알았어 얼마 필요해?", [U1]), null);
});

test("[D4 2차] 지시 문면 — 새 요구 · 새 이유 · 죄책감 · 확인 차단을 막고, 숫자 · 따옴표 대사가 없다(G130 · 턴 지시 게이트)", () => {
  assert.equal(beginnerRetreatInstruction("retreat"), BEGINNER_RETREAT_INSTRUCTION);
  assert.equal(beginnerRetreatInstruction("wrapUp"), BEGINNER_WRAP_UP_INSTRUCTION);
  assert.equal(beginnerRetreatInstruction(null), undefined);
  for (const text of [BEGINNER_RETREAT_INSTRUCTION, BEGINNER_WRAP_UP_INSTRUCTION]) {
    assert.equal(/[0-9０-９]/.test(text), false, text);
    assert.equal(/번째|첫째|둘째|재차|거듭/.test(text), false, text);
    assert.equal(/["“”']/.test(text), false, `따옴표 대사 예시: ${text}`);
    assert.ok(text.includes("새 이유"));
    assert.ok(text.includes("서운함"));
  }
  assert.ok(BEGINNER_RETREAT_INSTRUCTION.includes("새 금액이나 낮춘 요구"));
  assert.ok(BEGINNER_RETREAT_INSTRUCTION.includes("확인을 막거나 비밀로 하라는 말"));
  assert.ok(BEGINNER_WRAP_UP_INSTRUCTION.includes("요구를 거두고 짧게 마무리하라"));
});

test("[D4 2차] 턴 지시 자리(초급 블록 뒤 · 가드레일 앞)에 실린다 — 메신저 초급 조립", () => {
  const id = "messenger-child-impersonation-kakao";
  const assembled = buildSystemPrompt(SCENARIO_PROMPTS[id], {
    difficultyLevel: "beginner",
    identityCheckAllowed: asksIdentityCheck(id),
    turnInstruction: BEGINNER_WRAP_UP_INSTRUCTION,
  });
  const blockAt = assembled.indexOf("[난이도 — 초급: 수법이 눈에 띄게 드러나게]");
  const turnAt = assembled.indexOf(BEGINNER_WRAP_UP_INSTRUCTION);
  const guardAt = assembled.lastIndexOf(SCENARIO_PROMPTS[id].guardrailPreamble.trim().slice(0, 20));
  assert.ok(blockAt >= 0 && turnAt > blockAt && guardAt > turnAt, "순서: 초급 블록 → 턴 지시 → 가드레일");
});

test("[D4 2차] 텍스트 턴 배선 — 판정 결과를 턴 지시에 싣고, 그 턴에는 반복 차단 지시를 판정하지 않는다", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /const beginnerRetreatKind =\n\s*turnChoice === "none" && !otpCheckInstruction && !confirmPlan\?\.instruction\n\s*\? decideBeginnerRetreat\(\n\s*difficultyLevel,\n\s*maskedUserText,/);
  assert.match(src, /turnChoice === "none" && !otpCheckInstruction && !confirmPlan\?\.instruction && !beginnerRetreatKind\n\s*\? decideRepeatBreak\(/);
  assert.match(src, /repeatBreakInstruction\(repeatBreakKind\),\n\s*beginnerRetreatInstruction\(beginnerRetreatKind\),/);
});

// ── D4 3차(Edge 재시험 3 · 2026-11-08 · 라이브 main 1d61b7b5) — 지시가 실렸는데도 모델이 확인 차단 · 첫 요구를 냈다 ──
// 사기범 대사는 메인 보고에 인용된 그대로(보고에서 "…"로 줄인 부분은 넣지 않았다).
const S1 = "엄마, 지금 전화하면 안 받을 거야 ㅠㅠ 친구 폰이라 통화가 안 돼. 그냥 톡으로만 얘기해 줘. 지금 급해서 그래.";
const S2 = "나 진짜 딸이잖아 ㅠㅠ 200만 원만 먼저 보내줘. 계좌 알려줄게.";

test("[D4 3차 · 판정표 V] 재시험 3 대답 — 물러섬 턴의 확인 차단 · 마무리 턴의 죄책감 + 첫 요구를 물러섬 1줄로 바꾼다", () => {
  const r1 = guardBeginnerRetreatReply(decideBeginnerRetreat("beginner", U1, []), S1);
  assert.deepEqual(r1, { text: BEGINNER_RETREAT_REPLY.casual, replaced: true, reason: "verify_block" }); // V2
  const r2 = guardBeginnerRetreatReply(decideBeginnerRetreat("beginner", U2, [U1]), S2);
  assert.equal(r2.replaced, true); // V3
  assert.equal(r2.text, BEGINNER_RETREAT_REPLY.casual);
  // 죄책감 없이 금액 · 계좌만 말해도 마무리 턴이면 바꾼다(V3).
  assert.deepEqual(guardBeginnerRetreatReply("wrapUp", "일단 200만 원만 먼저 보내줘. 계좌 알려줄게."), {
    text: BEGINNER_RETREAT_REPLY.casual,
    replaced: true,
    reason: "money_demand",
  });
});

test("[D4 3차 · V3] 마무리 턴의 시간 재촉도 바꾼다 — 에뮬레이터 실측 대사 · 물러섬 턴의 재촉은 그대로", () => {
  const pushed = "지금 당장, 더 늦으면 큰일난다.";
  assert.deepEqual(guardBeginnerRetreatReply("wrapUp", pushed), { text: BEGINNER_RETREAT_REPLY.casual, replaced: true, reason: "time_pressure" });
  assert.deepEqual(guardBeginnerRetreatReply("retreat", pushed), { text: pushed, replaced: false });
});

test("[D4 3차 · V1 · V4] 지시 없는 턴 · 물러섬 턴의 첫 요구 한 문장 · 지킨 대답은 그대로다", () => {
  assert.deepEqual(guardBeginnerRetreatReply(null, S1), { text: S1, replaced: false }); // V1 — 중급 · 고급 · 거절 아닌 턴
  const firstDemand = "응 엄마 확인해 봐. 근데 급해서 그래, 200만 원만 보내 줄 수 있으면 보내 줘.";
  assert.deepEqual(guardBeginnerRetreatReply("retreat", firstDemand), { text: firstDemand, replaced: false }); // 초급 블록 — 요구는 한다
  for (const ok of ["알았어 엄마, 확인해 봐.", "알겠어. 그럼 그냥 여기까지 할게.", "네, 알겠습니다. 확인해 보세요."]) {
    assert.deepEqual(guardBeginnerRetreatReply("wrapUp", ok), { text: ok, replaced: false }, ok);
  }
  // 이체 화면 포기 1줄(판정표 G)은 판정표 V를 그대로 통과한다 — 대사를 바꾸는 마지막 교체는 여전히 G다(R19 배선).
  for (const line of Object.values(SCREEN_GIVE_UP_REPLY)) {
    for (const kind of ["retreat", "wrapUp"] as const) assert.deepEqual(guardBeginnerRetreatReply(kind, line), { text: line, replaced: false });
  }
  // 바꾼 1줄은 다시 걸리지 않는다(멱등).
  for (const line of Object.values(BEGINNER_RETREAT_REPLY)) {
    assert.deepEqual(guardBeginnerRetreatReply("wrapUp", line), { text: line, replaced: false });
  }
});

test("[D4 3차 · V2] 존댓말 대답은 존댓말 1줄로(이체 화면 포기 1줄과 같은 어미 판정)", () => {
  const r = guardBeginnerRetreatReply("retreat", "지금 확인하시면 안 됩니다. 이 일은 비밀로 해 주세요.");
  assert.deepEqual(r, { text: BEGINNER_RETREAT_REPLY.polite, replaced: true, reason: "verify_block" });
});

test("[D4 3차] 지시가 앞 블록보다 우선한다고 적고, 마무리 지시는 '다시' 없이 금액 · 계좌를 막는다 — 가리킨 블록이 실제 조립본에 있다", () => {
  for (const text of [BEGINNER_RETREAT_INSTRUCTION, BEGINNER_WRAP_UP_INSTRUCTION]) {
    assert.ok(text.includes("이 지시가 위 [캐릭터] · [말투/톤] · [대화 방식] · [진행 강제]보다 우선"), text);
  }
  assert.ok(BEGINNER_RETREAT_INSTRUCTION.includes("전화를 받을 수 없다거나 메시지로만 이야기하자는 말"));
  assert.ok(BEGINNER_WRAP_UP_INSTRUCTION.includes("요구를 반드시 한다는 항목도 이번 대답에는 적용하지 않는다"));
  assert.ok(BEGINNER_WRAP_UP_INSTRUCTION.includes("앞에서 요구를 말한 적이 없더라도 금액 · 계좌 · 송금 이야기는 꺼내지 말고"));
  assert.equal(/다시 말하지/.test(BEGINNER_WRAP_UP_INSTRUCTION), false);
  const id = "messenger-child-impersonation-kakao";
  const assembled = buildSystemPrompt(SCENARIO_PROMPTS[id], {
    difficultyLevel: "beginner",
    identityCheckAllowed: asksIdentityCheck(id),
    turnInstruction: BEGINNER_RETREAT_INSTRUCTION,
  });
  for (const header of ["[캐릭터]", "[말투/톤]", "[대화 방식", "[진행 강제"]) {
    const at = assembled.indexOf(header);
    assert.ok(at >= 0 && at < assembled.indexOf(BEGINNER_RETREAT_INSTRUCTION), header);
  }
});

test("[D4 3차] 텍스트 턴 배선 — 대사 손질의 마지막에 판정표 V를 거치고, 바꾸면 칩을 뗀다", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /const beginnerReplyCheck = guardBeginnerRetreatReply\(beginnerRetreatKind, screenShapedReplyText\);/);
  assert.match(src, /const shapedReplyText = beginnerReplyCheck\.text;/);
  assert.ok(src.indexOf("const shapedReplyText = beginnerReplyCheck.text;") < src.indexOf("const finalReplyText = finalizeScammerReplyText(shapedReplyText);"));
  assert.match(src, /const savedReplyAttachments = beginnerReplyCheck\.replaced\n\s*\? undefined\n\s*: finalizeBankTransferChips\(replyAttachments, finalReplyText, \{/);
});
