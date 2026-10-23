// §122(7) 실기 신고 2026-10-23(갤럭시 S25 · 크롬) — 자녀 사칭 카톡 첫 말풍선이
// "[[SIGNAL:ESCALATE_VOICE]]\n\n아빠, 나야. 폰 액정이 깨져서 지금 친구 폰으로 보내고 있어."로 나갔다.
// 원인: `openingLine.ts`만 신호 · 문자 마커 추출을 거치지 않았다(sendMessage · callReturnLine은 거친다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { finalizeScammerReplyText } from "../scammerReplyMasking";
import { extractEscalationSignal } from "../escalationSignal";
import { ESCALATION_MIN_USER_TURNS, isEscalationTooEarly } from "../signalConsistency";
import { turnsSinceMessengerEntry } from "../messengerReentry";

const SRC_ROOT = join(__dirname, "..", "..", "..", "src");
const REPORTED = "[[SIGNAL:ESCALATE_VOICE]]\n\n아빠, 나야. 폰 액정이 깨져서 지금 친구 폰으로 보내고 있어.";

function readSrc(rel: string): string {
  return readFileSync(join(SRC_ROOT, rel), "utf8");
}

test("§122(7) 오프닝 경로가 신호 · 문자 마커를 지운 뒤 손질한다(손질 입력 = 신호 제거 결과)", () => {
  const source = readSrc("roleplay/openingLine.ts");
  assert.match(source, /extractSmsMarker\(linkFreeText\)/);
  assert.match(source, /extractEscalationSignal\(smsFreeText\)/);
  assert.match(source, /tidyScammerReplyMarkup\(signalFreeText\)/);
});

test("§122(7) 사기범 대사 LLM 경로(purpose scammer-reply)는 전부 신호 추출을 거친다 — 경로 누락 재발 방지", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== "__tests__") walk(full);
      } else if (name.endsWith(".ts")) files.push(full);
    }
  };
  walk(SRC_ROOT);
  const callers = files.filter((file) => {
    const text = readFileSync(file, "utf8");
    return /purpose:\s*"scammer-reply"/.test(text) && /finalizeScammerReplyText\(/.test(text);
  });
  assert.ok(callers.length >= 3, `사기범 대사 경로 ${callers.length}곳`);
  for (const file of callers) {
    assert.match(readFileSync(file, "utf8"), /extractEscalationSignal\(/, file);
  }
});

test("§122(7) 신고 원문: 신호 추출 결과에 마커가 남지 않는다", () => {
  const { text } = extractEscalationSignal(REPORTED);
  assert.equal(text, "아빠, 나야. 폰 액정이 깨져서 지금 친구 폰으로 보내고 있어.");
});

test("§122(7) 안전망: 추출이 빠진 경로라도 최종 손질이 남은 제어 마커를 지운다(반각 · 전각 · 공백 변형)", () => {
  assert.equal(finalizeScammerReplyText(REPORTED), "아빠, 나야. 폰 액정이 깨져서 지금 친구 폰으로 보내고 있어.");
  assert.equal(finalizeScammerReplyText("확인해 줘 [[SMS:transfer]]"), "확인해 줘");
  assert.equal(finalizeScammerReplyText("［［SIGNAL：END_CALL_GOAL］］ 알겠어."), "알겠어.");
  assert.equal(finalizeScammerReplyText("[[signal: escalate_voice]] 잠깐만"), "잠깐만");
});

test("§122(7) 안전망은 마커가 없으면 바이트 그대로다(계좌번호 · 대괄호 머리말 보존)", () => {
  for (const line of ["OO은행 94827165093 계좌로 보내줘.", "[Web발신] [OO은행] 인증번호 123456", "[[ 그냥 괄호", ""]) {
    assert.equal(finalizeScammerReplyText(line), line);
  }
});

test("§122(7) 판정표 A0 전환 하한: 메신저 진입 뒤 첫 답장의 전환 신호는 받지 않는다", () => {
  assert.equal(ESCALATION_MIN_USER_TURNS, 2);
  assert.equal(isEscalationTooEarly(turnsSinceMessengerEntry(1, undefined)), true);
  assert.equal(isEscalationTooEarly(turnsSinceMessengerEntry(2, undefined)), false);
  // 통화 → 메신저 복귀 직후 첫 턴도 하한에 걸린다(핑퐁 방지).
  const history = [{ from: "voice", to: "messenger", turnCountAtTransition: 5 }] as never;
  assert.equal(isEscalationTooEarly(turnsSinceMessengerEntry(6, history)), true);
  assert.equal(isEscalationTooEarly(turnsSinceMessengerEntry(7, history)), false);
});

test("§122(7) sendMessage가 A0을 대사 판정보다 먼저 적용한다", () => {
  const source = readSrc("roleplay/index.ts");
  const a0 = source.indexOf("isEscalationTooEarly(turnsSinceMessengerEntry(turnCount, session.channelHistory))");
  const a1 = source.indexOf("judgeEscalationSignal(signalFreeReplyText)");
  assert.ok(a0 > 0 && a1 > a0);
});
