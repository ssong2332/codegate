// §112(사용자 결정 2026-10-23 *"ai가 먼저 끊는 경우도 메신저로 넘어가도록"*) — 메신저발 통화의 사기범 끊기 → 대화방 복귀 판정 · 배선 고정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decideCallReturn } from "../callReturn";
import {
  CALL_RETURN_AFTER_SCAMMER_HANGUP_INSTRUCTION,
  CALL_RETURN_INSTRUCTION,
} from "../../roleplay/callReturnLine";

const SRC = path.resolve(__dirname, "../../../src");
const readSrc = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

test("[§112] 판정표 — 표식 없음 = 참가자가 끊음 · goal = 사기범 나감 · give_up · unspecified = 톡으로 이어감", () => {
  assert.equal(decideCallReturn(undefined), "follow_up_user");
  assert.equal(decideCallReturn({ kind: "goal" }), "scammer_left");
  assert.equal(decideCallReturn({ kind: "give_up" }), "follow_up_scammer");
  assert.equal(decideCallReturn({ kind: "unspecified" }), "follow_up_scammer");
});

test("[§112] 사기범 끊기 뒤 복귀 지시 — 끊긴 것을 짚고 톡으로 이어가며 다시 전화하겠다고 하지 않는다 · 참가자 끊기 지시와 다르다", () => {
  assert.match(CALL_RETURN_AFTER_SCAMMER_HANGUP_INSTRUCTION, /네 쪽에서 통화를 끊었고/);
  assert.match(CALL_RETURN_AFTER_SCAMMER_HANGUP_INSTRUCTION, /다시 전화하겠다는 말로 끝내지 않는다/);
  assert.notEqual(CALL_RETURN_AFTER_SCAMMER_HANGUP_INSTRUCTION, CALL_RETURN_INSTRUCTION);
  assert.match(
    readSrc("roleplay/callReturnLine.ts"),
    // §131(13) · (7) — 같은 지시를 배열 맨 앞에 두고 뒤에 재요구 금지 · 역할 고정 줄을 잇는다.
    /turnInstruction: \[\s*by === "scammer" \? CALL_RETURN_AFTER_SCAMMER_HANGUP_INSTRUCTION : CALL_RETURN_INSTRUCTION,/,
  );
});

test("[§112] requestReverseEscalation — 전이 뒤 판정 · goal은 세션 종료 + 리포트 트리거 + 복귀 메시지 0 · give_up은 표식 삭제 뒤 사기범용 복귀 메시지", () => {
  const session = readSrc("session/index.ts");
  const body = session.slice(session.indexOf("export const requestReverseEscalation"));
  const at = (s: string) => body.indexOf(s);
  assert.ok(at("await transitionChannel(") < at("const callReturn = decideCallReturn(session.scammerHangup);"));
  assert.ok(at("decideCallReturn(session.scammerHangup)") < at("recordCallReturnLine("));
  assert.match(body, /if \(endedNow\) await triggerReportGeneration\(sessionId\);\s*return \{ escalation: \{ toChannel: "messenger" \}, scammerLeft: true \};/);
  assert.match(body, /recordCallReturnLine\(db, sessionId, callReturn === "follow_up_scammer" \? "scammer" : "user"\)/);
  const record = readSrc("session/callReturn.ts");
  assert.match(record, /tx\.update\(sessionRef, \{ status: "ended", endReason: "scammer_ended", endedAt: Timestamp\.now\(\) \}\);/);
  assert.match(record, /tx\.update\(sessionRef, \{ scammerHangup: FieldValue\.delete\(\) \}\);/);
  assert.match(record, /if \(!fresh \|\| fresh\.status !== "active"\) return false;/);
});

test("[§112] sendMessage 폴백 끊기 — 메신저발 통화(escalatedCall)는 세션을 끝내지 않고 표식만 · 응답 scammerHungUp · 리포트 트리거 0 · 처음부터 통화는 종전", () => {
  const src = readSrc("roleplay/index.ts");
  assert.match(src, /const hangupEnded = hangupAccepted && !escalatedCall;/);
  assert.match(src, /const hangupToMessenger = hangupAccepted && escalatedCall;/);
  assert.match(src, /if \(hangupEnded\) \{\s*update\.status = "ended";\s*update\.endReason = "scammer_ended";/);
  assert.match(src, /update\.scammerHangup = \{ acceptedAt: endedAt, kind: hangupEffect\.kind, path: "fallback" \};/);
  assert.match(src, /\.\.\.\(finalize\.hangupToMessenger \? \{ scammerHungUp: true as const \} : \{\}\),/);
  // 리포트 트리거는 세션을 끝낸 경우(hangupEnded)만 — 메신저발 끊기는 역전환 뒤 판정이 맡는다.
  assert.match(src, /if \(\(limitReached \|\| finalize\.hangupEnded\) && finalize\.stillActive\) \{/);
});
