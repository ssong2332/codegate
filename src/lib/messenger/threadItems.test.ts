import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CALL_SEGMENT_ICON, CALL_SEGMENT_LINE, foldCallSegments } from "./threadItems.ts";

const m = (id: string, turnIndex: number, channel?: string, role: "scammer" | "user" = "scammer") => ({
  id,
  role,
  turnIndex,
  ...(channel ? { channel } : {}),
});

test("[신고 재현] 메신저 → 통화 → 메시지로 전환: 통화 전사는 말풍선이 아니라 통화 줄 1개로 접힌다", () => {
  const items = foldCallSegments([
    m("a", 0, "messenger"),
    m("b", 1, "messenger", "user"),
    m("c", 2, "voice"),
    m("d", 3, "voice", "user"),
    m("e", 4, "voice"),
    m("f", 5, "messenger"),
  ]);
  assert.deepEqual(
    items.map((i) => (i.kind === "message" ? i.message.id : `call:${i.id}:${i.turnCount}`)),
    ["a", "b", "call:c:3", "f"],
  );
});

test("[통화 구간] 떨어진 두 통화 구간은 각각 접힌다 · 통화로 끝나도 접힌다", () => {
  const items = foldCallSegments([m("a", 0, "voice"), m("b", 1, "messenger"), m("c", 2, "voice"), m("d", 3, "voice")]);
  assert.deepEqual(
    items.map((i) => (i.kind === "message" ? i.message.id : `call:${i.id}:${i.turnCount}`)),
    ["call:a:1", "b", "call:c:2"],
  );
});

test("[회귀 0] channel 부재(옛 메신저 세션)·messenger는 말풍선 그대로 · 같은 객체", () => {
  const input = [m("a", 0), m("b", 1, "messenger", "user")];
  const items = foldCallSegments(input);
  assert.equal(items.length, 2);
  assert.ok(items.every((i, k) => i.kind === "message" && i.message === input[k]));
  assert.deepEqual(foldCallSegments([]), []);
});

test("[문구] 통화 줄은 말풍선이 아닌 시스템 문구 · 리포트 안내 · 아이콘은 문구와 분리(aria-hidden — 리뷰 Minor 2)", () => {
  assert.equal(CALL_SEGMENT_ICON, "📞");
  assert.match(CALL_SEGMENT_LINE, /^통화/);
  assert.match(CALL_SEGMENT_LINE, /리포트/);
  assert.doesNotMatch(CALL_SEGMENT_LINE, /📞/);
});

// §131(3)(메인 세션 라이브 확인 2026-10-24) — 종전 리뷰 Minor 3(링크 붙은 통화 턴은 접지 않는다)은 대사를 말풍선으로 복제했다 → 판정표 F.
test("[§131(3) F1 · F2] 링크가 붙은 통화 턴도 접는다 — 대사는 말풍선 0 · 링크만 통화 줄 아래에 남는다", () => {
  const link = { ...m("c", 2, "voice"), attachments: [{ kind: "link", fakeLandingId: "child-insurance-install" }] };
  const items = foldCallSegments([m("b", 1, "voice"), link, m("d", 3, "voice")]);
  assert.deepEqual(
    items.map((i) => (i.kind === "message" ? i.message.id : `call:${i.id}:${i.turnCount}:${i.attachments.length}`)),
    ["call:b:3:1"],
  );
  assert.equal(foldCallSegments([{ ...m("e", 0, "voice"), attachments: [] }])[0]!.kind, "call", "빈 첨부는 접는다");
});

test("[§131(3) F3 · 신고 재현] 대화방 복귀 메시지가 같은 링크를 다시 붙이면 통화 줄 쪽 링크는 뺀다(링크 한 번만) · 다른 링크는 남는다", () => {
  const inCall = { ...m("c", 2, "voice"), attachments: [{ kind: "link", fakeLandingId: "child-insurance-install" }] };
  const back = { ...m("f", 4, "messenger"), attachments: [{ kind: "link", fakeLandingId: "child-insurance-install" }] };
  const items = foldCallSegments([m("a", 1, "messenger"), inCall, m("d", 3, "voice", "user"), back]);
  assert.deepEqual(
    items.map((i) => (i.kind === "message" ? i.message.id : `call:${i.id}:${i.turnCount}:${i.attachments.length}`)),
    ["a", "call:c:2:0", "f"],
  );
  const other = { ...back, attachments: [{ kind: "link", fakeLandingId: "other-landing" }] };
  const kept = foldCallSegments([inCall, other])[0]!;
  assert.ok(kept.kind === "call" && kept.attachments.length === 1, "다른 링크면 통화 줄 링크 유지");
});

test("[§131(3) 배선] 통화 줄 아래 링크 카드 · 말풍선 링크 카드가 같은 함수(renderLinkCard)", () => {
  const page = readFileSync(new URL("../../components/MessengerChatRoom.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(page, /\{item\.attachments\.map\(\(attachment, i\) => \(attachment\.kind === "link" \? renderLinkCard\(attachment, i, false\) : null\)\)\}/);
  assert.match(page, /attachment\.kind === "link" \? renderLinkCard\(attachment, i, message\.role === "scammer"\) : null,/);
  assert.equal((page.match(/recordMockScreen\(attachment\.fakeLandingId, "shown"\)/g) ?? []).length, 1);
});

test("[배선] 메신저 화면이 channel을 읽고 foldCallSegments로 그린다(소스 스캔)", () => {
  const page = readFileSync(new URL("../../components/MessengerChatRoom.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(page, /channel: data\.channel as string \| undefined/);
  // §89.5 ⓐ — 표시 규칙(이웃 항목 참조) 때문에 접힌 목록을 변수로 한 번 만든 뒤 그린다.
  // §94 — 공개 전 답장을 숨긴 목록(+ 낙관적 내 말풍선)을 접는다. 원천은 여전히 구독 `messages`다.
  assert.match(page, /const visibleMessages =[\s\S]*?: messages;/);
  assert.match(page, /const threadItems = foldCallSegments\(optimistic \? \[\.\.\.visibleMessages, optimistic\] : visibleMessages\);[\s\S]*\{threadItems\.map\(/);
  assert.doesNotMatch(page, /\{messages\.map\(\(message\) =>/, "옛 직접 렌더가 남아 있으면 통화 전사가 다시 말풍선이 된다");
});
