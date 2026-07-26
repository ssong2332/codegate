// T86 — 무해화 경계 회귀 게이트 (AC-075 (b) 금지 패턴 확장 + (c) 우회 방지 게이트).
//
// **무엇을 막는가.** T83(확인 무력화 카탈로그)·T84(모의 설치 카탈로그)·T85(난이도 블록)·T95(전용
// 시나리오)가 각각 **자기 테스트만** 갖고 자랐다. 그 결과 금지 패턴 검사가 카탈로그마다 따로
// 걸려 있어, 콘텐츠가 하나 더 늘 때 **그 항목만 검사를 안 타는** 조용한 결손이 생길 수 있었다.
// 이 파일은 두 가지를 고정한다:
//   (b) 실존 기관 대표번호·실존 앱명·실 스토어 URL·실제 원격제어 절차 금지를 **전 콘텐츠 도메인**에
//       프로파일 표(`harmlessnessPatterns.ts` `SCAN_PROFILES`)대로 적용한다.
//   (c) 콘텐츠가 늘면 **검사 대상도 자동으로 는다.** 강제 장치는 3겹이다(T82 축 태깅 게이트 선례):
//       ① 타입 게이트 — `Record<keyof Item, FieldPolicy>`라 항목 타입에 필드가 늘면 `tsc`가 막는다.
//       ② 런타임 1:1 게이트 — 카탈로그 키 집합 `deepEqual`(시나리오가 늘면 스캔 대상도 는다).
//       ③ 모듈 등록부 게이트 — `functions/src/scenarios/*.ts` 파일 목록 `deepEqual`
//          (새 콘텐츠 카탈로그 파일을 만들면 등록하기 전까지 실패한다).
//
// ⚠️ 이 테스트가 실패하면 **검사를 완화하지 말고 콘텐츠를 고쳐라.** 콘텐츠가 정당한 예외라면
// `SCAN_PROFILES`의 표에 근거와 함께 행을 추가하는 것이지, 패턴을 지우는 것이 아니다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  FORBIDDEN_RULES,
  SCAN_PROFILES,
  scanSurfaces,
  scanText,
  type ScanProfile,
  type Surface,
} from "./harmlessnessPatterns";
import { SCENARIO_PROMPTS } from "../index";
import { PUBLIC_SCENARIOS, type ScenarioMeta } from "../publicMeta";
import { MOCK_INSTALL_CONSENT_INSTRUCTION, MOCK_SCREENS, type MockScreenItem } from "../mockScreens";
import { VERIFY_INTERCEPT, type VerifyInterceptItem } from "../verifyIntercept";
import { IN_CALL_SMS, type InCallSmsItem } from "../inCallSms";
import type { ScenarioPromptDoc } from "../../shared/types";

// ── 필드 정책(타입 게이트 ①) ────────────────────────────────────────────────
// `Record<keyof T, FieldPolicy>`이므로 항목 타입에 필드가 하나 늘면 **컴파일이 깨진다.**
// 빠뜨릴 수 없게 만드는 것이 목적이다 — 새 필드에 문구가 실려도 검사를 우회하지 못한다.
type FieldPolicy = { profile: ScanProfile } | { skip: string };

const SCENARIO_PROMPT_FIELDS: Record<keyof ScenarioPromptDoc, FieldPolicy> = {
  personaPrompt: { profile: "scenarioContent" },
  weakenedTactics: { profile: "scenarioContent" },
  guardrailPreamble: { profile: "scenarioContent" },
  suspicionKeywords: { profile: "scenarioContent" },
};

const SCENARIO_META_FIELDS: Record<keyof ScenarioMeta, FieldPolicy> = {
  title: { profile: "scenarioContent" },
  fraudType: { profile: "scenarioContent" },
  estimatedDuration: { profile: "scenarioContent" },
  difficulty: { profile: "scenarioContent" },
  callerLabel: { profile: "scenarioContent" },
  // 중첩 구조라 아래에서 lineId별로 개별 등록한다(빠지지 않는지는 별도 단언이 확인한다).
  deepvoiceLines: { skip: "아래에서 lineId별 개별 표면으로 등록" },
  voiceMode: { skip: "열거형 'clone'|'generic' — 자유 문자열이 아니다" },
  channel: { skip: "열거형 'voice'|'messenger'" },
  surface: { skip: "열거형 'kakao'|'sms'" },
  escalation: { skip: "열거형 조합 {toChannel,voiceMode} — 자유 문자열 없음" },
};

const VERIFY_INTERCEPT_FIELDS: Record<keyof VerifyInterceptItem, FieldPolicy> = {
  // 모의 창구·모의 번호·재연결 라벨 — 실존 기관명까지 금지(T83이 세운 규칙을 그대로 계승).
  deskLabel: { profile: "mockSurface" },
  displayNumber: { profile: "mockSurface" },
  reconnectedCallerLabel: { profile: "mockSurface" },
  // 모델 지시는 사칭 캐릭터를 지목할 수 있어 기관명 금지에서 빠진다(프로파일 표 참고).
  announceInstruction: { profile: "modelInstruction" },
  reconnectInstruction: { profile: "modelInstruction" },
  offerId: { skip: "식별자 — 콘텐츠가 아니다" },
  availableAfterScammerTurns: { skip: "숫자 게이트" },
};

const MOCK_SCREEN_FIELDS: Record<keyof MockScreenItem, FieldPolicy> = {
  headline: { profile: "mockSurface" },
  bodyLines: { profile: "mockSurface" },
  consentLabel: { profile: "mockSurface" },
  momentTactic: { profile: "mockSurface" },
  // ⚠️ 대처 문구만 프로파일이 다르다 — AC-071이 신고처(112·1332·금융감독원)를 **명시 요구**한다.
  correctAction: { profile: "correctiveGuidance" },
  landingId: { skip: "식별자" },
  kind: { skip: "열거형 MockScreenKind — 아래 kind 게이트가 별도로 본다" },
};

const IN_CALL_SMS_FIELDS: Record<keyof InCallSmsItem, FieldPolicy> = {
  senderLabel: { profile: "mockSurface" },
  body: { profile: "mockSurface" },
  linkDisplayText: { profile: "mockSurface" },
  otpCode: { profile: "mockSurface" },
  announceInstruction: { profile: "modelInstruction" },
  smsId: { skip: "식별자" },
  kind: { skip: "열거형 InCallSmsKind" },
  fakeLandingId: { skip: "식별자 참조 — 실 URL 필드가 아니다(§15.1.2)" },
  afterScammerTurns: { skip: "숫자 트리거" },
};

// ── 표면 수집 ────────────────────────────────────────────────────────────────

function toTexts(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value as string[];
  throw new Error(`${where}: 문자열/문자열배열이 아닌 값에 profile을 붙였다 — skip 사유를 적어라`);
}

function collectFields<T extends object>(
  domain: string,
  itemId: string,
  item: T,
  policy: Record<keyof T, FieldPolicy>,
  out: Surface[],
): void {
  for (const key of Object.keys(policy) as (keyof T & string)[]) {
    const rule = policy[key];
    if ("skip" in rule) continue;
    for (const text of toTexts(item[key], `${domain}/${itemId}.${key}`)) {
      out.push({ domain, itemId, field: key, text, profile: rule.profile });
    }
  }
}

/**
 * 전 콘텐츠 도메인의 검사 표면. **카탈로그를 순회해서 만든다** — 항목이 늘면 표면도 자동으로 는다
 * (하드코딩 목록이면 새 항목이 조용히 빠진다, §15.10.4가 자인한 실패 양식).
 */
function collectAllSurfaces(): Surface[] {
  const surfaces: Surface[] = [];

  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    collectFields("scenarioPrompt", scenarioId, prompt, SCENARIO_PROMPT_FIELDS, surfaces);
  }
  for (const [scenarioId, meta] of Object.entries(PUBLIC_SCENARIOS)) {
    collectFields("publicMeta", scenarioId, meta, SCENARIO_META_FIELDS, surfaces);
    for (const line of meta.deepvoiceLines) {
      surfaces.push({
        domain: "publicMeta",
        itemId: scenarioId,
        field: `deepvoiceLines[${line.lineId}]`,
        text: line.text,
        profile: "scenarioContent",
      });
    }
  }
  for (const [scenarioId, item] of Object.entries(VERIFY_INTERCEPT)) {
    collectFields("verifyIntercept", scenarioId, item, VERIFY_INTERCEPT_FIELDS, surfaces);
  }
  for (const [scenarioId, items] of Object.entries(MOCK_SCREENS)) {
    for (const item of items) {
      collectFields(
        "mockScreens",
        `${scenarioId}/${item.landingId}`,
        item,
        MOCK_SCREEN_FIELDS,
        surfaces,
      );
    }
  }
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) {
      collectFields("inCallSms", `${scenarioId}/${item.smsId}`, item, IN_CALL_SMS_FIELDS, surfaces);
    }
  }
  // 카탈로그 항목이 아닌 **모듈 상수** 모델 지시(§15.9.1 R3이 항목 밖에 둔 것) — 등록부에서 빠지기
  // 가장 쉬운 자리라 명시적으로 싣는다.
  surfaces.push({
    domain: "moduleConstant",
    itemId: "mockScreens",
    field: "MOCK_INSTALL_CONSENT_INSTRUCTION",
    text: MOCK_INSTALL_CONSENT_INSTRUCTION,
    profile: "modelInstruction",
  });

  return surfaces;
}

const ALL_SURFACES = collectAllSurfaces();

// ── (b) 금지 패턴을 전 도메인에 적용 ─────────────────────────────────────────

test("[T86/(b)] 전 콘텐츠 도메인이 금지 패턴(실존 대표번호·실존 앱명·실 스토어 URL·실제 원격제어 절차)을 통과한다", () => {
  const failures = scanSurfaces(ALL_SURFACES);
  assert.deepEqual(
    failures,
    [],
    `무해화 금지 패턴 위반:\n${failures.join("\n")}\n` +
      "⚠️ 검사를 완화하지 말고 콘텐츠를 고쳐라(AC-005/AC-072/AC-075).",
  );
});

test("[T86/(b)] 검사 대상 수 — 수집기가 카탈로그 항목을 하나도 빠뜨리지 않는다", () => {
  // ⚠️ **이 단언의 목적**: "훑었다"는 주장을 카탈로그 크기에서 **다시 계산해** 대조한다. 수집기가
  // 항목 하나를 조용히 건너뛰면(필터 오타·옵셔널 필드 누락) 여기서 숫자가 어긋난다.
  // 착수 시점 실측 총합 = **319 표면**(scenarioPrompt 148 · publicMeta 104 · verifyIntercept 30 ·
  // inCallSms 29 · mockScreens 7 · moduleConstant 1). 이전에는 실존 앱명·스토어 표기 검사가
  // **모의 화면 카탈로그(7 표면) 한 곳**에만 걸려 있었다.
  const byDomain = new Map<string, number>();
  for (const surface of ALL_SURFACES) {
    byDomain.set(surface.domain, (byDomain.get(surface.domain) ?? 0) + 1);
  }
  assert.deepEqual(
    [...byDomain.keys()].sort(),
    ["inCallSms", "mockScreens", "moduleConstant", "publicMeta", "scenarioPrompt", "verifyIntercept"],
    "콘텐츠 도메인이 추가·삭제되면 이 목록을 갱신하고 표면 수집도 함께 넓혀야 한다",
  );

  const expectedPrompt = Object.values(SCENARIO_PROMPTS).reduce(
    (n, p) => n + 2 + p.weakenedTactics.length + (p.suspicionKeywords?.length ?? 0),
    0,
  );
  const expectedMeta = Object.values(PUBLIC_SCENARIOS).reduce(
    (n, m) => n + 5 + m.deepvoiceLines.length,
    0,
  );
  const expectedVerify = Object.keys(VERIFY_INTERCEPT).length * 5;
  const expectedMock = Object.values(MOCK_SCREENS)
    .flat()
    .reduce((n, i) => n + 4 + i.bodyLines.length, 0);
  const expectedSms = Object.values(IN_CALL_SMS)
    .flat()
    .reduce((n, i) => n + 3 + (i.linkDisplayText ? 1 : 0) + (i.otpCode ? 1 : 0), 0);

  assert.equal(byDomain.get("scenarioPrompt"), expectedPrompt, "persona+guardrail+수법+의심키워드");
  assert.equal(byDomain.get("publicMeta"), expectedMeta, "메타 5필드 + 딥보이스 대사");
  assert.equal(byDomain.get("verifyIntercept"), expectedVerify, "T83/T95 확인 무력화 항목당 5필드");
  assert.equal(byDomain.get("mockScreens"), expectedMock, "T84 모의 화면 항목당 4필드 + bodyLines");
  assert.equal(byDomain.get("inCallSms"), expectedSms, "T68 통화 중 문자 항목당 3필드 + 옵셔널 2");
  assert.equal(byDomain.get("moduleConstant"), 1, "MOCK_INSTALL_CONSENT_INSTRUCTION");
  assert.equal(
    ALL_SURFACES.length,
    expectedPrompt + expectedMeta + expectedVerify + expectedMock + expectedSms + 1,
  );
  assert.ok(ALL_SURFACES.length >= 300, `총 검사 표면 수가 줄었다(현재 ${ALL_SURFACES.length})`);
});

// ── (b) 역방향 확인 — **테스트 코드 안에서만** 오염시킨다 ───────────────────
//
// ⚠️ 실제 콘텐츠 파일을 오염시켰다 되돌리는 방식은 쓰지 않는다(되돌리기를 잊으면 그대로 배포된다).
// 기존 관례와 동일하다: `verifyIntercept.test.ts`의 역검증, `mockScreenCopy.test.ts`의 poisoned-code.

test("[T86/역검증] 네 가지 신규 금지 패턴 각각이 실제로 잡힌다(샘플을 넣으면 실패한다)", () => {
  const samples: { family: string; text: string; profile: ScanProfile }[] = [
    { family: "realHotline", text: "확인은 1588-0000이 아니라 1332로 하세요", profile: "scenarioContent" },
    { family: "realAppName", text: "AnyDesk를 설치하시면 제가 도와드릴게요", profile: "scenarioContent" },
    {
      family: "storeAndInstall",
      text: "https://play.google.com/store/apps/details?id=com.example 에서 받으세요",
      profile: "mockSurface",
    },
    {
      family: "remoteControlProcedure",
      text: "설정에서 접근성 서비스를 켜고 알 수 없는 출처 허용을 눌러 주세요",
      profile: "mockSurface",
    },
    { family: "interceptionMeans", text: "착신 전환을 걸어 두면 됩니다", profile: "modelInstruction" },
    { family: "realInstitutionName", text: "국세청 민원창구", profile: "mockSurface" },
  ];
  for (const sample of samples) {
    const violations = scanText(sample.text, sample.profile);
    assert.ok(
      violations.some((v) => v.family === sample.family),
      `${sample.family} 패턴이 샘플을 잡지 못했다 — 검사가 무력하다: "${sample.text}"`,
    );
  }
});

test("[T86/역검증] 오염된 표면이 하나라도 섞이면 전 도메인 스캔이 실패한다", () => {
  const poisoned: Surface[] = [
    ...ALL_SURFACES,
    {
      domain: "poisoned",
      itemId: "fake-install",
      field: "bodyLines",
      text: "토스 앱을 앱 스토어에서 받은 뒤 접근성 서비스를 켜 주세요. https://example.com/app.apk",
      profile: "mockSurface",
    },
  ];
  const failures = scanSurfaces(poisoned);
  assert.ok(failures.length >= 4, `오염 표면이 4개 이상의 패턴군에 걸려야 한다(실제 ${failures.length})`);
  assert.ok(failures.every((f) => f.startsWith("poisoned/")), "깨끗한 표면은 위반으로 잡히면 안 된다");
});

test("[T86/역검증] 금지형 문맥 예외가 **긍정형 언급까지 봐주지는 않는다**", () => {
  // 프롬프트가 모델에게 "실존 앱 이름·앱스토어를 절대 말하지 않는다"고 **지시하는** 문장은
  // 무해화를 강화하는 문구다(기존 `[OQ-38/D-6]`·`[AC-071/OQ-38]`와 같은 판정). 다만 그 예외가
  // 넓어져 실제 유도 문구까지 통과하면 검사가 무의미해지므로 양쪽을 함께 고정한다.
  const prohibitive = "실제로 존재하는 앱 이름·앱스토어·설치 주소를 절대 말하지 않는다.";
  const positive = "앱스토어에서 확인 앱을 내려받아 설치해 주세요.";
  assert.deepEqual(scanText(prohibitive, "scenarioContent"), [], "금지형은 통과해야 한다");
  assert.ok(
    scanText(positive, "scenarioContent").some((v) => v.family === "storeAndInstall"),
    "긍정형 유도 문구는 반드시 걸려야 한다 — 예외가 여기까지 새면 (b)가 무너진다",
  );
  // 실 도메인·스킴·확장자는 금지형 문맥에서도 예외를 받지 않는다(값 자체가 산출물에 남는다).
  assert.ok(
    scanText("https://play.google.com 링크는 절대 쓰지 않는다", "scenarioContent").some(
      (v) => v.family === "storeAndInstall" || v.family === "operationalPayload",
    ),
    "실 URL은 금지형 문장 안에 있어도 위반이다",
  );
  assert.ok(
    scanText("1332로는 절대 걸지 않는다", "scenarioContent").some((v) => v.family === "realHotline"),
    "실존 대표번호도 예외 없음",
  );
});

test("[T86/역검증] 프로파일 표의 예외가 **의도한 자리에서만** 열린다(전역 금지어화 방지)", () => {
  // AC-071은 리포트 대처 문구에 신고처를 명시 요구한다 — 그 문구가 `scenarioContent` 프로파일에
  // 걸리면 안 되는 게 아니라, **`correctiveGuidance`에서만 통과**해야 한다.
  const reportGuidance = "이미 허용했다면 112(경찰)·1332(금융감독원)에 신고하기.";
  assert.deepEqual(scanText(reportGuidance, "correctiveGuidance"), []);
  assert.ok(
    scanText(reportGuidance, "mockSurface").length > 0,
    "같은 문구가 모의 화면 표면 프로파일에서는 걸려야 한다 — 예외가 전역으로 새면 안 된다",
  );
  // 반대로 사칭 대상 기관명은 시나리오 콘텐츠에서 통과하되 모의 창구명에서는 걸린다.
  assert.deepEqual(scanText("국세청 환급 담당입니다.", "scenarioContent"), []);
  assert.ok(scanText("국세청 확인창구", "mockSurface").length > 0);
});

// ── (c) 우회 방지 게이트 ─────────────────────────────────────────────────────

test("[T86/(c)] 시나리오가 늘면 검사 대상도 는다 — 스캔한 시나리오 집합이 카탈로그와 1:1이다", () => {
  const promptIds = Object.keys(SCENARIO_PROMPTS).sort();
  const metaIds = Object.keys(PUBLIC_SCENARIOS).sort();
  const scannedPromptIds = [
    ...new Set(ALL_SURFACES.filter((s) => s.domain === "scenarioPrompt").map((s) => s.itemId)),
  ].sort();
  const scannedMetaIds = [
    ...new Set(ALL_SURFACES.filter((s) => s.domain === "publicMeta").map((s) => s.itemId)),
  ].sort();

  assert.deepEqual(scannedPromptIds, promptIds, "프롬프트를 가진 시나리오가 전부 스캔돼야 한다");
  assert.deepEqual(scannedMetaIds, metaIds, "공개 메타를 가진 시나리오가 전부 스캔돼야 한다");
  assert.ok(promptIds.length >= 14, `시나리오가 14종 이상이어야 한다(현재 ${promptIds.length}종)`);
});

test("[T86/(c)] 카탈로그 항목의 **모든 런타임 필드**가 정책표에 등록돼 있다(신규 필드 우회 차단)", () => {
  const checks: { domain: string; items: object[]; policyKeys: string[] }[] = [
    {
      domain: "scenarioPrompt",
      items: Object.values(SCENARIO_PROMPTS),
      policyKeys: Object.keys(SCENARIO_PROMPT_FIELDS),
    },
    {
      domain: "publicMeta",
      items: Object.values(PUBLIC_SCENARIOS),
      policyKeys: Object.keys(SCENARIO_META_FIELDS),
    },
    {
      domain: "verifyIntercept",
      items: Object.values(VERIFY_INTERCEPT),
      policyKeys: Object.keys(VERIFY_INTERCEPT_FIELDS),
    },
    {
      domain: "mockScreens",
      items: Object.values(MOCK_SCREENS).flat(),
      policyKeys: Object.keys(MOCK_SCREEN_FIELDS),
    },
    {
      domain: "inCallSms",
      items: Object.values(IN_CALL_SMS).flat(),
      policyKeys: Object.keys(IN_CALL_SMS_FIELDS),
    },
  ];
  for (const { domain, items, policyKeys } of checks) {
    assert.ok(items.length > 0, `${domain}: 카탈로그가 비어 있으면 이 게이트가 무의미하다`);
    for (const item of items) {
      for (const key of Object.keys(item)) {
        assert.ok(
          policyKeys.includes(key),
          `${domain}: 필드 '${key}'가 정책표에 없다 — 문구를 실어도 금지 패턴 검사를 우회한다. ` +
            "profile을 붙이거나 skip 사유를 적어라.",
        );
      }
    }
  }
});

// 모듈 등록부 — 새 콘텐츠 카탈로그 **파일**이 생기면 여기서 걸린다(`mockScreenCopy.test.ts`의
// `readdirSync` 형제 파일 검사와 같은 관례). 값은 "scanned"(위 표면 수집이 훑는다) 또는 사유다.
const SCENARIO_MODULE_INVENTORY: Record<string, string> = {
  "publicMeta.ts": "scanned",
  "verifyIntercept.ts": "scanned",
  "mockScreens.ts": "scanned",
  "inCallSms.ts": "scanned",
  "index.ts": "scanned (SCENARIO_PROMPTS 집합체 — *.prompt.ts를 모은다)",
  "bankSecurityVerifyScam.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "cardCompanyImpersonation.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "courierCustomsScam.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "familyAccidentDeepvoice.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "grandchildImpersonation.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "institutionalImpersonation.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "kidnappingThreat.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "loanScam.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "messengerChildImpersonationKakao.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "messengerFriendLoanKakao.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "messengerParcelSmishingSms.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "messengerSubsidySmishingSms.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "reputationBlackmailScam.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  "taxRefundScam.prompt.ts": "scanned (SCENARIO_PROMPTS 경유)",
  // ↓ 콘텐츠 문자열을 스스로 갖지 않는 모듈(파생·좌표·도구).
  "axes.ts": "콘텐츠 아님 — 축 좌표(열거형)",
  "axisCoverage.ts": "콘텐츠 아님 — 커버리지 순수 함수",
  "axisCoverageReport.ts": "콘텐츠 아님 — 리포트 스크립트",
  "beginnerBriefing.ts": "파생 — weakenedTactics에서 만들어지므로 원본이 이미 스캔된다",
  "briefingTypes.ts": "콘텐츠 아님 — 타입 정의",
  "tacticFlavor.ts": "파생 — weakenedTactics 문자열을 자르는 순수 함수",
  "seed.ts": "콘텐츠 아님 — 시딩 스크립트(PUBLIC_SCENARIOS를 쓴다)",
};

test("[T86/(c)] 신규 콘텐츠 카탈로그 파일이 등록 없이 추가되지 못한다(모듈 등록부 1:1)", () => {
  const scenarioDir = path.resolve(__dirname, "../../../src/scenarios");
  const files = fs
    .readdirSync(scenarioDir)
    .filter((name) => name.endsWith(".ts"))
    .sort();
  assert.deepEqual(
    files,
    Object.keys(SCENARIO_MODULE_INVENTORY).sort(),
    "functions/src/scenarios에 파일이 추가·삭제됐다. SCENARIO_MODULE_INVENTORY에 " +
      "'scanned'로 등재하고 표면 수집에 넣거나, 왜 콘텐츠가 아닌지 사유를 적어라 — " +
      "등재 없이 새 카탈로그가 들어오면 그 콘텐츠만 금지 패턴 검사를 우회한다.",
  );
});

test("[T86/(c)] 프로파일 표에 정의된 패턴군만 쓰이고, 모든 프로파일이 실제로 표면에 배정돼 있다", () => {
  const usedProfiles = [...new Set(ALL_SURFACES.map((s) => s.profile))].sort();
  const definedProfiles = Object.keys(SCAN_PROFILES).sort();
  // `assembledPrompt`는 조립 결과 전용이라 여기(원본 표면)에는 배정되지 않는다 —
  // promptAssembly.test.ts의 [T86 전수] 매트릭스가 쓴다.
  assert.deepEqual(
    usedProfiles,
    definedProfiles.filter((p) => p !== "assembledPrompt"),
    "정의만 하고 아무 표면에도 안 쓰는 프로파일이 있으면 검사가 있다고 착각하게 된다",
  );
});

// ── T86 reviewer Major 1 — **죽은 패턴 재발 방지 게이트** ────────────────────
//
// **무엇이 있었나.** 이 파일을 만든 이유가 *"기존 `mockScreens.test.ts`의 `/\b앱\s*스토어\b/`가
// JS의 `\b`(ASCII 단어 경계) 때문에 한글 문맥에서 사실상 매치되지 않는다"* 는 진단이었는데,
// 정작 정본 파일 최초 작성에서 **같은 형태(`/\bplay\s*스토어\b/`)를 그대로 옮겨 심었다.**
// 게다가 그것이 "금지형 예외 없음" 버킷에 있어서 **검출력 0인데 겉보기엔 가장 강한 규칙**이었다.
//
// **재발 방지 방식**: 규칙마다 *"이 규칙은 이런 문자열을 잡으라고 만들었다"* 는 **양성 샘플**을
// 등록하고, 규칙 목록과 샘플 목록이 1:1임을 강제한다(T82 축 태깅 `deepEqual` 게이트와 같은 형태).
//   - 새 정규식을 추가하면 → 샘플을 등록하기 전까지 실패한다.
//   - 규칙이 죽어 있으면(양성 샘플조차 못 잡으면) → 실패한다.
//   - 리터럴 규칙(앱명·대표번호·기관명)은 **자기 이름 자체가 양성 샘플**이라 자동 검사한다.

/** 규칙 식별 키 — `/https?:\/\//i`처럼 **두 패턴군에 같은 정규식이 있으므로** 라벨만으로는 부족하다. */
function ruleKey(rule: { family: string; label: string }): string {
  return `${rule.family} ${rule.label}`;
}

/** 손수 쓴 정규식 규칙의 양성 샘플. 값이 그 정규식에 실제로 걸려야 한다. */
const PATTERN_LIVENESS_SAMPLES: Record<string, string> = {
  "operationalPayload /\\d{8,}/": "계좌 35208124471603 입니다",
  "operationalPayload /https?:\\/\\//i": "https://example.com",
  "storeAndInstall /https?:\\/\\//i": "https://example.com/app",
  "storeAndInstall /\\.apk\\b/i": "confirm.apk 를 받으세요",
  "storeAndInstall /\\.ipa\\b/i": "confirm.ipa 를 받으세요",
  "storeAndInstall /\\bplay\\.google\\b/i": "play.google.com/store/apps",
  "storeAndInstall /\\bapps\\.apple\\b/i": "apps.apple.com/kr/app/x",
  "storeAndInstall /\\bmarket:\\/\\//i": "market://details?id=com.example",
  "storeAndInstall /\\bintent:\\/\\//i": "intent://scan#Intent;end",
  "storeAndInstall /\\bpackage(Name)?\\s*[:=]/i": "packageName: com.example.app",
  "storeAndInstall /\\bapp\\s*store\\b/i": "App Store에서 받으세요",
  "storeAndInstall /\\bappstore\\b/i": "appstore 링크로 받으세요",
  // ⚠️ reviewer Major 1이 지목한 바로 그 규칙 — `\b`가 붙어 있으면 이 샘플에서 실패한다.
  "storeAndInstall /play\\s*스토어/i": "Play 스토어에서 설치하세요",
  "storeAndInstall /플레이\\s*스토어/": "플레이 스토어에서 설치하세요",
  "storeAndInstall /앱\\s*스토어/": "앱 스토어에서 받으세요",
  "storeAndInstall /원스토어/": "원스토어에서 받으세요",
  "remoteControlProcedure /접근성\\s*(서비스|권한|설정)/": "접근성 서비스를 켜 주세요",
  "remoteControlProcedure /화면\\s*(공유|미러링)[을를]?\\s*(켜|허용|활성)/": "화면 공유를 켜 주세요",
  "remoteControlProcedure /원격\\s*(제어|지원)[^.\\n]{0,12}(설치|연결|접속)\\s*(방법|절차|법)/":
    "원격 제어 앱 설치 방법을 알려드릴게요",
  "remoteControlProcedure /알림\\s*접근\\s*권한[^.\\n]{0,8}(켜|허용|활성)/":
    "알림 접근 권한을 허용해 주세요",
  "remoteControlProcedure /개발자\\s*(옵션|모드)[^.\\n]{0,8}(켜|활성|들어가)/":
    "개발자 옵션을 켜 주세요",
  "remoteControlProcedure /알\\s*수\\s*없는\\s*(출처|앱)[^.\\n]{0,10}(허용|설치|켜)/":
    "알 수 없는 출처 설치를 허용해 주세요",
  "remoteControlProcedure /출처를?\\s*알\\s*수\\s*없는\\s*앱/": "출처를 알 수 없는 앱입니다",
  "remoteControlProcedure /USB\\s*디버깅/i": "USB 디버깅을 켜 주세요",
  "remoteControlProcedure /기기\\s*관리자\\s*권한[^.\\n]{0,8}(허용|활성)/":
    "기기 관리자 권한을 허용해 주세요",
  "remoteControlProcedure /설정\\s*[>·→-]\\s*(보안|앱|일반)/": "설정 > 보안 메뉴로 들어가세요",
  "interceptionMeans /착신\\s*전환/": "착신 전환을 걸어 둡니다",
  "interceptionMeans /포워딩/": "포워딩 설정이 되어 있습니다",
  "interceptionMeans /중계기/": "중계기를 거칩니다",
  "interceptionMeans /번호\\s*목록/": "번호 목록을 넘깁니다",
  "interceptionMeans /앱을\\s*설치하면\\s*통화가/": "앱을 설치하면 통화가 넘어갑니다",
};

test("[T86/생존] 손수 쓴 정규식 규칙과 양성 샘플이 1:1이다(새 규칙이 샘플 없이 들어오지 못한다)", () => {
  const patternRuleKeys = FORBIDDEN_RULES.filter((rule) => rule.label.startsWith("/"))
    .map(ruleKey)
    .sort();
  assert.deepEqual(
    patternRuleKeys,
    Object.keys(PATTERN_LIVENESS_SAMPLES).sort(),
    "정규식 규칙을 추가·삭제했으면 PATTERN_LIVENESS_SAMPLES도 함께 갱신하라 — " +
      "샘플 없이 들어온 규칙은 죽어 있어도 아무도 모른다(reviewer Major 1).",
  );
});

test("[T86/생존] 모든 규칙이 자기 양성 샘플을 **실제로** 잡는다 — 죽은 패턴 재발 차단", () => {
  const dead: string[] = [];
  for (const rule of FORBIDDEN_RULES) {
    // 리터럴 규칙(앱명·대표번호·기관명)은 자기 이름이 곧 양성 샘플이다.
    // → `literalRule`의 이스케이프·숫자 경계 처리가 깨져도 여기서 드러난다.
    const sample = rule.label.startsWith("/")
      ? PATTERN_LIVENESS_SAMPLES[ruleKey(rule)]
      : rule.label;
    if (sample === undefined || !rule.pattern.test(sample)) {
      dead.push(`${ruleKey(rule)}  ← 샘플 "${sample}"을 잡지 못한다`);
    }
  }
  assert.deepEqual(
    dead,
    [],
    "검출력 0인 규칙이 있다:\n" +
      dead.join("\n") +
      "\n⚠️ 가장 흔한 원인은 **한글에 닿는 패턴에 붙은 `\\b`**다 — JS의 `\\b`는 ASCII 단어 경계라 " +
      "한글 앞뒤에서는 경계가 성립하지 않는다. `\\b`를 빼라(형제 규칙 `/플레이\\s*스토어/` 참고).",
  );
});

test("[T86/역검증] `\\b`가 붙은 한글 패턴은 위 생존 검사에서 실제로 걸린다", () => {
  // reviewer가 `node -e`로 재현한 것을 테스트로 고정한다 — 이 사실이 코드에 남아 있어야
  // 다음 사람이 "한글에도 \b를 쓰면 되겠지"라고 판단하지 않는다.
  const deadPattern = /\bplay\s*스토어\b/;
  const livePattern = /play\s*스토어/i;
  for (const sample of ["play 스토어", "play스토어", " play 스토어 ", "Play 스토어"]) {
    assert.equal(deadPattern.test(sample), false, `죽은 패턴이 우연히 잡으면 이 예시가 무의미하다: ${sample}`);
    assert.equal(livePattern.test(sample), true, `고친 패턴은 잡아야 한다: ${sample}`);
  }
  // 정본에 죽은 패턴이 다시 들어오면 위 [T86/생존] 테스트가 실패한다는 것을 여기서 직접 보인다.
  const sample = PATTERN_LIVENESS_SAMPLES["storeAndInstall /play\\s*스토어/i"];
  assert.equal(deadPattern.test(sample), false);
  assert.equal(livePattern.test(sample), true);
});

// 정본 소스에서 정규식 리터럴을 인식하는 **두 가지 서식**.
//   ELEMENT — 배열 원소(`  /x/i,`) 및 변수 선언의 다음 줄로 넘어간 리터럴(`  /x/;`)
//   DECL    — 한 줄짜리 단일 선언(`export const URL_PATTERN = /https?:\/\//i;`)
// ⚠️ QA Minor 2가 지적한 그대로다: 최초 구현은 ELEMENT(콤마로 끝나는 줄)만 인식했고, 정본에는
// 이미 `LONG_DIGIT_SEQUENCE`·`URL_PATTERN`·`PROHIBITIVE_CONTEXT`가 DECL/세미콜론 서식으로
// 선언돼 있어 **그 줄들은 통째로 건너뛰어졌다.**
const REGEX_ELEMENT_LINE = /^\s*\/(.+)\/([a-z]*)[,;]?\s*$/;
const REGEX_DECL_LINE = /^\s*(?:export\s+)?const\s+\w+(?::\s*RegExp)?\s*=\s*\/(.+)\/([a-z]*);\s*$/;

test("[T86/생존] 정본 소스에 한글이 닿는 `\\b` 패턴이 남아 있지 않다(정적 검사 — 서식 무관)", () => {
  // **이 검사의 역할과 한계를 정확히 적는다(QA Minor 2).**
  // 역할: 생존 검사(위 두 건)는 "등록된 양성 샘플을 잡는가"만 본다 — 샘플을 함께 약하게 쓰면
  //       통과할 수 있다. 그래서 소스에서 **한글 옆의 `\b`** 자체를 금지하는 겹을 하나 더 둔다.
  // 한계: 이 검사는 **소스 서식에 의존한다.** TS 소스에서 정규식 리터럴을 완전하게 렉싱하지
  //       않기 때문이다(나눗셈 연산자·문자열·주석 안의 슬래시와 구분하려면 파서가 필요하다).
  //       그래서 "모든 형식을 안다"고 주장하지 않고, **판정할 수 없는 `\b`를 만나면 통과시키지
  //       않고 실패**시킨다(아래 `unparsed`). 즉 서식이 넓어지면 검사가 조용히 빠지는 것이
  //       아니라 **시끄럽게 막힌다.**
  // 최종 backstop: 이 검사가 아니라 위 `[T86/생존]` 두 건이다 — 그 둘은 런타임
  //       `FORBIDDEN_RULES` 배열을 보므로 **선언 서식과 완전히 무관**하다. 어떤 서식으로 쓰든
  //       규칙이 죽어 있으면 "자기 양성 샘플을 잡지 못한다"에서 걸린다.
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../../src/scenarios/__tests__/harmlessnessPatterns.ts"),
    "utf8",
  );
  // 주석은 제외한다 — 이 파일의 주석은 `\b` 함정을 설명하느라 `\b`를 인용한다.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const offenders: string[] = [];
  const unparsed: string[] = [];
  code.split(/\r?\n/).forEach((line, i) => {
    if (!line.includes("\\b")) return;
    const literal = REGEX_ELEMENT_LINE.exec(line) ?? REGEX_DECL_LINE.exec(line);
    if (literal === null) {
      unparsed.push(`${i + 1}: ${line.trim()}`);
      return;
    }
    // `\b`가 한글 바로 앞이나 바로 뒤에 오는 경우만 잡는다(ASCII 전용 패턴의 `\b`는 정상이다).
    if (/[가-힣][^\\]{0,2}\\b|\\b[^가-힣]{0,2}[가-힣]/.test(literal[1])) {
      offenders.push(`${i + 1}: /${literal[1]}/${literal[2]}`);
    }
  });

  assert.deepEqual(
    unparsed,
    [],
    "`\\b`가 있는데 이 검사가 **정규식 리터럴로 판정할 수 없는 서식**이다. 통과시키지 않는다 — " +
      "인식 가능한 서식(배열 원소 / 한 줄 const 선언)으로 쓰거나 위 REGEX_*_LINE을 넓혀라:\n" +
      unparsed.join("\n"),
  );
  assert.deepEqual(
    offenders,
    [],
    "한글에 닿는 `\\b`는 ASCII 단어 경계라 매치되지 않는다(reviewer Major 1):\n" + offenders.join("\n"),
  );
});

test("[T86/생존] 위 정적 검사가 **단일 선언 서식**도 실제로 판정한다(QA Minor 2 회귀)", () => {
  // QA가 든 예시를 그대로 고정한다: `export const SNEAKY = /\b교묘한\b/;`
  // 최초 구현(콤마로 끝나는 줄만 인식)에서는 이 줄이 통째로 건너뛰어졌다.
  const declLine = "export const SNEAKY = /\\b교묘한\\b/;";
  const elementLine = "  /\\b교묘한\\b/,";
  const continuationLine = "  /\\b교묘한\\b/;";
  const koreanAdjacentB = /[가-힣][^\\]{0,2}\\b|\\b[^가-힣]{0,2}[가-힣]/;

  for (const [label, line] of [
    ["단일 선언", declLine],
    ["배열 원소", elementLine],
    ["선언 다음 줄", continuationLine],
  ] as const) {
    const literal = REGEX_ELEMENT_LINE.exec(line) ?? REGEX_DECL_LINE.exec(line);
    assert.ok(literal, `${label} 서식을 인식하지 못한다: ${line}`);
    assert.ok(koreanAdjacentB.test(literal[1]), `${label}: 한글 옆 \\b를 잡아야 한다`);
  }

  // 그리고 실제로 그 패턴이 죽어 있다는 사실도 함께 못박는다(왜 금지하는지의 근거).
  assert.equal(/\b교묘한\b/.test("이건 교묘한 수법이다"), false);
  assert.equal(/교묘한/.test("이건 교묘한 수법이다"), true);

  // ⚠️ ASCII 전용 패턴의 `\b`는 정상이므로 오탐하면 안 된다(정본에 11개 있다).
  for (const safe of ["  /\\bapp\\s*store\\b/i,", "  /\\.apk\\b/i,", "  /\\bmarket:\\/\\//i,"]) {
    const literal = REGEX_ELEMENT_LINE.exec(safe) ?? REGEX_DECL_LINE.exec(safe);
    assert.ok(literal, safe);
    assert.equal(koreanAdjacentB.test(literal[1]), false, `ASCII 전용 \\b를 오탐했다: ${safe}`);
  }
});
