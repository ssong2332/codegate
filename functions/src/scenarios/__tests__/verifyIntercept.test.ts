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

// 원 화자 **잔류 요구** 표현군의 정본은 아래 G85 절의 `RESIDENCY_DEMANDS`다(형태별 `quotable`
// 플래그를 함께 갖는다). 여기 G83은 **예외 없이** 부분 문자열만 보므로 패턴만 뽑은
// `RESIDENCY_PATTERNS`를 쓴다 — `announceInstruction`에는 금지형 용례가 없기 때문이다.

/** 참가자의 **신규 발신 전제**(G84) — 호 전환 모델에서는 어느 지시에도 있으면 안 된다. */
const DIAL_OUT_PREMISES: readonly RegExp[] = [/걸어/, /전화를\s*걸/, /안내받은\s*번호/];

/** **호 전환 전제**(G84) — 최소 하나는 반드시 있어야 한다. */
const TRANSFER_PREMISES: readonly RegExp[] = [/넘겼다/, /넘겨/, /연결해\s*드리/, /빠졌다/];

test("[T110/G83] announceInstruction ×6 — 원 화자 잔류 요구 표현이 0건이고, 호 전환을 제안한다", () => {
  for (const item of allItems) {
    for (const pattern of RESIDENCY_PATTERNS) {
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
  assert.ok(RESIDENCY_PATTERNS.some((pattern) => pattern.test(tainted)), "죽은 정규식이면 안 된다");
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

// ── 금지형 문맥 예외의 **판정 규칙**(reviewer Major / QA NO-GO로 한 번 좁혔다) ────────────────
//
// ⚠️ **최초 구현이 틀렸던 지점(원인 진단 그대로 인용)**: 예외 조건이 *"부정어가 그 잔류 요구를
// 부정하는가"* 가 아니라 *"부정어가 절 어딘가에 있는가"* 로 느슨하게 걸려 있었다. 매치 지점부터
// 다음 종결부호까지를 한 절로 보고 **그 구간 어디에든** 부정어가 있으면 예외를 줬으므로,
// 뒤에 무관한 부정문을 덧붙이는 것만으로 우회됐다(아래 역검증 ④~⑦이 그 4종을 고정한다).
//
// ⚠️ **고정폭 윈도로는 돌아가지 않는다(이미 실측으로 반증했다)**: 결함 원문
// *"저는 끊지 않고 기다리겠습니다."* 는 **바로 뒤 문장**이 *"…지어내 읽어 주지 마라"* 라서, 창을
// 넓히면 그 "마라"가 들어와 통과해 버린다. 아래 규칙은 창 크기에 **의존하지 않는다** — 부정어가
// 매치를 실제로 지배하는지를 **문법 형태**로 본다.
//
// **판정표(이 표에 없는 케이스는 임의 판단하지 말고 행을 추가할지 물을 것)**
// | # | 조건 | 판정 |
// |---|---|---|
// | 1 | 매치가 **종결형 서술**(`~습니다`)이다 | **예외 없음 — 항상 위반.** 이미 문장이 끝난 서술은 뒤에 무엇이 오든 부정되지 않는다. `대기하겠습니다 재촉하지 마라`가 여기서 걸린다 |
// | 2 | 매치 **바로 뒤**에 인용·내포 표지(`라고`/`라는`/`라며`/`다고`)가 붙고, **같은 절**에 부정 표지가 있다 | **예외 인정.** §22.1 A1 ⓐ *"끊지 마시**라고** 붙잡지도 않는다"* 가 정확히 이 형태다 |
// | 3 | 그 밖의 전부 | **위반.** 부정어가 뒤에 따로 붙어 있어도 매치를 지배하지 않는다 |
//
// 절 경계에 **쉼표(`,`)를 포함**시킨다 — 한국어 만연체에서 종결부호만 경계로 잡으면 구간이 무한정
// 늘어나 우회 표면이 커진다(reviewer 권고). 규칙 1·2가 이미 대부분을 막지만 경계는 좁을수록 좋다.

// ⚠️ **알려진 한계(자기 고지 — 고치지 않는다)**: 쉼표를 경계에 넣은 대가로, 인용과 부정 술어
// **사이에** 쉼표가 끼는 형태는 과차단된다 — 실측: `"끊지 마시라고, 붙잡지도 않는다."` 1건.
// **A/B로 확인한 결과 이 오차는 이번 수정이 만든 것이 아니다**(직전 판정식 재현: old=1 / new=1로 동일).
// 닫히는 방향이라 안전 저하가 아니고, §22.1 A1 ⓐ 확정 문면에는 그 쉼표가 없다.
/** 매치 지점부터 같은 절이 끝날 때까지(**쉼표 포함** 절 경계 전까지). */
function clauseAt(text: string, index: number): string {
  const rest = text.slice(index);
  const end = rest.search(/[.,!?\n]/);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * ⭐ **인용된 매치를 "실제로 부정하는" 형태**만 통과시키는 단일 패턴(판정표 2행의 구현).
 *
 * ⚠️ **2차 QA NO-GO의 원인과 수정(이 상수가 그 수정이다)**: 종전에는 조건이
 * `인용 표지가 뒤에 붙는가 && 절 어딘가에 부정어가 있는가` 두 개로 **분리**돼 있어서,
 * *"그 부정어가 매치를 부정하는가"* 는 아무도 검사하지 않았다. 그래서 `~하고 …하지 않는다`
 * 같은 **평범한 접속 구조**로 우회됐다(고의로 비튼 문자열이 아니라 콘텐츠 작성자가 A1 ⓐ를
 * 확장하다 우발적으로 재도입할 수 있는 형태다):
 *   - `끊지 마시라고 다른 사람은 절대 오지 않는다.`      ← 부정 대상이 "오다"
 *   - `끊지 마시라고 말하되 이후 다른 안내는 하지 않는다.` ← 부정 대상이 "안내하다"
 *   - `참가자에게 끊지 마시라고 안내하고 이후 응대를 종료하지 않는다.` ← **문자 그대로의 잔류 요구**
 * 이것은 1차에서 고친 결함과 **같은 논리 구조**였다 — "근처에 있는가"는 "지배하는가"가 아니다.
 *
 * **좁힌 규칙**: 인용 표지 뒤에 **부사 1개(선택)** 까지만 허용하고 **곧바로 부정 술어**가 와야 한다.
 * 매치와 부정어 사이에 **다른 완결 서술이 끼면 예외가 닫힌다**(위 3종이 전부 여기서 걸린다 —
 * `다른 사람은 절대 오지`·`말하되 이후 다른 안내는 하지`·`안내하고 이후 응대를 종료하지`는
 * 모두 부사 1개를 넘는다).
 *
 * ⚠️ **고정폭 윈도가 아니다**: 허용 폭이 글자 수가 아니라 **문법 단위(부사 1 + 용언 1)** 로 정의된다.
 * 그래서 "창을 넓히면 뒤 문장의 …마라가 들어온다"는 이미 실측 반증한 함정에 다시 빠지지 않는다.
 * ⚠️ **일부러 느슨하지 않게, 그러나 닫히지도 않게**: 부사 슬롯이 없으면
 * *"끊지 마시라고 절대 말하지 않는다"* 같은 **정상 금지형**이 과차단된다.
 */
const QUOTED_NEGATION = new RegExp(
  "^(?:라고|라는|라며|다고|란)\\s*" + // 인용·내포 표지가 매치에 **직접** 붙어야 한다
    "(?:[가-힣]{1,4}\\s+)?" + // 부사 1개까지만 끼어들 수 있다(예: "절대")
    "[가-힣]{1,6}(?:지도|지는|지)?\\s*" + // 부정될 용언 1개
    "(?:않는다|않겠다|않으며|말라|마라)", // 그 용언에 곧바로 붙는 부정 술어
);

type ResidencyDemand = {
  pattern: RegExp;
  /**
   * 인용·내포 구문에 실려 **부정될 수 있는** 형태인가.
   * `false` = 예외 자체가 성립하지 않는다(판정표 1행).
   */
  quotable: boolean;
};

/**
 * 원 화자 **잔류 요구** 표현(G83/G85) — 이 결함의 직접 원인이었던 문구군.
 *
 * ⭐ **왜 `끊지 마시` 1종만 `quotable: true`인가 — 이 판단을 안 적으면 다음 사람이 또 재사용한다.**
 * 예외는 **편의가 아니라 §22.1 A1 ⓐ 확정 문면 한 줄을 통과시키기 위해서만** 존재한다.
 * 나머지 4종은 예외가 **성립할 수 없는** 형태다(문법적 이유이지 정책적 선택이 아니다):
 *   - `기다리겠습니다` · `대기하겠습니다` → **종결형 서술.** 이미 끝난 문장이라 뒤에 무엇이 와도
 *     부정되지 않는다. 인용 표지를 붙일 자리 자체가 없다.
 *   - `끊지 않고` · `끊지 말고 기다` → **연결어미**라 `…라고`가 곧바로 붙는 구성이 비문이다
 *     (`"끊지 않고라고"`). 즉 인용문의 목적어가 될 수 없다.
 * ⇒ **`끊지 마시`만 `…라고` 인용이 성립한다**(A1 ⓐ `끊지 마시라고 붙잡지도 않는다`).
 * ⚠️ 새 패턴을 추가할 때 `quotable: true`를 **기본값처럼 복사하지 말 것** — 그 형태가 실제로
 * 인용문의 목적어가 되는 확정 문면이 있을 때만 true이고, 없으면 예외는 불필요하다.
 */
const RESIDENCY_DEMANDS: readonly ResidencyDemand[] = [
  { pattern: /끊지\s*않고/, quotable: false }, // 연결어미 — "끊지 않고라고"는 비문
  { pattern: /기다리겠습니다/, quotable: false }, // 종결형 서술
  { pattern: /끊지\s*마시/, quotable: true }, // ⭐ 유일 — A1 ⓐ "끊지 마시라고 붙잡지도 않는다"
  { pattern: /대기하겠습니다/, quotable: false }, // 종결형 서술
  { pattern: /끊지\s*말고\s*기다/, quotable: false }, // 연결어미
];

/** G83처럼 **예외 없이** 부분 문자열만 보는 자리용(지시문 2종은 금지형 용례가 없다). */
const RESIDENCY_PATTERNS: readonly RegExp[] = RESIDENCY_DEMANDS.map((demand) => demand.pattern);

/**
 * 잔류 요구가 **긍정형으로**(= 부정어의 지배를 받지 않은 채) 남아 있는 자리만 모은다(G85).
 *
 * 위 판정표를 그대로 구현한다. 예외는 **인용 표지가 매치에 직접 붙었을 때만** 열리므로,
 * "뒤에 아무 부정문이나 덧붙여 우회"가 구조적으로 불가능하다.
 */
function positiveResidencyDemands(text: string): string[] {
  const found: string[] = [];
  for (const demand of RESIDENCY_DEMANDS) {
    const global = new RegExp(demand.pattern.source, "g");
    for (const match of text.matchAll(global)) {
      const index = match.index ?? 0;
      const clause = clauseAt(text, index);
      if (!demand.quotable) {
        found.push(clause); // 판정표 1행 — 종결형·비인용형은 예외가 없다
        continue;
      }
      // 판정표 2행 — **한 패턴**으로 "인용 표지 + 곧바로 이어지는 부정 술어"를 함께 본다.
      // ⚠️ 두 조건으로 쪼개면(인용 표지 존재 && 절 안 어딘가에 부정어 존재) 그 부정어가 매치를
      // 부정하는지 아무도 검사하지 않게 된다 — 2차 QA NO-GO가 정확히 그 구조였다.
      const after = text.slice(index + match[0].length);
      if (!QUOTED_NEGATION.test(after)) found.push(clause); // 판정표 3행
    }
  }
  return found;
}

/**
 * 앞 담당자 언급이 **퇴장·금지 술어의 지배를 받는가**(복귀 허용 표현 0건, G85).
 *
 * ⚠️ **여기도 같은 결함이 있었다(대칭 확인 결과: 있었다 — 함께 고친다)**: 종전에는 90자 고정 윈도
 * 안에 `마라|않는다|…` 가 있기만 하면 예외였다 → *"앞 담당자가 이어서 말하게 하라, 무리하지는
 * 않는다"* 처럼 **무관한 부정문을 덧붙이면 통과**했다(역검증 ⑧이 고정한다).
 *
 * 좁힌 규칙: 언급이 속한 절에 **§22.1이 확정한 퇴장 술어 3종 중 하나**가 있어야 한다. 일반 부정어는
 * 예외를 열지 못한다 — 이 흐름에서 앞 담당자를 말해도 되는 문맥은 그 셋뿐이기 때문이다(A1 ⓑ ·
 * `RECONNECT_TAIL`). 술어 목록이 곧 **허용 문맥의 정본**이라 다음 사람이 임의 판단할 여지가 없다.
 */
// ⚠️ **알려진 한계(자기 고지 — 고치지 않는다)**: 이 목록은 **화이트리스트**라 §22.1이 확정하지 않은
// **퇴장 표현 패러프레이즈는 과차단**된다. 실측: `"앞 담당자는 자리를 비웠다."` · `"앞 담당자는
// 통화에서 물러났다."` 는 뜻이 같아도 위반으로 잡힌다(각각 1건). 이것은 **닫히는 방향의 오차**라
// 안전 저하가 아니며, 콘텐츠가 §22.1 확정 문면을 쓰는 한 실제로 걸리지 않는다. 문면을 확장하려면
// **이 목록에 행을 추가**할 것 — 임의로 일반 부정어 예외를 되살리면 우회가 다시 열린다.
const EXIT_PREDICATES: readonly RegExp[] = [
  // (ㄱ) 호가 넘어왔다·앞 화자가 빠졌다는 **전환·퇴장 서술**(§22.1 A3 확정 문면)
  /이\s*통화를\s*너에게\s*넘겼다/,
  /통화에서\s*빠졌다/,
  /빠진\s*사람이다/,
  // (ㄴ) 앞 화자로서·앞 화자를 대신해 **말하지 말라는 금지**(A1 ⓑ · `RECONNECT_TAIL` 확정 문면)
  /다시\s*말하지\s*(않는다|마라)/,
  /인용하는\s*형태도\s*만들지\s*(않는다|마라)/,
  /같은\s*사람이라는\s*사실[^.]*말하지\s*마라/,
];

/**
 * **허용 술어가 있어도 예외를 닫는 거부권** — 같은 절에 "앞 화자가 말하게 하라"류 **허용 구문**이
 * 섞이면 그 절은 퇴장 문맥이 아니다. 이것이 없으면 *"앞 담당자가 이어서 말하게 하되 이름은 말하지
 * 마라"* 처럼 **허용 + 금지를 한 절에 섞는** 우회가 남는다.
 */
const PERMISSIVE_VERBS = /말하게\s*하|이어서\s*말|대신\s*말|응대하게\s*하|설명하게\s*하/;

function returnAllowingMentions(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/앞\s*담당자|앞사람|원래\s*담당자/g)) {
    const clause = clauseAt(text, match.index ?? 0);
    const governed =
      EXIT_PREDICATES.some((predicate) => predicate.test(clause)) && !PERMISSIVE_VERBS.test(clause);
    if (!governed) found.push(clause);
  }
  return found;
}

// ══════════════════════════════════════════════════════════════════════════════
// ⭐ T110 / §22.6 1단계 — **G82(조립 게이트): 퇴장 규칙이 상시 블록에 실제로 들어가는가**
//
// ⚠️ §22.7 G82가 경고한 실패 양식: *"퇴장 규칙을 `reconnectInstruction`에만 넣고 상시 블록에 안
// 넣는다(전환 순간에만 필요하니까)"*. 1회성 턴 주입은 다음 턴이면 컨텍스트 뒤로 밀리고, 시스템
// 프롬프트는 매 턴 선두다 → 전환 직후 1턴만 지켜지고 **2~3턴 뒤 원 화자가 돌아온다**.
// ⚠️ 위치도 함께 고정한다 — 퇴장 규칙이 `guardrailPreamble`보다 **앞**이어야 한다(AC-065 불변:
// 가드레일은 언제나 맨 마지막이다).
// ══════════════════════════════════════════════════════════════════════════════

/** §22.1 A1 ⓑ 퇴장 규칙의 필수 성분 — 문면이 바뀌어도 **의미 3요소**는 남아야 한다. */
const EXIT_RULE_PARTS: readonly RegExp[] = [
  /빠진\s*사람이다/, // 앞 담당자는 통화에서 빠졌다
  /다시\s*말하지\s*않는다/, // 이름·직책·1인칭으로 복귀 금지
  /번갈아\s*말하/, // 두 화자가 번갈아 말하는 형태 금지(신고된 증상)
];

test("[T110/G82] 6종 × 고급 × 확인 무력화 — 조립 프롬프트의 **상시 블록**에 퇴장 규칙이 들어 있고 가드레일보다 앞이다", () => {
  const seen: string[] = [];
  for (const scenarioId of Object.keys(VERIFY_INTERCEPT)) {
    const prompt = SCENARIO_PROMPTS[scenarioId];
    const assembled = buildSystemPrompt(prompt, {
      difficultyLevel: "advanced",
      verifyInterceptEnabled: true,
    });
    const ruleBlock = extractVerifyRuleBlock(assembled);
    for (const part of EXIT_RULE_PARTS) {
      assert.ok(
        part.test(ruleBlock),
        `퇴장 규칙이 상시 블록에 없으면 전환 2~3턴 뒤 원 화자가 돌아온다(${part}): ${scenarioId}`,
      );
    }
    // ⓐ 붙잡지 않기 — 전환 제안으로 받아 두는 문구도 상시 블록에 있어야 한다.
    assert.ok(/붙잡지도\s*않는다/.test(ruleBlock), `A1 ⓐ 누락: ${scenarioId}`);
    assert.ok(/확인 부서를 연결해 드리겠습니다/.test(ruleBlock), `A1 ⓐ 보류 문구 누락: ${scenarioId}`);

    const exitIndex = assembled.indexOf("빠진 사람이다");
    const guardrailIndex = assembled.indexOf(prompt.guardrailPreamble.trimEnd().slice(0, 40));
    assert.ok(exitIndex >= 0 && guardrailIndex >= 0, scenarioId);
    assert.ok(
      exitIndex < guardrailIndex,
      `가드레일은 언제나 맨 마지막이다(AC-065): ${scenarioId}`,
    );
    seen.push(scenarioId);
  }
  assert.equal(seen.length, 6, "6종 전수여야 한다(부분 정정 차단)");
});

// ⚠️ **T110 / G73·G23 인접 사실 — clone 2종은 A1의 영향을 받지 않는다.**
// "공통 조립부가 바뀌었으니 ElevenLabs 에이전트 재생성이 필요하다"는 추론은 **자동으로 참이 아니다**:
// `VERIFY_INTERCEPT_RULE`은 조건형 블록이고 clone 2종은 카탈로그가 없어 블록이 붙지 않는다.
// 주석으로만 남기면 다음 사람이 다시 틀리게 추론하므로 **기계로 고정**한다(clone 2종 프롬프트
// 파일 상단의 재생성 상태 줄이 이 단언과 같은 사실을 말한다).
test("[T110/G73] clone 2종의 조립 산출물에는 확인 안내 블록이 붙지 않는다(= A1이 닿지 않는다)", () => {
  for (const scenarioId of ["family-accident-deepvoice", "grandchild-impersonation"]) {
    assert.equal(hasVerifyIntercept(scenarioId), false, `clone 경로에는 카탈로그가 없다: ${scenarioId}`);
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      const assembled = buildSystemPrompt(SCENARIO_PROMPTS[scenarioId], {
        difficultyLevel: level,
        verifyInterceptEnabled: hasVerifyIntercept(scenarioId),
      });
      assert.equal(
        assembled.includes("[확인 안내 — 이 훈련에서만 적용]"),
        false,
        `${scenarioId}/${level}: 블록이 붙으면 clone 에이전트 재생성이 실제로 필요해진다(G73)`,
      );
      assert.equal(assembled.includes("빠진 사람이다"), false, `${scenarioId}/${level}: A1 ⓑ 미유입`);
    }
  }
});

test("[T110/G82 역검증] 퇴장 규칙을 뺀 조립 결과는 **실제로 실패한다**(죽은 게이트가 아니다)", () => {
  const assembled = buildSystemPrompt(SCENARIO_PROMPTS["bank-security-verify-scam"], {
    difficultyLevel: "advanced",
    verifyInterceptEnabled: true,
  });
  const ruleBlock = extractVerifyRuleBlock(assembled);
  // A1 ⓑ가 없던 상태(= T110 착수 전 상시 블록)를 **테스트 코드 안에서만** 되만든다.
  const withoutExitRule = ruleBlock
    .split("\n")
    .filter((line) => !/빠진\s*사람이다/.test(line))
    .join("\n");
  assert.notEqual(withoutExitRule, ruleBlock, "실제로 한 줄이 제거돼야 역검증이 성립한다");
  const missing = EXIT_RULE_PARTS.filter((part) => !part.test(withoutExitRule));
  assert.equal(missing.length, EXIT_RULE_PARTS.length, "세 성분 전부가 그 한 줄에 있었다 = G82가 살아 있다");
});

test("[T110/G85] 모델에 도달하는 문자열 3종을 **합쳐도** 잔류 요구·복귀 허용 표현이 0건이다", () => {
  for (const scenarioId of Object.keys(VERIFY_INTERCEPT)) {
    const { combined } = modelReachableStrings(scenarioId);
    assert.deepEqual(
      positiveResidencyDemands(combined),
      [],
      `합집합에 잔류 요구가 남으면 두 전제가 다시 공존한다: ${scenarioId}`,
    );
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
    RESIDENCY_PATTERNS.every((pattern) => !pattern.test(announce)),
    "G83(announce 단독)은 통과한다",
  );
  assert.ok(
    DIAL_OUT_PREMISES.every((pattern) => !pattern.test(reconnect)),
    "G84(reconnect 단독)도 통과한다",
  );

  // ② 그런데 모델이 실제로 받는 합집합에는 잔류 요구가 들어 있다 → **G85만 잡는다.**
  const combined = [taintedRuleBlock, announce, reconnect].join("\n");
  const fired = positiveResidencyDemands(combined);
  // `clauseAt`은 **매치 지점부터** 절 끝까지를 돌려주므로 두 패턴이 각각의 절 조각으로 잡힌다.
  assert.deepEqual(
    fired,
    ["끊지 않고 기다리겠습니다", "기다리겠습니다"],
    "합쳐서 검사하지 않으면 이번 결함은 영영 잡히지 않는다",
  );
});

test("[T110/G85 역검증 ③] 금지형 문맥 예외가 **긍정형 잔류 요구까지 봐주지는 않는다**", () => {
  // §22.1 A1 ⓐ의 금지형("끊지 마시라고 붙잡지도 않는다")은 통과해야 하고,
  const prohibitive = "상대가 끊고 확인하겠다고 하면 막지 않는다 — 끊지 마시라고 붙잡지도 않는다.";
  assert.deepEqual(positiveResidencyDemands(prohibitive), []);
  // 결함 원문(긍정형)은 **반드시 걸려야** 한다. 뒤 문장에 "…마라"가 있어도 절이 다르므로 봐주지 않는다.
  const positive = "저는 끊지 않고 기다리겠습니다. 번호를 네가 지어내 읽어 주지 마라.";
  assert.equal(positiveResidencyDemands(positive).length, 2, "끊지 않고 · 기다리겠습니다 둘 다 걸린다");
});

test("[T110/G85 역검증 ②] 복귀 허용 문맥이 섞이면 G85가 잡는다", () => {
  const clean = "앞 담당자는 이 통화에서 빠진 사람이다 — 그 인물로 다시 말하지 마라.";
  const tainted = "앞 담당자가 옆에서 확인해 주면 이어서 설명하게 하라.";
  assert.deepEqual(returnAllowingMentions(clean), []);
  assert.equal(returnAllowingMentions(tainted).length, 1);
});

// ══════════════════════════════════════════════════════════════════════════════
// ⭐ T110 재작업 — **금지형 문맥 예외 우회 4종 회귀 고정**(reviewer Major · QA NO-GO)
//
// 최초 구현의 예외 조건이 *"부정어가 그 잔류 요구를 부정하는가"* 가 아니라 *"부정어가 절 어딘가에
// 있는가"* 였다. 아래 4종은 **무관한 부정문을 덧붙이는 것만으로** 게이트를 통과했던 실제 재현
// 입력이다. ⚠️ **한 테스트에 섞지 않는다** — 섞으면 하나만 잡혀도 통과해 나머지 구멍을 못 본다
// (G86-d에서 이미 세운 관례).
// 판정 규칙은 `positiveResidencyDemands` 위의 판정표에 있다.
// ══════════════════════════════════════════════════════════════════════════════

test("[T110/G85 우회회귀 ⓪ 대조군] 결함 원문은 BLOCKED다", () => {
  assert.ok(positiveResidencyDemands("저는 끊지 않고 기다리겠습니다.").length > 0);
});

test("[T110/G85 우회회귀 ①] 뒤에 무관한 부정 서술을 덧붙여도 BLOCKED다", () => {
  // 종전: 절 안에 "않는다"가 있다는 이유로 전체가 예외 처리돼 0건이었다(BYPASS).
  const bypass = "저는 끊지 않고 기다리겠습니다 다른 데로는 가지 않는다.";
  assert.ok(positiveResidencyDemands(bypass).length > 0, "무관한 부정어는 예외를 열지 못한다");
});

test("[T110/G85 우회회귀 ②] 뒤에 무관한 금지 명령을 덧붙여도 BLOCKED다", () => {
  const bypass = "저는 끊지 않고 기다리겠습니다 걱정은 하지 마라.";
  assert.ok(positiveResidencyDemands(bypass).length > 0);
});

test("[T110/G85 우회회귀 ③] 종결형 잔류 요구는 뒤에 무엇이 와도 BLOCKED다", () => {
  // 판정표 1행 — "대기하겠습니다"는 이미 끝난 서술이라 뒤 문장이 부정할 수 없다.
  const bypass = "대기하겠습니다 재촉하지 마라.";
  assert.ok(positiveResidencyDemands(bypass).length > 0);
});

test("[T110/G85 우회회귀 ④] 쉼표로 이어붙인 만연체(절 늘이기)로도 BLOCKED다", () => {
  // 종전: 절 경계가 종결부호뿐이라 한국어 만연체에서 구간이 무한정 늘어났다 → 쉼표를 경계에 넣었다.
  const bypass =
    "고객이 원할 때까지 저는 끊지 않고 기다리겠습니다, 이건 절차상 어쩔 수 없는 방침이며 다른 방식은 허용되지 않는다.";
  assert.ok(positiveResidencyDemands(bypass).length > 0);
});

test("[T110/G85 우회회귀 ⑤ 과차단 0건] 정상 금지형 2종은 그대로 통과한다", () => {
  // ⚠️ 좁히면서 **설계가 요구한 문구를 때리지 않았는지**가 이 재작업의 실패 조건이다.
  // (a) §22.1 A1 ⓐ 원문 — 예외가 인정돼야 한다(인용 표지 "라고"가 매치에 직접 붙는다).
  assert.deepEqual(
    positiveResidencyDemands("상대가 끊고 직접 확인해 보겠다고 하면 막지 않는다 — 끊지 마시라고 붙잡지도 않는다."),
    [],
  );
  // (b) 금지형 뒤에 긍정형이 이어지면 **긍정형만** 걸린다(과차단도 과소차단도 아니다).
  const mixed = "끊지 말라고 하지는 않겠지만 끊지 않고 기다리겠습니다.";
  assert.ok(positiveResidencyDemands(mixed).length > 0, "뒤의 긍정형 잔류 요구는 잡힌다");
});

test("[T110/G85 우회회귀 ⑥] `returnAllowingMentions`도 같은 결함이었다 — 함께 좁혔다", () => {
  // ⚠️ 대칭 확인 결과 **같은 구조였다**: 90자 윈도 안에 아무 부정어나 있으면 예외였다.
  const bypass = "앞 담당자가 이어서 말하게 하라, 무리하지는 않는다.";
  assert.ok(
    returnAllowingMentions(bypass).length > 0,
    "일반 부정어는 예외를 열지 못한다 — §22.1이 확정한 퇴장 술어만 연다",
  );
  // 확정 퇴장·전환 술어는 그대로 통과한다(A1 ⓑ · A3 · RECONNECT_TAIL의 실제 문장).
  for (const approved of [
    "앞 담당자가 이 통화를 너에게 넘겼다.",
    "앞 담당자는 통화에서 빠졌다.",
    "앞 담당자는 이 통화에서 빠진 사람이다",
    "그 인물의 이름·직책·1인칭으로 앞 담당자를 다시 말하지 않는다",
    "앞 담당자를 대신 인용하는 형태도 만들지 마라",
    "네가 앞사람과 같은 사람이라는 사실·통화가 어디로 이어졌는지는 어떤 형태로도 말하지 마라",
  ]) {
    assert.deepEqual(returnAllowingMentions(approved), [], approved);
  }
});

// ── 2차 QA NO-GO — **인용 예외(판정표 2행) 자체의 우회 3종** ──────────────────────
// ⚠️ 1차 수정에서 4종은 `quotable:false`로 예외를 아예 없앴는데 `끊지 마시` 1종만 취약한 검사를
// 그대로 재사용했다: *"인용 표지가 붙는가 && 절 안 어딘가에 부정어가 있는가"*. 그 부정어가 매치를
// 부정하는지는 아무도 보지 않았다 → `~하고 …하지 않는다`라는 **평범한 접속 구조**로 뚫렸다.
// ⚠️ **회귀 테스트에 이 형태가 없어서 구멍이 안 보였다.** 아래 3종이 그 자리를 메운다.
// ⚠️ 한 테스트에 섞지 않는다 — 섞으면 하나만 잡혀도 통과한다.

test("[T110/G85 우회회귀 ⑧] 인용 뒤 부정 대상이 **다른 주어**면 BLOCKED다", () => {
  const bypass = "끊지 마시라고 다른 사람은 절대 오지 않는다.";
  assert.ok(positiveResidencyDemands(bypass).length > 0, "부정 대상이 '오다'라 잔류 요구를 부정하지 않는다");
});

test("[T110/G85 우회회귀 ⑨] 인용과 부정 사이에 **다른 완결 서술**이 끼면 BLOCKED다", () => {
  const bypass = "끊지 마시라고 말하되 이후 다른 안내는 하지 않는다.";
  assert.ok(positiveResidencyDemands(bypass).length > 0, "'말하되'가 끼면 뒤 부정어는 매치를 지배하지 않는다");
});

test("[T110/G85 우회회귀 ⑩] `~하고 …하지 않는다` 접속형 잔류 요구는 BLOCKED다", () => {
  // ⭐ 이 문장은 **문자 그대로의 잔류 요구**다("끊지 마시라고 안내"). 고의로 비튼 문자열이 아니라
  // 콘텐츠 작성자가 A1 ⓐ를 확장하다 우발적으로 재도입할 수 있는 평범한 접속 구조다.
  const bypass = "참가자에게 끊지 마시라고 안내하고 이후 응대를 종료하지 않는다.";
  assert.ok(positiveResidencyDemands(bypass).length > 0);
});

test("[T110/G85 우회회귀 ⑪ 과차단 0건] 인용 예외는 **여전히 열려 있다**(A1 ⓐ + 부사형 변주)", () => {
  // 좁히면서 예외를 닫아 버리면 §22.1 A1 ⓐ가 자기 게이트에 걸린다 — 그것이 이 재작업의 실패 조건이다.
  assert.deepEqual(positiveResidencyDemands("끊지 마시라고 붙잡지도 않는다."), [], "A1 ⓐ 원문");
  // 부사 1개까지는 끼어들 수 있다 — 없으면 정상 금지형이 과차단된다.
  assert.deepEqual(positiveResidencyDemands("끊지 마시라고 절대 말하지 않는다."), [], "부사형 변주");
  assert.deepEqual(positiveResidencyDemands("끊지 마시라고 안내하지 마라."), [], "금지 명령형 변주");
});

test("[T110/G85 우회회귀 ⑦] 허용 구문과 금지를 한 절에 섞어도 BLOCKED다(거부권)", () => {
  // 퇴장 술어가 절에 있어도 "말하게 하라"류 허용 구문이 함께 있으면 퇴장 문맥이 아니다.
  const bypass = "앞 담당자가 이어서 말하게 하되 이름은 다시 말하지 마라";
  assert.ok(returnAllowingMentions(bypass).length > 0, "허용 구문이 섞이면 예외가 닫힌다");
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
