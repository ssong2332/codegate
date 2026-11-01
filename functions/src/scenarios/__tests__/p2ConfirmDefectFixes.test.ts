// ⭐ P2 확인 실측(2026-11-01 · docs/research/p2-confirm-probe-2026-11-01.md §4) 새 결함 수정 — 메인 "권고대로".
// | # | 결함 | 고정하는 것 |
// |---|---|---|
// | D-i | 카드 이관 문자가 기본 백스톱이라 늦어 사기범이 문자 없이 재촉 | `card-relief-account`(fv-x7ue · fv-w3dq) 백스톱 간격 1 · 설치 문자 뒤 다음 발화에 도착 |
// | D-e2 | 지인 메신저가 "다른 카드나 간편결제로 더 보내줘" | 공통 금지 문장에 "간편결제나 다른 카드로 더 보내라" · 메신저 조립에도 실림 |
// | D-f2 | 메신저 맨 앞 괄호 지문 "(통화 맺음)" 노출 | 맨 앞 짧은 지문 괄호 제거 · 정상 괄호는 남는다 |
// | D-k | 통화 중 대화방 캡처의 photoKind 누락 | 통화 중 경로도 photoKind 저장 · 캡처 지시 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../flowVariants";
import { planSmsBackstop, resolveDeclaredSms } from "../../inCallSms/smsGate";
import { buildSystemPrompt, OUT_OF_SERVICE_SENTENCE } from "../../roleplay/promptAssembly";
import { tidyScammerReplyMarkup } from "../../roleplay/replyMarkup";

const SRC = path.resolve(__dirname, "../../../src/roleplay");
const read = (file: string) => readFileSync(path.join(SRC, file), "utf8").replace(/\r\n/g, "\n");

test("[D-i] 카드 자가 고급 이관 문자 — 백스톱 간격 1 · 설치 문자 도착 뒤 기본(2)보다 먼저 백스톱이 움직인다", () => {
  for (const variantId of ["fv-x7ue", "fv-w3dq"]) {
    assert.equal(findFlowVariant(variantId)?.sms.find((s) => s.smsId === "card-relief-account")?.backstopUserTurns, 1, variantId);
    const { declared } = resolveDeclaredSms("card-company-impersonation", variantId);
    const relief = declared.find((d) => d.smsId === "card-relief-account");
    assert.equal(relief?.backstopUserTurns, 1, `${variantId}: 해석된 선언에도 실림`);
    // 설치 문자가 2발화에 도착 · 하한 4 — 하한을 넘긴 첫 발화부터 대기 없이 움직인다(기본 간격이면 한 발화 더 기다렸다).
    const plan = planSmsBackstop({ declared, delivered: [{ smsId: "card-guard-app-link", userTurnsAtArrival: 2 }], userTurns: 5 });
    assert.ok(plan.action === "nudge" || plan.action === "deliver", `${variantId}: 하한 + 1발화에 대기 아님(${plan.action})`);
    assert.equal(plan.item.smsId, "card-relief-account");
  }
  // fv-akj5(2인 챌린지 수신자 · #192 바이트 고정)는 문자 선언 0 그대로.
  assert.equal(findFlowVariant("fv-akj5")?.sms.length ?? 0, 0);
});

test("[D-e2] 공통 금지 문장 — 간편결제 · 다른 카드로 더 보내라 예시 · 지인 메신저 조립에도 실림", () => {
  assert.ok(OUT_OF_SERVICE_SENTENCE.includes("간편결제나 다른 카드로 더 보내라"));
  assert.ok(OUT_OF_SERVICE_SENTENCE.includes("다른 번호로 전화해 확인하라"), "기존 예시 유지");
  const messenger = buildSystemPrompt(resolveSessionScenarioPrompt("messenger-friend-loan-kakao", "fv-bxvp")!, { difficultyLevel: "beginner" });
  assert.ok(messenger.includes(OUT_OF_SERVICE_SENTENCE.trim()));
});

test("[D-f2] 맨 앞 괄호 지문 제거 — 실측 원문 · 비슷한 지문 / 정상 괄호 · 가운데 괄호 · 지문만 있는 대사는 그대로", () => {
  assert.equal(
    tidyScammerReplyMarkup("(통화 맺음) 확인해 보니 이체가 들어가지 않았어요. 이 내용은 누구에게도 말씀하지 마세요.").text,
    "확인해 보니 이체가 들어가지 않았어요. 이 내용은 누구에게도 말씀하지 마세요.",
  );
  for (const [input, expected] of [
    ["(조용히) 지금 바로 보내줘", "지금 바로 보내줘"],
    ["(확인 중) 잠깐만 기다려 줘", "잠깐만 기다려 줘"],
    ["(전화 끊은 뒤) 아까 말한 계좌로 보내", "아까 말한 계좌로 보내"],
  ] as const) {
    assert.equal(tidyScammerReplyMarkup(input).text, expected, input);
  }
  for (const keep of [
    "(주)가온캐피탈 상담원입니다.",
    "(가상) OO은행 948-2716-5093-27로 보내 주세요.",
    "(참고로) 이건 오늘까지만 돼.",
    "(OO은행 고객센터) 안내드립니다.",
    "지금 확인해 보니 (통화 맺음) 이렇게 됐어.",
    "(1588-0000) 이 번호로 오는 문자만 보세요.",
    "(통화 맺음)",
  ]) {
    assert.equal(tidyScammerReplyMarkup(keep).text, keep, keep);
  }
});

test("[D-k 배선] 통화 중 대화방 — sendMessage가 photoKind를 넘기고, 그 경로가 저장 · 캡처 지시에 쓴다", () => {
  const index = read("index.ts");
  assert.match(index, /return replyChatDuringCall\(\{ db, sessionRef, sessionId, session, scenarioPrompt, userText, isPhotoTurn, photoKind \}\);/);
  // photoKind는 duringCall 분기보다 앞에서 사진 턴 · 허용 값으로 걸러진다.
  assert.ok(index.indexOf('const photoKind = isPhotoTurn && requestedPhotoKind === "transfer-receipt"') < index.indexOf("if (request.data?.duringCall === true) {"));
  const chat = read("chatDuringCall.ts");
  assert.ok(chat.includes("const { db, sessionRef, sessionId, session, scenarioPrompt, userText, isPhotoTurn, photoKind } = input;"));
  assert.ok(chat.includes("      ...(isPhotoTurn ? { photo: true as const } : {}),\n      ...(photoKind ? { photoKind } : {}),\n    } satisfies MessageDoc);"), "사용자 메시지에 종류 저장");
  assert.ok(chat.includes("photoTurnInstruction(isPhotoTurn, photoKind),"), "캡처 지시");
  assert.equal(chat.includes("photoTurnInstruction(isPhotoTurn),"), false);
});
