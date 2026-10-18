// 난이도별 흐름 변형(flow variant) 데이터 — T191 S5 / PRD AC-096 · AC-097.
// 설계: T191 흐름 변형 설계(ScenarioDifficultyRedesign.md §2.1 · §2.2 · §2.6.3 · §2.6.4 ·
// Architecture T191 절 "흐름 변형 데이터 모델").
//
// ⛔ **Functions 전용이다**(설계 금지 X1 · D-46 · ADR-0004). 이 파일의 어떤 값도 클라 번들 ·
// `publicMeta.ts` · Firestore `scenarios/{}` 에 넣지 않는다. 세션 문서에는 **의미 없는 불투명 ID**
// (`flowVariantId`, `fv-xxxx`)만 쓴다. 수법 · 단계 · 문자 목적 · 인원 구성은 서버 밖으로 0.
// (`__tests__/flowVariants.test.ts`가 `src/**` import 0 · publicMeta 필드 0 · ID 형식을 고정한다.)
//
// ── 판정 규칙표(변형을 어떻게 만들었나 — 임의 판단 0, 이 표대로만) ─────────────────────────
// | If (§2.6.3 칸) | Then |
// |---|---|
// | 흐름이 적힌 칸 | `authoring:"authored"` — 기존 수법 중 고른 것(`keepLabels`) + 변형 전용 수법(`extraTactics`) + 단계 요약 |
// | "현행" 칸 | `authoring:"current"` — 새 흐름을 만들지 않는다(단계 0 · 페르소나 무변경). 수법은 기존 그대로이되, **PRD AC-096 (b)의 자기 난이도 축 D 범위 밖 라벨만 뺀다**(`dropLabels`, 아래 근거) — 단 **중급은 기존 수법을 빼지 않는다**(아래 ⚠️ 예외) |
// | 고급 + L3 `reduced` 시나리오 | 축 D에 D3/D4가 없을 수 있다 — §17.7 옵션 A(이미 채택된 축소)를 따른다. 테스트 상수 `ADVANCED_D34_EXEMPT`에 명시(조용한 누락 금지) |
//
// ⚠️ **"현행"에서 라벨을 빼는 근거(문서 간 충돌 해소 — 보고 대상)**: §2.6.3은 "현행 = 변형을 새로 만들지
// 않는다"고 적었지만, PRD AC-096 (b)는 **모든 변형**이 자기 난이도 열 범위 안이어야 한다고 하고
// (d)는 초급 산출 프롬프트에 이탈 차단 D2~D5 0건을 요구한다. PRD가 우선이므로, "현행" 행도 그
// 난이도의 축 D 범위 밖 라벨만 기계적으로 뺐다(초급: D2~D6). 흐름 · 단계 · 페르소나 문면은 그대로다.
// ⚠️ **중급 예외 — planner 확인 대기(AC-096 (b) vs DECISIONS #44)**: 중급은 "기존 시나리오의 수법을
// 빼앗지 않는다"(사용자 확정 · Architecture §17.4.1)가 우선한다. 그래서 kidnapping 중급의 "신고 차단
// 지시"(D6)와 loan 중급의 "절차·서류 정당화"(D4)는 **남겼다** — 범위표와의 차이는 테스트 상수
// `INTERMEDIATE_EXISTING_TACTIC_EXEMPT`(데이터에서 재계산해 같아야 통과)에 명시한다. bank 중급의 "확인 시도
// 무력화"(D3) 제외는 D-54("초급 · 중급에서는 D3가 등장하지 않을 뿐")에 근거해 유지한다.
//
// ⚠️ **문자(`sms`)는 S5에서 선언값이다.** 발송 판정 입력으로 쓰는 것은 S5b(`resolveSmsGate`)다 —
// S5b 전까지는 카탈로그(`inCallSms.ts`)가 오늘처럼 보낸다(이 파일은 그 파일을 import하지 않는다:
// 다른 세션 편집 중 · 순환 회피). 선언과 카탈로그의 정합(smsId 존재)은 테스트가 고정한다.
//
// ⚠️ **릴레이(인원 ≥ 2) — T191 S7부터 실제로 다른 목소리로 넘긴다**(`RELAY_RUNTIME_AVAILABLE = true`).
// leg마다 맡는 단계(`stageUntil`) · 다음 화자 페르소나(`personaPrompt`)를 여기서 저작하고, 교대 실행은
// `realtime/startRelayLeg.ts`(실시간) · `roleplay/index.ts`(텍스트 폴백)가 한다. 인계문은 서버가 마스킹
// 저장본으로만 만든다(`realtime/relayHandoff.ts` — 설계 금지 X2). ElevenLabs 경로는 릴레이 변형을 받지 않는다
// (DECISIONS #139 · `realtime/provider.ts` 허용목록).
import type { DifficultyLevel } from "../shared/difficulty";
import type { ScenarioPromptDoc } from "../shared/types";
import type { AxisExitBlock } from "./axes";
import { SCENARIO_PROMPTS } from "./index";
import { extractTacticLabel } from "./tacticFlavor";
import { hasVerifyIntercept } from "./verifyIntercept";

export type SmsPurpose = "identity" | "transfer" | "link";

export type FlowVariantSms = {
  purpose: SmsPurpose;
  /** `IN_CALL_SMS[scenarioId]`의 smsId 참조(본문 · 번호의 원천은 여전히 카탈로그다). */
  smsId: string;
  /** 백스톱이 강제해도 되는 문자인가(S5b). */
  required: boolean;
  /** 사용자 발화 N회 전에는 보내지 않는다(S5b 도달 조건 입력 — 판단값). */
  notBeforeUserTurns: number;
};

export type FlowVariantLeg = {
  /** 화면 표시값(S7 화자 표기 · UX 계약 C-6/C-8) — 실제 부서명 · 이름 0(AC-102 (c)). */
  callerLabel: string;
  /**
   * 0번 leg는 시나리오 persona를 재사용한다(부재). 1번 이상 leg는 **필수**(T191 S7 저작) — 시나리오 persona
   * 뒤에 "이번 통화에서 네 역할" 블록으로 붙어 [캐릭터]를 이 사람으로 바꾼다(안전 · 말투 규칙은 원본 그대로 산다).
   */
  personaPrompt?: string;
  /**
   * T191 S7 — 이 leg가 맡는 마지막 단계 번호(1-기반, `stages` 기준). 다음 leg가 있는 leg만 필수 — 다음 leg는
   * 그다음 단계부터 이어 간다. 마지막 leg는 부재(남은 단계 전부).
   */
  stageUntil?: number;
  speakerGender: "male" | "female";
  /** S7 교대 하한 · 천장(판단값). */
  minUserTurns: number;
  maxUserTurns: number;
};

export type FlowVariant = {
  /** 불투명 ID — `fv-` + 소문자·숫자 4자 이상. ⛔ 서술형 금지(네트워크에서 흐름을 읽을 수 없게). */
  variantId: string;
  scenarioId: string;
  level: DifficultyLevel;
  /** `current` = §2.6.3의 "현행" 닫힌 예외(AC-096 (c) 차이 검사 제외 — 테스트 상수에 명시). */
  authoring: "authored" | "current";
  /** 모델용 단계 요약(서버 전용). `current`는 빈 배열 — 페르소나를 바꾸지 않는다. */
  stages: { stageId: string; summary: string }[];
  /** 이 변형의 weakenedTactics(공통분 + 변형분). */
  tactics: string[];
  /** 축 D 값(난이도 L3 오버레이 포함 — AC-096 (b) 자동 검증 입력). 테스트가 콘텐츠와 대조한다. */
  exitBlock: AxisExitBlock[];
  sms: FlowVariantSms[];
  legs: FlowVariantLeg[];
  pressure: "low" | "mid" | "high";
  signal: "overt" | "mixed" | "covert";
  channels: string[];
  /** 요구 단계 수(AC-074 L4). */
  demandStages: number;
  /** 고급 전용 3종 필수(AC-097 (e)). */
  decisionMoment?: string;
  /** 사례 C · S 번호(AC-097 (c) · 설계 금지 X4). */
  sources?: string[];
};

/**
 * T191 S7(릴레이 재연결) 구현 완료 — legs ≥ 2 변형은 leg마다 다른 목소리 · 다른 페르소나로 넘긴다.
 * `false`로 되돌리면 S5의 "한 화자" 규칙으로 돌아간다(롤백 손잡이 — 프롬프트만 바뀌고 교대 실행 경로는
 * `isRelayVariant`가 이 값을 함께 보므로 같이 꺼진다).
 */
export const RELAY_RUNTIME_AVAILABLE = true;

// ── 저작 입력(내부) ───────────────────────────────────────────────────────────

type VariantSpec = Omit<FlowVariant, "tactics"> & {
  /** authored — 기존 수법 중 남길 라벨(순서 유지). 부재면 기존 전부에서 `dropLabels`만 뺀다. */
  keepLabels?: string[];
  /** current(또는 keepLabels 부재 authored) — 기존 수법에서 뺄 라벨. */
  dropLabels?: string[];
  /** 변형 전용 수법 — 다른 시나리오의 수법 문구를 그대로 빌리면 `{ from, label }`. */
  extraTactics?: (string | { from: string; label: string })[];
};

/** 저작 입력의 라벨이 원천에서 안 찾아지면 여기에 쌓인다 — 테스트가 빈 배열을 단언한다(조용한 누락 금지). */
export const UNRESOLVED_TACTIC_LABELS: string[] = [];

function tacticsOf(scenarioId: string): string[] {
  return SCENARIO_PROMPTS[scenarioId]?.weakenedTactics ?? [];
}

function findByLabel(scenarioId: string, label: string): string | undefined {
  const found = tacticsOf(scenarioId).find((t) => extractTacticLabel(t) === label);
  if (found === undefined) UNRESOLVED_TACTIC_LABELS.push(`${scenarioId}: ${label}`);
  return found;
}

function buildTactics(spec: VariantSpec): string[] {
  const base = tacticsOf(spec.scenarioId);
  let kept: string[];
  if (spec.keepLabels) {
    kept = spec.keepLabels
      .map((label) => findByLabel(spec.scenarioId, label))
      .filter((t): t is string => t !== undefined);
  } else {
    for (const label of spec.dropLabels ?? []) findByLabel(spec.scenarioId, label); // 존재 확인
    const drop = new Set(spec.dropLabels ?? []);
    kept = base.filter((t) => !drop.has(extractTacticLabel(t)));
  }
  const extras = (spec.extraTactics ?? [])
    .map((e) => (typeof e === "string" ? e : findByLabel(e.from, e.label)))
    .filter((t): t is string => t !== undefined);
  return [...kept, ...extras];
}

function compile(spec: VariantSpec): FlowVariant {
  const { keepLabels: _keep, dropLabels: _drop, extraTactics: _extra, ...rest } = spec;
  return { ...rest, tactics: buildTactics(spec) };
}

// ── 공통 값 ─────────────────────────────────────────────────────────────────

const ONE_LEG = (callerLabel: string, speakerGender: "male" | "female"): FlowVariantLeg[] => [
  { callerLabel, speakerGender, minUserTurns: 0, maxUserTurns: 20 },
];
const BEGINNER = { pressure: "low", signal: "overt" } as const;
const INTERMEDIATE = { pressure: "mid", signal: "mixed" } as const;
const ADVANCED = { pressure: "high", signal: "covert" } as const;
const st = (...summaries: string[]) =>
  summaries.map((summary, i) => ({ stageId: `s${i + 1}`, summary }));

// 다른 시나리오 수법 문구를 그대로 빌려 쓰는 참조(같은 원천 — 문구 사본 0).
const ASSET_INFO = { from: "asset-protection-notice-call", label: "거래 은행·자산 정보 수집" };
const CASH_HANDOFF = { from: "asset-protection-notice-call", label: "인출·전달 요구" };
const COIN_TRANSFER = { from: "prosecution-cooperation-call", label: "코인 구매·송금 요구" };
const APP_INSTALL = { from: "card-delivery-call", label: "보안 점검 앱 설치 요구" };
const AGENCY_PROBE = { from: "card-delivery-call", label: "기관 조사 언급" };

// 음성 시나리오용 "다른 번호" 수법(가족 · 손주 고급 — §2.6.3 "딥보이스 + 다른 번호로 연락", 사례 S9 · C18).
const OTHER_NUMBER_PRETEXT =
  "채널 전환 유도 — '폰이 고장 나서 다른 번호로 걸었어, 원래 번호로는 연락이 안 돼' 처럼 다른 번호로 연락한 이유를 대고, 원래 번호로 확인해 보지 못하게 한다.";

const SPECS: VariantSpec[] = [
  // ── institutional-impersonation (§2.6.3 1행 — 사례 C10 · C11 · C09, S16 · S11 · S27) ──────
  {
    variantId: "fv-5cn4",
    scenarioId: "institutional-impersonation",
    level: "beginner",
    authoring: "authored",
    stages: st(
      "수사관이라며 본인 명의 계좌가 범죄에 연루됐다고 알린다.",
      "본인 확인을 위해 신원 정보를 묻는다.",
      "계좌를 보호해야 한다며 안전계좌로 이체하라고 곧바로 요구한다.",
    ),
    keepLabels: ["권위 암시", "긴급성 조성", "불이익 암시", "신원정보 직접 요구", "부인 시 명의 도용 암시", "안전계좌 이체 요구"],
    exitBlock: ["D0_none"],
    sms: [{ purpose: "transfer", smsId: "institution-safe-account", required: true, notBeforeUserTurns: 3 }],
    legs: ONE_LEG("수사관", "male"),
    ...BEGINNER,
    channels: ["voice", "sms"],
    demandStages: 1,
  },
  {
    variantId: "fv-hktx",
    scenarioId: "institutional-impersonation",
    level: "intermediate",
    authoring: "authored",
    stages: st(
      "수사관이라며 본인 명의가 범죄에 쓰였다고 알린다.",
      "본인 확인 절차라며 신원 정보와 인증번호를 요구한다. 상대가 인증번호를 거부하면 인증번호 없이 다음 단계로 넘어간다.",
      "명의 도용으로 자산이 위험하다며 안전계좌 이체를 요구한다.",
    ),
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    sms: [
      { purpose: "identity", smsId: "institution-otp", required: false, notBeforeUserTurns: 2 },
      { purpose: "transfer", smsId: "institution-safe-account", required: true, notBeforeUserTurns: 3 },
    ],
    legs: ONE_LEG("수사관", "male"),
    ...INTERMEDIATE,
    channels: ["voice", "sms"],
    demandStages: 2,
  },
  {
    variantId: "fv-c5fj",
    scenarioId: "institutional-impersonation",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "검사라며 본인 명의가 범죄에 쓰였다고 알리고 구속 가능성을 비춘다.",
      "협조하면 조용히 끝난다며 안심시키고, 금융감독기관이 자산 보호를 돕는다고 말한다.",
      "계좌번호보다 거래 은행과 자산 규모부터 묻는다.",
      "은행에서 이유를 물으면 그럴듯한 개인 용도로 둘러대라고 일러 준 뒤(구체적인 문장은 만들어 주지 않는다), 돈을 찾아 담당 직원에게 맡기겠다는 약속을 받아 내려 한다.",
    ),
    keepLabels: ["권위 암시", "불이익 암시", "신원정보 직접 요구", "부인 시 명의 도용 암시", "비밀 유지 요구", "전화 끊음 저지"],
    extraTactics: [
      ASSET_INFO,
      CASH_HANDOFF,
      "안심 유도 — '협조만 하시면 약식으로 조용히 끝납니다' 처럼 위협과 번갈아 안심시켜 경계를 낮춘다.",
    ],
    // D2 · D5(콘텐츠) + D3 · D4(고급 오버레이 — 확인 무력화 카탈로그 보유 → d3_and_d4)
    exitBlock: ["D2_secrecy", "D3_verification_hijack", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [],
    legs: [
      { callerLabel: "검사", speakerGender: "male", minUserTurns: 3, maxUserTurns: 8, stageUntil: 2 },
      {
        callerLabel: "금융감독원 직원",
        speakerGender: "female",
        minUserTurns: 2,
        maxUserTurns: 10,
        personaPrompt:
          "너는 앞 담당자(검사를 사칭한 사람)에게서 통화를 넘겨받은 금융감독기관 직원을 사칭한다. 침착하고 정중한 사무적 존대를 쓰고, 검사 쪽 연락을 받고 자산 보호를 돕는 사람처럼 군다. 앞 담당자의 위협을 되풀이하지 말고 도와드리는 쪽이라는 태도로 신뢰를 얻는다. 실제 부서명 · 이름 · 전화번호는 말하지 않는다.",
      },
    ],
    ...ADVANCED,
    channels: ["voice"],
    demandStages: 2,
    decisionMoment: "돈을 찾아 담당 직원에게 맡기겠다는 약속에 동의하는 순간",
    sources: ["C10", "C11", "C01", "S16", "S11"],
  },
  {
    variantId: "fv-pgqt",
    scenarioId: "institutional-impersonation",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "검사라며 본인 명의 계좌가 범죄에 쓰였다고 알린다.",
      "자산이 범죄수익인지 검수해야 한다며 거래 은행과 자산 규모를 묻는다.",
      "검수를 위해 코인으로 바꿔 지정된 곳으로 옮기라고 요구한다.",
    ),
    keepLabels: ["권위 암시", "긴급성 조성", "불이익 암시", "신원정보 직접 요구", "부인 시 명의 도용 암시", "비밀 유지 요구", "전화 끊음 저지"],
    extraTactics: [ASSET_INFO, COIN_TRANSFER],
    exitBlock: ["D2_secrecy", "D3_verification_hijack", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [],
    legs: ONE_LEG("검사", "male"),
    ...ADVANCED,
    channels: ["voice"],
    demandStages: 2,
    decisionMoment: "코인 구매 · 송금 요구에 따르겠다고 하는 순간",
    sources: ["C09", "S27"],
  },

  // ── card-company-impersonation (§2.6.3 2행 — C03 · C04, S4 · S22 · S14) ─────────────────
  {
    variantId: "fv-aqp6",
    scenarioId: "card-company-impersonation",
    level: "beginner",
    authoring: "authored",
    stages: st("해외 가맹점 고액 결제 시도가 있었다고 놀라게 한다.", "결제를 막아 주겠다며 카드 정보를 곧바로 요구한다."),
    keepLabels: ["놀람 유발", "긴급성 조성", "카드정보 직접 요구", "부인 시 명의 도용 암시", "안심 유도"],
    exitBlock: ["D0_none"],
    sms: [],
    legs: ONE_LEG("카드사 보안팀", "female"),
    ...BEGINNER,
    channels: ["voice"],
    demandStages: 1,
  },
  {
    variantId: "fv-35f2",
    scenarioId: "card-company-impersonation",
    level: "intermediate",
    authoring: "authored",
    stages: st(
      "부정결제 시도를 알린다.",
      "본인 확인이라며 인증번호를 요구한다. 상대가 거부하면 인증번호 없이 다음 단계로 넘어간다.",
      "피해금을 안전한 계좌로 옮겨야 한다며 이체를 요구한다.",
    ),
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    sms: [
      { purpose: "identity", smsId: "card-otp", required: false, notBeforeUserTurns: 2 },
      { purpose: "transfer", smsId: "card-relief-account", required: true, notBeforeUserTurns: 3 },
    ],
    legs: ONE_LEG("카드사 보안팀", "female"),
    ...INTERMEDIATE,
    channels: ["voice", "sms"],
    demandStages: 2,
  },
  {
    variantId: "fv-akj5",
    scenarioId: "card-company-impersonation",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "카드사 상담원이라며 명의 도용 피해가 의심된다고 알린다.",
      "피해가 번지지 않게 휴대폰 보안 점검 앱을 설치하라고 요구한다.",
      "금융당국 조사가 시작됐다며 불안을 키운다.",
      "확인하겠다는 상대를 막지 않고, 확인 뒤에도 같은 요구를 이어 간다.",
      "카드 정보와 피해금 이관을 요구한다.",
    ),
    keepLabels: ["놀람 유발", "긴급성 조성", "카드정보 직접 요구", "피해금 이관 요구", "부인 시 명의 도용 암시", "안심 유도"],
    extraTactics: [APP_INSTALL, AGENCY_PROBE],
    exitBlock: ["D3_verification_hijack", "D4_procedural_legitimacy"],
    sms: [],
    legs: [
      { callerLabel: "카드사 상담원", speakerGender: "female", minUserTurns: 3, maxUserTurns: 8, stageUntil: 2 },
      {
        callerLabel: "금융감독원 직원",
        speakerGender: "male",
        minUserTurns: 2,
        maxUserTurns: 10,
        personaPrompt:
          "너는 앞 담당자(카드사 상담원을 사칭한 사람)에게서 통화를 넘겨받은 금융감독기관 조사 담당자를 사칭한다. 딱딱하고 단호한 사무적 존대를 쓰고, 명의 도용 건 조사를 맡았다는 사람처럼 군다. 앞 담당자가 이미 받은 답은 다시 묻지 않는다. 실제 부서명 · 이름 · 전화번호는 말하지 않는다.",
      },
    ],
    ...ADVANCED,
    channels: ["voice"],
    demandStages: 3,
    decisionMoment: "보안 점검 앱 설치 또는 피해금 이관에 동의하는 순간",
    sources: ["C03", "C04", "S4", "S22"],
  },

  // ── loan-refinance-scam (§2.6.3 3행 — S10 · S19) ─────────────────────────────────────────
  {
    variantId: "fv-bqr9",
    scenarioId: "loan-refinance-scam",
    level: "beginner",
    authoring: "authored",
    stages: st("저금리 대환대출 대상이라고 안내한다.", "신규 대출 승인을 위해 선입금이 필요하다고 곧바로 요구한다."),
    keepLabels: ["권위·정당성 포장", "이익 유혹", "마감 압박", "신규 대출 승인 명목 선입금 요구", "부인 시 이익 전환"],
    exitBlock: ["D1_time_pressure"],
    sms: [{ purpose: "transfer", smsId: "loan-account", required: true, notBeforeUserTurns: 3 }],
    legs: ONE_LEG("캐피탈 상담원", "female"),
    ...BEGINNER,
    channels: ["voice", "sms"],
    demandStages: 1,
  },
  {
    variantId: "fv-avap",
    scenarioId: "loan-refinance-scam",
    level: "intermediate",
    authoring: "authored",
    stages: st(
      "저금리 전환 대상이라고 안내한다.",
      "기존 대출을 먼저 갚아야 전환된다며 상환을 요구한다.",
      "망설이면 조건을 낮춰 다시 요구한다.",
    ),
    // 기존 수법 전부 유지 — "절차·서류 정당화"(D4)도 남긴다(DECISIONS #44 "중급이 기존 시나리오의 수법을
    // 빼앗지 않는다"). AC-096 (b) 중급 축 D 범위와의 차이는 planner 확인 대기 — 테스트 상수에 명시.
    exitBlock: ["D1_time_pressure", "D2_secrecy", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [{ purpose: "transfer", smsId: "loan-account", required: true, notBeforeUserTurns: 3 }],
    legs: ONE_LEG("캐피탈 상담원", "female"),
    ...INTERMEDIATE,
    channels: ["voice", "sms"],
    demandStages: 2,
  },
  {
    variantId: "fv-6s5p",
    scenarioId: "loan-refinance-scam",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "상대 대출 이력을 이미 아는 듯 맞춤 안내라고 말한다. 상대가 말하지 않은 이름 · 금액은 지어내 단정하지 않는다.",
      "대출 심사 전에 보안 점검 앱을 설치하고 쓰던 금융 앱은 잠시 지우라고 요구한다.",
      "절차와 서류를 들어 정식 상담처럼 꾸민다.",
      "기존 대출 상환 또는 선입금을 요구한다.",
    ),
    extraTactics: [
      "개인정보 보유 암시 — '고객님 대출 이력 보고 맞춤으로 연락드렸습니다' 처럼 이미 정보를 아는 듯 말한다. 상대가 말하지 않은 이름 · 금액 · 금융사는 지어내 단정하지 않는다.",
      "보안 앱 설치·금융 앱 삭제 요구 — '심사 전에 ○○안심보안 점검 앱을 설치하시고, 쓰시던 금융 앱은 잠시 지워 주셔야 합니다' 처럼 요구한다. 설치 방법 · 경로 · 권한 설정은 설명하지 않는다.",
    ],
    exitBlock: ["D1_time_pressure", "D2_secrecy", "D3_verification_hijack", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [
      { purpose: "link", smsId: "loan-apply-link", required: false, notBeforeUserTurns: 2 },
      { purpose: "transfer", smsId: "loan-account", required: true, notBeforeUserTurns: 3 },
    ],
    legs: ONE_LEG("캐피탈 상담원", "female"),
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 3,
    sources: ["S10", "S19", "C13", "C22"],
  },

  // ── tax-refund-scam (§2.6.3 4행 — 초급만 저작, 중급 · 고급 "현행") ─────────────────────────
  {
    variantId: "fv-vtq7",
    scenarioId: "tax-refund-scam",
    level: "beginner",
    authoring: "authored",
    stages: st(
      "미수령 환급금이 있다고 알린다.",
      "환급을 받으려면 수수료가 먼저 필요하다며 곧바로 요구하고, 접수는 문자로 보낸 안내에서 하라고 한다.",
    ),
    keepLabels: ["공짜 돈 유혹", "권위 포장", "본인확인 빙자 정보 수집", "환급 수수료 요구", "부인 시 절차 정당화"],
    exitBlock: ["D0_none"],
    sms: [{ purpose: "link", smsId: "tax-refund-link", required: true, notBeforeUserTurns: 2 }],
    legs: ONE_LEG("국세청 환급 담당", "female"),
    ...BEGINNER,
    channels: ["voice", "sms"],
    demandStages: 1,
  },
  {
    variantId: "fv-aqx2",
    scenarioId: "tax-refund-scam",
    level: "intermediate",
    authoring: "current",
    stages: [],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    sms: [{ purpose: "link", smsId: "tax-refund-link", required: true, notBeforeUserTurns: 2 }],
    legs: ONE_LEG("국세청 환급 담당", "female"),
    ...INTERMEDIATE,
    channels: ["voice", "sms"],
    demandStages: 2,
  },
  {
    variantId: "fv-uk7m",
    scenarioId: "tax-refund-scam",
    level: "advanced",
    authoring: "current",
    stages: [],
    exitBlock: ["D2_secrecy", "D3_verification_hijack", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [{ purpose: "link", smsId: "tax-refund-link", required: true, notBeforeUserTurns: 2 }],
    legs: ONE_LEG("국세청 환급 담당", "female"),
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 2,
  },

  // ── courier-customs-scam (§2.6.3 5행) ───────────────────────────────────────────────────
  {
    variantId: "fv-uaee",
    scenarioId: "courier-customs-scam",
    level: "beginner",
    authoring: "authored",
    stages: st("국제 택배가 통관에서 보류됐다고 알린다.", "통관비를 내야 한다며 곧바로 결제를 요구한다."),
    keepLabels: ["생활 밀착형 소재로 경계심 낮추기", "긴급성 조성", "명의 도용 암시", "통관비 결제 요구"],
    exitBlock: ["D0_none"],
    sms: [{ purpose: "transfer", smsId: "courier-customs-fee", required: true, notBeforeUserTurns: 3 }],
    legs: ONE_LEG("택배 고객센터", "female"),
    ...BEGINNER,
    channels: ["voice", "sms"],
    demandStages: 1,
  },
  {
    variantId: "fv-62ak",
    scenarioId: "courier-customs-scam",
    level: "intermediate",
    authoring: "authored",
    stages: st(
      "통관 보류를 알린다.",
      "문자로 보낸 링크에서 통관 정보를 확인하라고 한다.",
      "수수료 결제를 요구한다.",
    ),
    dropLabels: ["개인정보 직접 요구"],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    sms: [
      { purpose: "link", smsId: "courier-customs-link", required: false, notBeforeUserTurns: 2 },
      { purpose: "transfer", smsId: "courier-customs-fee", required: true, notBeforeUserTurns: 3 },
    ],
    legs: ONE_LEG("택배 고객센터", "female"),
    ...INTERMEDIATE,
    channels: ["voice", "sms"],
    demandStages: 2,
  },
  {
    variantId: "fv-xpvu",
    scenarioId: "courier-customs-scam",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "통관 보류를 알린다.",
      "문자로 보낸 링크에서 통관 정보를 확인하라고 한다.",
      "통관 확인에 필요하다며 개인정보를 요구한다.",
      "수수료 결제를 요구한다.",
    ),
    exitBlock: ["D2_secrecy", "D3_verification_hijack", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [
      { purpose: "link", smsId: "courier-customs-link", required: false, notBeforeUserTurns: 2 },
      { purpose: "transfer", smsId: "courier-customs-fee", required: true, notBeforeUserTurns: 3 },
    ],
    legs: ONE_LEG("택배 고객센터", "female"),
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 3,
  },

  // ── bank-security-verify-scam (§2.6.3 6행 — 초급 "보호계좌 직행" · 중급 · 고급 "현행") ─────
  {
    variantId: "fv-xuvu",
    scenarioId: "bank-security-verify-scam",
    level: "beginner",
    authoring: "authored",
    stages: st("계좌에서 비정상 출금 시도가 있었다고 알린다.", "출금을 막으려면 보호계좌로 옮겨야 한다며 곧바로 이체를 요구한다."),
    keepLabels: ["안심 유도", "본인확인 정보 직접 요구", "보호계좌 이체 요구", "긴급성 조성", "부인 시 명의 도용 암시"],
    exitBlock: ["D0_none"],
    sms: [{ purpose: "transfer", smsId: "bank-protect-account", required: true, notBeforeUserTurns: 3 }],
    legs: ONE_LEG("은행 금융사고대응팀", "male"),
    ...BEGINNER,
    channels: ["voice", "sms"],
    demandStages: 1,
  },
  {
    variantId: "fv-mhnv",
    scenarioId: "bank-security-verify-scam",
    level: "intermediate",
    authoring: "current",
    stages: [],
    // 중급 축 D 범위 밖인 D3 라벨만 뺀다(D-54 — "초급 · 중급에서는 D3가 등장하지 않을 뿐").
    dropLabels: ["확인 시도 무력화"],
    exitBlock: ["D0_none"],
    sms: [{ purpose: "transfer", smsId: "bank-protect-account", required: true, notBeforeUserTurns: 3 }],
    legs: ONE_LEG("은행 금융사고대응팀", "male"),
    ...INTERMEDIATE,
    channels: ["voice", "sms"],
    demandStages: 2,
  },
  {
    variantId: "fv-62q8",
    scenarioId: "bank-security-verify-scam",
    level: "advanced",
    authoring: "current",
    stages: [],
    exitBlock: ["D3_verification_hijack", "D4_procedural_legitimacy"],
    sms: [{ purpose: "transfer", smsId: "bank-protect-account", required: true, notBeforeUserTurns: 3 }],
    legs: ONE_LEG("은행 금융사고대응팀", "male"),
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 2,
  },

  // ── kidnapping-threat (§2.6.3 7행 — S26 · C16 · C17) ─────────────────────────────────────
  {
    variantId: "fv-c5ih",
    scenarioId: "kidnapping-threat",
    level: "beginner",
    authoring: "authored",
    stages: st("자녀가 자기 쪽에 있다고 위협한다.", "곧바로 송금을 요구한다."),
    keepLabels: ["명령조·단절적 어조", "냉담한 반응", "여지를 남긴 경고", "즉시 송금 요구", "부인 시 냉담한 떠넘기기", "촉박한 결정 압박"],
    exitBlock: ["D0_none"],
    sms: [],
    legs: ONE_LEG("신원 불상", "male"),
    ...BEGINNER,
    channels: ["voice"],
    demandStages: 1,
  },
  {
    variantId: "fv-dxwu",
    scenarioId: "kidnapping-threat",
    level: "intermediate",
    authoring: "current",
    stages: [],
    // "신고 차단 지시"(D6)를 빼지 않는다 — DECISIONS #44(planner 확인 대기 — AC-096 (b) vs #44).
    exitBlock: ["D2_secrecy", "D5_call_retention", "D6_report_blocking"],
    sms: [],
    legs: ONE_LEG("신원 불상", "male"),
    ...INTERMEDIATE,
    channels: ["voice"],
    demandStages: 2,
  },
  {
    variantId: "fv-k268",
    scenarioId: "kidnapping-threat",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "자녀가 자기 쪽에 있다고 말하고, 아이가 울고 있다고 말로만 전한다.",
      "상대가 먼저 말한 자녀 이름만 되받아 이미 다 알고 있는 척한다.",
      "소액을 즉시 이체하라고 요구하고, 망설이면 금액을 조정해 다시 요구한다.",
    ),
    extraTactics: [
      "가족 정보 언급 — 상대가 먼저 말한 자녀 이름만 되받아 '○○이 지금 여기 있습니다' 처럼 이미 다 아는 척한다. 학원 같은 장소는 '○○학원'처럼 가린 형태로만 말하고, 상대가 말하지 않은 이름은 지어내 단정하지 않는다.",
      "울음 언급 협박 — '지금 옆에서 아이가 울고 있습니다' 처럼 말로만 전해 공포를 키운다. 우는 소리를 흉내 내거나 신체 위해를 묘사하지 않는다.",
    ],
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy", "D5_call_retention", "D6_report_blocking"],
    sms: [],
    legs: ONE_LEG("신원 불상", "male"),
    ...ADVANCED,
    channels: ["voice"],
    demandStages: 2,
    sources: ["S26", "C16", "C17"],
  },

  // ── family-accident-deepvoice (§2.6.3 8행 — S9 · C18). ⚠️ clone = ElevenLabs 경로는 변형 미적용 ──
  {
    variantId: "fv-4dy4",
    scenarioId: "family-accident-deepvoice",
    level: "beginner",
    authoring: "authored",
    stages: st("사고가 났다고 다급하게 알린다.", "합의금이 급하다며 곧바로 송금을 부탁한다."),
    keepLabels: ["다급함 조성", "가족애·죄책감 이용", "권위·긴급상황 암시", "합의금 송금 요구", "부인 시 애정 호소"],
    exitBlock: ["D0_none"],
    sms: [],
    legs: ONE_LEG("가족", "female"),
    ...BEGINNER,
    channels: ["voice"],
    demandStages: 1,
  },
  {
    variantId: "fv-krq3",
    scenarioId: "family-accident-deepvoice",
    level: "intermediate",
    authoring: "current",
    stages: [],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    sms: [],
    legs: ONE_LEG("가족", "female"),
    ...INTERMEDIATE,
    channels: ["voice"],
    demandStages: 2,
  },
  {
    variantId: "fv-66hh",
    scenarioId: "family-accident-deepvoice",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "사고가 났다고 알리며 다른 번호로 연락한 이유를 댄다.",
      "원래 번호로는 연락이 안 된다며 확인을 막는다.",
      "합의금 송금을 요구한다.",
    ),
    extraTactics: [OTHER_NUMBER_PRETEXT],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    sms: [],
    legs: ONE_LEG("가족", "female"),
    ...ADVANCED,
    channels: ["voice"],
    demandStages: 2,
    sources: ["S9", "C18"],
  },

  // ── grandchild-impersonation (§2.6.3 8행 — 같은 줄). ⚠️ clone — 위와 같다 ────────────────
  {
    variantId: "fv-brcb",
    scenarioId: "grandchild-impersonation",
    level: "beginner",
    authoring: "authored",
    stages: st("급한 사정이 생겼다고 알린다.", "곧바로 송금을 부탁한다."),
    keepLabels: ["다급함 조성", "애정·죄책감 이용", "디지털 취약 악용", "송금 직접 요구"],
    exitBlock: ["D0_none"],
    sms: [],
    legs: ONE_LEG("손주", "male"),
    ...BEGINNER,
    channels: ["voice"],
    demandStages: 1,
  },
  {
    variantId: "fv-mabg",
    scenarioId: "grandchild-impersonation",
    level: "intermediate",
    authoring: "current",
    stages: [],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    sms: [],
    legs: ONE_LEG("손주", "male"),
    ...INTERMEDIATE,
    channels: ["voice"],
    demandStages: 2,
  },
  {
    variantId: "fv-cx5y",
    scenarioId: "grandchild-impersonation",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "폰이 고장 나 다른 번호로 걸었다고 한다.",
      "원래 번호로는 연락이 안 된다며 확인을 막는다.",
      "송금을 요구하고, 어려우면 상품권으로 바꿔 다시 요구한다.",
    ),
    extraTactics: [OTHER_NUMBER_PRETEXT],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    sms: [],
    legs: ONE_LEG("손주", "male"),
    ...ADVANCED,
    channels: ["voice"],
    demandStages: 2,
    sources: ["S9", "C18"],
  },

  // ── messenger-child-impersonation-kakao (§2.6.3 9행 — C15 · S6) ──────────────────────────
  {
    variantId: "fv-34v5",
    scenarioId: "messenger-child-impersonation-kakao",
    level: "beginner",
    authoring: "authored",
    stages: st("폰이 고장 나 친구 폰으로 연락한다고 한다.", "곧바로 송금을 부탁한다."),
    keepLabels: ["다급함 조성", "가족애·죄책감 이용", "채널 전환 유도", "송금 직접 요구"],
    exitBlock: ["D0_none"],
    sms: [],
    legs: ONE_LEG("자녀", "female"),
    ...BEGINNER,
    channels: ["messenger"],
    demandStages: 1,
  },
  {
    variantId: "fv-tpr3",
    scenarioId: "messenger-child-impersonation-kakao",
    level: "intermediate",
    authoring: "current",
    stages: [],
    exitBlock: ["D2_secrecy"],
    sms: [],
    legs: ONE_LEG("자녀", "female"),
    ...INTERMEDIATE,
    channels: ["messenger"],
    demandStages: 1,
  },
  {
    variantId: "fv-tdgg",
    scenarioId: "messenger-child-impersonation-kakao",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "폰 액정이 깨졌다고 한다.",
      "보험 처리에 앱 설치가 필요하다며 설치를 부탁한다.",
      "보험 접수에 신분증 사진이 필요하다고 한다.",
      "급한 돈 송금을 부탁한다.",
    ),
    extraTactics: [
      "보험 처리 앱 설치 요구 — '액정 보험 처리하려면 ○○보험접수 앱을 깔아야 한대' 처럼 이름만 대고 설치를 부탁한다. 설치 방법 · 경로 · 권한 설정은 설명하지 않는다.",
      "신원정보 직접 요구 — '보험 접수에 엄마 신분증 사진이 필요하대, 찍어서 보내 줘' 처럼 신분증 사진을 직접 요구한다.",
    ],
    exitBlock: ["D2_secrecy"],
    sms: [],
    legs: ONE_LEG("자녀", "female"),
    ...ADVANCED,
    channels: ["messenger"],
    demandStages: 3,
    sources: ["C15", "S6"],
  },

  // ── messenger-friend-loan / parcel / subsidy · reputation-blackmail — §2.6.3 세 난이도 "현행" ──
  ...(["beginner", "intermediate", "advanced"] as const).map(
    (level, i): VariantSpec => ({
      variantId: ["fv-42wd", "fv-fvsc", "fv-bxvp"][i],
      scenarioId: "messenger-friend-loan-kakao",
      level,
      authoring: "current",
      stages: [],
      exitBlock: ["D0_none"],
      sms: [],
      legs: ONE_LEG("지인", "male"),
      ...[BEGINNER, INTERMEDIATE, ADVANCED][i],
      channels: ["messenger"],
      demandStages: [1, 2, 2][i],
    }),
  ),
  {
    variantId: "fv-prr3",
    scenarioId: "messenger-parcel-smishing-sms",
    level: "beginner",
    authoring: "current",
    stages: [],
    dropLabels: ["확인 절차 차단"],
    exitBlock: ["D0_none"],
    sms: [],
    legs: ONE_LEG("택배 배송 안내", "female"),
    ...BEGINNER,
    channels: ["messenger"],
    demandStages: 1,
  },
  {
    variantId: "fv-tvq2",
    scenarioId: "messenger-parcel-smishing-sms",
    level: "intermediate",
    authoring: "current",
    stages: [],
    exitBlock: ["D2_secrecy"],
    sms: [],
    legs: ONE_LEG("택배 배송 안내", "female"),
    ...INTERMEDIATE,
    channels: ["messenger"],
    demandStages: 1,
  },
  {
    variantId: "fv-g454",
    scenarioId: "messenger-parcel-smishing-sms",
    level: "advanced",
    authoring: "current",
    stages: [],
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy"],
    sms: [],
    legs: ONE_LEG("택배 배송 안내", "female"),
    ...ADVANCED,
    channels: ["messenger"],
    demandStages: 2,
  },
  {
    variantId: "fv-rizf",
    scenarioId: "messenger-subsidy-smishing-sms",
    level: "beginner",
    authoring: "current",
    stages: [],
    dropLabels: ["확인 절차 차단"],
    exitBlock: ["D0_none"],
    sms: [],
    legs: ONE_LEG("지원금 안내센터", "female"),
    ...BEGINNER,
    channels: ["messenger"],
    demandStages: 1,
  },
  {
    variantId: "fv-afbr",
    scenarioId: "messenger-subsidy-smishing-sms",
    level: "intermediate",
    authoring: "current",
    stages: [],
    exitBlock: ["D2_secrecy"],
    sms: [],
    legs: ONE_LEG("지원금 안내센터", "female"),
    ...INTERMEDIATE,
    channels: ["messenger"],
    demandStages: 2,
  },
  {
    variantId: "fv-hu8w",
    scenarioId: "messenger-subsidy-smishing-sms",
    level: "advanced",
    authoring: "current",
    stages: [],
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy"],
    sms: [],
    legs: ONE_LEG("지원금 안내센터", "female"),
    ...ADVANCED,
    channels: ["messenger"],
    demandStages: 2,
  },
  {
    variantId: "fv-9nx7",
    scenarioId: "reputation-blackmail-scam",
    level: "beginner",
    authoring: "current",
    stages: [],
    // 초급 축 D 범위(D0 또는 D1 1개까지) 밖 라벨만 뺀다 — D1 "노골적 시간 압박" 1개는 남는다.
    dropLabels: ["비밀 유지 미끼", "확인 차단", "주변 확인 차단", "전화 끊음 저지"],
    exitBlock: ["D1_time_pressure"],
    sms: [{ purpose: "transfer", smsId: "blackmail-hush-account", required: true, notBeforeUserTurns: 3 }],
    legs: ONE_LEG("신원 불상", "male"),
    ...BEGINNER,
    channels: ["voice", "sms"],
    demandStages: 1,
  },
  {
    variantId: "fv-kwph",
    scenarioId: "reputation-blackmail-scam",
    level: "intermediate",
    authoring: "current",
    stages: [],
    exitBlock: ["D1_time_pressure", "D2_secrecy", "D5_call_retention"],
    sms: [{ purpose: "transfer", smsId: "blackmail-hush-account", required: true, notBeforeUserTurns: 3 }],
    legs: ONE_LEG("신원 불상", "male"),
    ...INTERMEDIATE,
    channels: ["voice", "sms"],
    demandStages: 2,
  },
  {
    variantId: "fv-egum",
    scenarioId: "reputation-blackmail-scam",
    level: "advanced",
    authoring: "current",
    stages: [],
    exitBlock: ["D1_time_pressure", "D2_secrecy", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [{ purpose: "transfer", smsId: "blackmail-hush-account", required: true, notBeforeUserTurns: 3 }],
    legs: ONE_LEG("신원 불상", "male"),
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 2,
  },

  // ── 고급 전용 3종(PRD AC-097 (a) · §2.6.4 1~3행) — 시나리오 자체가 변형이다 ──────────────
  {
    variantId: "fv-tvnj",
    scenarioId: "card-delivery-call",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "카드 배송 일정을 안내하며 말을 건다.",
      "카드를 신청하지 않았다면 명의 도용 사고라며 사고 접수로 넘긴다.",
      "본인 확인 뒤 휴대폰 보안 점검 앱을 설치하라고 요구한다.",
      "금융당국 조사가 시작됐다며 불안을 키우고, 확인하겠다는 상대를 막지 않는다.",
      "조사가 끝날 때까지 자산을 보호 계좌로 옮기라고 요구한다.",
    ),
    exitBlock: ["D3_verification_hijack", "D4_procedural_legitimacy"],
    sms: [],
    legs: [
      { callerLabel: "카드 배송 안내", speakerGender: "female", minUserTurns: 3, maxUserTurns: 8, stageUntil: 3 },
      {
        callerLabel: "금융감독원 직원",
        speakerGender: "male",
        minUserTurns: 2,
        maxUserTurns: 10,
        personaPrompt:
          "너는 앞 담당자(카드 배송 · 사고 접수 상담원을 사칭한 사람)에게서 통화를 넘겨받은 금융감독기관 조사 담당자를 사칭한다. 딱딱하고 단호한 사무적 존대를 쓰고, 명의 도용 사고 조사를 맡았다는 사람처럼 군다. 앞 담당자가 이미 받은 답은 다시 묻지 않는다. 실제 부서명 · 이름 · 전화번호는 말하지 않는다.",
      },
    ],
    ...ADVANCED,
    channels: ["voice"],
    demandStages: 3,
    decisionMoment: "보안 점검 앱 설치 또는 자산 보호 이체에 동의하는 순간",
    sources: ["C03", "C04", "S4", "S22"],
  },
  {
    variantId: "fv-bmiq",
    scenarioId: "asset-protection-notice-call",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "본인 명의 계좌가 범죄에 쓰인 정황이 있다고 알린다.",
      "본인 확인 뒤 계좌번호보다 거래 은행과 자산 규모부터 묻는다.",
      "비공개 진행을 강조하고, 은행에서 이유를 물으면 그럴듯한 개인 용도로 둘러대라고 일러 준다. 구체적인 문장은 만들어 주지 않는다.",
      "보관 조치 절차를 설명하며 돈을 찾아 담당 직원에게 맡기겠다는 약속을 받아 내려 한다. 만날 장소 · 시간 · 주소는 정하지도 묻지도 않는다.",
    ),
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy"],
    sms: [],
    legs: ONE_LEG("금융감독원 직원", "male"),
    ...ADVANCED,
    channels: ["voice"],
    demandStages: 2,
    // PRD AC-097 (e) 확정 전 기본값 = 설계 초안 안(주소 발화는 조건이 아니다 — AC-024).
    decisionMoment: "인출 · 전달 약속에 동의하는 순간",
    sources: ["C10", "C11", "C02", "S16", "S11"],
  },
  {
    variantId: "fv-nss6",
    scenarioId: "prosecution-cooperation-call",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "범죄 연루와 구속 가능성을 알린다.",
      "영장이 청구됐다고 말로만 전한다.",
      "비공개 수사라며 주변에 알리지 말고 혼자 있으라고 요구한다. 어디로 가라 · 무엇을 마련하라는 말은 하지 않는다.",
      "끊지 말고 수시로 진행 상황을 알려 달라고 한다.",
      "자산 검수를 위해 코인으로 바꿔 지정된 곳으로 옮기라고 요구한다.",
    ),
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [],
    legs: ONE_LEG("검찰 수사관", "male"),
    ...ADVANCED,
    channels: ["voice"],
    demandStages: 2,
    decisionMoment: "코인 구매 · 송금 약속에 동의하는 순간",
    sources: ["C05", "C06", "C07", "C08", "S3", "S25", "S28"],
  },
];

/** 흐름 변형 전체(서버 전용). 순서 = 회전 순서(같은 시나리오 · 난이도 안에서). */
export const FLOW_VARIANTS: readonly FlowVariant[] = SPECS.map(compile);

/** 저작 입력 — 테스트 전용 대조(keep/drop 라벨이 원천에 실재하는지 · "현행" 행 확인). */
export const FLOW_VARIANT_SPECS: readonly Readonly<VariantSpec>[] = SPECS;

/** 그 시나리오 · 난이도에 허용된 변형(회전 순서). */
export function listFlowVariants(scenarioId: string, level: DifficultyLevel): FlowVariant[] {
  return FLOW_VARIANTS.filter((v) => v.scenarioId === scenarioId && v.level === level);
}

export function findFlowVariant(variantId: string | undefined): FlowVariant | undefined {
  if (!variantId) return undefined;
  return FLOW_VARIANTS.find((v) => v.variantId === variantId);
}

// ── 프롬프트 합성 — buildSystemPrompt 시그니처 무변경(ScenarioPromptDoc 모양을 돌려준다) ───────

const FLOW_BLOCK_HEADER = "[이번 통화의 흐름]";
const FLOW_BLOCK_LEAD =
  "아래 순서를 기준으로 진행하되, 상대의 반응에 맞춰 한 단계에 더 머물거나 건너뛰어도 된다. 목록 밖 단계를 새로 만들지 않는다.";
const SINGLE_SPEAKER_RULE =
  "이 흐름에 다른 기관 사람이 등장하더라도 통화는 처음부터 끝까지 너 혼자 맡는다. 다른 담당자에게 넘기겠다거나 바꿔 드리겠다는 말은 하지 않고, 그 기관의 판단은 네가 전해 들은 것처럼 말한다.";
const SINGLE_SPEAKER_VERIFY_EXCEPTION = "확인 창구 안내 지시가 따로 들어온 턴에는 그 지시를 따른다.";

/** T191 S7 — 다음 leg 화자 페르소나 블록 머리(시나리오 persona의 [캐릭터]를 이 사람으로 바꾼다). */
export const RELAY_LEG_ROLE_HEADER = "[이번 통화에서 네 역할 — 위 [캐릭터]보다 우선한다]";

/**
 * 교대 방법(경로별). 실시간 = Live 도구 `transfer_call` · 텍스트 폴백 = 서버가 턴마다 허락을 알려 주고 응답 끝 신호.
 * 부재(리포트 · 오프닝처럼 교대가 일어나지 않는 호출부) = 방법 문장 없이 순서만.
 */
export type RelayTransferVia = "tool" | "marker";

export type ResolveRelayOptions = {
  /** 지금 말하는 leg(0-기반). 부재 = 0. */
  legIndex?: number;
  /** 서버가 마스킹 저장본으로 만든 인계 블록(`realtime/relayHandoff.ts`). leg ≥ 1에서만 붙는다. */
  handoff?: string;
  transferVia?: RelayTransferVia;
  /** T191 S7(#140) — 확인 창구 새 연결은 leg 0에서도 인계 블록을 붙인다(새 사람이 앞 대화를 이어받는다). */
  handoffAlways?: boolean;
  /** T191 S7(#140) — 확인 창구 새 연결: 이 화자 뒤로는 교대하지 않는다(다음 leg 규칙 · 도구 안내 0). */
  noFurtherTransfer?: boolean;
};

/** 변형에 실행 가능한 화자 교대가 있는가(S7 롤백 손잡이 `RELAY_RUNTIME_AVAILABLE`과 함께 본다). */
export function isRelayVariant(variant: FlowVariant | undefined): variant is FlowVariant {
  return Boolean(variant) && RELAY_RUNTIME_AVAILABLE && (variant as FlowVariant).legs.length > 1;
}

/** leg i가 맡는 단계 범위(1-기반, 양 끝 포함). 데이터 게이트가 `stageUntil` 단조 증가를 고정한다. */
export function legStageRange(variant: FlowVariant, legIndex: number): { from: number; to: number } {
  const from = legIndex === 0 ? 1 : (variant.legs[legIndex - 1]?.stageUntil ?? 0) + 1;
  const to = variant.legs[legIndex]?.stageUntil ?? variant.stages.length;
  return { from, to };
}

/**
 * 메시지 문서 `speakerLabel`(UX 계약 C-8) — **교대 뒤** leg의 화자 표기. leg 0 · 교대 없는 변형 · 범위 밖이면
 * 부재(교대 전 줄은 표기하지 않는다 — D-105 (3)).
 */
export function relaySpeakerLabel(variant: FlowVariant | undefined, legIndex: number | undefined): string | undefined {
  if (!isRelayVariant(variant) || !legIndex || legIndex < 1) return undefined;
  return variant.legs[legIndex]?.callerLabel;
}

/**
 * 변형을 합성한 시나리오 프롬프트(`personaPrompt` · `weakenedTactics` · `guardrailPreamble`).
 * - `current` 변형: 페르소나 무변경 · 수법만 변형 목록(대부분 원본과 같다).
 * - `authored` 변형: 페르소나 끝에 [이번 통화의 흐름] 블록 · 수법은 변형 목록.
 * - 릴레이 변형(T191 S7): leg 0은 자기 단계 뒤 다음 화자에게 넘기는 규칙, leg ≥ 1은 [이번 통화에서 네 역할]
 *   블록(그 leg 페르소나) + 자기 단계 + 서버 인계 블록. ⛔ 인계 블록은 호출부가 서버 마스킹본으로 만든 것만
 *   받는다(설계 X2 — 클라 요약 금지).
 * - 가드레일 원문은 그대로 넘긴다 — 조립 순서(가드레일 최후미)는 `buildSystemPrompt`가 강제한다. 인계 블록은
 *   persona 안이라 난이도 블록보다 **앞**이다(T191 릴레이 설계 "블록 위치").
 */
export function resolveVariantPrompt(
  base: ScenarioPromptDoc,
  variant: FlowVariant,
  legIndex = 0,
  relay: Omit<ResolveRelayOptions, "legIndex"> = {},
): ScenarioPromptDoc {
  const relaying = isRelayVariant(variant);
  const leg = relaying ? Math.min(Math.max(0, Math.trunc(legIndex)), variant.legs.length - 1) : 0;
  const blocks: string[] = [];
  if (leg > 0) {
    blocks.push(`${RELAY_LEG_ROLE_HEADER}\n${variant.legs[leg]?.personaPrompt ?? ""}`);
  }
  if (variant.stages.length > 0) blocks.push(buildFlowBlock(variant, leg, relay.transferVia, relay.noFurtherTransfer));
  if ((leg > 0 || relay.handoffAlways) && relay.handoff) blocks.push(relay.handoff);
  const personaPrompt =
    blocks.length === 0 ? base.personaPrompt : `${base.personaPrompt}\n\n${blocks.join("\n\n")}`;
  return {
    ...base,
    personaPrompt,
    weakenedTactics: [...variant.tactics],
  };
}

function buildFlowBlock(
  variant: FlowVariant,
  legIndex: number,
  transferVia?: RelayTransferVia,
  noFurtherTransfer = false,
): string {
  const lines = [FLOW_BLOCK_HEADER, FLOW_BLOCK_LEAD];
  variant.stages.forEach((stage, i) => lines.push(`${i + 1}. ${stage.summary}`));
  if (variant.legs.length > 1 && !RELAY_RUNTIME_AVAILABLE) {
    lines.push(
      hasVerifyIntercept(variant.scenarioId)
        ? `${SINGLE_SPEAKER_RULE} ${SINGLE_SPEAKER_VERIFY_EXCEPTION}`
        : SINGLE_SPEAKER_RULE,
    );
  } else if (isRelayVariant(variant)) {
    lines.push(...buildRelayRules(variant, legIndex, transferVia, noFurtherTransfer));
  }
  return lines.join("\n");
}

function buildRelayRules(
  variant: FlowVariant,
  legIndex: number,
  transferVia?: RelayTransferVia,
  noFurtherTransfer = false,
): string[] {
  const { from, to } = legStageRange(variant, legIndex);
  const next = noFurtherTransfer ? undefined : variant.legs[legIndex + 1];
  const rules: string[] = [];
  if (legIndex > 0) {
    rules.push(
      `앞 담당자가 1~${from - 1}단계를 이미 진행했다. 너는 ${from}단계부터 이어서 진행하고, 앞 담당자가 한 말을 처음부터 되풀이하지 않는다.`,
    );
  }
  if (next) {
    rules.push(
      `[교대] 너는 ${from}~${to}단계까지만 맡고, 그다음은 '${next.callerLabel}'에게 통화를 넘긴다. 그 뒤 단계를 네가 직접 진행하지 않는다. 넘기는 것은 허락을 받은 때에만 하고, 넘길 때는 그 담당자에게 연결해 주겠다는 한 문장만 말하며 새 요구를 붙이지 않는다.`,
    );
    if (transferVia === "tool") {
      rules.push("넘길 때가 되었다고 판단되면 transfer_call 도구를 불러 허락을 받고, 돌아온 안내를 따른다.");
    } else if (transferVia === "marker") {
      rules.push("넘겨도 되는 턴에는 그 사실이 따로 안내된다. 안내가 없는 턴에는 넘긴다는 말을 하지 않는다.");
    }
  } else if (legIndex > 0 || noFurtherTransfer) {
    rules.push("이 통화를 다른 사람에게 다시 넘기지 않는다. 남은 단계는 네가 끝까지 맡는다.");
  }
  if (hasVerifyIntercept(variant.scenarioId)) rules.push(SINGLE_SPEAKER_VERIFY_EXCEPTION);
  return rules;
}

/**
 * 세션(또는 리포트)의 시나리오 프롬프트를 해석하는 **단일 지점**(호출부: sendMessage · 오프닝 ·
 * Gemini Live 토큰 · 리포트 · 릴레이 leg 토큰). `flowVariantId` 부재 = 과거 세션 → 원본 그대로(무소급 — AC-096 (f)).
 * ID가 있는데 데이터에 없거나 다른 시나리오 것이면 원본으로 강등하고 경고 1줄(관측 가능 — 조용한 임의
 * 변형 0). 시나리오 자체가 없으면 undefined(호출부가 기존처럼 오류 처리한다).
 * `relay` 부재 = leg 0 · 교대 방법 문장 없음(S5와 같은 호출 형태).
 */
export function resolveSessionScenarioPrompt(
  scenarioId: string,
  flowVariantId?: string,
  relay?: ResolveRelayOptions,
): ScenarioPromptDoc | undefined {
  const base = SCENARIO_PROMPTS[scenarioId];
  if (!base) return undefined;
  if (!flowVariantId) return base;
  const variant = findFlowVariant(flowVariantId);
  if (!variant || variant.scenarioId !== scenarioId) {
    console.warn(
      JSON.stringify({ event: "flow_variant_unresolved", scenarioId, reason: variant ? "scenario_mismatch" : "unknown_id" }),
    );
    return base;
  }
  return resolveVariantPrompt(base, variant, relay?.legIndex ?? 0, {
    ...(relay?.handoff ? { handoff: relay.handoff } : {}),
    ...(relay?.transferVia ? { transferVia: relay.transferVia } : {}),
    ...(relay?.handoffAlways ? { handoffAlways: true } : {}),
    ...(relay?.noFurtherTransfer ? { noFurtherTransfer: true } : {}),
  });
}

/**
 * 초급 사전 브리핑 라벨(UX 계약 C-3 · D-108 · AC-096 (e)) — 그 시나리오 **초급 변형 전부**의 수법
 * 라벨 교집합(첫 변형의 순서 유지). 초급 변형이 없으면(고급 전용) 빈 배열.
 * ⇒ 어느 변형이 배정돼도 *"브리핑 라벨 ⊆ 배정 변형 수법"* 이 성립한다.
 */
export function beginnerBriefingLabels(scenarioId: string): string[] {
  const variants = listFlowVariants(scenarioId, "beginner");
  if (variants.length === 0) return [];
  const labelSets = variants.map((v) => v.tactics.map((t) => extractTacticLabel(t)).filter(Boolean));
  const [first, ...rest] = labelSets;
  const out: string[] = [];
  for (const label of first) {
    if (out.includes(label)) continue;
    if (rest.every((set) => set.includes(label))) out.push(label);
  }
  return out;
}
