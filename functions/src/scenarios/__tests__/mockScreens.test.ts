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
  const poisoned = `${allText}\n(실제로는 어디에도 전송되지 않았습니다 — 훈련용 모의 화면입니다.)`;
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
    ["courier-customs-scam", "loan-refinance-scam", "tax-refund-scam"],
    "통화 채널 3종이 카탈로그에 없으면 정밀화가 아무것도 안 푼 것이다",
  );
  // 그리고 그 3종은 **app-install을 하나도 갖지 않는다**(정밀화의 안전 전제 = M2 차단).
  for (const scenarioId of voiceScoped) {
    assert.equal(hasAppInstallMockScreen(scenarioId), false, `${scenarioId}: 통화 채널에 설치 목업 금지`);
  }
  // entrySurface 분포도 고정한다 — 표면 선언이 통째로 한쪽으로 쏠리면 G53/G-B 중 하나가 공회전한다.
  const surfaces = allItems.map((item) => item.entrySurface).sort();
  assert.deepEqual(surfaces, [
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
  assert.equal(reachableLandingKeys().length, 5, "도달 가능 랜딩은 5종이다(UX-023 v1.13 (1))");
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
