// G636 — 메신저 대화방 "보냄 → 읽음(1 사라짐) → 입력 중 → 답장" 순서(UX D-135 · docs/Architecture.md §92 · 실기 신고 2026-10-21).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  READ_MIN_MS,
  READ_TO_TYPING_MS,
  REVEAL_DOC_GRACE_MS,
  TYPING_MAX_MS,
  TYPING_MIN_MS,
  nextChangeAt,
  noteServerDone,
  noteSnapshot,
  replyPhaseAt,
  replyTimeline,
  typingDurationMs,
  viewReply,
  type PendingTurn,
} from "./replyChoreography.ts";

const base: PendingTurn = { localId: "l1", text: "그래?", sentAtMs: 10_000, baseTurnIndex: 2 };
const userDoc = { role: "user" as const, turnIndex: 3, text: "그래?" };
const replyDoc = { role: "scammer" as const, turnIndex: 4, text: "가".repeat(40) };

test("[G636] 답을 모르는 동안 = 1 유지 · 입력 중 없음 · 낙관적 말풍선 · 전송 잠김(신고 ② — 1과 입력 중이 함께 뜨지 않는다)", () => {
  for (const now of [10_000, 10_500, 30_000]) {
    const v = viewReply(base, [], now);
    assert.equal(v.phase, "unread");
    assert.equal(v.peerHasRead, false);
    assert.equal(v.showTyping, false);
    assert.equal(v.hideReply, true);
    assert.equal(v.showOptimistic, true);
    assert.equal(v.inFlight, true);
  }
  assert.equal(nextChangeAt(base, 10_000), null);
});

test("[G636] 빠른 응답 — 1 최소 유지 뒤 읽음 → 간격 → 입력 중(길이 비례) → 답장", () => {
  const p = noteSnapshot(base, [userDoc, replyDoc], 10_200); // 200ms 만에 답장 문서 도착
  const t = replyTimeline(p)!;
  assert.equal(t.readAt, 10_000 + READ_MIN_MS);
  assert.equal(t.typingAt, t.readAt + READ_TO_TYPING_MS);
  assert.equal(t.revealAt - t.typingAt, 40 * 45);
  assert.equal(replyPhaseAt(p, t.readAt - 1), "unread");
  assert.equal(replyPhaseAt(p, t.readAt), "read");
  assert.equal(replyPhaseAt(p, t.typingAt), "typing");
  assert.equal(replyPhaseAt(p, t.revealAt), "revealed");
  const reading = viewReply(p, [userDoc, replyDoc], t.readAt);
  assert.deepEqual([reading.peerHasRead, reading.showTyping, reading.hideReply], [true, false, true]);
  const typing = viewReply(p, [userDoc, replyDoc], t.typingAt);
  assert.deepEqual([typing.peerHasRead, typing.showTyping, typing.hideReply], [true, true, true]);
  assert.equal(typing.showOptimistic, false, "서버 문서가 오면 낙관적 말풍선은 문서로 바뀐다");
});

test("[G636] 늦은 응답 — 1을 단 채 기다리고, 늦은 만큼 입력 중을 줄인다(하한 유지)", () => {
  const p = noteSnapshot(base, [userDoc, replyDoc], 15_000); // 5초 걸림
  const t = replyTimeline(p)!;
  assert.equal(t.readAt, 15_000, "답을 안 순간에야 읽음");
  assert.equal(t.revealAt - t.typingAt, TYPING_MIN_MS);
  assert.equal(typingDurationMs(10, 0), TYPING_MIN_MS);
  assert.equal(typingDurationMs(500, 0), TYPING_MAX_MS);
  assert.equal(typingDurationMs(0, 0), 0);
});

test("[G636] 서버 응답이 구독보다 먼저 와도 같은 순서 · 답장 문서가 늦으면 점을 유지(여유 뒤 결과 적용)", () => {
  const p = noteServerDone(base, "가".repeat(20), { escalate: true }, 10_300);
  const t = replyTimeline(p)!;
  const before = viewReply(p, [userDoc], t.revealAt);
  assert.equal(before.showTyping, true, "공개 시각인데 문서가 없으면 점 유지");
  assert.equal(before.settled, false, "문서가 없으면 통화 전환을 미룬다");
  assert.equal(viewReply(p, [userDoc, replyDoc], t.revealAt).settled, true);
  const late = viewReply(p, [userDoc], t.revealAt + REVEAL_DOC_GRACE_MS);
  assert.deepEqual([late.showTyping, late.settled], [false, true], "구독이 끊겨도 영원히 멈추지 않는다");
  assert.equal(noteSnapshot(p, [userDoc, replyDoc], 12_000), p, "먼저 안 시각을 덮어쓰지 않는다");
});

test("[G636] 답 없이 끝남 — 입력 중 단계 없이 읽음과 동시에 정착", () => {
  const p = noteServerDone(base, undefined, { ended: true }, 10_100);
  const t = replyTimeline(p)!;
  assert.equal(t.typingAt, t.readAt);
  assert.equal(t.revealAt, t.readAt);
  assert.equal(viewReply(p, [userDoc], t.readAt).settled, true);
});

test("[G636] 실패 — 서버에 저장 안 됐으면 실패 말풍선 · 저장됐으면 문서 그대로 · 둘 다 전송 잠김 해제", () => {
  const failed: PendingTurn = { ...base, failed: true };
  const notSaved = viewReply(failed, [], 20_000);
  assert.deepEqual([notSaved.showOptimistic, notSaved.inFlight, notSaved.peerHasRead], [true, false, false]);
  const saved = viewReply(failed, [userDoc], 20_000);
  assert.deepEqual([saved.showOptimistic, saved.inFlight], [false, false]);
});

test("[G636] 대기 없음 — 모든 문서를 그대로 보인다", () => {
  const v = viewReply(null, [userDoc, replyDoc], 0);
  assert.deepEqual([v.hideReply, v.showTyping, v.showOptimistic, v.inFlight, v.settled], [false, false, false, false, true]);
});

test("[G636] 대화방 화면 배선 — 전송 즉시 입력 중을 띄우던 `sending &&` 분기와 입력칸 잠금이 없다", () => {
  const code = readFileSync("src/app/session/messenger/page.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  assert.ok(code.includes("viewReply("), "화면이 순서 판정 함수를 쓰지 않는다");
  assert.ok(!/\{sending && \(/.test(code), "전송 상태만으로 입력 중 점을 띄운다");
  assert.ok(!/disabled=\{sending\}/.test(code), "전송 중 입력칸을 잠가 키보드가 닫힌다");
});
