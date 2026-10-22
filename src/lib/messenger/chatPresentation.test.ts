// G633 — 메신저형 대화방 표시 규칙 + 앱 이름 표기 0 (docs/Architecture.md §89.5 ⓐ · UX D-132 (5) ⓐ).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chatEndedNotice, endsRun, formatChatTime, isUnreadByPeer, startsPeerRun } from "./chatPresentation.ts";
import type { ThreadItem, ThreadMessage } from "./threadItems.ts";

const m = (id: string, role: "scammer" | "user"): ThreadItem<ThreadMessage> => ({
  kind: "message",
  message: { id, role, turnIndex: Number(id) },
});
const call: ThreadItem<ThreadMessage> = { kind: "call", id: "c", turnCount: 2 };
// 상대 · 상대 · 나 · 통화 · 상대 · 나 · 나
const items = [m("0", "scammer"), m("1", "scammer"), m("2", "user"), call, m("4", "scammer"), m("5", "user"), m("6", "user")];

test("[G633] 이름 · 프로필 = 상대 연속 메시지의 첫 말풍선만(통화 줄은 연속을 끊는다)", () => {
  assert.deepEqual(items.map((_, i) => startsPeerRun(items, i)), [true, false, false, false, true, false, false]);
});

test("[G633] 시각 = 같은 쪽 연속의 마지막만", () => {
  assert.deepEqual(items.map((_, i) => endsRun(items, i)), [false, true, true, false, true, false, true]);
});

test("[G633] 숫자 1 = 뒤에 상대 메시지가 없는 내 메시지만", () => {
  assert.deepEqual(items.map((_, i) => isUnreadByPeer(items, i)), [false, false, false, false, false, true, true]);
});

test("[G633] 시각 형식 — 오전/오후 12시간제 · 시각 없음이면 빈 문자열", () => {
  assert.equal(formatChatTime(new Date(2026, 9, 20, 14, 5).getTime()), "오후 2:05");
  assert.equal(formatChatTime(new Date(2026, 9, 20, 0, 30).getTime()), "오전 12:30");
  assert.equal(formatChatTime(undefined), "");
});

test("[G633] 대화방 화면에 메신저 앱 이름 표기가 없다(UX D-132 (5) ⓐ · 사용자 결정 ②)", () => {
  const code = readFileSync("src/app/session/messenger/page.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  assert.ok(!code.includes("카카오톡"), "messenger/page.tsx 코드(주석 제외)에 앱 이름 표기가 남았다");
});

// §104.9 · UX D-145 (2) — 메신저 단계 사기범 종료 문구(E-1~E-3).
test("[§104.9 · D-145 (2)] 종료 줄 — 사기범 종료면 카톡형 '나갔습니다' · 문자형 '답장하지 않습니다' · 그 밖은 종전", () => {
  assert.equal(chatEndedNotice(true, "kakao"), "상대방이 채팅방을 나갔습니다.");
  assert.equal(chatEndedNotice(true, "sms"), "상대가 더 이상 답장하지 않습니다.");
  assert.equal(chatEndedNotice(false, "kakao"), "대화가 종료되었습니다.");
  assert.equal(chatEndedNotice(false, "sms"), "대화가 종료되었습니다.");
  for (const text of [chatEndedNotice(true, "kakao"), chatEndedNotice(true, "sms")]) {
    assert.equal(/훈련|\[|\]/.test(text), false, "세션 표식 · 메타 표기 0");
  }
  const page = readFileSync("src/app/session/messenger/page.tsx", "utf8").replace(/\r\n/g, "\n");
  assert.ok(page.includes('scammerEnded: result.ended === true && result.endReason === "scammer_ended",'), "서버 종료 사유를 결과에 싣는다");
  assert.ok(page.includes('{chatEndedNotice(pending?.outcome?.scammerEnded === true, isSms ? "sms" : "kakao")}'), "종료 줄이 판정 함수를 쓴다");
});
