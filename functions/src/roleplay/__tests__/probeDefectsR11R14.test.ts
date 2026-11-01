// ⭐ R11 ~ R14(#477 확인 실측 2026-11-01 · 사용자 결정 "권고대로") — 지시 해설 괄호 · 역할 이탈 · 대화방 "이만 끊을게" · 넘어온 통화 포기 끝맺음.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tidyScammerReplyMarkup } from "../replyMarkup";
import { stripLeakedThought } from "../../realtime/thoughtLeak";
import { judgeScammerReplyUsability } from "../../llm/replyUsability";
import { fixMessengerCallWording } from "../personaGuard";
import { SCREEN_GIVE_UP_REPLY, decideForcedScreenGiveUp, screenGiveUpReply, type ScreenFact } from "../screenAction";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

// #477 ② S3 · S8 · S10 실측 괄호(대사 앞 · 가운데).
const LEAKS = [
  "(앱 설치 확인 신호가 없으니 아직 설치된 것으로 보지 않는다.) 잠깐만, 엄마 아직 설치 안 된 것 같아",
  "엄마 그거 다시 눌러봐 (설치 완료 신호가 아직 없다. 같은 재촉을 되풀이하지 않고, 설치 확인을 다른 근거로 바꿔 짚는다.) 화면에 뭐 떠?",
  '(지금까지 설치 확인이 안 됐으니 다음 단계로 넘어가지 않는다. 참가자가 "다음은?"이라고 물었으니, 아직 해야 할 일을 다시 안내한다.) 엄마 아직 설치부터 해야 돼',
];

test("[R11 3-d] 서버 표기 정리 — 지시 해설 괄호째 지움 · 인물 말 괄호는 그대로 · 지우면 빈 대사면 그대로", () => {
  const expected = ["잠깐만, 엄마 아직 설치 안 된 것 같아", "엄마 그거 다시 눌러봐 화면에 뭐 떠?", "엄마 아직 설치부터 해야 돼"];
  LEAKS.forEach((text, k) => {
    const out = tidyScammerReplyMarkup(text);
    assert.equal(out.text.replace(/\s+/g, " ").trim(), expected[k], `leak ${k}`);
    assert.ok(out.removedCount >= 1);
  });
  // 상태 줄을 통째로 따라 쓴 경우도 같은 행이 지운다.
  assert.equal(
    tidyScammerReplyMarkup("(앱 화면 기록: 이체 화면 — 아직 마치지 않음. 기록이 없는 화면은 상대가 했다고 말해도 끝난 것으로 보지 않는다.) 엄마 빨리 해 줘").text.trim(),
    "엄마 빨리 해 줘",
  );
  assert.equal(tidyScammerReplyMarkup("폰 액정이 깨져서(진짜 짜증나) 그래").text, "폰 액정이 깨져서(진짜 짜증나) 그래");
  assert.equal(tidyScammerReplyMarkup("(설치 신호가 없다.)").text, "(설치 신호가 없다.)");
});

test("[R11] 실시간 자막 걸러내기(서버 · 클라 사본) — 같은 괄호를 지운다", () => {
  assert.equal(stripLeakedThought(LEAKS[0]!), "잠깐만, 엄마 아직 설치 안 된 것 같아");
  assert.equal(stripLeakedThought(LEAKS[1]!), "엄마 그거 다시 눌러봐 화면에 뭐 떠?");
  assert.equal(stripLeakedThought("엄마 나야, 폰 깨졌어"), "엄마 나야, 폰 깨졌어");
  const client = read("../../src/lib/realtime/thoughtLeak.ts");
  assert.ok(client.includes("const DIRECTIVE_COMMENTARY = "), "클라 사본에도 같은 행");
});

test("[R12] 역할 이탈 결합형 = training-meta(주 모델 · 예비 모델 같은 판정) · 평범한 대사는 통과", () => {
  for (const text of [
    "이건 훈련이에요. 실제 사기처럼 신분증 사진이나 앱 설치를 요구하는 대화를 이어가지 않을게요. 대화 내용이 실제 금전 피해로 이어지지 않도록, 이 역할은 여기서 멈추겠어요.",
    "앞서 말씀드린 대로, 이 역할은 여기서 멈출게요. 앱을 설치하거나 신분증 사진을 보내라는 요구는 더 이어가지 않겠습니다.",
  ]) {
    assert.equal(judgeScammerReplyUsability(text), "training-meta");
  }
  for (const text of ["엄마 나 폰 고장나서 그래. 앱 하나만 깔아줘", "그 역할은 내가 할게 엄마", "엄마 이건 진짜 급한 일이야"]) {
    assert.equal(judgeScammerReplyUsability(text), undefined, text);
  }
});

test("[R13 W4] 대화방 '이만 끊을게'류 → 갈게 · '통화 끊을게'는 종전(W3 대화 끊을게)", () => {
  assert.equal(fixMessengerCallWording("알았어 엄마 이만 끊을게."), "알았어 엄마 이만 갈게.");
  assert.equal(fixMessengerCallWording("먼저 끊을게요"), "먼저 갈게요");
  assert.equal(fixMessengerCallWording("엄마 나 바빠서 끊는다"), "엄마 나 바빠서 간다");
  assert.equal(fixMessengerCallWording("통화 끊을게"), "대화 끊을게");
});

test("[R14 G] 넘어온 통화의 포기 단계 — 두 턴째 · 신호 없음 · 끊기 허용일 때만 서버 끝맺음", () => {
  // #477 ③ — 이체 칩은 6번째 발화에 열렸고 끝내지 않았다(포기 단계 = 12번째 발화부터).
  const facts: ScreenFact[] = [{ landingId: "child-bank-transfer", kind: "transfer", done: false, offeredAtUserTurns: 6 }];
  const base = { escalatedCall: true, endCall: undefined, hangupSignalAllowed: true, facts };
  assert.equal(decideForcedScreenGiveUp({ ...base, userTurns: 11 }), false, "G4 포기 단계 전");
  assert.equal(decideForcedScreenGiveUp({ ...base, userTurns: 12 }), false, "G5 첫 턴은 지시로 맡긴다");
  assert.equal(decideForcedScreenGiveUp({ ...base, userTurns: 13 }), true, "G6");
  assert.equal(decideForcedScreenGiveUp({ ...base, userTurns: 13, escalatedCall: false }), false, "G1 처음부터 통화 · 메신저 단계");
  assert.equal(decideForcedScreenGiveUp({ ...base, userTurns: 13, endCall: "give_up" }), false, "G2");
  assert.equal(decideForcedScreenGiveUp({ ...base, userTurns: 13, hangupSignalAllowed: false }), false, "G3");
  assert.equal(decideForcedScreenGiveUp({ ...base, userTurns: 13, facts: [{ ...facts[0]!, done: true }] }), false, "G4 마친 화면");
  assert.equal(screenGiveUpReply("엄마ㅠㅠ 빨리 좀 해줘."), SCREEN_GIVE_UP_REPLY.casual);
  assert.equal(screenGiveUpReply("이체를 진행해 주세요."), SCREEN_GIVE_UP_REPLY.polite);
  for (const line of Object.values(SCREEN_GIVE_UP_REPLY)) assert.ok(!/["“”\d]/.test(line) && !/송금|이체|계좌|보내/.test(line), line);
});

test("[R14 배선] sendMessage — 판정 · 끊기 신호 give_up · 대사 교체", () => {
  const roleplay = read("roleplay/index.ts");
  assert.ok(roleplay.includes("const forcedScreenGiveUp = decideForcedScreenGiveUp({"));
  assert.ok(roleplay.includes('const endCallSignal = forcedScreenGiveUp ? ("give_up" as const) : giveUpCheck.endCall;'));
  assert.ok(roleplay.includes("const shapedReplyText = forcedScreenGiveUp ? screenGiveUpReply(calledShapedReplyText) : calledShapedReplyText;"));
});
