// 통화 중 문자 카탈로그 계약 테스트 (T68, UX-027/UF-008, AC-059/060/061).
//
// 이 파일이 고정하는 것은 "콘텐츠가 안전 불변식을 깨지 않는다"이다 — 카탈로그는 사람이 손으로
// 쓰는 콘텐츠라, 나중에 항목을 하나 추가하다가 실 URL이나 런타임 난수 인증번호가 섞여 들어오는
// 것이 이 기능에서 가장 현실적인 회귀다(AC-060/AC-061).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IN_CALL_SMS,
  findDueInCallSms,
  findInCallSmsItem,
  hasInCallSms,
  listInCallSmsTriggers,
} from "../inCallSms";
import {
  buildInCallSmsDoc,
  fallbackAnchorScammerTurn,
  realtimeAnchorScammerTurn,
} from "../../inCallSms/buildDoc";
import { PUBLIC_SCENARIOS } from "../publicMeta";
import { SCENARIO_PROMPTS } from "../index";

const allItems = Object.values(IN_CALL_SMS).flat();
/** T104 — `buildInCallSmsDoc`이 `landingKind` 판정을 위해 scenarioId를 받는다(§19.4 #2). */
const allEntries = Object.entries(IN_CALL_SMS).flatMap(([scenarioId, items]) =>
  items.map((item) => ({ scenarioId, item })),
);

test("[AC-060] 카탈로그 어디에도 실 URL(스킴/도메인) 필드·문자열이 존재하지 않는다(구조적 금지)", () => {
  assert.ok(allItems.length > 0, "카탈로그가 비어 있으면 이 기능은 영영 발동하지 않는다");
  for (const item of allItems) {
    // 타입에 url 필드가 없다는 것(컴파일 타임)에 더해, 본문·표시 텍스트에 실제로 눌러 이동할 수
    // 있는 주소 형태가 섞여 들어오는 것도 막는다.
    const surfaces = [item.body, item.linkDisplayText ?? "", item.senderLabel];
    for (const text of surfaces) {
      assert.ok(
        !/https?:\/\//i.test(text),
        `실 URL 스킴이 문자 콘텐츠에 있으면 안 된다: ${item.smsId}`,
      );
      assert.ok(
        !/\b[a-z0-9-]+\.(com|net|org|kr|co\.kr|io|link|shop)\b/i.test(text),
        `도메인 형태 문자열이 문자 콘텐츠에 있으면 안 된다: ${item.smsId}`,
      );
    }
    assert.ok(
      !Object.prototype.hasOwnProperty.call(item, "url"),
      `url 필드를 도입하면 안 된다: ${item.smsId}`,
    );
  }
});

test("[AC-060] kind별 필수 필드 계약 — link는 표시텍스트+가짜랜딩 참조, otp는 6자리 고정 리터럴", () => {
  for (const item of allItems) {
    if (item.kind === "link") {
      assert.ok(item.linkDisplayText, `link형은 linkDisplayText가 필요하다: ${item.smsId}`);
      assert.ok(item.fakeLandingId, `link형은 fakeLandingId가 필요하다: ${item.smsId}`);
      assert.equal(item.otpCode, undefined, `link형에 otpCode가 있으면 안 된다: ${item.smsId}`);
    }
    if (item.kind === "otp") {
      assert.match(item.otpCode ?? "", /^\d{6}$/, `otp형은 6자리 숫자여야 한다: ${item.smsId}`);
      // "런타임 난수 금지" — 같은 항목을 여러 번 읽어도 값이 같아야 한다(콘텐츠 고정 리터럴).
      assert.equal(
        findInCallSmsItem(
          Object.keys(IN_CALL_SMS).find((id) => IN_CALL_SMS[id].includes(item))!,
          item.smsId,
        )?.otpCode,
        item.otpCode,
      );
      assert.equal(item.fakeLandingId, undefined, `otp형에 링크가 있으면 안 된다: ${item.smsId}`);
    }
    if (item.kind === "account") {
      assert.equal(item.otpCode, undefined);
      assert.equal(item.fakeLandingId, undefined);
    }
  }
});

test("[AC-061] 인증번호형 문자는 본문에 '타인에게 알려주지 마세요'류 경고를 그대로 재현한다", () => {
  const otpItems = allItems.filter((item) => item.kind === "otp");
  assert.ok(otpItems.length > 0, "인증번호형이 하나도 없으면 사용자 신고가 해소되지 않는다");
  for (const item of otpItems) {
    assert.ok(
      item.body.includes("알려주지 마세요"),
      `경고 문구가 있어야 학습 포인트(모순)가 성립한다: ${item.smsId}`,
    );
    assert.ok(
      item.body.includes(item.otpCode ?? "__none__"),
      `본문에 인증번호가 실제로 표시돼야 한다: ${item.smsId}`,
    );
  }
});

test("[AC-060] announceInstruction은 '문자를 보냈다'는 사실만 알리게 하고 값 창작을 금지한다", () => {
  for (const item of allItems) {
    assert.ok(item.announceInstruction.includes("문자"), item.smsId);
    assert.ok(
      /지어내|읽어 주지/.test(item.announceInstruction),
      `모델이 계좌·인증번호 값을 창작하지 못하게 하는 문구가 필요하다: ${item.smsId}`,
    );
  }
});

test("smsId는 전역 유일하고, 시나리오 안에서 afterScammerTurns가 겹치지 않는다(결정론적 트리거)", () => {
  const ids = allItems.map((item) => item.smsId);
  assert.equal(new Set(ids).size, ids.length, "smsId가 중복되면 문서 id가 충돌한다");
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    const turns = items.map((item) => item.afterScammerTurns);
    assert.equal(
      new Set(turns).size,
      turns.length,
      `같은 턴에 두 문자가 도착하면 하나가 조용히 유실된다: ${scenarioId}`,
    );
    for (const turn of turns) {
      assert.ok(turn >= 1, `트리거 턴은 1 이상이어야 한다: ${scenarioId}`);
    }
  }
});

test("카탈로그의 모든 scenarioId가 실제 시나리오다(오탈자 = 영영 발동 안 함)", () => {
  for (const scenarioId of Object.keys(IN_CALL_SMS)) {
    assert.ok(PUBLIC_SCENARIOS[scenarioId], `공개 메타에 없는 시나리오: ${scenarioId}`);
    assert.ok(SCENARIO_PROMPTS[scenarioId], `프롬프트가 없는 시나리오: ${scenarioId}`);
    assert.notEqual(
      PUBLIC_SCENARIOS[scenarioId].channel,
      "messenger",
      `메신저 채널 시나리오에는 통화 중 문자가 성립하지 않는다: ${scenarioId}`,
    );
  }
});

test("[§15.6 G12] findInCallSmsItem은 다른 시나리오의 smsId를 거부한다(임의 문자 주입 차단)", () => {
  assert.ok(findInCallSmsItem("loan-refinance-scam", "loan-account"));
  assert.equal(
    findInCallSmsItem("tax-refund-scam", "loan-account"),
    undefined,
    "다른 시나리오 문자가 통과하면 임의 주입 경로가 된다",
  );
  assert.equal(findInCallSmsItem("loan-refinance-scam", "does-not-exist"), undefined);
  assert.equal(findInCallSmsItem("family-accident-deepvoice", "loan-account"), undefined);
});

test("listInCallSmsTriggers는 트리거만 내려주고 본문·인증번호를 노출하지 않는다(사전 유출 방지)", () => {
  const triggers = listInCallSmsTriggers("institutional-impersonation");
  assert.ok(triggers.length > 0);
  for (const trigger of triggers) {
    assert.deepEqual(Object.keys(trigger).sort(), ["afterScammerTurns", "smsId"]);
  }
  assert.deepEqual(listInCallSmsTriggers("family-accident-deepvoice"), []);
});

test("hasInCallSms / findDueInCallSms — 폴백 경로의 서버측 턴 계산이 실시간 규칙과 같다", () => {
  assert.equal(hasInCallSms("loan-refinance-scam"), true);
  assert.equal(hasInCallSms("family-accident-deepvoice"), false);
  assert.equal(findDueInCallSms("loan-refinance-scam", 3)?.smsId, "loan-account");
  assert.equal(findDueInCallSms("loan-refinance-scam", 4), undefined);
  assert.equal(findDueInCallSms("family-accident-deepvoice", 3), undefined);
});

test("buildInCallSmsDoc은 announceInstruction(모델용 지시)을 문서에 넣지 않는다(AC-024 계승)", () => {
  const fakeTimestamp = { seconds: 0, nanoseconds: 0 } as unknown as FirebaseFirestore.Timestamp;
  for (const { scenarioId, item } of allEntries) {
    const doc = buildInCallSmsDoc(item, fakeTimestamp, realtimeAnchorScammerTurn(item), scenarioId);
    assert.equal(
      (doc as unknown as Record<string, unknown>).announceInstruction,
      undefined,
      `프롬프트 재료가 클라로 나가면 안 된다: ${item.smsId}`,
    );
    assert.equal((doc as unknown as Record<string, unknown>).url, undefined);
    assert.equal(doc.smsId, item.smsId);
    assert.equal(doc.kind, item.kind);
    assert.equal(doc.body, item.body);
    if (item.kind === "otp") assert.equal(doc.otpCode, item.otpCode);
    else assert.equal(doc.otpCode, undefined);
    if (item.kind === "link") assert.equal(doc.fakeLandingId, item.fakeLandingId);
    else assert.equal(doc.fakeLandingId, undefined);
  }
});

test("[T104/§19.4 #3] buildInCallSmsDoc의 landingKind는 기본값이면 **키를 만들지 않는다**(무백필)", () => {
  const fakeTimestamp = { seconds: 0, nanoseconds: 0 } as unknown as FirebaseFirestore.Timestamp;
  for (const { scenarioId, item } of allEntries) {
    const doc = buildInCallSmsDoc(item, fakeTimestamp, realtimeAnchorScammerTurn(item), scenarioId);
    const raw = doc as unknown as Record<string, unknown>;
    // 현행 통화 경로 랜딩 3종은 전부 credential-form(=기본값)이라 **오늘 쓰이는 문서는 한 바이트도
    // 바뀌지 않는다.** `extractLinkMarker`의 생략 규칙과 글자 그대로 같은 규칙이다(드리프트 방지).
    assert.equal(
      Object.prototype.hasOwnProperty.call(raw, "landingKind"),
      false,
      `${scenarioId}/${item.smsId}: 기본값 kind에 키를 만들면 기존 문서와 형태가 갈라진다`,
    );
  }
});

// ── T89(§15.1.5 (4) / §15.6 G21) — 앵커 write 값 ────────────────────────────────
test("[T89] buildInCallSmsDoc은 신규 문서에 anchorScammerTurn을 **항상** 채운다(리졸버가 미해결로 떨어지지 않게)", () => {
  const fakeTimestamp = { seconds: 0, nanoseconds: 0 } as unknown as FirebaseFirestore.Timestamp;
  for (const { scenarioId, item } of allEntries) {
    const doc = buildInCallSmsDoc(item, fakeTimestamp, realtimeAnchorScammerTurn(item), scenarioId);
    assert.equal(
      typeof doc.anchorScammerTurn,
      "number",
      `앵커가 없으면 리포트 스냅샷이 anchorResolved:false로 떨어진다: ${item.smsId}`,
    );
  }
});

// ⚠️ G21이 "실측하고 어긋나면 리졸버가 아니라 write 지점 값을 ±1 하라"고 지목한 지점을 고정한다.
// 실측 사실 두 가지: (1) createSession이 오프닝 사기범 메시지를 turnIndex 0으로 **먼저** 쓴다
// (functions/src/session/index.ts), (2) 실시간 전사는 그 뒤에 append된다(submitTranscript.ts
// `nextIndex = historySnap.size`)이고 클라의 turn 카운터는 Live turnComplete만 센다.
// → 실시간은 +1, 폴백은 -1. 두 경로 모두 "문자 뒤 그 다음 사기범 발화가 announce"가 되도록 맞춘다.
test("[T89] 앵커 값 — 실시간=+1(오프닝 행 보정), 폴백=-1(응답 직전 write)", () => {
  const item = { afterScammerTurns: 3 } as Parameters<typeof realtimeAnchorScammerTurn>[0];
  assert.equal(realtimeAnchorScammerTurn(item), 4);
  assert.equal(fallbackAnchorScammerTurn(item), 2);
});
