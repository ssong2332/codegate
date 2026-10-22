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
// ⚠️ **문자(`sms`)는 S5b부터 실제 동작이다** — 발송 판정(`inCallSms/smsGate.ts` `resolveSmsGate`)의 허용 집합 ·
// 하한(`notBeforeUserTurns`) · 백스톱 강제 여부(`required`)가 이 선언에서 나온다. 문자 본문은 여전히 카탈로그
// (`inCallSms.ts`)가 원천이다(이 파일은 그 파일을 import하지 않는다 — 순환 회피). 선언과 카탈로그의 정합(smsId 존재)은
// 테스트가 고정한다.
//
// ⚠️ **릴레이(인원 ≥ 2)는 S7 전까지 한 화자로 진행한다.** `legs`는 S7(`startRelayLeg`)이 쓸 데이터이고,
// 지금은 `resolveVariantPrompt`가 0번 leg 하나로 전체 단계를 진행하게 하며 *"다른 담당자에게 넘긴다"*
// 는 말을 하지 않게 한다(`RELAY_RUNTIME_AVAILABLE = false`).
import type { DifficultyLevel } from "../shared/difficulty";
import type { ScenarioPromptDoc } from "../shared/types";
import type { AxisExitBlock } from "./axes";
import { SCENARIO_PROMPTS } from "./index";
import { PARCEL_ADVANCED_INSTALL_TACTIC, PARCEL_ADVANCED_LEG_PERSONA } from "./messengerParcelSmishingSms.prompt";
import { CARD_DELIVERY_PERSONA } from "./cardDeliveryCall.prompt";
import { ASSET_CUSTODY_PROCEDURE_TACTIC } from "./assetProtectionNoticeCall.prompt";
import {
  PROSECUTION_CASE_LINK_PERSONA,
  PROSECUTION_CASE_LINK_TACTIC,
  PROSECUTION_CASE_RECORD_TACTIC,
  PROSECUTION_WALLET_COIN_TACTIC,
  PROSECUTION_WALLET_EXTRA_TACTICS,
  PROSECUTION_WALLET_PERSONA,
  PROSECUTION_SITE_COIN_TACTIC,
  PROSECUTION_SITE_EXTRA_TACTICS,
  PROSECUTION_SITE_PERSONA,
} from "./prosecutionCooperationCall.prompt";
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
  /** 0번 leg는 시나리오 persona를 재사용한다(부재). 다음 leg persona는 S7에서 저작한다. */
  personaPrompt?: string;
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
  /**
   * T194-a(docs/Architecture.md §84.4.2 · PRD AC-106 (i) · G581) — 이 변형에 메신저 → 통화 단계가 있는가.
   * ⛔ `false`를 쓰지 않는다 — **부재가 거짓**이다. 같은 (시나리오 × 난이도)의 허용 변형은 이 값이 모두 같아야 하고
   * (UX-025 · 시작 고지가 (시나리오 × 난이도) 값으로 갈리므로 — 하나라도 다르면 안내 유무가 배정 변형을 드러낸다),
   * 그 값은 공개 메타 술어 `resolveScenarioEscalation`과 같아야 한다(테스트가 고정한다). 런타임 전이 판정은 이 필드가 아니라
   * 그 술어가 한다(`scenarios/escalation.ts`).
   */
  escalatesToVoice?: true;
  /**
   * §92.3(DECISIONS #206) — **배정 은퇴**. 옛 세션 · 리포트 해석(`findFlowVariant` · `resolveSessionScenarioPrompt`)에는 그대로 쓰이지만
   * `listFlowVariants`(= 배정 풀 · 브리핑 라벨의 입력)에서는 빠진다. ⛔ `false`를 쓰지 않는다 — 부재가 거짓이다.
   */
  retired?: true;
};

/** S7(릴레이 재연결) 구현 전에는 false — legs ≥ 2 변형도 한 화자로 진행한다. */
export const RELAY_RUNTIME_AVAILABLE = false;

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

// ── 2026-10-21(사용자 실기 신고) — 기관 사칭 고급 공통: 인증번호 → 안전계좌 링크 이체 화면(아래 fv-c5fj 주석) ──────────────
// ⛔ 이체는 **문자 링크로 연 이체 화면에서만** 하게 한다(UX-023 · D-115 — 계좌는 미리 채워져 있고 금액만 참가자가 넣는다). 은행 앱 ·
//    창구 · ATM에서 "알아서" 이체하라는 말이 나오지 않게 단계 · 수법 문면 둘 다에 적는다. 계좌 · 금액 값은 문자 · 화면이 원천이다.
const INSTITUTION_ADVANCED_OTP_STAGE =
  "본인 확인 마지막 절차라며 문자로 간 인증번호를 불러 달라고 요구한다. 상대가 거부하면 불이익을 한 번 더 암시한 뒤 인증번호 없이 다음 단계로 넘어간다.";
const INSTITUTION_ADVANCED_LINK_TRANSFER_STAGE =
  "자산을 보호해야 한다며 문자로 보낸 안전계좌 안내의 링크를 열게 하고, 그 화면에서 금액을 직접 넣어 이체를 마치라고 요구한다. 은행 앱이나 창구에서 따로 이체하라고 하지 않는다.";
const INSTITUTION_OTP_DEMAND =
  "인증번호 요구 — '본인 확인 마지막 절차입니다, 방금 문자로 간 인증번호 여섯 자리 불러 주십시오' 처럼 문자로 도착한 인증번호를 불러 달라고 요구한다. 번호는 네가 지어내 말하지 않는다.";
const INSTITUTION_LINK_TRANSFER =
  "이체 화면 유도 — '문자로 보낸 안내의 링크를 눌러 보시면 안전계좌는 이미 들어가 있습니다, 금액만 넣고 이체 누르시면 됩니다' 처럼 문자 속 링크의 이체 화면에서 직접 이체하게 한다. 은행 앱·창구·ATM에서 따로 보내라고 하지 않는다.";
const INSTITUTION_ADVANCED_SMS: FlowVariantSms[] = [
  { purpose: "identity", smsId: "institution-otp", required: true, notBeforeUserTurns: 2 },
  { purpose: "transfer", smsId: "institution-safe-account", required: true, notBeforeUserTurns: 4 },
];
const INSTITUTION_ADVANCED_DECISION_MOMENT = "문자 링크로 연 안전계좌 이체 화면에서 금액을 넣고 이체하기를 누르는 순간";
const APP_INSTALL = { from: "card-delivery-call", label: "보안 점검 앱 설치 요구" };
const AGENCY_PROBE = { from: "card-delivery-call", label: "기관 조사 언급" };
// §92 — 카드 배송 흐름(fv-tvnj 원본 · 카드사 흡수 변형 fv-w3dq가 공유 — 문구 사본 0).
const CARD_DELIVERY_STAGES = [
  "카드 배송 일정을 안내하며 말을 건다.",
  "카드를 신청하지 않았다면 명의 도용 사고라며 사고 접수로 넘긴다.",
  "본인 확인 뒤 휴대폰 보안 점검 앱을 설치하라고 요구한다.",
  "금융당국 조사가 시작됐다며 불안을 키우고, 확인하겠다는 상대를 막지 않는다.",
  "조사가 끝날 때까지 자산을 보호 계좌로 옮기라고 요구한다.",
] as const;
const CARD_DELIVERY_DECISION_MOMENT = "보안 점검 앱 설치 또는 자산 보호 이체에 동의하는 순간";
// §92 ③ — 원본(`cardDeliveryCall.prompt.ts`)과 라벨 · 뒷부분이 같고, 인용 예시만 카드사 요구 머리(*"성함부터 불러주세요"*)로 바꿨다.
const CARD_DELIVERY_IDENTITY_DEMAND =
  "본인확인 정보 직접 요구 — '사고 접수는 본인 확인부터라서요, 성함부터 불러주세요' 처럼 신원 정보를 직접 요구한다. 상대가 카드를 신청한 적 없다고 부인해도 '그러면 명의 도용 여부부터 확인해야 합니다' 라며 같은 요구를 다른 근거로 다시 꺼낸다 — 이 요구는 상대가 무엇을 부인하든 꺼낼 수 있다.";

// §92.3 — 자산 보호 · 검찰 고급의 옛 변형(은퇴)과 새 변형이 공유하는 문구(사본 0 — 옛 변형 바이트 무변경).
const ASSET_PROTECTION_STAGES_HEAD = [
  "본인 명의 계좌가 범죄에 쓰인 정황이 있다고 알린다.",
  "본인 확인 뒤 계좌번호보다 거래 은행과 자산 규모부터 묻는다.",
  "비공개 진행을 강조하고, 은행에서 이유를 물으면 그럴듯한 개인 용도로 둘러대라고 일러 준다. 구체적인 문장은 만들어 주지 않는다.",
] as const;
const ASSET_PROTECTION_HANDOFF_STAGE =
  "보관 조치 절차를 설명하며 돈을 찾아 담당 직원에게 맡기겠다는 약속을 받아 내려 한다. 만날 장소 · 시간 · 주소는 정하지도 묻지도 않는다.";
const ASSET_PROTECTION_DECISION_MOMENT = "인출 · 전달 약속에 동의하는 순간";
const ASSET_PROTECTION_SOURCES = ["C10", "C11", "C02", "S16", "S11"];
/** 검찰 고급 단계 — 영장 단계(2번째)만 옛 · 새 변형이 다르다. */
const PROSECUTION_STAGES = [
  "범죄 연루와 구속 가능성을 알린다.",
  "비공개 수사라며 주변에 알리지 말고 혼자 있으라고 요구한다. 어디로 가라 · 무엇을 마련하라는 말은 하지 않는다.",
  "끊지 말고 수시로 진행 상황을 알려 달라고 한다.",
  "자산 검수를 위해 코인으로 바꿔 지정된 곳으로 옮기라고 요구한다.",
] as const;
const PROSECUTION_DECISION_MOMENT = "코인 구매 · 송금 약속에 동의하는 순간";
// §98(2026-10-21 사용자 실기 신고) — 검찰 고급 fv-c8wq: 코인 전환을 단계로 펼치고 보관 지갑 송금 화면 · 송금 뒤 추가 요구 · 거부 시 격상을 끝단에 둔다.
const PROSECUTION_CASE_LINK_STAGE =
  "영장이 청구됐다며 문자로 보낸 사건 조회 링크에서 본인 확인 뒤 사건 기록을 직접 확인하라고 한다.";
const PROSECUTION_WALLET_STAGES_TAIL = [
  "자산 검수 대상이라며 거래 은행과 예금 · 적금 규모를 묻고, 빠뜨리면 증거 은닉으로 본다고 압박한다.",
  "예금을 본인 명의 OO거래소 계좌로 옮겨 코인으로 바꾸라고 한 단계씩 지시하고, 은행 · 거래소에서 이유를 물으면 개인 용도라고만 하라고 이른다. 앱의 버튼 · 메뉴 · 인증 절차는 설명하지 않는다.",
  "바꾼 코인은 문자로 보낸 검수 전용 보관 지갑 안내의 링크 화면에서 지갑 번호와 금액을 넣어 전송하게 한다. 다른 곳으로 따로 보내라고 하지 않는다.",
  "전송을 마치면 결과를 알린 뒤 곧바로 남은 예금 · 적금 · 대출 가능액도 검수 대상이라며 추가로 바꿔 보내라고 요구하고, 피해자로 확인되면 돌려준다고 안심시킨다. 검수 기간이나 나중에 연락하겠다는 말로 통화를 정리하지 않는다.",
  "상대가 거부하거나 의심하면 구속영장 집행 · 계좌 동결 · 가족 조사로 위협을 올리고, 오늘만 마치면 조용히 끝난다는 회유와 번갈아 쓴다.",
] as const;
const PROSECUTION_WALLET_DECISION_MOMENT = "문자 링크로 연 보관 지갑 화면에서 지갑 번호와 금액을 넣고 전송하기를 누르는 순간";
// §101(2026-10-21 사용자 요청) — 검찰 고급 fv-h3vn: 통화는 문자로 보낸 자산 검수 사이트로 보내고 진행만 재촉한다. 전환 · 이체 절차는 말로 설명하지 않고
// 참가자가 모의 사이트(`asset-check-site`)에서 직접 누른다. 앞 2단계(자산 진술)와 끝 2단계(추가 요구 · 거부 시 격상)의 뜻은 fv-c8wq와 같다.
const PROSECUTION_SITE_STAGES_TAIL = [
  PROSECUTION_WALLET_STAGES_TAIL[0],
  "문자로 보낸 자산 검수 링크로 사이트에 들어가 본인 확인부터 하고 화면 안내대로만 진행하라고 한다. 거래소 가입 · 계좌 이동 · 코인 구매 · 지갑 송금의 순서나 방법은 말로 설명하지 않는다.",
  "사이트를 진행하는 동안 \"지금 어느 화면까지 하셨어요?\"처럼 한 단계마다 확인하고, 멈추면 오늘 안에 이체까지 끝내야 한다고 재촉한다. 막혔다고 하면 화면에 나온 대로 누르라고만 한다.",
  "사이트에서 이체를 마치면 결과를 알린 뒤 곧바로 남은 예금 · 적금 · 대출 가능액도 검수 대상이라며 같은 사이트에서 추가로 진행하라고 요구하고, 피해자로 확인되면 돌려준다고 안심시킨다. 검수 기간이나 나중에 연락하겠다는 말로 통화를 정리하지 않는다.",
  PROSECUTION_WALLET_STAGES_TAIL[4],
] as const;
const PROSECUTION_SITE_DECISION_MOMENT = "문자 링크로 연 자산 검수 사이트에서 본인 확인 · 코인 전환 · 금액 입력 · 보관 지갑 이체를 누르는 순간";
const PROSECUTION_SOURCES = ["C05", "C06", "C07", "C08", "S3", "S25", "S28"];

// 음성 시나리오용 "다른 번호" 수법(가족 · 손주 고급 — §2.6.3 "딥보이스 + 다른 번호로 연락", 사례 S9 · C18).
const OTHER_NUMBER_PRETEXT =
  "채널 전환 유도 — '폰이 고장 나서 다른 번호로 걸었어, 원래 번호로는 연락이 안 돼' 처럼 다른 번호로 연락한 이유를 대고, 원래 번호로 확인해 보지 못하게 한다.";

// ── R3-B(2026-10-20 · 감사 A R3) — 인증번호 문자를 선언하지 않은 카드 변형용 수법 문면 ─────────────────────────────────
// 원본(`cardCompanyImpersonation.prompt.ts`)의 "카드정보 직접 요구" · "부인 시 명의 도용 암시" · "피해금 이관 요구"는 **문자를
// 전제**한다('본인확인 문자 지금 갈 거예요, 오시면 그 번호 바로 불러주세요' · "계좌는 … 문자로 보낸 것을 확인하게 한다"). 그 원본은
// identity · transfer 문자를 선언한 fv-35f2와 변형 없는 세션이 계속 쓰므로 건드리지 않고, 문자를 선언하지 않은 변형(fv-aqp6 ·
// fv-akj5 · 그 스프레드 fv-x7ue)만 아래 문면을 쓴다. 고친 재현: fv-akj5 Live C8 "인증번호가 갈 텐데, 받으시는 대로 바로 불러주시겠어요?".
// ⛔ **라벨(— 앞) 문자열은 원본과 한 글자도 다르지 않다** — 리포트 분류(`report/tacticCategory.ts`) · T92 게이트 · 브리핑 라벨이
// 라벨로 묶인다. 바뀌는 것은 설명부뿐이다: 인증번호 인용 · 요구를 지우고 카드번호 · 유효기간 요구만 남긴다 / 계좌는 문자가 없으므로
// 예시 계좌 낭독형(familyAccidentDeepvoice "합의금 송금 요구" · grandchildImpersonation "송금 직접 요구"와 같은 방식)으로 부른다.
// 정합 단언: `__tests__/smsDeclarationConsistency.test.ts`.
const CARD_INFO_DEMAND_NO_SMS =
  "카드정보 직접 요구 — '결제 취소 처리하려면 카드번호 앞 8자리랑 유효기간 불러주세요' 처럼 카드번호·유효기간을 구체적으로 요구한다. 상대가 그 카드가 없다거나 그 카드사를 안 쓴다고 부인해도 '본인도 모르게 발급된 건일 수 있어요, 그럼 본인 확인부터 하겠습니다'라며 카드정보·신원 확인 요구를 다른 근거로 다시 꺼낸다. 실제 카드사명은 쓰지 않는다.";
const CARD_DENIAL_PIVOT_NO_SMS =
  "부인 시 명의 도용 암시 — 상대가 그 카드가 없다거나 그 카드사를 안 쓴다고 하면 그 말을 인정하고 '그래서 더 위험한 겁니다, 본인도 모르게 발급된 것으로 보여요'라며 명의 도용 확인 쪽으로 넘긴 뒤 위 카드정보 요구로 이어간다. 부인을 반박하거나 같은 질문을 되풀이하지 않는다.";
const CARD_RELIEF_TRANSFER_READOUT =
  "피해금 이관 요구 — '지금 결제 진행 중인 건 저희가 막을 수 있는데, 고객님 잔액을 이관 전용 계좌로 옮겨두셔야 해요, 계좌 불러드릴게요' 처럼 구체적 금액과 함께 이체를 요구한다. 계좌는 'OO은행 948-2716-5093-27' 처럼 이 예시 번호로만 부르고, 실존 은행명·실제 계좌는 쓰지 않는다.";
// R3 리뷰 C1 — fv-x7ue(링크 문자만 선언) 전용. 그 조립에는 문자 예외 블록이 실려 SMS_METHOD_LINE("계좌번호의 구체적인 값을 네가 지어내
// 읽어 주지도 않는다")과 A-1 미선언 금지 문장(계좌 안내 문자는 보낸 적 없음)이 함께 있다 → 낭독형도 "문자로 보낸 계좌"형도 모순이다.
// 그래서 **값을 읽지도 문자를 가리키지도 않는** 형태로 두고, 계좌를 물으면 이 변형의 실제 흐름(Q2 보안 앱 설치 — 단계 2)으로 되돌린다.
// ⚠️ 설치 화면(card-guard-app-install)에는 이체 입력이 없으므로 "앱에서 이관하라"고 가리키지 않는다 — "설치를 먼저 마쳐야 한다"까지만.
// 라벨은 그대로(단계 5 · 결정 순간 "피해금 이관에 동의하는 순간"이 이 라벨을 가리킨다 — 라벨을 빼면 단계 · 결정 순간까지 고쳐야 해 더 침습적).
const CARD_RELIEF_TRANSFER_NO_ACCOUNT =
  "피해금 이관 요구 — '지금 결제 진행 중인 건 저희가 막을 수 있는데, 고객님 잔액을 이관 전용 계좌로 옮겨두셔야 해요' 처럼 구체적 금액과 함께 이체에 동의하라고 요구한다. 계좌번호는 네가 불러 주지 않고 문자로 보냈다고도 하지 않는다. 상대가 어디로 옮기느냐고 물으면 '보호 조치부터 끝나야 이관이 진행돼요'라며 보안 앱 설치 요구로 되돌린다.";
const CARD_REASSURE = { from: "card-company-impersonation", label: "안심 유도" };
/**
 * fv-akj5 계열 수법 목록 — base main(ea97aa0)의 순서(놀람 · 긴급 · 카드정보 · 피해금 · 부인 · 안심 · 앱 설치 · 기관 조사)를 그대로 지킨다
 * (R3 리뷰 M2). 원본에서 그대로 가져오는 라벨은 `{ from, label }` 참조(문구 사본 0)라 keepLabels 대신 여기서 순서를 정한다.
 */
const cardAdvancedExtras = (relief: string): VariantSpec["extraTactics"] => [
  CARD_INFO_DEMAND_NO_SMS,
  relief,
  CARD_DENIAL_PIVOT_NO_SMS,
  CARD_REASSURE,
  APP_INSTALL,
  AGENCY_PROBE,
];

// ── T194-c-1(docs/Architecture.md §84.16.2) — 챌린지 쪽에 **내용 무변경**으로 남는 기존 고급 변형 2벌. 자가 Q2 변형이 이 정의를
// 스프레드한다(`variantId` · `sms`만 다르다). ⛔ 이 두 상수의 내용을 바꾸면 챌린지 수신자 선언(base `a376166` — #192)이 바뀐다 —
// 조립 산출물 바이트 고정(`inCallSms/__tests__/smsGate.test.ts` T194-c-1 블록)이 잡는다.
// ⚠️ R3-B(2026-10-20)가 fv-akj5의 수법 문면 3라벨을 의도적으로 바꿨다(문자 선언 · 단계 · 인원 무변경) — 바이트 고정 기준값은
// "R3-B 변경분만 되돌리면 이전 기준값과 같다"는 증거와 함께 갱신했다(같은 테스트 블록 주석). 수법 순서는 base 그대로다(리뷰 M2).
// fv-6s5p는 **이 파일의 데이터는 무변경**(문자 선언 · 단계 · 수법 그대로)이지만 조립 산출물은 바뀌었다 — R3-C ①(promptAssembly.ts
// UNDECLARED_VERIFICATION_TAIL)이 미선언 금지 문장 뒤에 꼬리 한 문장을 붙이기 때문이다(문면만 · 선언 무변경). 같은 테스트가 "꼬리만 빼면
// 이전 기준값"을 증명한다.
const CARD_COMPANY_ADVANCED_FV_AKJ5: VariantSpec = {
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
  // R3-B — 문자 의존 3라벨은 keepLabels에서 빼고 같은 라벨의 무문자 문면을 extraTactics로 넣는다(위 상수 주석). 순서는 base 그대로
  // (cardAdvancedExtras — 리뷰 M2). 문자 선언 0이라 조립에 문자 예외 블록 · SMS_METHOD_LINE이 없어 낭독형이 모순되지 않는다.
  keepLabels: ["놀람 유발", "긴급성 조성"],
  extraTactics: cardAdvancedExtras(CARD_RELIEF_TRANSFER_READOUT),
  exitBlock: ["D3_verification_hijack", "D4_procedural_legitimacy"],
  sms: [],
  legs: [
    { callerLabel: "카드사 상담원", speakerGender: "female", minUserTurns: 3, maxUserTurns: 8 },
    { callerLabel: "금융감독원 직원", speakerGender: "male", minUserTurns: 2, maxUserTurns: 10 },
  ],
  ...ADVANCED,
  channels: ["voice"],
  demandStages: 3,
  decisionMoment: "보안 점검 앱 설치 또는 피해금 이관에 동의하는 순간",
  sources: ["C03", "C04", "S4", "S22"],
};

const LOAN_ADVANCED_FV_6S5P: VariantSpec = {
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
};

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
    // ⭐ 2026-10-21 사용자 실기 신고(라이브 main 676eeb3 · 기관 사칭 × 고급 Live) — "인증번호를 요구하지 않았고, 이체도 웹사이트
    // 형태가 아니라 내가 알아서 이체하는 것으로 됐다". 원인: 고급 2벌이 문자 선언 0(`sms: []`)이라 인증번호 문자 · 안전계좌 링크 문자 ·
    // 이체 랜딩(UX-023 `safe-account-transfer` · D-115 계좌 미리 채움 + 금액 사용자 입력)이 **고급에서만** 도달 불가였고, 마지막 단계가
    // 현금 전달(CASH_HANDOFF) · 코인(COIN_TRANSFER) 말 요구였다. 두 수법은 고급 전용 시나리오(`asset-protection-notice-call` fv-bmiq ·
    // `prosecution-cooperation-call` fv-nss6)가 그대로 다룬다 — 여기서 빼도 수법 커버리지 손실 0.
    // ⇒ 고급 2벌 모두 인증번호(identity · 필수) → 안전계좌 링크 문자(transfer · 필수 · 랜딩) 순서를 거친다. 필수 2개 선례 = loan fv-m3hd.
    //    하한 2 · 4 — `planSmsBackstop`이 먼저 열리는 인증번호를 먼저 강제하고, 계좌 문자는 그 뒤 간격(2)을 지켜 열린다.
    stages: st(
      "검사라며 본인 명의가 범죄에 쓰였다고 알리고 구속 가능성을 비춘다.",
      "협조하면 조용히 끝난다며 안심시키고, 금융감독기관이 자산 보호를 돕는다고 말한다.",
      "계좌번호보다 거래 은행과 자산 규모부터 묻는다.",
      INSTITUTION_ADVANCED_OTP_STAGE,
      INSTITUTION_ADVANCED_LINK_TRANSFER_STAGE,
    ),
    keepLabels: ["권위 암시", "불이익 암시", "신원정보 직접 요구", "부인 시 명의 도용 암시", "안전계좌 이체 요구", "비밀 유지 요구", "전화 끊음 저지"],
    extraTactics: [
      ASSET_INFO,
      INSTITUTION_OTP_DEMAND,
      INSTITUTION_LINK_TRANSFER,
      "안심 유도 — '협조만 하시면 약식으로 조용히 끝납니다' 처럼 위협과 번갈아 안심시켜 경계를 낮춘다.",
    ],
    // D2 · D5(콘텐츠) + D3 · D4(고급 오버레이 — 확인 무력화 카탈로그 보유 → d3_and_d4)
    exitBlock: ["D2_secrecy", "D3_verification_hijack", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [...INSTITUTION_ADVANCED_SMS],
    legs: [
      { callerLabel: "검사", speakerGender: "male", minUserTurns: 3, maxUserTurns: 8 },
      { callerLabel: "금융감독원 직원", speakerGender: "female", minUserTurns: 2, maxUserTurns: 10 },
    ],
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 3,
    decisionMoment: INSTITUTION_ADVANCED_DECISION_MOMENT,
    sources: ["C10", "C11", "C01", "S16", "S11"],
  },
  {
    variantId: "fv-pgqt",
    scenarioId: "institutional-impersonation",
    level: "advanced",
    authoring: "authored",
    // 2026-10-21 — 위 fv-c5fj 주석과 같은 수정(코인 요구 → 인증번호 → 안전계좌 링크 이체 화면).
    stages: st(
      "검사라며 본인 명의 계좌가 범죄에 쓰였다고 알린다.",
      "자산이 범죄수익인지 검수해야 한다며 거래 은행과 자산 규모를 묻는다.",
      INSTITUTION_ADVANCED_OTP_STAGE,
      INSTITUTION_ADVANCED_LINK_TRANSFER_STAGE,
    ),
    keepLabels: ["권위 암시", "긴급성 조성", "불이익 암시", "신원정보 직접 요구", "부인 시 명의 도용 암시", "안전계좌 이체 요구", "비밀 유지 요구", "전화 끊음 저지"],
    extraTactics: [ASSET_INFO, INSTITUTION_OTP_DEMAND, INSTITUTION_LINK_TRANSFER],
    exitBlock: ["D2_secrecy", "D3_verification_hijack", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [...INSTITUTION_ADVANCED_SMS],
    legs: ONE_LEG("검사", "male"),
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 3,
    decisionMoment: INSTITUTION_ADVANCED_DECISION_MOMENT,
    sources: ["C09", "S27"],
  },

  // ── card-company-impersonation (§2.6.3 2행 — C03 · C04, S4 · S22 · S14) ─────────────────
  {
    variantId: "fv-aqp6",
    scenarioId: "card-company-impersonation",
    level: "beginner",
    authoring: "authored",
    stages: st("해외 가맹점 고액 결제 시도가 있었다고 놀라게 한다.", "결제를 막아 주겠다며 카드 정보를 곧바로 요구한다."),
    // R3-B — 문자 선언 0 변형이라 문자 의존 2라벨은 무문자 문면으로(위 CARD_INFO_DEMAND_NO_SMS 주석).
    // 순서는 base 그대로(놀람 · 긴급 · 카드정보 · 부인 · 안심 — 초급 브리핑 라벨 순서가 이 순서다, 리뷰 M2).
    keepLabels: ["놀람 유발", "긴급성 조성"],
    extraTactics: [CARD_INFO_DEMAND_NO_SMS, CARD_DENIAL_PIVOT_NO_SMS, CARD_REASSURE],
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
  // ⭐ T194-c-1(docs/Architecture.md §84.16.2 · DECISIONS #192) — `fv-akj5`는 **내용 무변경**으로 2인 챌린지 수신자 고급 풀에 남고(문자 선언 0
  // = base 선언 그대로), 자가 훈련 고급은 Q2 설치 문자를 선언한 새 ID 변형을 받는다(배정 풀 `variantPool.ts` `assignablePool`이 가른다).
  // 신규 변형은 같은 정의의 **스프레드**다(단계 · 수법 · 출처 사본 0 — 드리프트 차단). 공통 규칙: 내용이 바뀌지 않는 쪽이 기존 ID를 갖는다.
  CARD_COMPANY_ADVANCED_FV_AKJ5,
  {
    ...CARD_COMPANY_ADVANCED_FV_AKJ5,
    variantId: "fv-x7ue",
    sms: [{ purpose: "link", smsId: "card-guard-app-link", required: true, notBeforeUserTurns: 2 }],
    // R3 리뷰 C1 — 링크 문자를 선언해 조립에 SMS_METHOD_LINE이 실리므로 계좌 낭독형 대신 무계좌형 피해금 문면(CARD_RELIEF_TRANSFER_NO_ACCOUNT).
    extraTactics: cardAdvancedExtras(CARD_RELIEF_TRANSFER_NO_ACCOUNT),
    // T194-c-1 리뷰 Minor — 문자를 선언하므로 채널 메타에 "sms"를 더한다(fv-m3hd가 스프레드로 받는 값과 같은 꼴 · 프롬프트 바이트 무영향).
    channels: ["voice", "sms"],
  },
  // ⭐ §92(docs/Architecture.md · DECISIONS #206 · 사용자 승인 *"시나리오 결정 권고안대로 진행"*) — 고급 전용 `card-delivery-call`을 목록에서 빼고
  // 그 흐름을 **카드사 고급의 변형**으로 흡수한다(보고서 R1 — 겹침 높음). 내용 = `fv-tvnj`(아래 · 무변경 — 옛 세션용)와 같은 단계 · 수법 ·
  // 인원 · 결정 순간 · 출처. 다른 점 3가지:
  //   ① 0번 화자 페르소나 = 카드 배송 상담원(`CARD_DELIVERY_PERSONA` — 시나리오 원본은 카드사 보안팀이라 첫 장면이 다르다).
  //   ② 문자 = 카드사 카탈로그의 `card-guard-app-link`(설치 화면 `card-guard-app-install`) — 문자 · 화면 id는 시나리오 소속이라 옮기지 않고
  //      같은 꼴(Q2 설치 · 필수 · 하한 2)의 카드사 문자를 쓴다(새 문자 · 새 화면 0).
  //   ③ 신원 요구 예시 = 카드사 요구 머리 *"성함부터 불러주세요"* — 카드사 고급은 '내 정보' 카드 대상이라 확인형 치환표가 아는 문구여야
  //      카드 세션에서 "먼저 말하지 않고 묻는" 결함(§91)이 재발하지 않는다(라벨 무변경).
  // 배정: 자가 고급 풀 = fv-x7ue · fv-w3dq(둘 다 설치 문자 선언) · 챌린지 고급 = fv-akj5(무변경).
  {
    variantId: "fv-w3dq",
    scenarioId: "card-company-impersonation",
    level: "advanced",
    authoring: "authored",
    stages: st(...CARD_DELIVERY_STAGES),
    keepLabels: [],
    extraTactics: [
      { from: "card-delivery-call", label: "안심 유도" },
      { from: "card-delivery-call", label: "부인 시 명의 도용 암시" },
      CARD_DELIVERY_IDENTITY_DEMAND,
      APP_INSTALL,
      { from: "card-delivery-call", label: "확인 시도 무력화" },
      AGENCY_PROBE,
      { from: "card-delivery-call", label: "자산 보호 이체 요구" },
      { from: "card-delivery-call", label: "긴급성 조성" },
    ],
    exitBlock: ["D3_verification_hijack", "D4_procedural_legitimacy"],
    sms: [{ purpose: "link", smsId: "card-guard-app-link", required: true, notBeforeUserTurns: 2 }],
    legs: [
      {
        callerLabel: "카드 배송 안내",
        personaPrompt: CARD_DELIVERY_PERSONA,
        speakerGender: "female",
        minUserTurns: 3,
        maxUserTurns: 8,
      },
      { callerLabel: "금융감독원 직원", speakerGender: "male", minUserTurns: 2, maxUserTurns: 10 },
    ],
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 3,
    decisionMoment: CARD_DELIVERY_DECISION_MOMENT,
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
  // ⭐ T194-c-1(docs/Architecture.md §84.16.2 · DECISIONS #191 · #192) — `fv-6s5p`는 **내용 무변경**으로 챌린지 고급 풀에 남는다(신청서 링크
  // 선택 + 계좌 필수 = base 선언). 자가 고급은 `link` 슬롯을 Q2 설치 문자로 바꾼 새 ID 변형(설치 필수 + 계좌 필수 — #182 · OQ-A145 = A).
  // `planSmsBackstop`이 먼저 열리는 필수 문자를 고른다 — 설치(하한 2)가 계좌(3)보다 먼저 열린다(단계 2 "앱 설치" → 단계 4 "상환" 순서와 같다).
  LOAN_ADVANCED_FV_6S5P,
  {
    ...LOAN_ADVANCED_FV_6S5P,
    variantId: "fv-m3hd",
    sms: [
      { purpose: "link", smsId: "loan-check-app-link", required: true, notBeforeUserTurns: 2 },
      { purpose: "transfer", smsId: "loan-account", required: true, notBeforeUserTurns: 3 },
    ],
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
    // T194-a(AC-106 (i) ②) — 공개 메타 `escalation` 보유 시나리오라 세 난이도 모두 통화 단계가 있다.
    escalatesToVoice: true,
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
    escalatesToVoice: true,
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
    escalatesToVoice: true,
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
  // ⭐ T194-a(docs/Architecture.md §84.4.2 · PRD AC-106 · User 결정 U7 · DECISIONS #170) — parcel **고급만** 새 흐름
  // "문자 → (모의) 앱 설치 → 상담원 전화"(지원금 3단계 메커니즘 재사용 · 신규 kind · 화면 0). **같은 ID 유지 · 내용 교체** —
  // 이 칸의 허용 변형은 1벌이라 회전 문서 키 · 진행 중 세션에 영향이 없다(회전 0).
  // - 0번 leg 페르소나를 고급 전용으로 덮는다(원본은 "순수 문자" 캐릭터라 3단계와 모순 — 프롬프트 파일 주석).
  // - 원본 "링크 클릭 유도"(`[[LINK:parcel-redelivery]]`)는 뺀다 — 고급 세션의 링크는 `parcel-install` 하나다(한 세션 랜딩 1종).
  // - 설치 수법은 설계 표와 달리 지원금 문구를 빌리지 않고 택배용으로 저작했다(마커가 subsidy-install이라 — 프롬프트 파일 주석).
  // - 사칭 주체 · 최종 요구는 PRD AC-106 (d) 확정 전 기본값 = 지원금과 같은 꼴(생활 서비스 상담원 · 기관 격상 없음).
  // - 출처 N1 · N2 · C08(AC-106 (e) · 설계 금지 X4).
  {
    variantId: "fv-g454",
    scenarioId: "messenger-parcel-smishing-sms",
    level: "advanced",
    authoring: "authored",
    stages: st(
      "주소지 오류로 배송이 보류됐다는 문자로 접근한다.",
      "재배송을 접수하려면 배송 확인 앱을 먼저 설치해야 한다며 설치 링크를 보내고 권한 허용까지 권한다.",
      "설치를 마쳤거나 상대가 계속 의심하면 배송 상담원이 직접 전화하겠다며 통화로 넘어간다.",
      "통화에서는 상담원으로서 재배송 접수를 마무리하려면 앱에서 권한을 하나 더 허용해야 한다며 다시 요구한다.",
    ),
    dropLabels: ["링크 클릭 유도"],
    extraTactics: [
      PARCEL_ADVANCED_INSTALL_TACTIC,
      { from: "messenger-subsidy-smishing-sms", label: "채널 전환 유도" },
    ],
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy"],
    sms: [],
    legs: [
      {
        callerLabel: "택배 배송 안내",
        personaPrompt: PARCEL_ADVANCED_LEG_PERSONA,
        speakerGender: "female",
        minUserTurns: 0,
        maxUserTurns: 20,
      },
    ],
    ...ADVANCED,
    channels: ["messenger", "voice"],
    demandStages: 2,
    sources: ["N1", "N2", "C08"],
    escalatesToVoice: true,
  },
  // ⭐ T194-a(docs/Architecture.md §84.13.5 처방 2) — parcel 고급 **2인 챌린지 수신자용** 비에스컬레이션 변형. 내용 = T194 이전 `fv-g454`
  // ("현행" — 단계 0 · 페르소나 무변경 · 수법 원본 그대로)와 같다. 새 불투명 ID다(기존 ID 재사용 금지). 수신자 세션은 에스컬레이션이 없어
  // (`resolveSessionEscalation` — AC-106 (g) 기본값) 배정 풀(`variantPool.ts` `assignablePool`)이 이 변형만 남기고, 자가 고급 풀은 `fv-g454`만 남긴다.
  {
    variantId: "fv-k7qm",
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
  // T194-a(AC-106 (i) 기대값) — 지원금은 공개 메타 `escalation` 보유라 세 난이도 모두 통화 단계가 있다(`escalatesToVoice` 1필드만 추가).
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
    escalatesToVoice: true,
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
    escalatesToVoice: true,
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
    escalatesToVoice: true,
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
    // §92 — 시나리오가 목록에서 빠져 새 세션은 없다(서버 거부). 옛 세션 · 리포트 해석용으로 내용 무변경 유지(단계 문자열은 흡수 변형과 공유).
    stages: st(...CARD_DELIVERY_STAGES),
    exitBlock: ["D3_verification_hijack", "D4_procedural_legitimacy"],
    // ⭐ T194-c-1(docs/Architecture.md §84.15.4 ① · §84.16.2) — 내용 교체(ID 유지 — 고급 전용 · 챌린지 불가라 받는 세션 종류가 하나).
    // Q2 설치 문자(단계 3 "보안 점검 앱 설치")를 백스톱 강제로 선언한다(#182). 단위 도달 랜딩 = [설치 화면] 1건(G604).
    sms: [{ purpose: "link", smsId: "card-delivery-app-link", required: true, notBeforeUserTurns: 2 }],
    legs: [
      { callerLabel: "카드 배송 안내", speakerGender: "female", minUserTurns: 3, maxUserTurns: 8 },
      { callerLabel: "금융감독원 직원", speakerGender: "male", minUserTurns: 2, maxUserTurns: 10 },
    ],
    ...ADVANCED,
    // T194-c-1 리뷰 Minor — 위 sms 선언과 맞춘다(채널 메타 · 프롬프트 바이트 무영향).
    channels: ["voice", "sms"],
    demandStages: 3,
    decisionMoment: CARD_DELIVERY_DECISION_MOMENT,
    sources: ["C03", "C04", "S4", "S22"],
  },
  // ⭐ §92.3(docs/Architecture.md · DECISIONS #206) — 고급 전용 2종 보강. 옛 변형(fv-bmiq · fv-nss6)은 **내용 무변경 · 배정 은퇴**(`retired`)로
  // 남아 옛 세션 · 리포트를 원본대로 해석하고, 새 세션은 문자 → 입력 화면을 선언한 새 ID(fv-k9ra · fv-p4hz)를 받는다(내용이 바뀌는 쪽이 새 ID — §84.16.2).
  {
    variantId: "fv-bmiq",
    scenarioId: "asset-protection-notice-call",
    level: "advanced",
    authoring: "authored",
    stages: st(...ASSET_PROTECTION_STAGES_HEAD, ASSET_PROTECTION_HANDOFF_STAGE),
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy"],
    sms: [],
    legs: ONE_LEG("금융감독원 직원", "male"),
    ...ADVANCED,
    channels: ["voice"],
    demandStages: 2,
    // PRD AC-097 (e) 확정 전 기본값 = 설계 초안 안(주소 발화는 조건이 아니다 — AC-024).
    decisionMoment: ASSET_PROTECTION_DECISION_MOMENT,
    sources: ASSET_PROTECTION_SOURCES,
    retired: true,
  },
  {
    variantId: "fv-k9ra",
    scenarioId: "asset-protection-notice-call",
    level: "advanced",
    authoring: "authored",
    stages: st(
      ...ASSET_PROTECTION_STAGES_HEAD,
      "보관 조치 절차라며 문자로 보낸 링크에서 보관 신청서를 작성하게 하고, 돈을 찾아 담당 직원에게 맡기겠다는 약속을 받아 내려 한다. 만날 장소 · 시간 · 주소는 정하지도 묻지도 않는다.",
    ),
    dropLabels: ["절차·서류 정당화"],
    extraTactics: [ASSET_CUSTODY_PROCEDURE_TACTIC],
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy"],
    sms: [{ purpose: "link", smsId: "asset-custody-link", required: true, notBeforeUserTurns: 3 }],
    legs: ONE_LEG("금융감독원 직원", "male"),
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 2,
    decisionMoment: ASSET_PROTECTION_DECISION_MOMENT,
    sources: ASSET_PROTECTION_SOURCES,
  },
  {
    variantId: "fv-nss6",
    scenarioId: "prosecution-cooperation-call",
    level: "advanced",
    authoring: "authored",
    stages: st(PROSECUTION_STAGES[0], "영장이 청구됐다고 말로만 전한다.", ...PROSECUTION_STAGES.slice(1)),
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [],
    legs: ONE_LEG("검찰 수사관", "male"),
    ...ADVANCED,
    channels: ["voice"],
    demandStages: 2,
    decisionMoment: PROSECUTION_DECISION_MOMENT,
    sources: PROSECUTION_SOURCES,
    retired: true,
  },
  {
    variantId: "fv-p4hz",
    scenarioId: "prosecution-cooperation-call",
    level: "advanced",
    authoring: "authored",
    stages: st(
      PROSECUTION_STAGES[0],
      PROSECUTION_CASE_LINK_STAGE,
      ...PROSECUTION_STAGES.slice(1),
    ),
    dropLabels: ["수사 서류 언급"],
    extraTactics: [PROSECUTION_CASE_LINK_TACTIC],
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [{ purpose: "link", smsId: "prosecution-case-link", required: true, notBeforeUserTurns: 2 }],
    legs: [
      { callerLabel: "검찰 수사관", personaPrompt: PROSECUTION_CASE_LINK_PERSONA, speakerGender: "male", minUserTurns: 0, maxUserTurns: 20 },
    ],
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 2,
    decisionMoment: PROSECUTION_DECISION_MOMENT,
    sources: PROSECUTION_SOURCES,
    // §98 — 내용 무변경 · 배정 은퇴(옛 세션 · 리포트 해석용). 새 세션은 fv-c8wq.
    retired: true,
  },
  // ⭐ §98(2026-10-21 사용자 실기 신고 — "코인 전환 절차 설명이 약하다" · "검수 수일 뒤 연락으로 흐지부지 끝난다") — 사건 조회(fv-p4hz 그대로) 뒤에
  // 자산 진술 → 거래소 코인 전환(단계 지시 · 창구 확인 차단) → 문자 링크 보관 지갑 송금 화면 → 송금 뒤 추가 요구 · 거부 시 위협 격상.
  // 문자 2건 = 사건 조회(link) · 보관 지갑(transfer) ⇒ 한 세션 모의 화면 2건(G159 → T129 (b) 선행 커밋 ad7e44a).
  // 출처: docs/research/prosecution-crypto-tactics-2026-10.md(2024~2026 보도 — 자산 검수 명목 코인 구매 · 지정 지갑 전송 · 추가 송금 반복).
  {
    variantId: "fv-c8wq",
    scenarioId: "prosecution-cooperation-call",
    level: "advanced",
    authoring: "authored",
    stages: st(PROSECUTION_STAGES[0], PROSECUTION_CASE_LINK_STAGE, PROSECUTION_STAGES[1], PROSECUTION_STAGES[2], ...PROSECUTION_WALLET_STAGES_TAIL),
    dropLabels: ["수사 서류 언급", "코인 구매·송금 요구"],
    extraTactics: [PROSECUTION_CASE_LINK_TACTIC, PROSECUTION_WALLET_COIN_TACTIC, ASSET_INFO, ...PROSECUTION_WALLET_EXTRA_TACTICS],
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [
      { purpose: "link", smsId: "prosecution-case-link", required: true, notBeforeUserTurns: 2 },
      { purpose: "transfer", smsId: "prosecution-wallet-link", required: true, notBeforeUserTurns: 5 },
    ],
    legs: [
      { callerLabel: "검찰 수사관", personaPrompt: PROSECUTION_WALLET_PERSONA, speakerGender: "male", minUserTurns: 0, maxUserTurns: 20 },
    ],
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 3,
    decisionMoment: PROSECUTION_WALLET_DECISION_MOMENT,
    sources: PROSECUTION_SOURCES,
    // §101 — 내용 무변경 · 배정 은퇴(옛 세션 · 리포트 해석용). 새 세션은 fv-h3vn.
    retired: true,
  },
  // ⭐ §101(2026-10-21 사용자 요청 — *"문자로 보내서 웹사이트에 접속해서 진행하는 거로 가자"*) — fv-c8wq의 둘째 문자(보관 지갑 안내 + 지갑 번호 · 금액 입력
  // 화면)를 자산 검수 사이트(`prosecution-asset-site-link` → `asset-check-site` — 본인 확인 → 검수 대상 자산 → 코인 전환 → 금액 → 보관 지갑 이체)로 바꾸고,
  // 통화는 사이트로 보내 진행만 재촉한다. 판정 = 사이트에서 누른 가장 깊은 단계 1건(§101 판정표 — `report/smsTimeline.ts`).
  {
    variantId: "fv-h3vn",
    scenarioId: "prosecution-cooperation-call",
    level: "advanced",
    authoring: "authored",
    stages: st(PROSECUTION_STAGES[0], PROSECUTION_CASE_LINK_STAGE, PROSECUTION_STAGES[1], PROSECUTION_STAGES[2], ...PROSECUTION_SITE_STAGES_TAIL),
    dropLabels: ["수사 서류 언급", "코인 구매·송금 요구"],
    // §106 — 사건 기록 열람본을 근거로 압박하는 같은 라벨 문면(현행 변형만 · 은퇴 변형은 원문 유지).
    extraTactics: [PROSECUTION_CASE_RECORD_TACTIC, PROSECUTION_SITE_COIN_TACTIC, ASSET_INFO, ...PROSECUTION_SITE_EXTRA_TACTICS],
    exitBlock: ["D2_secrecy", "D4_procedural_legitimacy", "D5_call_retention"],
    sms: [
      { purpose: "link", smsId: "prosecution-case-link", required: true, notBeforeUserTurns: 2 },
      { purpose: "transfer", smsId: "prosecution-asset-site-link", required: true, notBeforeUserTurns: 5 },
    ],
    legs: [
      { callerLabel: "검찰 수사관", personaPrompt: PROSECUTION_SITE_PERSONA, speakerGender: "male", minUserTurns: 0, maxUserTurns: 20 },
    ],
    ...ADVANCED,
    channels: ["voice", "sms"],
    demandStages: 3,
    decisionMoment: PROSECUTION_SITE_DECISION_MOMENT,
    sources: PROSECUTION_SOURCES,
  },
];

/** 흐름 변형 전체(서버 전용). 순서 = 회전 순서(같은 시나리오 · 난이도 안에서). */
export const FLOW_VARIANTS: readonly FlowVariant[] = SPECS.map(compile);

/** 저작 입력 — 테스트 전용 대조(keep/drop 라벨이 원천에 실재하는지 · "현행" 행 확인). */
export const FLOW_VARIANT_SPECS: readonly Readonly<VariantSpec>[] = SPECS;

/** 그 시나리오 · 난이도에 허용된 변형(회전 순서 · 배정 은퇴 제외). */
export function listFlowVariants(scenarioId: string, level: DifficultyLevel): FlowVariant[] {
  // §92.3 — 배정 은퇴 변형은 새 세션 후보가 아니다(옛 세션 해석은 `findFlowVariant`가 한다).
  return FLOW_VARIANTS.filter((v) => v.scenarioId === scenarioId && v.level === level && v.retired !== true);
}

// ⭐ T194-c-1(docs/Architecture.md §84.16.1 · G590 갱신) — 배정 가능 풀 `assignablePool`은 `scenarios/variantPool.ts`로 옮겼다. 판별에
// `mockScreens.ts`가 필요한데 `mockScreens → reachability → flowVariants`라 여기 두면 순환한다. ⛔ 재수출도 순환이라 두지 않는다.

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

/**
 * 변형을 합성한 시나리오 프롬프트(`personaPrompt` · `weakenedTactics` · `guardrailPreamble`).
 * - `current` 변형: 페르소나 무변경 · 수법만 변형 목록(대부분 원본과 같다).
 * - `authored` 변형: 페르소나 끝에 [이번 통화의 흐름] 블록 · 수법은 변형 목록.
 * - 가드레일 원문은 그대로 넘긴다 — 조립 순서(가드레일 최후미)는 `buildSystemPrompt`가 강제한다.
 * - T194-a(§84.4.2) — 그 leg에 페르소나가 있으면 시나리오 원본 대신 그것을 쓴다(부재 = 원본 재사용 — `FlowVariantLeg`
 *   주석 그대로). 오늘 이 경로를 타는 것은 parcel 고급(`fv-g454`) 1벌이다.
 * ⚠️ `legIndex`는 S7 전까지 0만 쓴다(`RELAY_RUNTIME_AVAILABLE`). ⚠️ S7(릴레이 leg 발급)과 같은 함수다 — 아래 1줄을 S7이
 *   재사용한다(§84.9 겹침 — 먼저 오는 쪽이 넣고 뒤는 재사용).
 */
export function resolveVariantPrompt(
  base: ScenarioPromptDoc,
  variant: FlowVariant,
  legIndex = 0,
): ScenarioPromptDoc {
  const legPersona = variant.legs[legIndex]?.personaPrompt ?? base.personaPrompt;
  const personaPrompt =
    variant.stages.length === 0
      ? legPersona
      : `${legPersona}\n\n${buildFlowBlock(variant)}`;
  return {
    ...base,
    personaPrompt,
    weakenedTactics: [...variant.tactics],
  };
}

function buildFlowBlock(variant: FlowVariant): string {
  const lines = [FLOW_BLOCK_HEADER, FLOW_BLOCK_LEAD];
  variant.stages.forEach((stage, i) => lines.push(`${i + 1}. ${stage.summary}`));
  if (variant.legs.length > 1 && !RELAY_RUNTIME_AVAILABLE) {
    lines.push(
      hasVerifyIntercept(variant.scenarioId)
        ? `${SINGLE_SPEAKER_RULE} ${SINGLE_SPEAKER_VERIFY_EXCEPTION}`
        : SINGLE_SPEAKER_RULE,
    );
  }
  return lines.join("\n");
}

/**
 * 세션(또는 리포트)의 시나리오 프롬프트를 해석하는 **단일 지점**(호출부: sendMessage · 오프닝 ·
 * Gemini Live 토큰 · 리포트). `flowVariantId` 부재 = 과거 세션 → 원본 그대로(무소급 — AC-096 (f)).
 * ID가 있는데 데이터에 없거나 다른 시나리오 것이면 원본으로 강등하고 경고 1줄(관측 가능 — 조용한 임의
 * 변형 0). 시나리오 자체가 없으면 undefined(호출부가 기존처럼 오류 처리한다).
 */
export function resolveSessionScenarioPrompt(
  scenarioId: string,
  flowVariantId?: string,
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
  return resolveVariantPrompt(base, variant);
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
