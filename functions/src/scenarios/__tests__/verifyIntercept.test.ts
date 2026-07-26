// 확인 시도 무력화 카탈로그 계약 테스트 (T83, UX-031/UF-011, AC-071/AC-019/AC-033/AC-005).
//
// 이 파일이 고정하는 것은 "콘텐츠가 안전 불변식을 깨지 않는다"이다 — 카탈로그는 사람이 손으로 쓰는
// 콘텐츠라, 나중에 항목을 추가하다가 실존 대표번호나 실 URL이 섞여 들어오는 것이 이 기능에서 가장
// 현실적인 회귀다(AC-033/AC-005/AC-019).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VERIFY_INTERCEPT,
  findVerifyInterceptItem,
  getVerifyOfferTrigger,
  hasVerifyIntercept,
} from "../verifyIntercept";
import { buildVerifyInterceptDoc } from "../../verifyIntercept/buildDoc";
import { PUBLIC_SCENARIOS } from "../publicMeta";
import { SCENARIO_PROMPTS } from "../index";

const allItems = Object.values(VERIFY_INTERCEPT);

test("[AC-019] 카탈로그 어디에도 실 발신 표면(url/tel/발신 대상·실 주소)이 존재하지 않는다", () => {
  assert.ok(allItems.length > 0, "카탈로그가 비어 있으면 이 기능은 영영 발동하지 않는다");
  for (const item of allItems) {
    for (const key of ["url", "tel", "phoneNumber", "dialTarget", "href"]) {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(item, key),
        `발신 관련 필드를 도입하면 안 된다(${key}): ${item.offerId}`,
      );
    }
    const surfaces = [item.deskLabel, item.displayNumber, item.reconnectedCallerLabel];
    for (const text of surfaces) {
      assert.ok(!/https?:\/\//i.test(text), `실 URL 스킴 금지: ${item.offerId}`);
      assert.ok(!/tel:/i.test(text), `tel: 스킴 금지: ${item.offerId}`);
    }
  }
});

test("[AC-033/AC-005] displayNumber는 마지막 네 자리가 0000인 고정 형식이다(architect 고정, §16.1.3)", () => {
  for (const item of allItems) {
    assert.match(
      item.displayNumber,
      /^\d{3,4}-0000$/,
      `모의 번호 형식이 어긋나면 실제 번호로 오인될 수 있다: ${item.offerId}`,
    );
  }
});

// ⚠️ 검사 대상은 **카탈로그의 deskLabel/displayNumber로 한정**한다(§16.1.3 경고) — AC-071은 리포트
// 신고처로 112·1332를 **명시 요구**하므로 이 목록을 전역 금지어로 만들면 AC-071을 스스로 위반한다.
const REAL_WORLD_FORBIDDEN = [
  "112",
  "1332",
  "1577",
  "1588",
  "1544",
  "국세청",
  "경찰청",
  "금융감독원",
  "검찰청",
  "금감원",
  "우체국",
  "관세청",
];

test("[AC-033/AC-005] deskLabel·displayNumber에 실존 기관명·실존 대표번호가 부분 문자열로도 없다", () => {
  for (const item of allItems) {
    for (const forbidden of REAL_WORLD_FORBIDDEN) {
      assert.ok(
        !item.deskLabel.includes(forbidden),
        `실존 기관·번호가 창구명에 있으면 안 된다(${forbidden}): ${item.offerId}`,
      );
      assert.ok(
        !item.displayNumber.includes(forbidden),
        `실존 대표번호와 부분 일치하면 안 된다(${forbidden}): ${item.offerId}`,
      );
      assert.ok(
        !item.reconnectedCallerLabel.includes(forbidden),
        `재연결 라벨도 같은 규칙이다(${forbidden}): ${item.offerId}`,
      );
    }
  }
});

// 역방향 확인 — 위 검사가 실제로 잡는다는 증명(T86 관례).
test("[역검증] 실존 기관명이 섞이면 위 금지 검사가 실패한다", () => {
  const tainted = { deskLabel: "국세청 확인창구", displayNumber: "1588-0000" };
  assert.ok(REAL_WORLD_FORBIDDEN.some((word) => tainted.deskLabel.includes(word)));
  assert.ok(REAL_WORLD_FORBIDDEN.some((word) => tainted.displayNumber.includes(word)));
});

test("[AC-005] 모델 지시에 가로채기의 **수단** 서술이 없다(어느 단계에서도 재현·설명 대상 아님)", () => {
  const MEANS = /착신\s*전환|포워딩|중계|우회|번호 목록|앱을 설치하면 통화가/;
  for (const item of allItems) {
    for (const instruction of [item.announceInstruction, item.reconnectInstruction]) {
      assert.ok(!MEANS.test(instruction), `수단 서술이 지시에 들어가면 안 된다: ${item.offerId}`);
    }
  }
});

test("[OQ-38/D-6] 구조 설명 문구는 **금지 지시로만** 등장한다(세션 중 구조 설명 0건)", () => {
  // OQ-38 확정 = 세션 중에는 상황만 재현한다. 다만 모델이 스스로 "어디에 걸어도 같은 곳"이라고
  // 말해 버리면 그 확정이 깨지므로, 카탈로그는 그 문구를 **금지 지시**로 명시해야 한다.
  // → 등장 자체를 막는 대신, 등장할 때 **반드시 금지형**(…하지 마라)이어야 한다고 고정한다.
  const STRUCTURE = /같은 곳으로 이어|같은 조직|같은 사람/g;
  for (const item of allItems) {
    for (const instruction of [item.announceInstruction, item.reconnectInstruction]) {
      for (const match of instruction.matchAll(STRUCTURE)) {
        const after = instruction.slice(match.index ?? 0, (match.index ?? 0) + 60);
        assert.ok(
          /하지\s*마라|말하지\s*마라|마라/.test(after),
          `구조 설명 문구가 금지형이 아니면 세션 중에 실제로 나간다: ${item.offerId}`,
        );
      }
    }
    assert.ok(
      /같은 곳으로 이어진다/.test(item.announceInstruction),
      `"…라고 말하지 마라" 형태의 금지 문구가 필요하다: ${item.offerId}`,
    );
  }
});

test("[역검증] 금지형이 아닌 구조 설명이 섞이면 위 검사가 실패한다", () => {
  const tainted = "어디에 걸어도 같은 곳으로 이어진다고 알려줘라.";
  const match = /같은 곳으로 이어/.exec(tainted);
  const after = tainted.slice(match?.index ?? 0, (match?.index ?? 0) + 60);
  assert.ok(!/하지\s*마라|말하지\s*마라|마라/.test(after));
});

test("[AC-071] announceInstruction은 확인을 **막지 않고 권하게** 하고 번호 창작을 금지한다", () => {
  for (const item of allItems) {
    assert.ok(/확인/.test(item.announceInstruction), item.offerId);
    assert.ok(
      /막지 말고|권하라/.test(item.announceInstruction),
      `확인 의사를 막지 않고 권하는 지시가 있어야 AC-071이 성립한다: ${item.offerId}`,
    );
    assert.ok(
      /지어내/.test(item.announceInstruction),
      `모델이 번호를 창작하지 못하게 하는 문구가 필요하다: ${item.offerId}`,
    );
    assert.ok(
      item.announceInstruction.includes(item.deskLabel),
      `모델이 부를 창구 이름은 카탈로그 값과 같아야 한다(화면·대사 불일치 방지): ${item.offerId}`,
    );
  }
});

test("[AC-071] reconnectInstruction은 **다른 담당자**로 전환시키고 앞선 요구를 확인해 주게 한다", () => {
  for (const item of allItems) {
    assert.ok(
      /다른 담당자|다른 상담원/.test(item.reconnectInstruction),
      `표면 전환(§16.5 ③)이 없으면 재연결이 재현되지 않는다: ${item.offerId}`,
    );
    assert.ok(
      /확인/.test(item.reconnectInstruction) && /이어가라/.test(item.reconnectInstruction),
      `앞선 요구를 "확인해 드렸다"는 형태로 되풀이해야 한다(§16.5 ④): ${item.offerId}`,
    );
  }
});

test("가용 게이트는 2~3턴(§16.1.4 권고 범위)이고 결정론적이다", () => {
  for (const item of allItems) {
    assert.ok(
      item.availableAfterScammerTurns >= 2 && item.availableAfterScammerTurns <= 3,
      `게이트가 범위를 벗어나면 요구 전/후 맥락이 어긋난다: ${item.offerId}`,
    );
  }
});

test("offerId는 전역 유일하고, 시나리오당 최대 1건이다(§16.1.3)", () => {
  const ids = allItems.map((item) => item.offerId);
  assert.equal(new Set(ids).size, ids.length, "offerId가 중복되면 문서 id가 충돌한다");
  // Record<scenarioId, item> 타입 자체가 "시나리오당 1건"을 강제한다(배열이 아니다).
  assert.equal(allItems.length, Object.keys(VERIFY_INTERCEPT).length);
});

test("카탈로그의 모든 scenarioId가 실제 시나리오이며 **지시 주입이 가능한 경로**다", () => {
  for (const scenarioId of Object.keys(VERIFY_INTERCEPT)) {
    assert.ok(PUBLIC_SCENARIOS[scenarioId], `공개 메타에 없는 시나리오: ${scenarioId}`);
    assert.ok(SCENARIO_PROMPTS[scenarioId], `프롬프트가 없는 시나리오: ${scenarioId}`);
    assert.notEqual(
      PUBLIC_SCENARIOS[scenarioId].channel,
      "messenger",
      `메신저 채널에는 통화 셸이 없어 오버레이 계층이 성립하지 않는다: ${scenarioId}`,
    );
    // §16.6 G23 — clone(=ElevenLabs) 시나리오에는 지시 주입 지점이 없다. 카탈로그에 넣으면
    // 컨트롤만 뜨고 사기범이 아무 말도 하지 않는 반대 방향 불일치가 생긴다.
    assert.notEqual(
      PUBLIC_SCENARIOS[scenarioId].voiceMode,
      "clone",
      `clone 경로에는 확인 무력화가 성립하지 않는다(G23): ${scenarioId}`,
    );
  }
});

test("[§16.6 G24] findVerifyInterceptItem은 다른 시나리오·다른 offerId를 거부한다(위조 호출 차단)", () => {
  assert.ok(findVerifyInterceptItem("institutional-impersonation"));
  assert.ok(
    findVerifyInterceptItem("institutional-impersonation", "institution-verify-desk"),
  );
  assert.equal(
    findVerifyInterceptItem("institutional-impersonation", "card-verify-desk"),
    undefined,
    "다른 시나리오의 offerId가 통과하면 임의 주입 경로가 된다",
  );
  assert.equal(findVerifyInterceptItem("family-accident-deepvoice"), undefined);
  assert.equal(findVerifyInterceptItem("does-not-exist", "institution-verify-desk"), undefined);
});

test("hasVerifyIntercept / getVerifyOfferTrigger — 게이트만 내려주고 창구명·번호·지시는 노출하지 않는다", () => {
  assert.equal(hasVerifyIntercept("institutional-impersonation"), true);
  assert.equal(hasVerifyIntercept("family-accident-deepvoice"), false);
  const trigger = getVerifyOfferTrigger("institutional-impersonation");
  assert.deepEqual(Object.keys(trigger ?? {}), ["availableAfterScammerTurns"]);
  assert.equal(getVerifyOfferTrigger("family-accident-deepvoice"), undefined);
});

test("[AC-024] buildVerifyInterceptDoc은 모델 지시를 문서에 넣지 않는다(프롬프트 클라 미노출)", () => {
  const fakeTimestamp = { seconds: 0, nanoseconds: 0 } as unknown as FirebaseFirestore.Timestamp;
  for (const item of allItems) {
    const doc = buildVerifyInterceptDoc(item, fakeTimestamp, 3) as unknown as Record<
      string,
      unknown
    >;
    assert.equal(doc.announceInstruction, undefined, `프롬프트 재료 유출: ${item.offerId}`);
    assert.equal(doc.reconnectInstruction, undefined, `프롬프트 재료 유출: ${item.offerId}`);
    assert.equal(doc.url, undefined);
    assert.equal(doc.tel, undefined);
    // 재연결 라벨은 **재연결 시점에만** 기록된다(오퍼 문서에 미리 넣으면 라벨이 먼저 바뀐다).
    assert.equal(doc.reconnectedCallerLabel, undefined);
    assert.equal(doc.deskLabel, item.deskLabel);
    assert.equal(doc.displayNumber, item.displayNumber);
    assert.equal(doc.offerAnchorScammerTurn, 3);
  }
});
