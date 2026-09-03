// T84 — 모의 화면 카탈로그의 안전 불변식·드리프트 고정
// (Architecture.md §15.9.1/§15.9.7, DECISIONS #42, AC-072/AC-073/AC-076).
//
// ⚠️ 이 파일이 지키는 것은 **AC-072의 하드 제약**이다: 실제 설치 파일·실제 앱스토어 링크·실존
// 앱명·실제 OS 권한 요청·실제 기기 설정 변경·외부 네비게이션이 **어디에도 없다**. 그 "없음"은
// 주장만으로는 증명되지 않으므로 여기서 기계로 훑는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  DEFAULT_MOCK_SCREEN_KIND,
  findMockScreenItem,
  hasAppInstallMockScreen,
  listAppInstallMockScreens,
  MOCK_INSTALL_CONSENT_INSTRUCTION,
  MOCK_SCREENS,
  resolveMockScreenKind,
  type MockScreenItem,
} from "../mockScreens";
import { IN_CALL_SMS } from "../inCallSms";
import { VERIFY_INTERCEPT } from "../verifyIntercept";
import { SCENARIO_PROMPTS } from "../index";
import { PUBLIC_SCENARIOS } from "../publicMeta";
import { extractLinkMarker } from "../../roleplay/linkMarker";
import { REAL_WORLD_APP_NAMES } from "./harmlessnessPatterns";

const allItems = Object.values(MOCK_SCREENS).flat();
// T104 — kind별 옵셔널 필드가 생겼으므로 **부재를 걸러 내고 전 문자열 필드를 훑는다.** 목록을
// 손으로 유지하면 새 필드가 조용히 빠지므로, 아래 [T104/G-C] 필드 등록부 단언이 이 목록과
// `MockScreenItem`의 1:1을 강제한다.
const allText = allItems
  .flatMap((item) => [
    item.headline,
    item.issuerLabel,
    item.submitLabel,
    item.successHeadline,
    item.consentLabel,
    item.momentTactic,
    item.correctAction,
    ...item.bodyLines,
    ...(item.fields ?? []),
  ])
  .filter((text): text is string => text !== undefined)
  .join("\n");

/** `app-install` 항목을 **하나라도** 가진 시나리오 — 정밀화된 G55·channel 단언의 판정 키(§19.2 (2)). */
const appInstallScenarioIds = Object.keys(MOCK_SCREENS).filter((scenarioId) =>
  hasAppInstallMockScreen(scenarioId),
);

test("[AC-072] 카탈로그 타입·값 어디에도 실 설치 경로(URL·스토어·패키지명·파일)가 없다", () => {
  // ⚠️ **주의(T86, 2026-07-26) — 아래 목록의 `/\bplay\s*스토어\b/`·`/\b앱\s*스토어\b/` 두 줄은
  // 사실상 아무것도 잡지 못한다.** JS의 `\b`는 **ASCII 단어 경계**라 한글 앞뒤에서는 경계가
  // 성립하지 않는다(`"앱 스토어에서 받으세요"` → false). **보호막으로 착각하지 마라.**
  // 실제 방어는 `harmlessnessPatterns.ts`의 `STORE_AND_INSTALL_PATTERNS`(`\b` 없는 형태)가
  // 이 카탈로그를 포함한 **전 콘텐츠 도메인**에 걸어 두고 있으며, 죽은 패턴 재발은 그 파일의
  // `[T86/생존]` 테스트가 막는다. 이 줄들은 T86 범위(테스트 확장) 밖이라 **단언을 고치지 않고
  // 사실만 적어 둔다** — 고치려면 별도 태스크로 등재할 것.
  //
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

test("[§15.9.7 G53] entrySurface='messenger-link' 항목의 landingId가 LINK_LABELS에 있다(칩 라벨 드리프트 방지)", () => {
  // extractLinkMarker가 기본 라벨("확인하기")로 떨어지면 설치 유도 링크가 무의미한 라벨로 뜬다.
  //
  // ⚠️ **T104 정밀화(ADR-0012)**: 판정 대상을 "모든 landingId" → **`entrySurface ===
  // "messenger-link"` 항목**으로 좁혔다. G53의 원문 사유는 *"`extractLinkMarker`가 기본 라벨로
  // 떨어지면"* 이고, 통화 중 문자 경로의 칩은 `InCallSmsItem.linkDisplayText`가 그리며
  // `extractLinkMarker`를 **애초에 타지 않는다**(§19.1 (1)). ⛔ 통화 경로 3종을 `LINK_LABELS`에
  // 넣어 통과시키는 우회는 금지다(G77) — 어떤 프롬프트도 안 내보내는 죽은 라벨이 늘고, G53의
  // 의미가 *"프롬프트가 내보내는 id"* → *"카탈로그에 있는 id"* 로 조용히 뒤집힌다.
  // 통화 경로의 대응 게이트는 G-B(양방향 참조 정합)다.
  for (const [scenarioId, items] of Object.entries(MOCK_SCREENS)) {
    for (const item of items) {
      if (item.entrySurface !== "messenger-link") continue;
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

test("[§15.9.7 G55] **app-install 항목을 가진** 시나리오는 IN_CALL_SMS·VERIFY_INTERCEPT와 겹치지 않는다", () => {
  // turnInstruction 슬롯은 문자열 1개뿐이라 같은 시나리오에서 두 지시가 due이면 하나가 밀린다.
  // 우선순위 규칙(pickFallbackTurnInstruction)이 있지만, **현행 콘텐츠에서는 애초에 경합하지
  // 않는다**는 사실 자체를 여기서 고정한다.
  //
  // ⚠️ **T104 정밀화(ADR-0012)**: 판정 키를 "카탈로그의 모든 scenarioId" → **`app-install` 항목을
  // 가진 scenarioId**로 좁혔다. 사유가 정확히 그것이기 때문이다 — 모의 화면 쪽에서
  // `turnInstruction`을 만드는 경로는 `hasAppInstallMockScreen()` 게이트 뒤에만 있고
  // (`roleplay/index.ts:213` → `mockScreens.ts` `listAppInstallMockScreens`), 지시의 전제인
  // `consentedAt`은 `kind !== "app-install"`이면 콜러블이 거부한다(`mockScreens/index.ts:74-76`).
  // 즉 `credential-form` 항목은 **경합 자체를 만들 수 없다**(§19.1 (2) ①②).
  for (const scenarioId of appInstallScenarioIds) {
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
  assert.ok(appInstallScenarioIds.length > 0, "app-install 항목이 0건이면 이 게이트가 아무것도 안 잡는다");
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

// ── T104 신규 게이트 G-A~G-E (Architecture.md §19.5 · ADR-0012) ───────────────
//
// **왜 정밀화보다 먼저인가(G75)**: 위 네 단언의 판정 키를 `app-install`·진입 표면으로 좁히면
// 그 틈으로 *"`app-install` 목업이 통화 중 문자에서 열리는"* 사고(M2)와 *"통화 경로 랜딩이 어떤
// 정합 게이트도 안 타는"* 구멍(M5)이 열린다. 아래 게이트가 그 둘을 반대쪽에서 닫는다.
//
// 판정 로직을 **순수 함수**로 두는 이유: 같은 코드로 실제 카탈로그와 **오염 픽스처**를 함께
// 돌려 "좁힌 조건이 실제로는 아무것도 안 잡는 상태"를 배제하기 위해서다(G-E 역검증).

type Catalog = Record<string, MockScreenItem[]>;

/** G-A — 통화 중 문자 표면에서는 `app-install`이 열릴 수 없다(R6을 카탈로그 쪽에서 한 번 더). */
function findEntrySurfaceKindViolations(catalog: Catalog): string[] {
  const failures: string[] = [];
  for (const [scenarioId, items] of Object.entries(catalog)) {
    for (const item of items) {
      if (item.entrySurface === "in-call-sms" && item.kind === "app-install") {
        failures.push(`${scenarioId}/${item.landingId}: in-call-sms 표면에 app-install kind(G-A/R6)`);
      }
    }
  }
  return failures;
}

/** G-B — `IN_CALL_SMS.fakeLandingId` ↔ 카탈로그 **양방향** 참조 정합(M5를 닫는다).
 *
 * 이 게이트 이전에는 통화 경로 랜딩이 **어떤 정합 검사도 타지 않았다** — `LINK_LABELS`에 없어
 * G53을 애초에 우회하고, `MOCK_SCREENS`에 없어 `findMockScreenItem` 재검증도 타지 않았다.
 * 오탈자 1글자로 랜딩이 조용히 범용 화면으로 떨어지는 것이 정확히 이번 사용자 신고의 재발 경로다. */
function findCrossReferenceViolations(
  catalog: Catalog,
  smsCatalog: Record<string, { smsId: string; fakeLandingId?: string }[]>,
): string[] {
  const failures: string[] = [];
  // ① 통화 중 문자가 가리키는 landingId는 **같은 시나리오** 카탈로그에 in-call-sms 표면으로 있다.
  for (const [scenarioId, items] of Object.entries(smsCatalog)) {
    for (const sms of items) {
      if (!sms.fakeLandingId) continue;
      const item = (catalog[scenarioId] ?? []).find((i) => i.landingId === sms.fakeLandingId);
      if (!item) {
        failures.push(
          `${scenarioId}/${sms.smsId}: fakeLandingId '${sms.fakeLandingId}'가 카탈로그에 없다(G-B ①)`,
        );
        continue;
      }
      if (item.entrySurface !== "in-call-sms") {
        failures.push(
          `${scenarioId}/${sms.smsId}: '${sms.fakeLandingId}'의 entrySurface가 ` +
            `'${item.entrySurface}'다 — 통화 중 문자가 참조하면 in-call-sms여야 한다(G-B ①)`,
        );
      }
    }
  }
  // ② 반대 방향 — in-call-sms 표면 항목은 자기를 참조하는 문자가 최소 1건 있어야 한다(도달 가능).
  for (const [scenarioId, items] of Object.entries(catalog)) {
    for (const item of items) {
      if (item.entrySurface !== "in-call-sms") continue;
      const referenced = (smsCatalog[scenarioId] ?? []).some(
        (sms) => sms.fakeLandingId === item.landingId,
      );
      if (!referenced) {
        failures.push(
          `${scenarioId}/${item.landingId}: 이 랜딩을 참조하는 통화 중 문자가 없다 — ` +
            "도달할 수 없는 화면이다(G-B ②)",
        );
      }
    }
  }
  return failures;
}

/** G-C — kind ↔ 필드 정합(§19.3 (2)). `app-install`에 입력 필드가 생기면 AC-072가 조용히 깨진다. */
function findKindFieldViolations(catalog: Catalog): string[] {
  const failures: string[] = [];
  for (const [scenarioId, items] of Object.entries(catalog)) {
    for (const item of items) {
      const at = `${scenarioId}/${item.landingId}`;
      if (item.kind === "app-install") {
        if (item.consentLabel === undefined) failures.push(`${at}: app-install에 consentLabel이 없다`);
        if (item.fields !== undefined) {
          failures.push(`${at}: app-install에 입력 필드가 있으면 AC-072 "입력 필드 0"이 깨진다`);
        }
        if (item.submitLabel !== undefined) failures.push(`${at}: submitLabel은 credential-form 전용`);
        if (item.successHeadline !== undefined) {
          failures.push(`${at}: successHeadline은 credential-form 전용`);
        }
      } else {
        if (item.consentLabel !== undefined) failures.push(`${at}: consentLabel은 app-install 전용`);
        if (item.fields === undefined || item.fields.length < 1 || item.fields.length > 3) {
          failures.push(`${at}: credential-form은 입력 필드 1~3개여야 한다(UX-023 v1.13)`);
        }
        if (item.submitLabel === undefined) failures.push(`${at}: credential-form에 submitLabel이 없다`);
        if (item.successHeadline === undefined) {
          failures.push(`${at}: credential-form에 successHeadline이 없다`);
        }
      }
    }
  }
  return failures;
}

/** 오염 픽스처용 최소 항목(역검증 전용 — 실제 카탈로그에 들어가지 않는다). */
function fixtureItem(overrides: Partial<MockScreenItem>): MockScreenItem {
  return {
    landingId: "fixture-landing",
    kind: "credential-form",
    entrySurface: "messenger-link",
    headline: "픽스처 화면",
    bodyLines: ["픽스처 안내문."],
    issuerLabel: "ⓒ 픽스처센터",
    fields: ["성함"],
    submitLabel: "확인",
    successHeadline: "입력되었습니다.",
    momentTactic: "픽스처 수법",
    correctAction: "픽스처 대처 문구입니다. 링크로 정보를 입력하지 말고 화면을 닫으세요.",
    ...overrides,
  };
}

test("[T104/G-A] entrySurface='in-call-sms' 항목은 app-install kind일 수 없다(R6 반대쪽)", () => {
  assert.deepEqual(findEntrySurfaceKindViolations(MOCK_SCREENS), []);
});

test("[T104/G-A 역검증] 통화 표면에 app-install을 넣으면 실제로 걸린다", () => {
  const poisoned: Catalog = {
    "loan-refinance-scam": [
      fixtureItem({ entrySurface: "in-call-sms", kind: "app-install", consentLabel: "허용", fields: undefined }),
    ],
  };
  assert.equal(findEntrySurfaceKindViolations(poisoned).length, 1);
});

test("[T104/G-B] IN_CALL_SMS ↔ MOCK_SCREENS 양방향 참조 정합(통화 경로 랜딩의 M5를 닫는다)", () => {
  assert.deepEqual(findCrossReferenceViolations(MOCK_SCREENS, IN_CALL_SMS), []);
});

test("[T104/G-B 역검증] 한쪽에서 1건을 빼거나 표면을 틀리면 실제로 실패한다", () => {
  // ① 카탈로그에서 통화 경로 항목 1건을 빼면 — 문자 → 랜딩 참조가 끊긴다.
  const withoutOne: Catalog = Object.fromEntries(
    Object.entries(MOCK_SCREENS).map(([scenarioId, items]) => [
      scenarioId,
      scenarioId === "loan-refinance-scam" ? [] : items,
    ]),
  );
  const dropped = findCrossReferenceViolations(withoutOne, IN_CALL_SMS);
  assert.ok(
    dropped.some((f) => f.includes("loan-refinance-apply")),
    `카탈로그에서 1건을 빼면 G-B ①이 잡아야 한다: ${dropped.join(" / ")}`,
  );
  // ② 아무도 참조하지 않는 통화 표면 항목을 넣으면 — 반대 방향이 잡는다.
  const orphan = findCrossReferenceViolations(
    { "tax-refund-scam": [fixtureItem({ landingId: "nobody-links-here", entrySurface: "in-call-sms" })] },
    {},
  );
  assert.ok(orphan.some((f) => f.includes("nobody-links-here")));
  // ③ 표면을 messenger-link로 잘못 선언하면 — 정밀화된 G53 쪽으로 새는 것을 여기서 막는다.
  const wrongSurface = findCrossReferenceViolations(
    { "tax-refund-scam": [fixtureItem({ landingId: "tax-refund-claim", entrySurface: "messenger-link" })] },
    IN_CALL_SMS,
  );
  assert.ok(wrongSurface.some((f) => f.includes("entrySurface")));
});

test("[T104/G-C] kind ↔ 필드 정합 — app-install에 입력 필드가 0건이다(AC-072)", () => {
  assert.deepEqual(findKindFieldViolations(MOCK_SCREENS), []);
});

test("[T104/G-C 역검증] app-install에 fields를 넣거나 credential-form에 consentLabel을 넣으면 실패한다", () => {
  const installWithFields = findKindFieldViolations({
    s: [fixtureItem({ kind: "app-install", consentLabel: "허용", fields: ["성함"], submitLabel: undefined, successHeadline: undefined })],
  });
  assert.ok(installWithFields.some((f) => f.includes("AC-072")));
  const formWithConsent = findKindFieldViolations({ s: [fixtureItem({ consentLabel: "허용" })] });
  assert.ok(formWithConsent.some((f) => f.includes("app-install 전용")));
  const tooManyFields = findKindFieldViolations({
    s: [fixtureItem({ fields: ["a", "b", "c", "d"] })],
  });
  assert.ok(tooManyFields.some((f) => f.includes("1~3개")));
});

// G-D — 안전 고지는 상황과 무관하게 **컴포넌트 상수**로 남는다(§19.3 (3) · P-28 ⑤).
// 카탈로그 필드가 되면 항목마다 다른 고지가 가능해져 "상황이 갈려도 안 갈리는 것"이 무너진다.
const SHARED_SAFETY_NOTICES = [
  "(실제로는 어디에도 전송되지 않았습니다 — 훈련용 모의 화면입니다.)",
  "(실제로는 어디에도 전송되지 않았고 돈도 오가지 않았습니다 — 훈련용 모의 화면입니다.)",
  "AI 훈련용 모의 화면",
  "훈련 종료",
];

test("[T104/G-D] 공유 안전 고지 문구가 카탈로그 어느 필드에도 없다", () => {
  for (const notice of SHARED_SAFETY_NOTICES) {
    assert.equal(
      allText.includes(notice),
      false,
      `공유 안전 고지는 컴포넌트 상수여야 한다(P-28 ⑤): ${notice}`,
    );
  }
});

test("[T104/G-D 역검증] 안전 고지를 카탈로그 문구에 넣으면 위 검사가 실패한다", () => {
  const poisoned = `${allText}\n(실제로는 어디에도 전송되지 않았고 돈도 오가지 않았습니다 — 훈련용 모의 화면입니다.)`;
  assert.ok(SHARED_SAFETY_NOTICES.some((notice) => poisoned.includes(notice)));
});

test("[T104/G-E] 정밀화된 게이트가 **실제로 무언가를 잡는다**(좁힌 조건의 공회전 방지)", () => {
  // G53 — 등재되지 않은 messenger-link id는 기본 라벨로 떨어지고, 그것이 곧 위반이다.
  const { attachments } = extractLinkMarker(
    "[[LINK:not-registered-label]]",
    "messenger-subsidy-smishing-sms",
  );
  assert.equal(attachments?.[0].displayText, "확인하기", "G53이 잡아야 할 상태가 재현되지 않는다");

  // G55·channel — app-install 판정 키가 실제 카탈로그에서 비어 있지 않다(공회전 방지).
  assert.deepEqual(appInstallScenarioIds, ["messenger-subsidy-smishing-sms"]);
  // 통화 채널 시나리오가 **실제로** 카탈로그에 들어와 있다 — 정밀화가 없었다면 여기서 깨졌을 상태다.
  // ⚠️ `channel`은 옵셔널이고 **음성 시나리오는 아예 필드를 갖지 않는다**(`publicMeta.ts:29`) —
  // `=== "voice"`로 세면 0건이 나온다. 정밀화된 단언과 같은 판정("messenger가 아닌 것")을 쓴다.
  const voiceScoped = Object.keys(MOCK_SCREENS).filter(
    (scenarioId) => PUBLIC_SCENARIOS[scenarioId].channel !== "messenger",
  );
  assert.deepEqual(
    voiceScoped.sort(),
    // §51 — institutional-impersonation·card-company-impersonation이 §45 ⓐ 집행으로 신규
    // 등재된다(통화 채널, credential-form). §53(§51 커밋 D) — bank-security-verify-scam이
    // OQ-A31 (b) 집행으로 신규 등재된다.
    [
      "bank-security-verify-scam",
      "card-company-impersonation",
      "courier-customs-scam",
      "institutional-impersonation",
      "loan-refinance-scam",
      "tax-refund-scam",
    ],
    "통화 채널 6종이 카탈로그에 없으면 정밀화가 아무것도 안 푼 것이다",
  );
  // 그리고 그 5종은 **app-install을 하나도 갖지 않는다**(정밀화의 안전 전제 = M2 차단).
  for (const scenarioId of voiceScoped) {
    assert.equal(hasAppInstallMockScreen(scenarioId), false, `${scenarioId}: 통화 채널에 설치 목업 금지`);
  }
  // entrySurface 분포도 고정한다 — 표면 선언이 통째로 한쪽으로 쏠리면 G53/G-B 중 하나가 공회전한다.
  const surfaces = allItems.map((item) => item.entrySurface).sort();
  assert.deepEqual(surfaces, [
    // §51 — institutional-impersonation·card-company-impersonation의 이체형 랜딩(in-call-sms)이
    // 추가됐다. §53(§51 커밋 D) — bank-security-verify-scam의 이체형 랜딩(in-call-sms)이 추가됐다.
    "in-call-sms",
    "in-call-sms",
    "in-call-sms",
    "in-call-sms",
    "in-call-sms",
    "in-call-sms",
    "messenger-link",
    "messenger-link",
  ]);
});

test("landingId는 전역 유일하고, 카탈로그의 모든 scenarioId가 실제 시나리오다", () => {
  const ids = allItems.map((i) => i.landingId);
  assert.equal(new Set(ids).size, ids.length, "landingId가 중복되면 문서 id가 세션 안에서 충돌한다");
  for (const scenarioId of Object.keys(MOCK_SCREENS)) {
    assert.ok(SCENARIO_PROMPTS[scenarioId], `${scenarioId}: SCENARIO_PROMPTS에 존재해야 한다`);
    assert.ok(PUBLIC_SCENARIOS[scenarioId], `${scenarioId}: PUBLIC_SCENARIOS에 존재해야 한다`);
  }
  // ⚠️ **T104 정밀화(ADR-0012)**: `channel === "messenger"` 단언의 원문 사유는 *"모의 설치는
  // 메신저 단계에서 일어난다(UF-012 Step 2)"* 이고 상위 규칙 §15.9.1 R6은 *"통화 중 문자를 통해
  // **`app-install` kind가 열리는 경로**는 범위 밖"* 이다 — **채널 자체를 금지한 것이 아니다.**
  // 그래서 판정 키를 `app-install` 항목을 가진 시나리오로 좁힌다. 통화 채널의
  // `credential-form` 랜딩은 `recordMockScreenEvent`를 타지 않아(§19.4 #4) 앵커 자체가 생기지
  // 않는다(§19.1 (2) ④).
  for (const scenarioId of appInstallScenarioIds) {
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

// ── AC-078 (a)(b)(d) — 상황별 랜딩의 완료 판정 조건 (T104 · PRD v1.8) ──────────
//
// ⚠️ **"도달 가능"의 정의는 AC 안에 고정돼 있다**: *"시나리오 프롬프트 또는 통화 중 문자 카탈로그가
// **실제로 그 링크 마커를 방출하는** 경우만 도달 가능이다 — 라벨·식별자만 등재돼 있고 어떤
// 프롬프트도 내지 않는 항목은 대상이 아니다."* 그래서 `LINK_LABELS`가 아니라 **프롬프트 본문**과
// **`IN_CALL_SMS.fakeLandingId`** 를 원천으로 삼는다(`subsidy-apply`는 라벨만 있고 이 마커를 내는
// 프롬프트가 0개라 도달 불가 — 대상이 아니다).

const LINK_MARKER_IN_PROMPT = /\[\[LINK:([a-zA-Z0-9_-]+)\]\]/g;

/** `scenarioId::landingId` 형태의 **도달 가능 랜딩** 집합(정렬). */
function reachableLandingKeys(): string[] {
  const keys = new Set<string>();
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const promptText = [
      prompt.personaPrompt,
      prompt.guardrailPreamble,
      ...prompt.weakenedTactics,
      ...(prompt.suspicionKeywords ?? []),
    ].join("\n");
    for (const [, landingId] of promptText.matchAll(LINK_MARKER_IN_PROMPT)) {
      keys.add(`${scenarioId}::${landingId}`);
    }
  }
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const sms of items) {
      if (sms.fakeLandingId) keys.add(`${scenarioId}::${sms.fakeLandingId}`);
    }
  }
  return [...keys].sort();
}

function catalogLandingKeys(catalog: Catalog): string[] {
  return Object.entries(catalog)
    .flatMap(([scenarioId, items]) => items.map((item) => `${scenarioId}::${item.landingId}`))
    .sort();
}

test("[AC-078 (a)] 콘텐츠 카탈로그 ↔ 도달 가능 랜딩 집합이 **양방향으로** 일치한다", () => {
  assert.deepEqual(catalogLandingKeys(MOCK_SCREENS), reachableLandingKeys());
  // 도달 불가 라벨은 대상이 아니다 — 여기 들어오면 스코프 크립이다.
  assert.equal(
    reachableLandingKeys().some((key) => key.endsWith("::subsidy-apply")),
    false,
    "어떤 프롬프트도 내지 않는 라벨이 도달 가능 집합에 들어왔다",
  );
  assert.equal(reachableLandingKeys().length, 8, "도달 가능 랜딩은 8종이다(§53/§51 커밋 D — protect-account-transfer 추가)");
});

test("[AC-078 (a) 역검증] 한쪽에서 1건을 빼면 실제로 실패한다", () => {
  const withoutOne: Catalog = Object.fromEntries(
    Object.entries(MOCK_SCREENS).filter(([scenarioId]) => scenarioId !== "tax-refund-scam"),
  );
  assert.notDeepEqual(catalogLandingKeys(withoutOne), reachableLandingKeys());
  // 반대 방향 — 도달 경로가 없는 항목을 카탈로그에 넣어도 어긋난다.
  const withExtra: Catalog = {
    ...MOCK_SCREENS,
    "family-accident-deepvoice": [fixtureItem({ landingId: "unreachable-landing" })],
  };
  assert.notDeepEqual(catalogLandingKeys(withExtra), reachableLandingKeys());
});

// ── G159 트립와이어 — 시나리오당 도달 가능 랜딩 기수 (T129 · Architecture.md §35.6/§35.7) ────
//
// ⚠️ **이것은 계약이 아니라 트립와이어다.** *"시나리오당 랜딩은 1건이어야 한다"* 를 규정하지
// 않는다 — 그렇게 읽으면 다음 사람이 **콘텐츠를 되돌리거나 이 단언을 지운다**(§35.9 G159).
//
// **무엇을 보는가**: D-61의 표시 분기 매칭 키는 `entry.anchorTurnIndex === moment.turnIndex`
// **하나**다(`src/lib/report/mockScreenTimelineCopy.ts:73`). 같은 사기범 메시지(= 같은
// turnIndex)에 서로 다른 `landingId`가 앵커되고 **그중 한쪽만 승격**되면, 나머지 한쪽이 분기
// "나"로 **오분류**된다(정답은 "다" — 정당한 칭찬 누락). 그 결함의 **4중 연접 중 기계로 관측
// 가능한 것은 조건 1**(한 시나리오의 도달 가능 랜딩 ≥2)뿐이다(§35.3).
//
// ⛔ **이 블록이 하지 않는 것**: 오분류를 막지 않는다. `mockScreenTimelineCopy.ts`는 한 글자도
// 바뀌지 않았다(G160). 여기서 만드는 것은 **조기 경보**이며, 오늘 새로 잡는 것은 **0건**이다
// (설계 의도 — 값은 잡는 개수가 아니라 발화 시점에 있다, §35.7).
//
// ⚠️ 기존 `:549`의 총계 단언(`length === 5`)은 **이 결함을 잡지 못한다** — 기존 시나리오에 두
// 번째 랜딩을 얹고 총계를 6으로 고치면 집합 일치도 총계도 전부 초록불이다(§35.2 (2)).

/** G159 처방 — 빨간불일 때 **무엇을 해야 하는지**가 메시지에 있어야 한다(§35.6 1행). */
const G159_PRESCRIPTION =
  "⛔ 콘텐츠를 되돌리거나 이 단언의 숫자를 고쳐 통과시키지 말 것 — 그것이 이 저장소가 게이트를 잃는 방식이다. " +
  "docs/Architecture.md §35.6 표에 따라 **T129 (b)(D-61 매칭 키를 landingId 인식형으로)** 를 " +
  "**선행 커밋**으로 넣은 뒤 콘텐츠를 얹어라. (b) 없이 이 상태가 병합되면 같은 사기범 메시지에 " +
  "앵커된 두 랜딩 중 한쪽이 분기 '나'로 오분류되어 정당한 칭찬이 사라진다.";

/**
 * `scenarioId::landingId` 키 배열 → **도달 가능 랜딩이 2건 이상인 scenarioId 목록**(정렬).
 *
 * ⛔ 모듈 전역을 직접 읽지 않는다 — 인자로 받아야 역검증에서 오염 입력을 넣을 수 있다
 * (§35.7 1 · G139 계열).
 */
function findMultiLandingScenarios(keys: readonly string[]): string[] {
  const byScenario = new Map<string, Set<string>>();
  for (const key of keys) {
    const separator = key.indexOf("::");
    const scenarioId = separator < 0 ? key : key.slice(0, separator);
    const landingId = separator < 0 ? "" : key.slice(separator + 2);
    const landings = byScenario.get(scenarioId) ?? new Set<string>();
    landings.add(landingId);
    byScenario.set(scenarioId, landings);
  }
  return [...byScenario.entries()]
    .filter(([, landings]) => landings.size >= 2)
    .map(([scenarioId]) => scenarioId)
    .sort();
}

test("[G159 트립와이어] 한 시나리오에 도달 가능 랜딩이 2건 이상 들어오면 알린다(T129 §35.6)", () => {
  const offenders = findMultiLandingScenarios(reachableLandingKeys());
  assert.deepEqual(
    offenders,
    [],
    `도달 가능 랜딩이 2건 이상인 시나리오: ${offenders.join(", ")} — ${G159_PRESCRIPTION}`,
  );
});

test("[G159 트립와이어 역검증] 오염 키 1건을 주입하면 해당 scenarioId를 실제로 돌려준다", () => {
  const polluted = [...reachableLandingKeys(), "tax-refund-scam::extra-landing"];
  assert.deepEqual(findMultiLandingScenarios(polluted), ["tax-refund-scam"]);
  // 같은 시나리오의 **같은** 랜딩이 중복돼도 발화하지 않는다(오탐 0 — 조건 1과 정확히 일치).
  const duplicated = [...reachableLandingKeys(), reachableLandingKeys()[0]];
  assert.deepEqual(findMultiLandingScenarios(duplicated), []);
  // 처방 문구가 비어 있으면 빨간불이 "숫자를 고쳐라"로 읽힌다(§35.7 4 · G159).
  assert.ok(G159_PRESCRIPTION.includes("§35.6"));
  assert.ok(G159_PRESCRIPTION.includes("선행 커밋"));
});

/** (b) 수렴 금지 판정용 본문 조합 — 헤드라인·안내문·필드 라벨 구성·CTA·완료 문구. */
function bodySignature(item: MockScreenItem): string {
  return JSON.stringify([
    item.headline,
    item.bodyLines,
    item.fields ?? null,
    item.submitLabel ?? item.consentLabel ?? null,
    item.successHeadline ?? null,
    item.issuerLabel,
  ]);
}

test("[AC-078 (b)] 서로 다른 랜딩의 본문이 **하나도 수렴하지 않는다**(쌍별 비교)", () => {
  const items = Object.values(MOCK_SCREENS).flat();
  assert.ok(items.length >= 5, "비교 대상이 5종 이상이어야 한다");
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      assert.notEqual(
        bodySignature(items[i]),
        bodySignature(items[j]),
        `${items[i].landingId} ↔ ${items[j].landingId}: 링크 라벨만 다르고 열면 같은 화면이면 AC-078 위반`,
      );
      // OQ-U28 권고 (i) — 헤드라인만으로도 갈린다(기계 판정 가능한 최소 조건).
      assert.notEqual(
        items[i].headline,
        items[j].headline,
        `${items[i].landingId} ↔ ${items[j].landingId}: 헤드라인이 같으면 상황이 갈리지 않은 것이다`,
      );
    }
  }
});

test("[AC-078 (b) 역검증] 두 항목을 같게 만들면 쌍별 비교가 실제로 실패한다", () => {
  const twin = fixtureItem({ landingId: "twin-a" });
  assert.equal(bodySignature(twin), bodySignature(fixtureItem({ landingId: "twin-b" })));
  // 실제 항목 하나를 다른 항목의 본문으로 덮어써도 마찬가지다.
  const real = MOCK_SCREENS["tax-refund-scam"][0];
  const cloned = { ...MOCK_SCREENS["courier-customs-scam"][0], landingId: "cloned" };
  assert.notEqual(bodySignature(real), bodySignature(cloned));
  assert.equal(bodySignature(cloned), bodySignature(MOCK_SCREENS["courier-customs-scam"][0]));
});

// ── AC-079 — 수렴 금지를 **필드 단위**로 좁힌다 (T107 · PRD v1.9) ──────────────
//
// AC-078 (b)는 **전체 조합의 완전 동일성**만 금지한다. 그래서 **헤드라인·CTA만 서로 다르게 둔 채**
// `bodyLines`·`fields`·`successHeadline`·`issuerLabel`을 전부 범용으로 되돌리면 — 조합이 완전히
// 같지는 않으므로 — 위 두 단언(전체 조합 · 헤드라인 단독)이 **둘 다 통과한다.** 아래
// `[AC-079 (c) 역검증]`이 그 사실을 **같은 출력에 나란히** 보인다. AC-079는 그 사이를 메운다.
//
// ⭐ **비교 단위 기준 — AC-079 (a). 이 문단이 기준의 정본이며, 다음 사람이 판정을 달리하지
// 않도록 코드에 문장으로 남긴다.**
//   각 필드의 비교 단위는 **카탈로그에 저작된 값 전체**다.
//   · `fields` = **라벨 문자열 배열 전체이며 순서를 포함**한다(같은 라벨을 순서만 바꿔 배열해도
//     "서로 다르다"로 본다). **placeholder는 비교 단위가 아니다 — 애초에 카탈로그 필드가 아니다**
//     (`mockScreens.ts`의 `fields?: string[]`).
//   · `bodyLines` = 줄 배열 전체(순서 포함). `successHeadline`·`issuerLabel` = 문자열 전체.
//   · 장래 스키마가 확장돼 항목이 하위 값을 갖게 되더라도 비교 단위는 **카탈로그 값 전체**로
//     유지한다 — 하위 값 일부만 뽑아 비교하도록 좁히지 않는다.
//
// ⭐ **옵셔널 필드 제외 규칙 — AC-079 (b).** `fields`·`successHeadline`은 `kind`에 따라 부재한다
//   (`kind="app-install"`인 `subsidy-install`에는 **둘 다 없다**).
//   · **양쪽 모두 부재인 쌍은 그 필드의 비교에서 제외**한다(`undefined` 대 `undefined`를
//     "동일 = 위반"으로 판정하지 않는다 — 안 그러면 정상 카탈로그가 오탐으로 실패한다).
//   · **한쪽만 부재인 쌍은 서로 다른 것으로 본다.**
const DIVERGENCE_FIELDS = ["bodyLines", "fields", "successHeadline", "issuerLabel"] as const;

type DivergenceField = (typeof DIVERGENCE_FIELDS)[number];

/** 비교 단위 = 카탈로그 값 전체(배열은 순서 포함). **부재는 `undefined`로 남긴다**(제외 판정용). */
function fieldValue(item: MockScreenItem, field: DivergenceField): string | undefined {
  const raw = item[field];
  return raw === undefined ? undefined : JSON.stringify(raw);
}

type FieldStats = {
  field: DivergenceField;
  /** 실제로 비교한 쌍 수. */
  compared: number;
  /** 양쪽 다 부재라 제외한 쌍 수(AC-079 (b)). */
  excluded: number;
  /** 수렴한 쌍 — `landingId ↔ landingId`. */
  converged: string[];
};

/**
 * 필드별 쌍별 비교 통계.
 * @param excludeBothAbsent AC-079 (b) 제외 규칙. **`false`는 그 규칙이 없을 때 무슨 일이
 *   일어나는지(정상 카탈로그 오탐)를 출력으로 보이기 위한 역검증 전용**이며 본 검사는 항상 기본값을 쓴다.
 */
function fieldDivergenceStats(
  items: MockScreenItem[],
  { excludeBothAbsent = true }: { excludeBothAbsent?: boolean } = {},
): FieldStats[] {
  return DIVERGENCE_FIELDS.map((field) => {
    const stats: FieldStats = { field, compared: 0, excluded: 0, converged: [] };
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = fieldValue(items[i], field);
        const b = fieldValue(items[j], field);
        if (a === undefined && b === undefined) {
          if (excludeBothAbsent) {
            stats.excluded += 1;
            continue;
          }
        }
        stats.compared += 1;
        if (a === b) stats.converged.push(`${items[i].landingId} ↔ ${items[j].landingId}`);
      }
    }
    return stats;
  });
}

/** 위반 목록 — `field: landingId ↔ landingId`. 빈 배열이면 AC-079 충족. */
function findFieldConvergence(
  items: MockScreenItem[],
  options?: { excludeBothAbsent?: boolean },
): string[] {
  return fieldDivergenceStats(items, options).flatMap((stats) =>
    stats.converged.map((pair) => `${stats.field}: ${pair}`),
  );
}

test("[AC-079] bodyLines·fields·successHeadline·issuerLabel이 **각각 단독으로** 수렴하지 않는다", (t) => {
  const items = Object.values(MOCK_SCREENS).flat();
  assert.equal(items.length, 8, "현행 비교 대상은 도달 가능 랜딩 8종이다(§53/§51 커밋 D — protect-account-transfer 추가)");
  const stats = fieldDivergenceStats(items);
  for (const { field, compared, excluded, converged } of stats) {
    t.diagnostic(
      `${field}: 비교쌍 ${compared} / 제외쌍 ${excluded} / 수렴쌍 ${converged.length}`,
    );
    assert.ok(compared >= 1, `${field}: 비교한 쌍이 0개면 이 검사는 아무것도 보증하지 않는다`);
  }
  assert.deepEqual(
    findFieldConvergence(items),
    [],
    "헤드라인·CTA가 달라도 본문·필드·완료 문구가 같으면 열었을 때 같은 화면이다(AC-079)",
  );
});

test("[AC-079 (c) 역검증] 헤드라인·CTA만 남기고 4필드를 범용화하면 — 기존 두 단언은 통과하고 AC-079만 실패한다", (t) => {
  const items = Object.values(MOCK_SCREENS).flat();
  // 오염은 **테스트 코드 안에서만** 만든다(실제 카탈로그를 고쳤다 되돌리지 않는다 —
  // `callContinuity.test.ts:161-162`가 세운 관례).
  const GENERIC = {
    bodyLines: ["본인확인이 필요합니다.", "아래 정보를 입력해 주세요."],
    fields: ["성함", "연락처"],
    successHeadline: "정상 처리되었습니다.",
    issuerLabel: "ⓒ 확인센터",
  };
  const poisoned: MockScreenItem[] = items.map((item) => ({
    ...item,
    // headline·submitLabel·consentLabel은 **실제 값 그대로** 둔다(= 서로 다름을 유지).
    bodyLines: GENERIC.bodyLines,
    issuerLabel: GENERIC.issuerLabel,
    ...(item.fields ? { fields: GENERIC.fields } : {}),
    ...(item.successHeadline ? { successHeadline: GENERIC.successHeadline } : {}),
  }));

  // ① 기존 AC-078 (b) 전체 조합 단언 — 이 오염 샘플에서 **통과한다**(위반 0건).
  const signatureViolations: string[] = [];
  const headlineViolations: string[] = [];
  for (let i = 0; i < poisoned.length; i += 1) {
    for (let j = i + 1; j < poisoned.length; j += 1) {
      const pair = `${poisoned[i].landingId} ↔ ${poisoned[j].landingId}`;
      if (bodySignature(poisoned[i]) === bodySignature(poisoned[j])) signatureViolations.push(pair);
      if (poisoned[i].headline === poisoned[j].headline) headlineViolations.push(pair);
    }
  }
  t.diagnostic(`오염 샘플: 전체 조합(bodySignature) 위반 ${signatureViolations.length}건 → 기존 단언 통과`);
  t.diagnostic(`오염 샘플: 헤드라인 단독 위반 ${headlineViolations.length}건 → 기존 단언 통과`);
  assert.deepEqual(signatureViolations, [], "헤드라인이 달라 조합이 완전히 같지는 않다 — (b)는 통과한다");
  assert.deepEqual(headlineViolations, [], "헤드라인은 서로 다르게 유지했다 — 헤드라인 단언도 통과한다");

  // ② 같은 샘플에서 AC-079 검사는 **실제로 실패한다** — 그 사이가 비어 있었다는 직접 증거.
  const violations = findFieldConvergence(poisoned);
  t.diagnostic(`오염 샘플: AC-079 필드별 위반 ${violations.length}건 → 신규 검사 실패`);
  assert.ok(violations.length > 0, "AC-079 검사가 이 샘플을 잡지 못하면 구멍이 그대로다");
  for (const field of DIVERGENCE_FIELDS) {
    assert.ok(
      violations.some((v) => v.startsWith(`${field}:`)),
      `${field}를 범용화했는데 위반으로 잡히지 않았다`,
    );
  }
  // ③ 대조군 — 현행 카탈로그는 같은 검사를 통과한다(오염 때문에 실패한 것이 맞다).
  assert.deepEqual(findFieldConvergence(items), []);
});

test("[AC-079 (b)] 옵셔널 필드가 **양쪽 다 부재인 쌍**은 비교에서 제외된다(제외가 없으면 오탐)", (t) => {
  // `fields`·`successHeadline`이 둘 다 없는 `app-install` 두 항목 — 나머지는 서로 다르다.
  const twoInstalls: MockScreenItem[] = [
    fixtureItem({
      landingId: "install-a",
      kind: "app-install",
      headline: "A 앱을 설치해야 진행됩니다",
      bodyLines: ["A 안내문."],
      issuerLabel: "ⓒ A센터",
      consentLabel: "권한 허용하고 계속하기",
      fields: undefined,
      submitLabel: undefined,
      successHeadline: undefined,
    }),
    fixtureItem({
      landingId: "install-b",
      kind: "app-install",
      headline: "B 앱을 설치해야 진행됩니다",
      bodyLines: ["B 안내문."],
      issuerLabel: "ⓒ B센터",
      consentLabel: "허용하고 진행하기",
      fields: undefined,
      submitLabel: undefined,
      successHeadline: undefined,
    }),
  ];
  const excluded = fieldDivergenceStats(twoInstalls)
    .filter((s) => s.excluded > 0)
    .map((s) => `${s.field}(제외 ${s.excluded}쌍)`);
  t.diagnostic(`제외 규칙 적용: ${excluded.join(" · ")} → 위반 ${findFieldConvergence(twoInstalls).length}건`);
  assert.deepEqual(excluded, ["fields(제외 1쌍)", "successHeadline(제외 1쌍)"]);
  assert.deepEqual(findFieldConvergence(twoInstalls), [], "부재 대 부재를 '동일'로 보면 오탐이다");

  // 제외 규칙을 끄면 같은 샘플이 **실제로 오탐으로 실패한다** — 규칙이 일하고 있다는 증거.
  const withoutRule = findFieldConvergence(twoInstalls, { excludeBothAbsent: false });
  t.diagnostic(`제외 규칙 해제 시: 오탐 ${withoutRule.length}건 (${withoutRule.join(" / ")})`);
  assert.deepEqual(withoutRule, [
    "fields: install-a ↔ install-b",
    "successHeadline: install-a ↔ install-b",
  ]);

  // 한쪽만 부재인 쌍은 **서로 다른 것으로 본다**(현행 카탈로그가 정확히 이 형태다 —
  // `subsidy-install`만 app-install이라 **오늘 실제로 제외되는 쌍은 0**이다).
  const realStats = fieldDivergenceStats(Object.values(MOCK_SCREENS).flat());
  t.diagnostic(
    `현행 카탈로그 제외쌍: ${realStats.map((s) => `${s.field}=${s.excluded}`).join(" · ")}`,
  );
  assert.deepEqual(
    realStats.map((s) => s.excluded),
    [0, 0, 0, 0],
    "app-install이 2종 이상 되면 이 값이 늘고, 그때 위 제외 규칙이 실제로 일한다",
  );
  const oneSideAbsent = fieldDivergenceStats([
    twoInstalls[0],
    fixtureItem({ landingId: "form-a" }),
  ]).find((s) => s.field === "fields");
  assert.deepEqual([oneSideAbsent?.compared, oneSideAbsent?.converged], [1, []]);
});

// ── AC-078 (c) — 미끼 → 랜딩 대조표를 **기계로 묶는다** ────────────────────────
//
// AC-078 (c)는 대조표가 *"구현 산출물에 포함된다(대조표가 없으면 미충족)"* 이라고 규정했다.
// 사람이 읽는 표는 `mockScreens.ts`의 콘텐츠 항목 바로 위 주석에 있고, **여기가 그 표의 강제
// 장치**다. 주석은 강제가 아니므로 — 미끼 문면과 랜딩 문안이 따로 바뀌면 표가 조용히 낡는다 —
// 아래 표를 **런타임 카탈로그 값**에 대고 검사한다.
//
// ⚠️ **줄 번호는 앵커가 아니다.** `baitSource`의 `파일:줄`은 사람이 찾아가기 위한 스냅샷이고,
// 기계가 붙잡는 것은 `baitExcerpt`(실제 미끼 텍스트에 지금도 있어야 하는 인용)와 앵커 토큰이다.
// 줄이 밀려도 검사는 살아 있고, **문면이 바뀌면 반드시 실패한다.**
//
// ⚠️ **헤드라인과 CTA를 합쳐서 검사하지 않는다(실측으로 발견한 구멍).** 최초 구현은
// `headline + CTA` 한 덩어리에 앵커가 있는지만 봤는데, 그러면 **헤드라인만 범용 문구로
// 되돌려도**(= 정확히 이번 사용자 신고 상태) CTA가 앵커를 갖고 있어 통과했다 — 역검증에서
// 실제로 통과하는 것을 확인하고 아래처럼 **면별로** 쪼갰다.
const BAIT_TO_LANDING: {
  landingId: string;
  baitSource: string;
  baitExcerpt: string;
  /** 랜딩 **헤드라인**에 반드시 있어야 하는 토큰(≥1). */
  headlineAnchors: string[];
  /**
   * 랜딩 **CTA**에 반드시 있어야 하는 토큰.
   * ⚠️ `app-install`만 빈 배열이 허용된다 — 그 kind의 CTA는 미끼 행위의 반복이 아니라
   * **가짜 "권한 허용" 버튼**이고(AC-072가 규정한 안전 계약), D-58이 `subsidy-install`을
   * "무변경"으로 확정했다. 아래 테스트가 이 예외를 kind로 좁혀 강제한다.
   */
  ctaAnchors: string[];
}[] = [
  {
    landingId: "parcel-redelivery",
    baitSource: "roleplay/linkMarker.ts:22 (칩 라벨) · messengerParcelSmishingSms.prompt.ts:37",
    baitExcerpt: "재배송 신청 확인하기",
    headlineAnchors: ["배송"],
    ctaAnchors: ["재배송", "신청"],
  },
  {
    landingId: "subsidy-install",
    baitSource: "roleplay/linkMarker.ts:24 (칩 라벨) · messengerSubsidySmishingSms.prompt.ts:64",
    baitExcerpt: "지원금 신청 앱 설치하기",
    headlineAnchors: ["앱", "설치"],
    ctaAnchors: [], // app-install — 위 주석의 예외(권한 허용 버튼)
  },
  {
    landingId: "loan-refinance-apply",
    baitSource: "scenarios/inCallSms.ts:57-58 (문자 본문·칩)",
    baitExcerpt: "아래에서 본인확인 후 신청을 완료해 주세요.",
    headlineAnchors: ["본인확인", "신청"],
    ctaAnchors: ["본인확인", "완료"],
  },
  {
    landingId: "tax-refund-claim",
    baitSource: "scenarios/inCallSms.ts:106-107 (문자 본문·칩)",
    baitExcerpt: "아래에서 계좌를 등록하시면 당일 지급됩니다.",
    headlineAnchors: ["계좌", "등록"],
    ctaAnchors: ["계좌", "등록"],
  },
  {
    landingId: "courier-customs-check",
    baitSource: "scenarios/inCallSms.ts:120-121 (문자 본문·칩)",
    baitExcerpt: "수취인 정보 불일치로 통관이 보류되었습니다.",
    headlineAnchors: ["수취인", "통관", "보류"],
    ctaAnchors: ["수취인"],
  },
  {
    landingId: "safe-account-transfer",
    baitSource: "scenarios/inCallSms.ts:87-91 (문자 본문·칩)",
    baitExcerpt: "아래에서 안전계좌 이체를 진행해 주세요.",
    headlineAnchors: ["안전계좌", "이체"],
    ctaAnchors: ["안전계좌", "이체"],
  },
  {
    landingId: "card-relief-transfer",
    baitSource: "scenarios/inCallSms.ts:117-119 (문자 본문·칩)",
    baitExcerpt: "아래에서 피해금 이관을 진행해 주세요.",
    headlineAnchors: ["피해금", "이관"],
    ctaAnchors: ["피해금", "이관"],
  },
  {
    landingId: "protect-account-transfer",
    baitSource: "scenarios/inCallSms.ts:173-175 (문자 본문·칩)",
    baitExcerpt: "아래에서 보호계좌로 옮기기를 진행해 주세요.",
    headlineAnchors: ["보호계좌", "옮기기"],
    ctaAnchors: ["보호계좌", "옮기기"],
  },
];

/** 그 랜딩을 **불러낸** 문면 전부 — 칩 라벨(메신저) + 프롬프트 + 통화 중 문자 본문/칩. */
function baitTextFor(scenarioId: string, item: MockScreenItem): string {
  const parts: string[] = [];
  if (item.entrySurface === "messenger-link") {
    const { attachments } = extractLinkMarker(`[[LINK:${item.landingId}]]`, scenarioId);
    if (attachments) parts.push(attachments[0].displayText);
    const prompt = SCENARIO_PROMPTS[scenarioId];
    if (prompt) {
      parts.push(prompt.personaPrompt, ...prompt.weakenedTactics);
    }
  }
  for (const sms of IN_CALL_SMS[scenarioId] ?? []) {
    if (sms.fakeLandingId !== item.landingId) continue;
    parts.push(sms.body, sms.linkDisplayText ?? "");
  }
  return parts.join("\n");
}

/** 랜딩 쪽 CTA 라벨 — kind별로 필드가 다르다(G-C가 정합을 단언한다). */
function landingCta(item: MockScreenItem): string {
  return item.submitLabel ?? item.consentLabel ?? "";
}

function findItemByLandingId(landingId: string): { scenarioId: string; item: MockScreenItem } {
  for (const [scenarioId, items] of Object.entries(MOCK_SCREENS)) {
    const item = items.find((i) => i.landingId === landingId);
    if (item) return { scenarioId, item };
  }
  throw new Error(`대조표의 landingId가 카탈로그에 없다: ${landingId}`);
}

test("[AC-078 (c)] 대조표가 카탈로그를 하나도 빠뜨리지 않는다(새 랜딩이 표를 건너뛸 수 없다)", () => {
  assert.deepEqual(
    BAIT_TO_LANDING.map((row) => row.landingId).sort(),
    allItems.map((item) => item.landingId).sort(),
    "랜딩을 추가·삭제했으면 BAIT_TO_LANDING과 mockScreens.ts의 주석 대조표를 함께 갱신하라",
  );
  for (const row of BAIT_TO_LANDING) {
    const { item } = findItemByLandingId(row.landingId);
    assert.ok(row.headlineAnchors.length >= 1, `${row.landingId}: 헤드라인 앵커가 최소 1개 필요하다`);
    for (const anchor of [...row.headlineAnchors, ...row.ctaAnchors]) {
      assert.ok(anchor.length >= 1, `${row.landingId}: 빈 앵커는 아무것도 검사하지 않는다`);
    }
    // ⛔ CTA 앵커를 비우는 예외는 **`app-install`에만** 열려 있다(위 표의 사유).
    if (item.kind !== "app-install") {
      assert.ok(
        row.ctaAnchors.length >= 1,
        `${row.landingId}: credential-form은 CTA도 미끼 행위를 수행해야 한다(AC-078 (c))`,
      );
    }
    assert.ok(row.baitSource.includes(":"), `${row.landingId}: 미끼 출처를 파일:줄로 적어라`);
  }
});

test("[AC-078 (c)] 미끼 인용이 **실제 미끼 문면에 지금도 존재**한다(미끼가 바뀌면 실패)", () => {
  for (const row of BAIT_TO_LANDING) {
    const { scenarioId, item } = findItemByLandingId(row.landingId);
    const bait = baitTextFor(scenarioId, item);
    assert.ok(bait.length > 0, `${row.landingId}: 미끼 문면을 하나도 못 모았다 — 수집기가 죽었다`);
    assert.ok(
      bait.includes(row.baitExcerpt),
      `${row.landingId}: 대조표의 미끼 인용이 실제 문면에 없다(미끼가 바뀌었다). ` +
        `출처=${row.baitSource} / 인용="${row.baitExcerpt}"`,
    );
  }
});

test("[AC-078 (c)] 앵커 토큰이 미끼와 랜딩 **헤드라인·CTA 각각에** 있다(한 면만 바뀌어도 실패)", () => {
  for (const row of BAIT_TO_LANDING) {
    const { item } = findItemByLandingId(row.landingId);
    for (const [face, text, anchors] of [
      ["헤드라인", item.headline, row.headlineAnchors],
      ["CTA", landingCta(item), row.ctaAnchors],
    ] as const) {
      for (const anchor of anchors) {
        assert.ok(
          row.baitExcerpt.includes(anchor),
          `${row.landingId}: 앵커 '${anchor}'가 미끼 인용에 없다 — 대조가 성립하지 않는다`,
        );
        assert.ok(
          text.includes(anchor),
          `${row.landingId}: 앵커 '${anchor}'가 랜딩 ${face}에 없다 — ` +
            `미끼가 예고한 행위를 화면이 수행하지 않는다(AC-078 (c)). 현재 ${face}="${text}"`,
        );
      }
    }
  }
});

test("[AC-078 (c)] 사람이 읽는 대조표가 **소스에 실제로 있고** 테스트 표와 1:1이다", () => {
  // AC 본문: "그 대조표는 구현 산출물에 포함된다(대조표가 없으면 미충족)".
  // 보고서·PR 본문은 저장소가 아니므로, 카탈로그 소스의 주석 표를 여기서 붙잡는다.
  const source = readFileSync(
    path.resolve(__dirname, "../../../src/scenarios/mockScreens.ts"),
    "utf8",
  );
  const start = source.indexOf("AC-078 (c) 미끼 → 랜딩 대조표");
  assert.ok(start > 0, "mockScreens.ts에 사람이 읽는 대조표 주석이 있어야 한다(AC-078 (c) 산출물)");
  const table = source.slice(start, source.indexOf("const MESSENGER_PARCEL_SMISHING_SMS", start));
  for (const row of BAIT_TO_LANDING) {
    assert.ok(table.includes(row.landingId), `주석 대조표에 ${row.landingId} 행이 없다`);
    assert.ok(
      table.includes(row.baitExcerpt),
      `주석 대조표의 미끼 인용이 테스트 표와 다르다: ${row.landingId}`,
    );
  }
});

test("[AC-078 (c) 역검증] 미끼나 랜딩 문안 한쪽만 바뀌면 대조가 실제로 깨진다", () => {
  const { item } = findItemByLandingId("tax-refund-claim");
  const row = BAIT_TO_LANDING.find((r) => r.landingId === "tax-refund-claim");
  assert.ok(row);
  // ① **헤드라인만** 범용 문구로 되돌려도 잡힌다 — 최초 구현(헤드라인+CTA 합산)이 놓치던 자리다.
  const genericHeadline = "본인확인이 필요합니다";
  assert.equal(
    row.headlineAnchors.every((anchor) => genericHeadline.includes(anchor)),
    false,
    "헤드라인만 범용으로 되돌려도 실패해야 한다(= 정확히 이번 사용자 신고 상태)",
  );
  // ② **CTA만** 범용 문구로 되돌려도 잡힌다.
  const genericCta = "확인";
  assert.equal(
    row.ctaAnchors.every((anchor) => genericCta.includes(anchor)),
    false,
    "CTA만 범용으로 되돌려도 실패해야 한다",
  );
  // ③ 미끼 쪽 문면이 바뀌면 — 인용 존재 검사가 잡는다.
  const changedBait = "[환급안내] 조회 결과가 있습니다.";
  assert.equal(changedBait.includes(row.baitExcerpt), false);
  // ④ 그리고 현재 실제 값은 셋 다 통과한다(대조군).
  assert.ok(row.headlineAnchors.every((anchor) => item.headline.includes(anchor)));
  assert.ok(row.ctaAnchors.every((anchor) => landingCta(item).includes(anchor)));
});

test("[AC-078 (d)] 콘텐츠 없는 식별자는 범용 화면으로만 폴백하고 app-install로는 절대 폴백하지 않는다", () => {
  const scenarioIds = [...Object.keys(MOCK_SCREENS), "family-accident-deepvoice", "no-such-scenario"];
  for (const scenarioId of scenarioIds) {
    for (const landingId of ["", "unknown", "subsidy-install-", "SUBSIDY-INSTALL", "app-install"]) {
      assert.equal(
        resolveMockScreenKind(scenarioId, landingId),
        "credential-form",
        `${scenarioId}/${landingId}: 부재 id가 app-install로 열리면 안 된다(§15.9.1 R5)`,
      );
    }
  }
  // 다른 시나리오의 app-install id를 빌려 와도 소속 재검증에서 막힌다(§15.6 G12 동형).
  assert.equal(resolveMockScreenKind("tax-refund-scam", "subsidy-install"), "credential-form");
  assert.equal(DEFAULT_MOCK_SCREEN_KIND, "credential-form");
});

test("[§15.9.7 G54] 응낙 턴 지시가 채널 전이 신호를 담지 않는다(신규 전이 트리거 0건)", () => {
  assert.equal(
    MOCK_INSTALL_CONSENT_INSTRUCTION.includes("[[SIGNAL:"),
    false,
    "지시에 전이 신호를 심으면 응낙이 곧 전이가 되어 AC-073을 깬다",
  );
});
