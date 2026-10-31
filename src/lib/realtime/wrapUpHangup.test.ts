// 2026-10-31 실기 신고(운영 세션 c8184afd · 기관 사칭 고급 · "갑자기 아무 말 없이 통화가 종료") — §115 마무리 지시가 자기가 시킨 `end_call`을
// 6행(지시 대기)으로 막던 결함. 판정 = `isHangupInstructionPending`(순수) · 배선 = 부모 화면 소스 스캔(화면은 렌더할 수 없다).
// ⚠️ 줄바꿈 리터럴 앵커를 쓰지 않는다(CRLF 체크아웃) — 정규식은 `\s*`로 잇는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isHangupInstructionPending } from "../session/callEnding.ts";
import { enqueueInstruction, takeNextInstruction } from "../verifyintercept/verifyIntercept.ts";

const base = { queued: 0, busy: false, busyIsWrapUp: false, relaySwitchPending: false };

test("[판정표] 마무리 지시 처리 중의 end_call은 지시 대기가 아니다 · 그 밖 행은 종전 그대로", () => {
  // 신고 칸 — 큐 0 · 마무리 지시 처리 중.
  assert.equal(isHangupInstructionPending({ ...base, busy: true, busyIsWrapUp: true }), false);
  // 종전 행.
  assert.equal(isHangupInstructionPending(base), false);
  assert.equal(isHangupInstructionPending({ ...base, busy: true }), true, "다른 지시 처리 중은 종전처럼 막는다");
  assert.equal(isHangupInstructionPending({ ...base, queued: 1 }), true);
  assert.equal(isHangupInstructionPending({ ...base, queued: 1, busy: true, busyIsWrapUp: true }), true, "큐에 남은 지시가 있으면 막는다");
  assert.equal(isHangupInstructionPending({ ...base, busy: true, busyIsWrapUp: true, relaySwitchPending: true }), true);
});

test("[큐] wrapUp 표시는 큐를 지나도 남는다(드레인이 읽는 값)", () => {
  const queue = enqueueInstruction([], { text: "(마무리)", priority: "sms", smsNudge: true, wrapUp: true });
  assert.equal(takeNextInstruction(queue).item?.wrapUp, true);
});

const page = readFileSync("src/app/session/play/page.tsx", "utf8");

test("[배선] 마무리 지시만 wrapUp으로 넣고 · 드레인이 표시를 켜고 · 사기범 턴 경계가 끈다", () => {
  assert.match(page, /enqueueTurnInstruction\(result\.wrapUpInstruction, "sms", \{ smsNudge: true, wrapUp: true \}\);/);
  assert.equal((page.match(/wrapUp: true \}\);/g) ?? []).length, 1, "마무리 지시 밖에서 wrapUp을 켠다");
  assert.match(page, /instructionBusyRef\.current = true;\s*instructionBusyWrapUpRef\.current = item\.wrapUp === true;/);
  assert.match(page, /instructionBusyRef\.current = false;\s*instructionBusyWrapUpRef\.current = false;\s*drainInstructionQueue\(\);/);
});
