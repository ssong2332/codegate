// 앵커 계산 + 폴백 턴 지시 선택 (T83, §16.3.2 / §16.6 G28·G31).
//
// ⚠️ G28이 지목한 지점이다 — "이 산술은 단위 테스트만으로 끝내지 말고 **에뮬레이터 실측**으로
// 확인한다". 이 파일은 그 실측 **전에** 값을 못박는 회귀 그물이고, 실측 결과는 구현 보고서에 남는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackVerifyAnchor, realtimeVerifyAnchor } from "../buildDoc";
import { pickFallbackTurnInstruction } from "../fallbackTurn";

test("[§16.3.2] 실시간 앵커 = scammerTurns + 1(오프닝 사기범 행 보정)", () => {
  // 실측 사실: `createSession`이 오프닝 사기범 메시지를 turnIndex 0으로 **먼저** 쓰고, 실시간
  // 전사는 그 뒤에 append된다. 클라의 카운터는 Live turnComplete만 세므로 문서 수는 1 + N이다.
  assert.equal(realtimeVerifyAnchor(0), 1);
  assert.equal(realtimeVerifyAnchor(2), 3);
  assert.equal(realtimeVerifyAnchor(5), 6);
});

test("[§16.3.2] 폴백 앵커 = 서버가 센 scammer 문서 수(보정 없음)", () => {
  // 이 경로에는 실제 메시지가 이미 존재하므로 클라 값을 믿을 필요가 없다.
  assert.equal(fallbackVerifyAnchor(1), 1);
  assert.equal(fallbackVerifyAnchor(4), 4);
});

test("앵커는 음수·소수를 흘려보내지 않는다(위조 입력 방어 — 표시 위치만 흔들리지만 조용히 두지 않는다)", () => {
  assert.equal(realtimeVerifyAnchor(-3), 1);
  assert.equal(realtimeVerifyAnchor(2.9), 3);
  assert.equal(fallbackVerifyAnchor(-1), 0);
});

// ── 폴백 경로 턴 지시 선택(§16.6 G31) ──────────────────────────────────────────
test("[G31] 문자 announce와 확인 announce가 같은 턴에 due면 **문자가 우선**하고 확인은 보류된다", () => {
  const choice = pickFallbackTurnInstruction({
    smsDue: true,
    verify: { announced: false, placed: false },
    scammerDocCount: 3,
  });
  assert.equal(choice, "sms_announce");
});

test("[G31 (2)] 보류된 확인 announce는 **버려지지 않는다** — 다음 턴에 다시 due가 된다", () => {
  const nextTurn = pickFallbackTurnInstruction({
    smsDue: false,
    verify: { announced: false, placed: false },
    scammerDocCount: 4,
  });
  assert.equal(nextTurn, "verify_announce", "announcedAt 부재가 곧 큐다");
});

test("이미 announce된 오퍼는 다시 주입하지 않는다(중복 권유 방지)", () => {
  assert.equal(
    pickFallbackTurnInstruction({
      smsDue: false,
      verify: { announced: true, placed: false },
      scammerDocCount: 5,
    }),
    "none",
  );
});

test("[판정 앵커 보호] 재연결 대사는 **그 턴 하나에만** 자리가 있어 문자보다 우선한다", () => {
  // reconnectAnchorScammerTurn === 지금까지의 scammer 문서 수 → 이번 턴에 만들어질 대사가
  // 정확히 `scammers[reconnectAnchorScammerTurn]`(=리포트의 판정 앵커)이다.
  assert.equal(
    pickFallbackTurnInstruction({
      smsDue: true,
      verify: { announced: true, placed: true, reconnectAnchorScammerTurn: 4 },
      scammerDocCount: 4,
    }),
    "verify_reconnect",
  );
  // 그 턴이 아니면 재연결 지시를 다시 넣지 않는다(중복 자기소개 방지).
  assert.equal(
    pickFallbackTurnInstruction({
      smsDue: false,
      verify: { announced: true, placed: true, reconnectAnchorScammerTurn: 4 },
      scammerDocCount: 5,
    }),
    "none",
  );
});

test("확인 문서가 없으면 선택 결과가 기존 T68 동작과 동일하다(회귀 0)", () => {
  assert.equal(pickFallbackTurnInstruction({ smsDue: true, scammerDocCount: 3 }), "sms_announce");
  assert.equal(pickFallbackTurnInstruction({ smsDue: false, scammerDocCount: 3 }), "none");
});
