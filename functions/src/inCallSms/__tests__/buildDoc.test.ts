// 통화 중 문자 응답 조립 — 전환(호 전환) 게이트 (T68/§53, Architecture.md §53.6 (3)/§53.8).
//
// ⚠️ 왜 이 파일이 새로 생겼는가: `functions/src/inCallSms/buildDoc.ts`는 지금까지 전용 테스트
// 파일이 없었다(카탈로그 콘텐츠 계약은 `scenarios/__tests__/inCallSms.test.ts`가 담당한다). 이
// 게이트는 카탈로그 콘텐츠가 아니라 **응답 조립 판정**이라 `verifyIntercept/__tests__/buildDoc.test.ts`
// (T118/R-1 선례 — `resolveVerifyOfferPlan`/`buildVerifyOfferResponse`)와 같은 형태로 이 폴더에 둔다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInCallSmsResponse, resolveInCallSmsPlan } from "../buildDoc";
import { IN_CALL_SMS } from "../../scenarios/inCallSms";

const allItems = Object.values(IN_CALL_SMS).flat();

// ── §53.6 (3)/T118-R-1 동형 — 전환(placedAt)이 끝난 오퍼가 연 문자에는 announceInstruction을
//    싣지 않는다 ─────────────────────────────────────────────────────────────────

test("[§53.8 3] resolveInCallSmsPlan — placed:true는 항상 includeInstruction:false", () => {
  assert.equal(resolveInCallSmsPlan({ placed: true }).includeInstruction, false);
});

test("[§53.8 3 회귀 0] resolveInCallSmsPlan — placed:false는 종전과 같이 includeInstruction:true", () => {
  assert.equal(resolveInCallSmsPlan({ placed: false }).includeInstruction, true);
});

test("[§53.6 (3)] `placed:true`에는 announceInstruction을 **싣지 않는다**(카탈로그 전 항목 — 차단)", () => {
  assert.ok(allItems.length > 0, "카탈로그가 비어 있으면 이 검증이 아무것도 보증하지 않는다");
  for (const item of allItems) {
    const response = buildInCallSmsResponse(item, { placed: true });
    assert.equal(response.announceInstruction, undefined, item.smsId);
    assert.equal(response.smsId, item.smsId, "smsId는 그대로 돌려준다(클라 렌더 소스)");
  }
});

test("[§53.6 (3) 역검증] `placed:false`에서는 응답이 오늘과 완전히 같다(카탈로그 전 항목 — 회귀 0)", () => {
  for (const item of allItems) {
    assert.deepEqual(buildInCallSmsResponse(item, { placed: false }), {
      smsId: item.smsId,
      announceInstruction: item.announceInstruction,
    });
  }
});

test("[§53.6 (3) 역검증 2] 게이트를 되돌린 사본은 실제로 지시를 실어 버린다(죽은 게이트가 아니다)", () => {
  // 되돌린 구현을 테스트 코드 안에서만 재현한다(실제 소스를 고쳤다 되돌리는 방식 금지 —
  // `callContinuity.test.ts`가 세운 관례).
  const beforeGate = (item: (typeof allItems)[number]) => ({
    smsId: item.smsId,
    announceInstruction: item.announceInstruction,
  });
  const bankItem = IN_CALL_SMS["bank-security-verify-scam"]?.[0];
  assert.ok(bankItem, "이 테스트는 bank-security-verify-scam 카탈로그가 있어야 성립한다");
  assert.notEqual(beforeGate(bankItem!).announceInstruction, undefined, "종전 동작 재현");
  assert.equal(
    buildInCallSmsResponse(bankItem!, { placed: true }).announceInstruction,
    undefined,
  );
});

// ── §53.8 7 — 하한 트립와이어(⛔ 계약이 아니라 회귀 방지, `openingLine.ts:80` 주석의 기계화) ──

test("[§53.8 7 트립와이어] IN_CALL_SMS 전 항목의 afterScammerTurns는 2 이상이다", () => {
  for (const item of allItems) {
    assert.ok(
      item.afterScammerTurns >= 2,
      `${item.smsId}: afterScammerTurns=${item.afterScammerTurns}. ` +
        "1은 실시간에서 오프닝 인사 직후(참가자 발화 0건)에 도착하고 폴백에서는 영원히 도착하지 " +
        "않는다 — docs/Architecture.md §53.3",
    );
  }
});

test("[§53.8 7 트립와이어 역검증] afterScammerTurns:1인 항목이 섞이면 실제로 걸린다(죽은 게이트가 아니다)", () => {
  const poisoned = [...allItems, { ...allItems[0], smsId: "poison", afterScammerTurns: 1 }];
  const offenders = poisoned.filter((item) => item.afterScammerTurns < 2).map((item) => item.smsId);
  assert.deepEqual(offenders, ["poison"]);
});
