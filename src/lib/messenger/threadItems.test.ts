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

test("[리뷰 Minor 3] 링크 칩이 붙은 통화 턴은 접지 않는다(누를 수 있던 링크 보존) · 앞뒤 통화 구간은 각각 접힌다", () => {
  const link = { ...m("c", 2, "voice"), attachments: [{ kind: "link" }] };
  const items = foldCallSegments([m("b", 1, "voice"), link, m("d", 3, "voice")]);
  assert.deepEqual(
    items.map((i) => (i.kind === "message" ? i.message.id : `call:${i.id}:${i.turnCount}`)),
    ["call:b:1", "c", "call:d:1"],
  );
  assert.equal(foldCallSegments([{ ...m("e", 0, "voice"), attachments: [] }])[0]!.kind, "call", "빈 첨부는 접는다");
});

test("[배선] 메신저 화면이 channel을 읽고 foldCallSegments로 그린다(소스 스캔)", () => {
  const page = readFileSync(new URL("../../app/session/messenger/page.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(page, /channel: data\.channel as string \| undefined/);
  assert.match(page, /foldCallSegments\(messages\)\.map\(/);
  assert.doesNotMatch(page, /\{messages\.map\(\(message\) =>/, "옛 직접 렌더가 남아 있으면 통화 전사가 다시 말풍선이 된다");
});
