// T84 — 모의 화면 카탈로그의 안전 불변식·드리프트 고정
// (Architecture.md §15.9.1/§15.9.7, DECISIONS #42, AC-072/AC-073/AC-076).
//
// ⚠️ 이 파일이 지키는 것은 **AC-072의 하드 제약**이다: 실제 설치 파일·실제 앱스토어 링크·실존
// 앱명·실제 OS 권한 요청·실제 기기 설정 변경·외부 네비게이션이 **어디에도 없다**. 그 "없음"은
// 주장만으로는 증명되지 않으므로 여기서 기계로 훑는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MOCK_SCREEN_KIND,
  findMockScreenItem,
  hasAppInstallMockScreen,
  listAppInstallMockScreens,
  MOCK_INSTALL_CONSENT_INSTRUCTION,
  MOCK_SCREENS,
  resolveMockScreenKind,
} from "../mockScreens";
import { IN_CALL_SMS } from "../inCallSms";
import { VERIFY_INTERCEPT } from "../verifyIntercept";
import { SCENARIO_PROMPTS } from "../index";
import { PUBLIC_SCENARIOS } from "../publicMeta";
import { extractLinkMarker } from "../../roleplay/linkMarker";
import { REAL_WORLD_APP_NAMES } from "./harmlessnessPatterns";

const allItems = Object.values(MOCK_SCREENS).flat();
const allText = allItems
  .flatMap((item) => [item.headline, item.consentLabel, item.momentTactic, item.correctAction, ...item.bodyLines])
  .join("\n");

test("[AC-072] 카탈로그 타입·값 어디에도 실 설치 경로(URL·스토어·패키지명·파일)가 없다", () => {
  // ① 값에 URL·파일 확장자·스토어 표기가 없다.
  for (const forbidden of [
    /https?:\/\//i,
    /\.apk\b/i,
    /\bplay\.google\b/i,
    /\bapp\s*store\b/i,
    /\bappstore\b/i,
    /\bplay\s*스토어\b/,
    /\b앱\s*스토어\b/,
    /\bmarket:\/\//i,
    /\bintent:\/\//i,
    /\bpackage(Name)?\s*[:=]/i,
  ]) {
    assert.equal(forbidden.test(allText), false, `카탈로그 문구에 금지 패턴이 있다: ${forbidden}`);
  }
  // ② 스키마에 그런 **필드 자체가 없다**(값이 비어 있는 것과 다르다 — 구조적 금지).
  for (const item of allItems) {
    for (const forbiddenKey of ["url", "storeUrl", "packageName", "apkUrl", "permissions", "deepLink"]) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(item, forbiddenKey),
        false,
        `${item.landingId}: '${forbiddenKey}' 필드가 존재하면 안 된다(AC-072 구조적 금지)`,
      );
    }
  }
});

test("[역검증] 스토어 URL이 섞이면 위 금지 검사가 실제로 실패한다", () => {
  const poisoned = `${allText}\nhttps://play.google.com/store/apps/details?id=com.example`;
  assert.equal(/https?:\/\//i.test(poisoned), true);
  assert.equal(/\bplay\.google\b/i.test(poisoned), true);
});

// 실존 앱·서비스명이 부분 문자열로도 등장하면 안 된다(AC-072 "실존 앱명" 금지).
//
// T86 — 목록 자체는 `harmlessnessPatterns.ts`가 정본이다(이 목록이 모의 화면 카탈로그에만 걸려
// 있어 확인 무력화·통화 중 문자·시나리오 프롬프트는 검사를 안 탔다). **이 파일의 단언은 그대로**다.

test("[AC-072] 실존 앱·서비스명이 카탈로그 문구에 부분 문자열로도 없다", () => {
  for (const name of REAL_WORLD_APP_NAMES) {
    assert.equal(
      allText.toLowerCase().includes(name.toLowerCase()),
      false,
      `실존 앱·서비스명이 문구에 있으면 안 된다: ${name}`,
    );
  }
});

test("[역검증] 실존 앱명이 섞이면 위 검사가 실패한다", () => {
  const poisoned = `${allText}\nAnyDesk 설치해 주세요`;
  assert.ok(REAL_WORLD_APP_NAMES.some((n) => poisoned.toLowerCase().includes(n.toLowerCase())));
});

test("[AC-005] correctAction·모델 지시가 가로채기·원격제어의 **수단**을 설명하지 않는다", () => {
  // 전달되는 것은 "결과 상황과 대처"뿐이다. 조작 절차를 설명하면 그 자체가 운영 가능한 정보가 된다.
  for (const forbidden of ["접근성 서비스", "화면 공유 켜", "원격 제어 방법", "알림 접근 권한을 켜"]) {
    assert.equal(
      `${allText}\n${MOCK_INSTALL_CONSENT_INSTRUCTION}`.includes(forbidden),
      false,
      `수단 서술이 있으면 안 된다: ${forbidden}`,
    );
  }
});

test("[D-52/P-25] correctAction에 무력감 표현이 없고, 유효 대처가 구체 행동으로 들어 있다", () => {
  for (const item of allItems) {
    for (const forbidden of ["소용없", "막을 수 없", "어차피", "방법이 없"]) {
      assert.equal(
        item.correctAction.includes(forbidden),
        false,
        `${item.landingId}: 무력감 표현 금지(P-25): ${forbidden}`,
      );
    }
    // 과신·질책 표현도 쓰지 않는다(P-8 계승).
    for (const forbidden of ["이제 안전", "면역", "또 틀렸"]) {
      assert.equal(item.correctAction.includes(forbidden), false, `${item.landingId}: ${forbidden}`);
    }
    assert.ok(item.correctAction.length >= 20, `${item.landingId}: correctAction이 비어 있으면 안 된다`);
  }
});

test("[§15.9.7 G53] MOCK_SCREENS의 모든 landingId가 LINK_LABELS에 있다(칩 라벨 드리프트 방지)", () => {
  // extractLinkMarker가 기본 라벨("확인하기")로 떨어지면 설치 유도 링크가 무의미한 라벨로 뜬다.
  for (const [scenarioId, items] of Object.entries(MOCK_SCREENS)) {
    for (const item of items) {
      const { attachments } = extractLinkMarker(`[[LINK:${item.landingId}]]`, scenarioId);
      assert.ok(attachments);
      assert.notEqual(
        attachments[0].displayText,
        "확인하기",
        `${item.landingId}: LINK_LABELS에 라벨을 등재해야 한다(G53)`,
      );
      assert.equal(attachments[0].landingKind, item.kind === "credential-form" ? undefined : item.kind);
    }
  }
});

test("[§15.9.7 G55] MOCK_SCREENS는 IN_CALL_SMS·VERIFY_INTERCEPT와 scenarioId를 공유하지 않는다", () => {
  // turnInstruction 슬롯은 문자열 1개뿐이라 같은 시나리오에서 두 지시가 due이면 하나가 밀린다.
  // 우선순위 규칙(pickFallbackTurnInstruction)이 있지만, **현행 콘텐츠에서는 애초에 경합하지
  // 않는다**는 사실 자체를 여기서 고정한다.
  for (const scenarioId of Object.keys(MOCK_SCREENS)) {
    assert.equal(
      IN_CALL_SMS[scenarioId],
      undefined,
      `${scenarioId}: 통화 중 문자 카탈로그와 겹치면 turnInstruction 경합이 실제로 발생한다(G55)`,
    );
    assert.equal(
      VERIFY_INTERCEPT[scenarioId],
      undefined,
      `${scenarioId}: 확인 무력화 카탈로그와 겹치면 turnInstruction 경합이 실제로 발생한다(G55)`,
    );
  }
});

test("[§15.9.1 R6] IN_CALL_SMS가 app-install 랜딩을 참조하지 않는다(통화 중 문자 경로는 범위 밖)", () => {
  const installIds = new Set(allItems.filter((i) => i.kind === "app-install").map((i) => i.landingId));
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const sms of items) {
      if (!sms.fakeLandingId) continue;
      assert.equal(
        installIds.has(sms.fakeLandingId),
        false,
        `${scenarioId}/${sms.smsId}: 통화 중 문자로 설치 목업을 열면 앵커 규칙이 합성 타임스탬프 문제와 얽힌다(R6)`,
      );
    }
  }
});

test("landingId는 전역 유일하고, 카탈로그의 모든 scenarioId가 실제 시나리오다", () => {
  const ids = allItems.map((i) => i.landingId);
  assert.equal(new Set(ids).size, ids.length, "landingId가 중복되면 문서 id가 세션 안에서 충돌한다");
  for (const scenarioId of Object.keys(MOCK_SCREENS)) {
    assert.ok(SCENARIO_PROMPTS[scenarioId], `${scenarioId}: SCENARIO_PROMPTS에 존재해야 한다`);
    assert.ok(PUBLIC_SCENARIOS[scenarioId], `${scenarioId}: PUBLIC_SCENARIOS에 존재해야 한다`);
    assert.equal(
      PUBLIC_SCENARIOS[scenarioId].channel,
      "messenger",
      `${scenarioId}: 모의 설치는 메신저 단계에서 일어난다(UF-012 Step 2)`,
    );
  }
});

test("[AC-073] app-install 카탈로그를 가진 시나리오는 escalation 배선을 이미 갖고 있다(신규 전이 경로 0건)", () => {
  for (const scenarioId of Object.keys(MOCK_SCREENS)) {
    if (!hasAppInstallMockScreen(scenarioId)) continue;
    const escalation = PUBLIC_SCENARIOS[scenarioId].escalation;
    assert.ok(escalation, `${scenarioId}: 3단계로 이어지려면 기존 escalation 메타가 있어야 한다`);
    assert.equal(escalation.toChannel, "voice");
  }
});

test("[R3/R5] resolveMockScreenKind: 소속이면 카탈로그 값, 아니면 credential-form 폴백", () => {
  assert.equal(DEFAULT_MOCK_SCREEN_KIND, "credential-form");
  assert.equal(
    resolveMockScreenKind("messenger-subsidy-smishing-sms", "subsidy-install"),
    "app-install",
  );
  assert.equal(resolveMockScreenKind("messenger-subsidy-smishing-sms", "unknown"), "credential-form");
  assert.equal(resolveMockScreenKind("no-such-scenario", "subsidy-install"), "credential-form");
});

test("[§15.6 G12 동형] findMockScreenItem은 다른 시나리오·다른 landingId를 거부한다(위조 호출 차단)", () => {
  assert.ok(findMockScreenItem("messenger-subsidy-smishing-sms", "subsidy-install"));
  assert.equal(findMockScreenItem("messenger-parcel-smishing-sms", "subsidy-install"), undefined);
  assert.equal(findMockScreenItem("messenger-subsidy-smishing-sms", "parcel-redelivery"), undefined);
});

test("hasAppInstallMockScreen / listAppInstallMockScreens — 게이팅 판정이 일치한다", () => {
  assert.equal(hasAppInstallMockScreen("messenger-subsidy-smishing-sms"), true);
  assert.equal(hasAppInstallMockScreen("family-accident-deepvoice"), false);
  assert.equal(listAppInstallMockScreens("family-accident-deepvoice").length, 0);
  assert.deepEqual(
    listAppInstallMockScreens("messenger-subsidy-smishing-sms").map((i) => i.landingId),
    ["subsidy-install"],
  );
});

test("[§15.9.7 G54] 응낙 턴 지시가 채널 전이 신호를 담지 않는다(신규 전이 트리거 0건)", () => {
  assert.equal(
    MOCK_INSTALL_CONSENT_INSTRUCTION.includes("[[SIGNAL:"),
    false,
    "지시에 전이 신호를 심으면 응낙이 곧 전이가 되어 AC-073을 깬다",
  );
});
