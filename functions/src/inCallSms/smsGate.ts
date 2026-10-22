// 통화 중 문자 **도달 조건** — 순수 판정(T191 문자 도달 조건 설계 · PRD AC-099 · User 결정 D7).
//
// ⛔ **문자 발송 판정 함수는 이 파일의 `resolveSmsGate` 하나뿐이다**(설계 금지 X4). 실시간 도구
// (`deliverInCallSms` trigger:"model_tool") · 텍스트 폴백 마커(`sendMessage` `[[SMS:…]]`) · 백스톱(두 경로)이
// 전부 `smsDelivery.ts`의 `deliverSmsThroughGate`를 거쳐 이 함수를 부른다. 경로마다 판정을 따로 두면
// 예전의 `>=`(실시간) vs `===`(폴백) 분기가 다시 생긴다.
//
// ⛔ 이 파일은 대화 내용을 분류하지 않는다 — *"본인확인을 요구했다 · 이체를 요구했다"* 같은 의미 판단은
// 모델 몫이다(AC-099 (b) — 추가 LLM 호출 0회). 서버가 보는 것은 목적 인자 · 변형 선언 · 도착 기록 ·
// 사용자 발화 수뿐이다.
//
// ── `resolveSmsGate` 판정표(⛔ 이 순서 그대로 — 설계 "resolveSmsGate" 표) ─────────────────────────
// | # | If | Then |
// |---|---|---|
// | 1 | `purpose`가 변형 `sms` 선언에 없다(enum 밖 · 부재 포함) | `not_allowed`(쓰기 0) |
// | 2 | 그 목적의 문자가 이미 도착 | `already_delivered`(쓰기 0) |
// | 3 | `userTurns < max(item.notBeforeUserTurns, FIRST_SMS_MIN_USER_TURNS)` | `too_early` |
// | 4 | 직전 문자 도착 이후 사용자 발화 `< MIN_USER_TURNS_BETWEEN_SMS` | `too_soon` |
// | 5 | 그 외 | `allowed` |
//
// ── `planSmsBackstop` 판정표(필수 목적만 강제 · 선택 목적은 건너뛰기 — 설계 "백스톱" 표 · AC-099 (e)) ──
// | If | Then |
// |---|---|
// | 아직 안 보낸 `required:true` 문자가 없다 | `none_pending`(백스톱 할 일 없음 — 선택 문자는 모델이 부를 때만 간다) |
// | 그 문자의 게이트 3·4가 열린 시점(`openAt`) + `BACKSTOP_USER_TURNS` × 2 ≤ `userTurns` | `deliver`(게이트를 다시 통과시켜 발송) |
// | `userTurns === openAt + BACKSTOP_USER_TURNS` | `nudge` 1회(정확히 그 발화에서만 — 상태 저장 없이 1회가 된다) |
// | 그 외 | `wait` |
import type { FlowVariantSms, SmsPurpose } from "../scenarios/flowVariants";
import { findFlowVariant } from "../scenarios/flowVariants";
import { findInCallSmsItem, hasInCallSms } from "../scenarios/inCallSms";

/** 첫 문자 하한 — 오프닝 뒤 참가자가 두 번 말하기 전엔 문자 없음(설계 판단값 · AC-099 (b) "첫 문자의 하한"). */
export const FIRST_SMS_MIN_USER_TURNS = 2;
/** 서로 다른 두 문자 사이 최소 사용자 발화 수(AC-099 (c)). */
export const MIN_USER_TURNS_BETWEEN_SMS = 2;
/** 백스톱 단계 간격 — 게이트가 열린 뒤 이만큼 발화하면 넛지, 다시 이만큼이면 발송(설계 판단값). */
export const BACKSTOP_USER_TURNS = 2;
/** 클라 주장 카운터의 범위 검사 상한(설계 "서버는 범위만 검사"). */
export const MAX_CLAIMED_TURNS = 200;

export const SMS_PURPOSES: readonly SmsPurpose[] = ["identity", "transfer", "link"];

export function isSmsPurpose(value: unknown): value is SmsPurpose {
  return typeof value === "string" && (SMS_PURPOSES as readonly string[]).includes(value);
}

/** 도착 기록 1건(`sessions/{sid}/inCallSms/{smsId}`에서 판정에 쓰는 필드만). */
export type DeliveredSmsRecord = {
  smsId: string;
  /**
   * 도착 시점의 사용자 발화 수(AC-099 (h)). 이 필드 도입 전에 쓰인 문서(배포 시점에 진행 중이던 세션)에는
   * 없다 — 그때는 0으로 본다(간격 판정이 가장 이른 쪽으로 기운다 · 무백필).
   */
  userTurnsAtArrival?: number;
  /** §108 — 이 문자가 연 랜딩을 제출했다(`landingSubmittedAt` — 끊기 4행 `goalActionDone` C-1). 부재 = 제출 전 · 읽지 않음. */
  landingSubmitted?: true;
};

export type SmsGateStatus = "allowed" | "not_allowed" | "already_delivered" | "too_early" | "too_soon";

export type SmsGateResult =
  | { status: "allowed"; item: FlowVariantSms }
  | { status: Exclude<SmsGateStatus, "allowed">; item?: FlowVariantSms };

export type SmsGateInput = {
  /** 요청된 목적(검증 전 원값 — enum 밖이면 1행 `not_allowed`). */
  purpose: unknown;
  /** 그 세션 흐름 변형의 문자 선언(`resolveDeclaredSms`). */
  declared: readonly FlowVariantSms[];
  delivered: readonly DeliveredSmsRecord[];
  /** 지금까지의 사용자 발화 수(실시간 = 클라 카운터 · 폴백 = 서버 `messages` 계수). */
  userTurns: number;
};

/** 직전 문자가 도착했을 때의 사용자 발화 수. 도착한 문자가 없으면 `undefined`. */
export function lastArrivalUserTurns(delivered: readonly DeliveredSmsRecord[]): number | undefined {
  if (delivered.length === 0) return undefined;
  return Math.max(...delivered.map((d) => d.userTurnsAtArrival ?? 0));
}

/** 이 항목의 게이트 3 하한. */
function earliestUserTurns(item: FlowVariantSms): number {
  return Math.max(item.notBeforeUserTurns, FIRST_SMS_MIN_USER_TURNS);
}

/** ⛔ 판정표 순서 그대로(위 머리 주석). 부수효과 0. */
export function resolveSmsGate(input: SmsGateInput): SmsGateResult {
  const item = isSmsPurpose(input.purpose)
    ? input.declared.find((declared) => declared.purpose === input.purpose)
    : undefined;
  if (!item) return { status: "not_allowed" };
  if (input.delivered.some((d) => d.smsId === item.smsId)) return { status: "already_delivered", item };
  if (input.userTurns < earliestUserTurns(item)) return { status: "too_early", item };
  const last = lastArrivalUserTurns(input.delivered);
  if (last !== undefined && input.userTurns - last < MIN_USER_TURNS_BETWEEN_SMS) {
    return { status: "too_soon", item };
  }
  return { status: "allowed", item };
}

export type SmsBackstopPlan =
  | { action: "none_pending" }
  | { action: "wait" }
  | { action: "nudge"; item: FlowVariantSms; openAt: number }
  | { action: "deliver"; item: FlowVariantSms };

/**
 * 이 필수 문자의 게이트 3·4가 열리는 사용자 발화 수 — `resolveSmsGate`가 처음 `allowed`를 내는 값과 같다
 * (테스트가 격자 전수로 대조한다 — 두 계산이 갈라지면 백스톱이 막힌 문을 두드린다).
 */
export function gateOpensAtUserTurns(
  item: FlowVariantSms,
  delivered: readonly DeliveredSmsRecord[],
): number {
  const last = lastArrivalUserTurns(delivered);
  const afterLast = last === undefined ? 0 : last + MIN_USER_TURNS_BETWEEN_SMS;
  return Math.max(earliestUserTurns(item), afterLast);
}

/**
 * 백스톱 판정(위 머리 주석 두 번째 표). 발송 자체는 호출부가 `resolveSmsGate`를 다시 통과시켜 한다.
 * ⭐ §104(2026-10-22 · 사용자 실기 신고 *"자산 검수 안내 등 문자를 보냈다고 하는데, 실제로는 안 와 있는"*) — `claimed`(사기범이 이미 "문자를 보냈다"고
 * 말했다 — 실시간 클라 주장)면 넛지 · 대기 단계를 건너뛰고 **게이트가 열린 순간** 보낸다(`userTurns ≥ openAt`). 게이트 하한(`notBeforeUserTurns` ·
 * 문자 간 간격)은 그대로다 — 하한 전이면 여전히 `wait`. 부재 · false = 종전 판정.
 */
export function planSmsBackstop(input: Omit<SmsGateInput, "purpose"> & { claimed?: boolean }): SmsBackstopPlan {
  const deliveredIds = new Set(input.delivered.map((d) => d.smsId));
  const pending = input.declared.filter((item) => item.required && !deliveredIds.has(item.smsId));
  if (pending.length === 0) return { action: "none_pending" };
  // 필수 문자는 변형당 1개뿐이지만(현행 데이터), 여럿이면 가장 먼저 열리는 것 · 같으면 선언 순서.
  let target = pending[0];
  let openAt = gateOpensAtUserTurns(target, input.delivered);
  for (const item of pending.slice(1)) {
    const at = gateOpensAtUserTurns(item, input.delivered);
    if (at < openAt) {
      target = item;
      openAt = at;
    }
  }
  if (input.claimed === true && input.userTurns >= openAt) return { action: "deliver", item: target };
  if (input.userTurns >= openAt + BACKSTOP_USER_TURNS * 2) return { action: "deliver", item: target };
  if (input.userTurns === openAt + BACKSTOP_USER_TURNS) return { action: "nudge", item: target, openAt };
  return { action: "wait" };
}

/**
 * ⭐ §108(2026-10-22 실기 신고 *"문자 발송이 여전히 느리게 온다"*) — 모델 도구(`send_prepared_sms`)의 **목적 보정**.
 * 운영 로그(§108.3): 모델이 문자를 보내려고 도구를 불렀는데 목적을 잘못 골라(`link`가 없는 시나리오에서 `link` → `not_allowed` ·
 * 이미 보낸 `link`를 다시 → `already_delivered`) 거절되고, 실제 문자는 2~3발화 뒤 백스톱으로만 왔다.
 * 판정표(위에서부터 첫 행):
 * | # | If | Then |
 * |---|---|---|
 * | P-1 | 요청 목적이 게이트를 통과한다(`allowed`) | 그대로 |
 * | P-2 | 요청 목적이 `not_allowed` ∨ `already_delivered` ∧ 남은 필수 문자의 게이트가 **지금 열려 있다**(`planSmsBackstop` `claimed` = deliver) | 그 필수 문자의 목적으로 바꾼다 |
 * | P-3 | 그 밖(`too_early` · `too_soon` — 하한 전 · 남은 필수 0 · 게이트 닫힘) | 그대로(거절 — 하한은 앞당기지 않는다) |
 * 반환 = 실제로 게이트에 넘길 목적 · 바꿨으면 `correctedFrom`(로그용).
 */
export function correctModelSmsPurpose(input: SmsGateInput): { purpose: unknown; correctedFrom?: string } {
  const gate = resolveSmsGate(input);
  if (gate.status !== "not_allowed" && gate.status !== "already_delivered") return { purpose: input.purpose };
  const plan = planSmsBackstop({ declared: input.declared, delivered: input.delivered, userTurns: input.userTurns, claimed: true });
  if (plan.action !== "deliver") return { purpose: input.purpose };
  return {
    purpose: plan.item.purpose,
    correctedFrom: typeof input.purpose === "string" ? input.purpose.slice(0, 32) : "invalid",
  };
}

/**
 * 세션의 문자 선언 — `flowVariantId` → 변형 `sms`. 카탈로그(`IN_CALL_SMS`)에 없는 smsId는 뺀다(본문 원천이
 * 없으면 보낼 수 없다 · `flowVariants.test.ts`가 정합을 고정한다).
 * - 변형 부재(과거 세션) · 알 수 없는 ID · 다른 시나리오의 ID ⇒ 빈 선언 = 문자 0통(`reason`으로 관측 가능 — 조용한
 *   임의 발송 금지. 예전 카탈로그 고정 턴 경로는 폐기됐다).
 */
export function resolveDeclaredSms(
  scenarioId: string,
  flowVariantId: string | undefined,
): { declared: FlowVariantSms[]; reason?: "no_variant" | "unknown_variant" | "scenario_mismatch" } {
  if (!flowVariantId) return { declared: [], reason: "no_variant" };
  const variant = findFlowVariant(flowVariantId);
  if (!variant) return { declared: [], reason: "unknown_variant" };
  if (variant.scenarioId !== scenarioId) return { declared: [], reason: "scenario_mismatch" };
  return { declared: variant.sms.filter((item) => findInCallSmsItem(scenarioId, item.smsId) !== undefined) };
}

/**
 * ⭐ 리뷰 Minor ③ — 넛지 1회 보장의 서버 쪽 고리. 화면이 재마운트돼 질의 기록(`lastRequestedUserTurns`)이 지워지면 같은
 * 발화 수로 다시 물을 수 있다. 이미 넛지한 게이트 개방 시점(`openAt`)이 세션 문서 `smsNudgedOpenAt`에 있으면 넛지하지
 * 않는다. 값은 사용자 발화 수(숫자)뿐이다 — 목적 · smsId는 쓰지 않는다(설계 금지 X1).
 */
export function alreadyNudged(nudgedOpenAt: readonly number[] | undefined, openAt: number): boolean {
  return (nudgedOpenAt ?? []).includes(openAt);
}

/**
 * ⭐ 리뷰 M2 — "이 세션에 통화 중 문자가 있는가"의 **단일 술어**. Live 도구 선언(`liveTools.ts` 2곳) · 프롬프트의
 * `inCallSmsEnabled`(호출부 3곳: `geminiProvider` · `roleplay/index` · `openingLine`) · 자격증명 `inCallSmsBackstop`
 * (`realtime/index`)이 전부 이 함수를 부른다(조건식 복사 금지 — §59 Critical #2 "문면-선언 불일치" 재발 방지).
 * - 변형 ID가 있으면: 그 변형이 문자를 1개 이상 선언했는가(선언 0 변형은 도구 · 문자 문면 · 백스톱 전부 꺼진다).
 * - 변형 ID가 없으면(변형 도입 전 세션 · 2인 챌린지 등 무소급): 종전 판정 `hasInCallSms(scenarioId)` 그대로 —
 *   조립 산출물이 종전과 바이트 단위로 같다(`smsGate.test.ts`가 전 시나리오 × 난이도로 고정). ⚠️ 이 경우 발송 판정의
 *   선언은 비어 있어(`resolveDeclaredSms` → `no_variant`) 도구를 불러도 `not_allowed`다 — 관측 가능한 강등(로그 `declaredReason`).
 */
export function sessionDeclaresInCallSms(scenarioId: string, flowVariantId: string | undefined): boolean {
  if (!flowVariantId) return hasInCallSms(scenarioId);
  return resolveDeclaredSms(scenarioId, flowVariantId).declared.length > 0;
}

/**
 * A-1 ②(2026-10-19 · audit-A R3) — 프롬프트 문자 예외 항목에 실을 **선언 목적**(`promptAssembly` `inCallSmsPurposes`).
 * 호출부 3곳(`geminiProvider` · `roleplay/index` · `openingLine`)이 `sessionDeclaresInCallSms`와 나란히 이 함수를 부른다
 * (조건식 복사 금지 — 같은 원천 `resolveDeclaredSms`).
 * - 변형 ID가 없으면 `undefined`(종전 템플릿 — 조립 산출물 바이트 동일 · `sessionDeclaresInCallSms`의 무소급 규칙과 같은 갈래).
 * - 변형 ID가 있으면 선언 순서대로 중복 없는 목적 목록(선언 0이면 빈 배열 — 그때는 문자 문면 자체가 꺼진다).
 */
export function sessionDeclaredSmsPurposes(
  scenarioId: string,
  flowVariantId: string | undefined,
): SmsPurpose[] | undefined {
  if (!flowVariantId) return undefined;
  const purposes: SmsPurpose[] = [];
  for (const item of resolveDeclaredSms(scenarioId, flowVariantId).declared) {
    if (!purposes.includes(item.purpose)) purposes.push(item.purpose);
  }
  return purposes;
}

/**
 * 2026-10-21(사용자 실기 신고 — 기관 사칭 고급 "내가 알아서 이체") — 이 세션이 선언한 계좌(transfer) 문자 중 **이체 화면을 여는 링크**
 * (카탈로그 `fakeLandingId`)가 붙은 것이 있는가(`promptAssembly` `transferSmsLink`). 호출부 3곳이 `sessionDeclaredSmsPurposes`와
 * 나란히 부른다. 변형 ID 부재 = 거짓(종전 템플릿 — 무소급).
 */
export function sessionTransferSmsOpensLanding(scenarioId: string, flowVariantId: string | undefined): boolean {
  if (!flowVariantId) return false;
  return resolveDeclaredSms(scenarioId, flowVariantId).declared.some(
    (item) => item.purpose === "transfer" && findInCallSmsItem(scenarioId, item.smsId)?.fakeLandingId !== undefined,
  );
}

/**
 * ⭐ 리뷰 M1 — 텍스트 폴백 판정에 쓰는 사용자 발화 수 = max(서버 `messages`의 user 수, 마지막 도착 문서의
 * `userTurnsAtArrival`). 실시간 통화가 도중에 폴백으로 강등되면 실시간 구간의 전사는 통화 종료 때에야 `messages`에
 * 올라가므로(`submitTranscript`) 서버 계수가 실시간 클라 계수보다 작다. 보정하지 않으면 실시간에서 받은 문자의
 * 발화 수(클라 단위)와 폴백 계수(서버 단위)를 섞어 간격 판정이 음수가 되거나 하한을 다시 통과한다.
 * max로 두면 단위가 섞여도 "직전 문자보다 앞선 발화 수"로는 판정하지 않는다(보수 쪽 — 다음 문자가 늦어질 수는 있다).
 */
export function effectiveTextPathUserTurns(
  serverUserTurns: number,
  delivered: readonly DeliveredSmsRecord[],
): number {
  return Math.max(serverUserTurns, lastArrivalUserTurns(delivered) ?? 0);
}

// ── 서버 소유 모델 지시 문면(G101/G386 관례 — 클라가 저작하지 않는다) ─────────────────────────────
// ⛔ "재촉" · "다급" 0 · 인용 예시 대사 0(AC-099 (g) · 설계 announce 문면 규칙과 같은 기준 — smsGate.test.ts).

const PURPOSE_LABEL: Record<SmsPurpose, string> = {
  identity: "인증번호",
  transfer: "계좌",
  link: "링크",
};

/** `not_allowed` 거부 문면(설계 정본 1줄 그대로). */
export const SMS_DECLINE_NOT_ALLOWED =
  "(그런 안내는 보낼 수 없다. 문자를 보냈다고 말하지 말고 하던 이야기를 이어가라.)";

/** 백스톱 넛지(설계 정본 문면의 `{목적}` 자리에 목적 라벨). 실시간 = 맥락 주입 · 폴백 = 턴 지시 1줄. */
export function buildSmsNudgeInstruction(purpose: SmsPurpose): string {
  return `(필요하면 지금 ${PURPOSE_LABEL[purpose]} 안내 문자를 보내도 된다 — 아직 그 단계가 아니면 무시하라.)`;
}

/** 텍스트 폴백 마커 원문(`[[SMS:transfer]]`) — 마커 추출(`roleplay/smsMarker.ts`)과 같은 모양. */
export function smsMarkerFor(purpose: SmsPurpose): string {
  return `[[SMS:${purpose}]]`;
}

/**
 * 텍스트 폴백 — 지금 게이트가 열린 목적만 모델에게 마커로 제시하는 턴 지시 1줄. 열린 목적이 없으면 `undefined`
 * (그 턴에는 문자 이야기 자체를 꺼내지 않게 — 지시가 없을 때 보냈다고 말하지 않는다는 프롬프트 규칙과 맞물린다).
 * ⚠️ 제시한 목적만 마커로 받으므로, 같은 요청 안에서 사후 판정(`resolveSmsGate`)이 다르게 나오는 경우는
 * 동시 요청 경합뿐이다(그때는 거부 로그 1줄 · 문서 0).
 */
export function buildSmsMarkerOfferInstruction(purposes: readonly SmsPurpose[]): string | undefined {
  if (purposes.length === 0) return undefined;
  const options = purposes.map((p) => `${smsMarkerFor(p)}(${PURPOSE_LABEL[p]} 안내)`).join(" · ");
  return `(문자 안내 — 대화가 지금 그 단계에 이르렀다고 판단될 때만 답변 맨 끝에 다음 표시 중 하나를 그대로 붙이면 그 문자가 상대 휴대전화에 실제로 도착한다: ${options}. 표시를 붙였다면 그 답변 안에서 문자를 보냈다는 사실을 한 문장으로 알리고 상대의 반응을 기다려라. 아직 그 단계가 아니면 표시를 붙이지 말고 문자 이야기도 꺼내지 마라.)`;
}
