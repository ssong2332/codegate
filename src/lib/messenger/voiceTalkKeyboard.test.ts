// 실기 신고 4 · 5(2026-10-21 · 갤럭시 S25) — 카톡형 대화방.
// 5: AI 답이 오면 키보드가 저절로 올라왔다 → 입력칸 자동 포커스 0(사용자가 누를 때만). 입력 중 전송은 키보드를 닫지 않는다.
// 4: 통화로 이어지지 않는 세션에 보이스톡이 없었다 → 모든 카톡형 프로필 시트에 보이고, 그런 세션은 신호음 → 응답 없음.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE = "src/components/MessengerChatRoom.tsx";
const codeOnly = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("[실기 5] 대화방 입력칸에 자동 포커스 0 — 응답 뒤 focus() 호출이 없다", () => {
  const code = codeOnly(readFileSync(PAGE, "utf8"));
  assert.equal(code.includes("inputRef.current?.focus()"), false, "응답 뒤 입력칸 포커스가 남았다(키보드 자동 활성화)");
  assert.equal(/autoFocus/.test(code), false);
  // 시작 고지 뒤 포커스는 대화 목록이다(T187 — 입력칸 아님).
  assert.ok(code.includes("messageListRef.current?.focus();"));
});

test("[실기 5] 전송 버튼은 누를 때 포커스를 가져가지 않는다(입력 중이면 키보드 유지 · 닫혀 있으면 열지 않음)", () => {
  const code = codeOnly(readFileSync(PAGE, "utf8"));
  assert.match(code, /disabled=\{turnLocked \|\| !input\.trim\(\)\}\s*onPointerDown=\{\(event\) => event\.preventDefault\(\)\}\s*aria-label="전송"/);
});

test("[실기 4] 프로필 시트 보이스톡 — 대화 종료 전이면 늘 넘기고, 전이 불가 세션은 응답 없음 연출 · 답장 생성 중 잠금", () => {
  const code = codeOnly(readFileSync(PAGE, "utf8"));
  assert.match(
    code,
    /voiceTalk=\{\s*chatEnded\s*\?\s*undefined\s*:\s*canVoiceTalk\s*\?\s*\{[\s\S]*?void handleVoiceTalkDial\(\);[\s\S]*?\}\s*:\s*\{[\s\S]*?handleVoiceTalkUnanswered\(\);[\s\S]*?disabled: turnLocked \|\| voiceTalkCall !== null,/,
  );
  assert.ok(code.includes('requestEscalation({ sessionId, via: "voice_talk" })'));
  assert.ok(code.includes('"보이스톡 연결 중…"') && code.includes('"상대방이 응답하지 않습니다"'));
  assert.ok(code.includes('aria-label="보이스톡 취소"'));
  // 응답 없음 메시지가 다음 전송의 답장으로 오인되지 않는다(기준점 하한).
  assert.match(code, /baseTurnIndex: Math\.max\([\s\S]*?voiceTalkFloorRef\.current,\s*\),/);
  // 종전 통화 전이 응답 판별은 합집합 타입에서 안전한 형태로.
  assert.ok(code.includes('"escalation" in result && result.escalation.toChannel === "voice"'));
});

test("[실기 4] 클라 · 서버 요청 · 응답 타입이 같은 모양이다", () => {
  const client = readFileSync("src/lib/api/types.ts", "utf8");
  const server = readFileSync("functions/src/session/types.ts", "utf8");
  for (const needle of [
    'export type RequestEscalationRequest = { sessionId: string; via?: "voice_talk" };',
    'export type RequestEscalationResponse = { escalation: { toChannel: "voice" } } | { voiceTalk: "unanswered"; turnIndex: number };',
  ]) {
    assert.ok(client.includes(needle), `클라: ${needle}`);
    assert.ok(server.includes(needle), `서버: ${needle}`);
  }
});
