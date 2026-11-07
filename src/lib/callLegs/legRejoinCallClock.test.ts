// 2026-11-07 Edge 시험 판 26(카드사 고급 R1) · 판 1 — 끊은 통화의 같은 인물 재연결 첫 신호 · 통화(레그)마다 00:00부터 벽시계 경과.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LEG_DIALED_OPENING_TURN,
  LEG_REJOIN_CALLBACK_OPENING_TURN,
  LEG_REJOIN_REDIAL_OPENING_TURN,
  legOpeningTurnFor,
} from "./legTransition.ts";
import { callElapsedSince, formatCallElapsed } from "../phone/callClock.ts";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const page = read("src/app/session/play/page.tsx");

test("[판 26 재현] 끊은 배송원 통화에 배송원이 다시 걸어 옴(rejoin callback · entry incoming) — 첫 신호가 기본 트리거(null)가 아니라 '끊겼던 통화 잇기'", () => {
  // 수정 전: rejoin을 모르는 판정은 incoming 레그 연결에 null(= GeminiVoiceSession 기본 트리거 "신분과 전화를 건 이유를 밝혀라")을 돌려줬다.
  assert.equal(legOpeningTurnFor({ legOpening: true, connectionSeq: 2, entry: "incoming" }), null, "rejoin 없는 새 수신 통화 = 종전");
  assert.equal(legOpeningTurnFor({ legOpening: true, connectionSeq: 2, entry: "incoming", rejoin: "callback" }), LEG_REJOIN_CALLBACK_OPENING_TURN);
  assert.equal(legOpeningTurnFor({ legOpening: true, connectionSeq: 2, entry: "dial", rejoin: "redial" }), LEG_REJOIN_REDIAL_OPENING_TURN);
  // 새 통화(rejoin null) = 종전 판정 그대로.
  assert.equal(legOpeningTurnFor({ legOpening: true, connectionSeq: 2, entry: "dial", rejoin: null }), LEG_DIALED_OPENING_TURN);
  // 통화 중 다시 잇기(§99 · legOpening false) = rejoin이 남아 있어도 레그 판정 밖.
  assert.equal(legOpeningTurnFor({ legOpening: false, connectionSeq: 3, entry: "incoming", rejoin: "callback" }), undefined);
});

test("[판 26] 재연결 첫 신호 문면 — 처음부터 되풀이 금지 · 이미 보낸 문자 재발송 금지 · 짧게 · 세션 안 금지 문구 0(G437)", () => {
  assert.ok(LEG_REJOIN_CALLBACK_OPENING_TURN.includes("처음부터 되풀이하지 말고"));
  assert.ok(LEG_REJOIN_CALLBACK_OPENING_TURN.includes("이미 보낸 문자를 다시 보내 주겠다고 하지 마라"));
  assert.ok(LEG_REJOIN_CALLBACK_OPENING_TURN.includes("끊기기 전 단계에서 이어 간다"));
  assert.ok(LEG_REJOIN_REDIAL_OPENING_TURN.includes("네가 전화한 것이 아니다") && LEG_REJOIN_REDIAL_OPENING_TURN.includes("받는 쪽의 짧은 한마디"));
  for (const text of [LEG_REJOIN_CALLBACK_OPENING_TURN, LEG_REJOIN_REDIAL_OPENING_TURN]) {
    assert.ok(!/모의|훈련/.test(text), text);
  }
});

test("[판 26 배선] 서버 startCallLeg 응답 rejoin → 첫 신호 판정 입력", () => {
  const open = page.slice(page.indexOf("const openNextLeg = async"), page.indexOf("const beginLegTransition = async"));
  assert.ok(open.includes('if (result.status === "connected") {\n        setLegRejoin(result.rejoin ?? null);'));
  assert.ok(page.includes("legOpeningTurnFor({ legOpening, connectionSeq: realtime.connectionSeq, entry: realtime.credentials?.callLeg?.entry, rejoin: legRejoin })"));
  const types = read("src/lib/api/types.ts");
  assert.ok(types.includes('entry: "dial" | "transfer" | "incoming"; rejoin?: "redial" | "callback" }'));
});

test("[판 1 · 26 표] 통화 화면 경과 = 연결 시각부터 벽시계 · 모르면 종전 값", () => {
  const start = 1_000_000;
  assert.equal(callElapsedSince(start, start, 99), 0);
  assert.equal(callElapsedSince(start + 1_999, start, 99), 1);
  // 판 1 — 탭이 5분 멈췄다가 틱이 한 번만 와도 실제 경과(종전 +1 방식은 1초만 늘었다).
  assert.equal(formatCallElapsed(callElapsedSince(start + 300_000, start, 1)), "05:00");
  assert.equal(callElapsedSince(start - 5_000, start, 9), 0, "시계가 뒤로 가면 0");
  assert.equal(callElapsedSince(start, null, 42), 42, "연결 시각 모름 = 종전 값");
});

test("[판 26 배선] 새 통화(넘김 제외)마다 기점을 다시 잡고 00:00부터 · 화면 경과 표시는 전부 그 값 · 세션 경과는 그대로", () => {
  const connect = page.slice(page.indexOf("const connectLeg = (callerLabelForLeg"), page.indexOf("const openNextLeg = async"));
  assert.ok(connect.includes('if (via !== "transfer") {\n      callStartMsRef.current = callLogNowMs();\n      setCallDisplaySec(0);\n    }'));
  const answer = page.slice(page.indexOf("answeredAtMsRef.current = Date.now();"), page.indexOf("// ⭐ 수정안 A — **이 탭 핸들러 안에서 동기로**"));
  assert.ok(answer.includes("callStartMsRef.current = answeredAtMsRef.current;") && answer.includes("setCallDisplaySec(0);"));
  // 같은 타이머 effect 한 곳(새 setInterval 0 — toolWindowWiring 단언)에서 벽시계로 갱신.
  assert.ok(page.includes("setElapsedSec(elapsedSecRef.current);\n      setCallDisplaySec(callElapsedSince(Date.now(), callStartMsRef.current, elapsedSecRef.current));"));
  // 화면에 보이는 통화 경과는 전부 지금 통화 값(세션 경과 표시 0 — 녹음 표시는 차이 계산이라 그대로).
  assert.ok(!page.includes("formatCallElapsed(elapsedSec)") && !page.includes("spokenCallElapsed(elapsedSec)"));
  assert.ok(page.includes("{formatCallElapsed(callDisplaySec)}") && page.includes("aria-label={spokenCallElapsed(callDisplaySec)}"));
  // 세션 경과(한도 종료)는 바뀌지 않는다.
  assert.ok(page.includes("if (elapsedSec * 1000 < limitMs) return;"));
});
