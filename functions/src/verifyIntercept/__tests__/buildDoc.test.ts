// 앵커 계산 + 폴백 턴 지시 선택 (T83, §16.3.2 / §16.6 G28·G31).
//
// ⚠️ G28이 지목한 지점이다 — "이 산술은 단위 테스트만으로 끝내지 말고 **에뮬레이터 실측**으로
// 확인한다". 이 파일은 그 실측 **전에** 값을 못박는 회귀 그물이고, 실측 결과는 구현 보고서에 남는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  announcedVerifyAnchor,
  buildVerifyOfferResponse,
  fallbackVerifyAnchor,
  realtimeVerifyAnchor,
  resolveVerifyOfferPlan,
} from "../buildDoc";
import { pickFallbackTurnInstruction } from "../fallbackTurn";
import { VERIFY_INTERCEPT } from "../../scenarios/verifyIntercept";

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
  assert.equal(announcedVerifyAnchor(-3), 1);
  assert.equal(announcedVerifyAnchor(2.9), 3);
});

// ── §45.7 V1 — 폴백 앵커를 **예고를 말하는 턴**으로 옮긴다(§45.6 F2-b · P-2로 100% 재현) ──────
test("[§45.7 V1] announce 시점 앵커 = 이번 턴에 생성될 사기범 응답의 1-기반 순번", () => {
  // 이번 응답을 만들기 **전**의 사기범 문서 수가 N이면, 지금 만들어질 예고 대사는 N+1번째다.
  assert.equal(announcedVerifyAnchor(0), 1);
  assert.equal(announcedVerifyAnchor(4), 5);
});

test("[§45.7 V1] ⛔ F2-b 회귀 그물 — announce 앵커는 오퍼 write 시점 앵커보다 **정확히 1 크다**", () => {
  // P-2 실측(격리 에뮬레이터 3/3, institutional-impersonation):
  //   오퍼 write 시점 scammerDocCount=4 ⇒ offerAnchorScammerTurn=4 ⇒ turnIndex 6
  //   예고 대사는 그 **다음** sendMessage 턴 ⇒ 사기범 5번째 ⇒ turnIndex 8
  // ⇒ 두 값이 같아지면(=갱신이 사라지면) 카드가 다시 예고보다 앞에 놓인다.
  const scammerDocCountAtOffer = 4;
  const scammerDocCountAtAnnounce = 4; // 오퍼 요청 직후 턴이라 아직 같은 값이다
  assert.equal(fallbackVerifyAnchor(scammerDocCountAtOffer), 4);
  assert.equal(announcedVerifyAnchor(scammerDocCountAtAnnounce), 5);
  assert.equal(
    announcedVerifyAnchor(scammerDocCountAtAnnounce) - fallbackVerifyAnchor(scammerDocCountAtOffer),
    1,
  );
});

/**
 * ⭐⭐ **배선 게이트 — 순수 함수 테스트만으로는 V1을 지킬 수 없다.**
 *
 * `announcedVerifyAnchor`는 옳은데 **호출부가 사라지면** 위 테스트는 전부 초록인 채로 결함이
 * 되돌아온다(이 저장소가 반복해서 데인 양식 — 관측 불가 지점에 걸린 동작). 호출부가 Firestore
 * write라 유닛으로 관측할 수 없으므로 **소스 스캔**으로 고정한다(`secretInjectionLayer1.test.ts`
 * 관례 — 테스트는 `lib/`에서 돌므로 소스 경로를 명시적으로 잡는다).
 */
const ROLEPLAY_SRC = path.resolve(__dirname, "../../../src/roleplay/index.ts");

test("[§45.7 V1 배선] verify_announce 분기가 announcedAt과 **같은 write**로 앵커를 갱신한다", () => {
  const src = readFileSync(ROLEPLAY_SRC, "utf8");
  const branch = src.slice(src.indexOf('turnChoice === "verify_announce"'));
  const updateCall = branch.slice(branch.indexOf("verifyOfferRef.update("));
  const updateArgs = updateCall.slice(0, updateCall.indexOf("})") + 2);
  assert.ok(
    updateArgs.includes("announcedAt:"),
    "announcedAt 마킹이 이 분기에 있어야 한다(§38.4 C — 폴백 컨트롤 선행 조건, G188)",
  );
  assert.ok(
    /offerAnchorScammerTurn:\s*announcedVerifyAnchor\(scammerDocCount\)/.test(updateArgs),
    "⛔ 앵커 갱신이 사라지면 F2-b(카드가 예고 대사보다 앞)가 그대로 되돌아온다 — §45.7 V1",
  );
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

// ── T84 증분: 모의 설치 응낙 지시(§15.9.3 / §15.9.7 G55) ──────────────────────
test("[T84] 설치 응낙 지시는 다른 지시가 없을 때 선택된다", () => {
  assert.equal(
    pickFallbackTurnInstruction({ smsDue: false, scammerDocCount: 2, installConsentDue: true }),
    "install_consent",
  );
});

test("[G55] 문자 announce가 같은 턴에 due면 문자가 이기고 설치 지시는 **이월**된다", () => {
  assert.equal(
    pickFallbackTurnInstruction({ smsDue: true, scammerDocCount: 2, installConsentDue: true }),
    "sms_announce",
  );
  // 이월된 지시는 버려지지 않는다 — `consentAnnouncedAt` 미세팅이 곧 큐라서 다음 턴에 다시 due다.
  assert.equal(
    pickFallbackTurnInstruction({ smsDue: false, scammerDocCount: 3, installConsentDue: true }),
    "install_consent",
  );
});

test("[T84 회귀 0] installConsentDue가 없으면 기존 선택 결과가 한 건도 바뀌지 않는다", () => {
  for (const smsDue of [true, false]) {
    for (const installConsentDue of [undefined, false]) {
      assert.equal(
        pickFallbackTurnInstruction({ smsDue, scammerDocCount: 3, installConsentDue }),
        smsDue ? "sms_announce" : "none",
      );
    }
  }
});

// ── T118 / R-1 (§25.5 (4) · §25.9 ⑤) ─────────────────────────────────────────────
// 전환이 끝난 뒤(`placedAt` 존재)의 확인 권유는 참가자가 겪은 사실과 모순이다. 종전 구현은 오퍼
// 문서가 이미 있어도 지시를 **무조건** 돌려줬고, 그것이 증상 ①의 (가) 갈래(중복 주입)의 경로였다.
// ⛔ 이 처방은 (나)(모델이 스스로 반복)를 대체하지 않는다 — 그쪽은 층 A5다(**G102**).

test("[T118/R-1] `placedAt`이 있는 오퍼에는 announceInstruction을 **싣지 않는다**(6종 전수)", () => {
  for (const item of Object.values(VERIFY_INTERCEPT)) {
    const placed = buildVerifyOfferResponse(item, { placed: true });
    assert.equal(placed.announceInstruction, undefined, item.offerId);
    assert.equal(placed.offerId, item.offerId, "offerId는 그대로 돌려준다(클라 렌더 소스)");
  }
});

test("[T118/R-1] 전환 **전**에는 종전과 똑같이 지시를 싣는다(회귀 0)", () => {
  for (const item of Object.values(VERIFY_INTERCEPT)) {
    assert.deepEqual(buildVerifyOfferResponse(item, { placed: false }), {
      offerId: item.offerId,
      announceInstruction: item.announceInstruction,
    });
  }
});

test("[T118/R-1 역검증] 분기를 되돌린 **사본**은 실제로 지시를 실어 버린다(죽은 게이트가 아니다)", () => {
  // 되돌린 구현을 테스트 코드 안에서만 재현한다(실제 소스를 고쳤다 되돌리는 방식 금지 —
  // `callContinuity.test.ts`가 세운 관례).
  const beforeR1 = (item: (typeof VERIFY_INTERCEPT)[string]) => ({
    offerId: item.offerId,
    announceInstruction: item.announceInstruction,
  });
  const item = VERIFY_INTERCEPT["bank-security-verify-scam"];
  assert.notEqual(beforeR1(item).announceInstruction, undefined, "종전 동작 재현");
  assert.equal(buildVerifyOfferResponse(item, { placed: true }).announceInstruction, undefined);
});

// ══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §38.4 후보 E — **2단 오퍼**(P-2). `stage` × `placed` 4칸 전수.
//
// 이 표가 흩어지면 *"1단계는 R-1을 보는데 2단계는 안 본다"* 같은 비대칭이 **에러 없이** 생긴다
// (§38.7 5). 판정은 `resolveVerifyOfferPlan` 한 곳이 소유하고 여기서 전수로 못박는다.
// ══════════════════════════════════════════════════════════════════════════════
test("[§38.4 E / P-2] stage × placed 판정표 전수", () => {
  const rows = [
    // stage 부재 = 종전 동작(폴백 경로) — 문서를 쓰고 지시를 싣는다.
    { stage: undefined, placed: false, persist: true, includeInstruction: true },
    { stage: undefined, placed: true, persist: false, includeInstruction: false },
    // ⭐ 1단계 — write를 미룬다(E의 본체). 지시는 그대로 나간다.
    { stage: "announce" as const, placed: false, persist: false, includeInstruction: true },
    { stage: "announce" as const, placed: true, persist: false, includeInstruction: false },
    // ⭐ 2단계 — 예고 턴이 끝난 뒤 문서를 만든다. 지시는 **다시 주지 않는다**(중복 주입 금지).
    { stage: "commit" as const, placed: false, persist: true, includeInstruction: false },
    { stage: "commit" as const, placed: true, persist: false, includeInstruction: false },
  ];
  for (const row of rows) {
    assert.deepEqual(
      resolveVerifyOfferPlan({ placed: row.placed, ...(row.stage ? { stage: row.stage } : {}) }),
      { persist: row.persist, includeInstruction: row.includeInstruction },
      `stage=${row.stage ?? "(부재)"} placed=${row.placed}`,
    );
  }
});

test("[§38.4 E / P-2 역검증] 1단계에서 write를 하면 순서 교정이 통째로 무의미해진다", () => {
  // ⭐ 종전 동작(= stage 부재)이 정확히 그것이다 — 같은 입력에서 persist가 갈린다.
  assert.equal(resolveVerifyOfferPlan({ placed: false }).persist, true, "종전 동작 재현");
  assert.equal(
    resolveVerifyOfferPlan({ stage: "announce", placed: false }).persist,
    false,
    "⭐ 1단계는 문서를 만들지 않는다 — 문서 존재 = 예고 완료라는 판별자가 여기서 성립한다",
  );
});

test("[§38.4 E / T118 R-1 유지] 전환이 끝난 오퍼에는 **어느 단계에서도** 지시가 실리지 않는다", () => {
  const item = VERIFY_INTERCEPT["bank-security-verify-scam"];
  for (const stage of [undefined, "announce", "commit"] as const) {
    assert.equal(
      buildVerifyOfferResponse(item, { placed: true, ...(stage ? { stage } : {}) })
        .announceInstruction,
      undefined,
      `stage=${stage ?? "(부재)"}`,
    );
  }
});

test("[§38.4 E] 1단계 응답은 종전 응답과 **바이트 동일**하다(응답 스키마 델타 0건)", () => {
  for (const item of Object.values(VERIFY_INTERCEPT)) {
    assert.deepEqual(
      buildVerifyOfferResponse(item, { placed: false, stage: "announce" }),
      buildVerifyOfferResponse(item, { placed: false }),
      "클라가 1단계에서 받는 것은 종전과 같다 — 바뀐 것은 **문서 write 시점**뿐이다",
    );
  }
});
