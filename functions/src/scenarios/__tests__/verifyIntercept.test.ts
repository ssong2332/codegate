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
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { PUBLIC_SCENARIOS } from "../publicMeta";
import { SCENARIO_PROMPTS } from "../index";
import { REAL_WORLD_FORBIDDEN } from "./harmlessnessPatterns";

const allItems = Object.values(VERIFY_INTERCEPT);

// ══════════════════════════════════════════════════════════════════════════════
// ⭐ T110 / §22.3 — **`displayNumber` 제거로 사라진 단언 3건의 대체 게이트(G86-a/b/c)**
//
// 종전 구조의 실제 구멍(§22.3 표): 검사 대상이 `[deskLabel, displayNumber,
// reconnectedCallerLabel]` **하드코딩 3필드**였다 → **신규 필드는 자동으로 검사를 빠져나갔다.**
// 아래 세 게이트는 전부 `Object.entries(item)` **전 문자열 필드 순회**로 바뀌었으므로 필드가
// 늘어나도 검사가 함께 늘어난다 = 커버리지가 **넓어진다**.
//
// | 사라진 단언 | 무엇을 지켰나 | 대체 |
// |---|---|---|
// | `displayNumber` 형식 `/^\d{3,4}-0000$/` | 모의 번호가 실번호로 오인되지 않게 | **G86-a**(번호 형태 자체를 금지 — 형식 고정보다 강하다) |
// | `deskLabel`·`displayNumber`의 `REAL_WORLD_FORBIDDEN` 부분 문자열 금지 | AC-033/AC-005 | **G86-b**(지시문 2종 포함 전 필드) |
// | `surfaces` 3필드의 url/tel 스킴 검사 | AC-019 | **G86-c**(전 필드 순회) |
// ══════════════════════════════════════════════════════════════════════════════

/** 카탈로그 항목의 **모든 문자열 필드**를 `[필드명, 값]`으로 편다(순회 대상의 단일 정의). */
function stringFieldsOf(item: Record<string, unknown>): [string, string][] {
  return Object.entries(item).filter((entry): entry is [string, string] => typeof entry[1] === "string");
}

/**
 * 전화번호 형태(G86-a). 모의 번호 형식을 고정하는 대신 **번호 자체를 금지**한다 —
 * 호 전환 모델에서 카탈로그에 번호가 등장할 정당한 이유가 하나도 없기 때문이다.
 */
const PHONE_SHAPES: readonly RegExp[] = [
  /\d{2,4}-\d{3,4}(-\d{4})?/, // 02-1234-5678 / 1500-0000 형태
  /\b1\d{3}-\d{4}\b/, // 대표번호 형태
  /\d{7,}/, // 연속 7자리 이상(하이픈 없는 번호·계좌 형태)
];

test("[T110/G86-a] 카탈로그 **전 문자열 필드**에 전화번호 형태가 0건이다(구 displayNumber 형식 단언 대체)", () => {
  assert.ok(allItems.length > 0, "카탈로그가 비어 있으면 이 기능은 영영 발동하지 않는다");
  for (const item of allItems) {
    for (const [field, value] of stringFieldsOf(item)) {
      for (const shape of PHONE_SHAPES) {
        assert.ok(
          !shape.test(value),
          `번호 형태가 카탈로그에 들어오면 안 된다(${item.offerId}.${field}, ${shape}): ${value}`,
        );
      }
    }
  }
});

// ⚠️ 검사 대상은 **이 카탈로그의 필드로 한정**한다(§16.1.3 경고) — AC-071은 리포트 신고처로
// 112·1332를 **명시 요구**하므로 이 목록을 전역 금지어로 만들면 AC-071을 스스로 위반한다.
//
// T86 — 목록 자체는 `harmlessnessPatterns.ts`가 정본이다. T110 — 적용 범위가 3필드에서
// **전 문자열 필드(지시문 2종 포함)** 로 넓어졌다(§22.3 G86-b). 이 카탈로그의 창구는 전부 모의
// (`○○…`)이므로 지시문에도 실존 기관명이 등장할 이유가 없다.
test("[T110/G86-b][AC-033/AC-005] 전 문자열 필드에 실존 기관명·실존 대표번호가 부분 문자열로도 없다", () => {
  for (const item of allItems) {
    for (const [field, value] of stringFieldsOf(item)) {
      for (const forbidden of REAL_WORLD_FORBIDDEN) {
        assert.ok(
          !value.includes(forbidden),
          `실존 기관·번호가 카탈로그에 있으면 안 된다(${forbidden}) — ${item.offerId}.${field}`,
        );
      }
    }
  }
});

test("[T110/G86-c][AC-019] 실 발신 표면(url/tel/발신 대상)이 어느 필드에도 없다 — 하드코딩이 아니라 전 필드 순회", () => {
  for (const item of allItems) {
    for (const key of ["url", "tel", "phoneNumber", "dialTarget", "href", "displayNumber"]) {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(item, key),
        `발신 관련 필드를 도입하면 안 된다(${key}): ${item.offerId}`,
      );
    }
    for (const [field, value] of stringFieldsOf(item)) {
      assert.ok(!/https?:\/\//i.test(value), `실 URL 스킴 금지: ${item.offerId}.${field}`);
      assert.ok(!/tel:/i.test(value), `tel: 스킴 금지: ${item.offerId}.${field}`);
    }
  }
});

// 역방향 확인(G86-d) — 위 세 게이트가 **실제로 잡는다**는 증명. 오염은 **테스트 코드 안에서만**
// 만든다(실제 소스를 고쳤다 되돌리는 방식 금지 — `callContinuity.test.ts`가 세운 관례).
// ⚠️ 오염 샘플 3종을 **하나에 섞지 않는다**(§22.6 6단계) — 섞으면 한 게이트가 죽어도 다른
// 게이트가 잡아 주어 죽은 정규식을 알아채지 못한다(T86에서 실제로 데인 실패 양식이다).
/** 세 게이트의 판정식 — 본 검사와 역검증이 **같은 식**을 쓰도록 한 곳에 둔다. */
const GATE_PREDICATES = {
  "G86-a": (v: string) => PHONE_SHAPES.some((shape) => shape.test(v)),
  "G86-b": (v: string) => REAL_WORLD_FORBIDDEN.some((word) => v.includes(word)),
  "G86-c": (v: string) => /https?:\/\//i.test(v) || /tel:/i.test(v),
} as const;

/** 오염 샘플에서 **어느 게이트가 어느 필드를 지목했는지** 를 그대로 뽑는다. */
function firedGates(sample: Record<string, unknown>): { gate: string; field: string }[] {
  const fired: { gate: string; field: string }[] = [];
  for (const [gate, predicate] of Object.entries(GATE_PREDICATES)) {
    for (const [field, value] of stringFieldsOf(sample)) {
      if (predicate(value)) fired.push({ gate, field });
    }
  }
  return fired;
}

test("[T110/G86-d 역검증 ①] 번호가 섞이면 **G86-a만** 실패한다", () => {
  const tainted = {
    offerId: "tainted-a",
    deskLabel: "○○확인창구",
    announceInstruction: "02-1234-5678로 걸어 주세요.",
  };
  assert.deepEqual(firedGates(tainted), [{ gate: "G86-a", field: "announceInstruction" }]);
});

test("[T110/G86-d 역검증 ②] 실존 기관명이 섞이면 **G86-b만** 실패한다", () => {
  const tainted = {
    offerId: "tainted-b",
    deskLabel: "국세청 확인창구",
    reconnectedCallerLabel: "○○확인창구",
  };
  assert.deepEqual(firedGates(tainted), [{ gate: "G86-b", field: "deskLabel" }]);
});

test("[T110/G86-d 역검증 ③] tel 스킴이 섞이면 **G86-c만** 실패한다", () => {
  const tainted = {
    offerId: "tainted-c",
    deskLabel: "○○확인창구",
    reconnectInstruction: "tel:verify-desk 로 안내하라",
  };
  assert.deepEqual(firedGates(tainted), [{ gate: "G86-c", field: "reconnectInstruction" }]);
});

test("[T110/G86-d 역검증 ④] 현행 6종은 세 게이트 어디에도 걸리지 않는다(오탐 0건)", () => {
  for (const item of allItems) {
    assert.deepEqual(firedGates(item as unknown as Record<string, unknown>), [], item.offerId);
  }
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

// ══════════════════════════════════════════════════════════════════════════════
// ⭐ T110 / §22.6 — **호 전환 모델의 하드 게이트(G83 · G84 · G85)**
//
// 사용자가 라이브에서 신고한 결함은 모델의 드리프트가 아니라 **프롬프트가 요구한 동작**이었다:
//   - 구 `announceInstruction`: *"저는 끊지 않고 기다리겠습니다"* → 원 화자의 **세션 잔류**를 지시
//   - 구 `reconnectInstruction`: *"안내받은 번호로 확인 전화를 걸어"* → 참가자의 **신규 발신**을 전제
// 두 전제는 양립할 수 없는데 **같은 모델 세션에 공존**했다. 즉 모델은 시킨 대로 했다.
//
// ⚠️ **서버가 강제할 수 있는 지점은 "모델에게 도달하는 문자열 집합" 하나뿐이다**(§22.2 실측 —
// 세션 중 시스템 프롬프트 교체/소켓 재연결/음색 전환/서버측 출력 필터/클라 음소거는 전부 불가·기각.
// 응답 모달리티가 오디오 고정이라 서버가 사기범 텍스트를 쥐는 지점이 없다). 그 집합은 정확히 3개다:
// ① 상시 블록 `VERIFY_INTERCEPT_RULE` ② `announceInstruction` ③ `reconnectInstruction`.
// ⛔ 그러므로 이 게이트들이 보증하는 것은 **"겹침을 요구하는 문자열이 모델에게 가지 않는다"** 까지다.
// **원 화자의 침묵은 보증하지 않는다** — 실제 발화 확인은 라이브 검증 소관이다(§22.8 (1)).

/** 원 화자 **잔류 요구** 표현(G83) — 이 결함의 직접 원인이었던 문구군. */
const RESIDENCY_DEMANDS: readonly RegExp[] = [
  /끊지\s*않고/,
  /기다리겠습니다/,
  /끊지\s*마시/,
  /대기하겠습니다/,
  /끊지\s*말고\s*기다/,
];

/** 참가자의 **신규 발신 전제**(G84) — 호 전환 모델에서는 어느 지시에도 있으면 안 된다. */
const DIAL_OUT_PREMISES: readonly RegExp[] = [/걸어/, /전화를\s*걸/, /안내받은\s*번호/];

/** **호 전환 전제**(G84) — 최소 하나는 반드시 있어야 한다. */
const TRANSFER_PREMISES: readonly RegExp[] = [/넘겼다/, /넘겨/, /연결해\s*드리/, /빠졌다/];

test("[T110/G83] announceInstruction ×6 — 원 화자 잔류 요구 표현이 0건이고, 호 전환을 제안한다", () => {
  for (const item of allItems) {
    for (const pattern of RESIDENCY_DEMANDS) {
      assert.ok(
        !pattern.test(item.announceInstruction),
        `잔류 요구가 남아 있으면 원 화자가 세션에 머무는 것이 프롬프트로 요구된다(${pattern}): ${item.offerId}`,
      );
    }
    assert.ok(
      TRANSFER_PREMISES.some((pattern) => pattern.test(item.announceInstruction)),
      `삭제만으로는 부족하다 — "내가 넘겨 주겠다"는 전환 제안이 있어야 한다(G83): ${item.offerId}`,
    );
  }
});

test("[T110/G83 역검증] 잔류 요구 문구를 되살린 샘플은 실제로 실패한다", () => {
  const tainted = "확인해 보세요. 저는 끊지 않고 기다리겠습니다.";
  assert.ok(RESIDENCY_DEMANDS.some((pattern) => pattern.test(tainted)), "죽은 정규식이면 안 된다");
});

test("[T110/G84] reconnectInstruction ×6 — 신규 발신 전제 0건 · 전환 전제 존재 · 복귀 금지 명문", () => {
  for (const item of allItems) {
    for (const pattern of DIAL_OUT_PREMISES) {
      assert.ok(
        !pattern.test(item.reconnectInstruction),
        `신규 발신 전제가 한 종에만 남아도 그 시나리오는 옛 모델로 동작한다(${pattern}): ${item.offerId}`,
      );
    }
    assert.ok(
      TRANSFER_PREMISES.some((pattern) => pattern.test(item.reconnectInstruction)),
      `호가 넘어왔다는 전제가 없으면 전환이 재현되지 않는다: ${item.offerId}`,
    );
    // ⭐ 복귀 금지(§22.1 A3) — "지우기만" 하면 모델은 시스템 프롬프트에 살아 있는 원 페르소나로
    // 자연 복귀한다(G83 갭). 삭제가 아니라 **퇴장 명문화**여야 한다.
    assert.ok(
      /빠진\s*사람|빠졌다/.test(item.reconnectInstruction),
      `앞 담당자가 통화에서 빠졌다는 명문이 필요하다: ${item.offerId}`,
    );
    assert.ok(
      /다시\s*말하지\s*마라/.test(item.reconnectInstruction),
      `앞 담당자로 되돌아가지 말라는 금지가 필요하다: ${item.offerId}`,
    );
    assert.ok(
      /번갈아\s*말하/.test(item.reconnectInstruction),
      `두 화자가 번갈아 말하는 형태 금지가 필요하다(사용자가 신고한 증상 그대로): ${item.offerId}`,
    );
  }
});

test("[T110/G84 역검증 ①] 신규 발신 전제를 되살린 샘플은 실제로 실패한다", () => {
  const tainted = "(참가자가 안내받은 번호로 확인 전화를 걸어 지금 막 연결됐다.)";
  assert.ok(DIAL_OUT_PREMISES.some((pattern) => pattern.test(tainted)));
});

test("[T110/G84 역검증 ②] 복귀 금지를 뺀 샘플은 실제로 실패한다", () => {
  const tainted = "(앞 담당자가 이 통화를 너에게 넘겼다. 지금부터 너는 다른 담당자다.)";
  assert.ok(TRANSFER_PREMISES.some((pattern) => pattern.test(tainted)), "전환 전제는 있다");
  assert.ok(!/다시\s*말하지\s*마라/.test(tainted), "그러나 복귀 금지가 없어 G84가 걸러야 한다");
  assert.ok(!/번갈아\s*말하/.test(tainted));
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

// ── T95 — 전용 시나리오에서 **메커닉이 실제로 켜지는지** ────────────────────
//
// 카탈로그에 항목이 없으면 이 기능은 그 시나리오에서 아예 발동하지 않는다(프롬프트의 조건형 블록도
// 함께 꺼진다). 즉 "확인 무력화 전용 시나리오"를 만들어 놓고 카탈로그를 빠뜨리면 **D3를 태깅했는데
// 실제로는 아무 일도 일어나지 않는** 조용한 결손이 된다 — 이 테스트가 그것을 막는다.
test("[T95/AC-071] 확인 무력화 전용 시나리오가 카탈로그를 갖고, 고급에서 게이트가 실제로 내려간다", () => {
  const scenarioId = "bank-security-verify-scam";
  assert.equal(hasVerifyIntercept(scenarioId), true, "전용 시나리오인데 카탈로그가 없으면 기능이 영영 안 뜬다");

  const item = findVerifyInterceptItem(scenarioId);
  assert.ok(item);
  assert.equal(item.offerId, "bank-security-verify-desk");
  // 이 시나리오는 확인 우회로가 본론이라 가장 이른 게이트(2턴)를 쓴다(§16.1.4 권고 범위 2~3 안).
  assert.equal(item.availableAfterScammerTurns, 2);

  // `createRealtimeCall`이 클라에 내려보내는 것은 게이트뿐이다(창구명·번호·지시 미노출).
  assert.deepEqual(getVerifyOfferTrigger(scenarioId), { availableAfterScammerTurns: 2 });

  // 다른 시나리오의 offerId로는 이 시나리오에 오퍼를 꽂을 수 없다(G24 위조 차단).
  assert.equal(findVerifyInterceptItem(scenarioId, "institution-verify-desk"), undefined);
});

// AC-075 — 신규 D3 콘텐츠가 **고급으로 조립될 때에도** 가드레일 최후미 불변식이 유지되는지
// (§15.5/AC-065). 조립 함수 자체는 시나리오와 무관하지만, AC-075는 "신규 콘텐츠 전부"에 대한
// 확인을 명문 요구하므로 이 시나리오로 직접 한 번 더 고정한다.
test("[T95/AC-075] 신규 시나리오를 고급으로 조립하면 확인 안내 블록이 붙고, 가드레일은 여전히 맨 마지막이다", () => {
  const prompt = SCENARIO_PROMPTS["bank-security-verify-scam"];
  const advanced = buildSystemPrompt(prompt, {
    difficultyLevel: "advanced",
    verifyInterceptEnabled: hasVerifyIntercept("bank-security-verify-scam"),
  });
  assert.ok(advanced.includes("[확인 안내 — 이 훈련에서만 적용]"), "고급에서 확인 동기화 블록이 붙어야 한다");
  assert.ok(
    advanced.trimEnd().endsWith(prompt.guardrailPreamble.trimEnd()),
    "guardrailPreamble이 맨 마지막이어야 한다(AC-065 불변)",
  );
  // 초급·중급에서는 메커닉이 꺼지므로 블록도 붙지 않는다(회귀 0 — 프롬프트가 도입 전과 동일).
  for (const level of ["beginner", "intermediate"] as const) {
    const assembled = buildSystemPrompt(prompt, { difficultyLevel: level, verifyInterceptEnabled: false });
    assert.equal(assembled.includes("[확인 안내 — 이 훈련에서만 적용]"), false, level);
    assert.ok(assembled.trimEnd().endsWith(prompt.guardrailPreamble.trimEnd()), level);
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
    // ⭐ T110(§22.3) — *"buildDoc이 displayNumber를 문서에 그대로 쓴다"* 단언은 **필드 소멸로
    // 불필요**해졌고, 그 자리를 이 단언이 대신한다: **신규 문서에는 번호가 실리지 않는다.**
    // (문서 타입에는 옵셔널로 남아 과거 문서를 무백필로 읽는다 — 백필·마이그레이션 0건.)
    assert.equal(doc.displayNumber, undefined, `신규 문서에 번호가 실리면 안 된다: ${item.offerId}`);
    assert.equal(doc.offerAnchorScammerTurn, 3);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ T110 / §22.6 4단계 — **G85(동시 공존 금지): 이 결함의 직접 게이트**
//
// ⚠️ **왜 합쳐서 검사해야 하는가**: 이번 결함은 *"각각은 말이 되는 두 지시가 한 세션에 공존"* 이었다.
// 개별 필드 검사(G83·G84)만으로는 **잔류 요구가 상시 블록에 있는 경우를 통과시킨다** — 아래 역검증
// 테스트가 바로 그 사실을 같은 출력에 보여 준다. 모델이 실제로 받는 것은 **3종의 합집합**이므로
// 게이트도 합집합을 봐야 한다.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 조립된 시스템 프롬프트에서 **상시 블록(`VERIFY_INTERCEPT_RULE`)만** 잘라낸다.
 * ⚠️ 이 상수는 `promptAssembly.ts`의 모듈 지역 상수라 import할 수 없으므로 **조립 산출물에서**
 * 읽는다 — 오히려 이쪽이 정확하다(모델에게 실제로 도달하는 것은 조립 결과이지 소스 리터럴이 아니다).
 */
function extractVerifyRuleBlock(assembled: string): string {
  const start = assembled.indexOf("[확인 안내 — 이 훈련에서만 적용]");
  assert.ok(start >= 0, "고급 + 확인 무력화 세션인데 상시 블록이 조립되지 않았다");
  const end = assembled.indexOf("\n\n", start);
  return end < 0 ? assembled.slice(start) : assembled.slice(start, end);
}

/** 한 세션에서 모델에게 도달할 수 있는 문자열 **3종의 합집합**(§22.2 F행 채택안). */
function modelReachableStrings(scenarioId: string): {
  ruleBlock: string;
  announce: string;
  reconnect: string;
  combined: string;
} {
  const item = findVerifyInterceptItem(scenarioId);
  assert.ok(item, scenarioId);
  const assembled = buildSystemPrompt(SCENARIO_PROMPTS[scenarioId], {
    difficultyLevel: "advanced",
    verifyInterceptEnabled: true,
  });
  const ruleBlock = extractVerifyRuleBlock(assembled);
  return {
    ruleBlock,
    announce: item.announceInstruction,
    reconnect: item.reconnectInstruction,
    combined: [ruleBlock, item.announceInstruction, item.reconnectInstruction].join("\n"),
  };
}

/** 앞 담당자 언급이 **퇴장·금지 문맥**에서만 나오는가(복귀 허용 표현 0건). */
function returnAllowingMentions(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/앞\s*담당자|앞사람|원래\s*담당자/g)) {
    const index = match.index ?? 0;
    const window = text.slice(index, index + 90);
    const prohibitive = /마라|말라|않는다|하지\s*마|빠졌다|빠진\s*사람|빠진다/.test(window);
    if (!prohibitive) found.push(window);
  }
  return found;
}

test("[T110/G85] 모델에 도달하는 문자열 3종을 **합쳐도** 잔류 요구·복귀 허용 표현이 0건이다", () => {
  for (const scenarioId of Object.keys(VERIFY_INTERCEPT)) {
    const { combined } = modelReachableStrings(scenarioId);
    for (const pattern of RESIDENCY_DEMANDS) {
      assert.ok(
        !pattern.test(combined),
        `합집합에 잔류 요구가 남으면 두 전제가 다시 공존한다(${pattern}): ${scenarioId}`,
      );
    }
    assert.deepEqual(
      returnAllowingMentions(combined),
      [],
      `앞 담당자 언급은 퇴장·금지 문맥에서만 허용된다: ${scenarioId}`,
    );
  }
});

test("[T110/G85 ⭐역검증] 잔류 요구를 **상시 블록에** 넣으면 — 개별 필드 검사(G83·G84)는 통과하는데 G85만 실패한다", () => {
  const scenarioId = "bank-security-verify-scam";
  const { ruleBlock, announce, reconnect } = modelReachableStrings(scenarioId);

  // 오염은 **테스트 코드 안에서만** 만든다(실제 소스를 고쳤다 되돌리는 방식 금지).
  // 오염 위치는 상시 블록 — 즉 announce/reconnect **두 필드는 한 글자도 건드리지 않았다**.
  const taintedRuleBlock = `${ruleBlock}\n- 상대가 확인하는 동안 앞 담당자는 끊지 않고 기다리겠습니다.`;

  // ① 개별 필드 검사(G83·G84)는 **그대로 통과한다** — 두 필드가 깨끗하기 때문이다.
  assert.ok(
    RESIDENCY_DEMANDS.every((pattern) => !pattern.test(announce)),
    "G83(announce 단독)은 통과한다",
  );
  assert.ok(
    DIAL_OUT_PREMISES.every((pattern) => !pattern.test(reconnect)),
    "G84(reconnect 단독)도 통과한다",
  );

  // ② 그런데 모델이 실제로 받는 합집합에는 잔류 요구가 들어 있다 → **G85만 잡는다.**
  const combined = [taintedRuleBlock, announce, reconnect].join("\n");
  const fired = RESIDENCY_DEMANDS.filter((pattern) => pattern.test(combined));
  assert.ok(fired.length > 0, "합쳐서 검사하지 않으면 이번 결함은 영영 잡히지 않는다");
});

test("[T110/G85 역검증 ②] 복귀 허용 문맥이 섞이면 G85가 잡는다", () => {
  const clean = "앞 담당자는 이 통화에서 빠진 사람이다 — 그 인물로 다시 말하지 마라.";
  const tainted = "앞 담당자가 옆에서 확인해 주면 이어서 설명하게 하라.";
  assert.deepEqual(returnAllowingMentions(clean), []);
  assert.equal(returnAllowingMentions(tainted).length, 1);
});

// ══════════════════════════════════════════════════════════════════════════════
// ⭐ T110 / §22.6 7단계 — **6종 전수 증거**
// 이 저장소의 반복 실패 양식은 *"1종만 고치고 끝내기"* 다(G84). 게이트가 `Object.values` 순회임을
// 보이고, **6개 offerId를 나열하는 단언** 1건으로 그 범위를 못박는다.
// ══════════════════════════════════════════════════════════════════════════════
test("[T110/§22.6 7단계] 위 게이트의 순회 대상은 카탈로그 **6종 전부**다(부분 정정 차단)", () => {
  assert.deepEqual(
    Object.values(VERIFY_INTERCEPT).map((item) => item.offerId).sort(),
    [
      "bank-security-verify-desk",
      "card-verify-desk",
      "courier-verify-desk",
      "institution-verify-desk",
      "loan-verify-desk",
      "tax-verify-desk",
    ],
    "6종 중 하나라도 빠지거나 늘면 전수 게이트의 범위가 달라진다 — 이 단언을 먼저 고칠 것",
  );
  assert.equal(allItems.length, 6);
  // 순회 대상이 곧 `Object.values(VERIFY_INTERCEPT)`라는 사실을 같은 자리에서 고정한다.
  assert.deepEqual(allItems, Object.values(VERIFY_INTERCEPT));
});
