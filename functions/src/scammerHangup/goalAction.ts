// §108(2026-10-22 사용자 결정 · 메인 세션 A2안 · DECISIONS #223) — 끊기 판정표 4행의 "할 일을 다 했다" 입력(`goalActionDone`).
// 실시간 콜러블(`scammerHangup/index.ts`)과 텍스트 폴백(`roleplay/index.ts`)이 **이 파일 하나**를 부른다(AC-103 (f) "같은 조건").
//
// 판정표(하나라도 참이면 완료 — 사용자 의도 *"할 게 없으면 끊는다"*):
// | # | If(서버 기록 · 서버 선언) | 뜻 |
// |---|---|---|
// | C-1 | 통화 중 문자 문서 `landingSubmittedAt` | 문자 링크가 연 화면(이체 · 신청)을 제출했다 |
// | C-2 | `mockScreens` 문서 `consentedAt` ∨ `submittedAt` | 앱 설치 화면 응낙 · 화면 제출 |
// | C-3 | 선언된 필수 문자 ≥ 1 ∧ 전부 도착 ∧ 마지막 도착 뒤 참가자 발화 ≥ `GOAL_AFTER_LAST_SMS_USER_TURNS` | 화면이 없는 흐름(계좌 문자만)에서 보낼 것을 다 보내고 행동할 기회를 줬다 |
// | C-4 | 선언된 문자 0(흐름 변형이 `sms: []`) ∧ 참가자 발화 ≥ `GOAL_NO_SMS_MIN_USER_TURNS` | 문자 없는 흐름(카드사 고급 `fv-akj5` — 2인 챌린지 고급)에서 요구를 다 꺼낼 시간이 지났다 |
// | C-5 | ⭐ §115 — 변형에 후속 단계(`goalFollowUpUserTurns`)가 있다: 필수 문자 ≥ 1 ∧ 전부 도착 ∧ 마지막 도착 뒤 참가자 발화 ≥ 그 값 | **이 변형은 C-1 ~ C-4 대신 이 행만 본다** — 이체 화면을 제출해도 뒤에 대출 실행 유도가 남아 있다(기관 사칭 고급 2벌) |
// | — | 그 밖 · 선언을 해석할 수 없음(변형 없음 · 모름) · 읽기 실패 | 미완료(4행 fail-closed) |
// ⛔ 끊을지 판단은 여전히 모델이다(H-1~H-5) — 이 값은 4행이 **막지 않게** 할 뿐이다. 하한 5 · 6 · 7행은 그대로.
// ⚠️ `userTurns`는 경로마다 판정표 5행과 같은 값이다(실시간 = 클라 주장 · 폴백 = 서버 계수 — OQ-A120과 같은 등급).
import type { DeliveredSmsRecord } from "../inCallSms/smsGate";
import { findFlowVariant, type FlowVariantSms } from "../scenarios/flowVariants";
import { findInCallSmsItem } from "../scenarios/inCallSms";
import { resolveMockScreenKind } from "../scenarios/mockScreens";

/**
 * C-3 — 마지막 문자 도착 뒤 참가자 발화 수. ⚠️ **판단값**(측정값 아님): 문자 백스톱의 넛지 간격(`BACKSTOP_USER_TURNS = 2`) · 문자 간 간격
 * (`MIN_USER_TURNS_BETWEEN_SMS = 2`)과 같은 단위다 — 도착 뒤 첫 발화(문자 확인 · 6행 해제)와 둘째 발화(행동 · 보고)를 준다.
 */
export const GOAL_AFTER_LAST_SMS_USER_TURNS = 2;

/**
 * C-4 — 문자 선언 0 변형의 추가 하한(메인 세션 *"필요하면 그 변형만 추가 하한"*). ⚠️ **판단값**: `fv-akj5`의 0번 화자 `maxUserTurns = 8`(그 변형이
 * 스스로 잡은 첫 화자 대화 길이)과 같다 — 요구 3단계(`demandStages: 3`)를 진행 강제 간격(2~3턴)으로 꺼낼 시간. 이 값이 없으면 C-3을 그대로
 * 적용할 때 "남은 필수 0"이 처음부터 참이 되어 4행이 사실상 꺼진다(하한 3만 남음 — §108.2 표).
 */
export const GOAL_NO_SMS_MIN_USER_TURNS = 8;

/** `mockScreens` 문서에서 판정에 쓰는 사실 2개(시각 값의 존재만). P1 M1 — 문서 id(= `landingId`)도 싣는다(4-c행 · 부재 = 종전 호출부). */
export type MockScreenCompletion = { consented: boolean; submitted: boolean; landingId?: string };

export type GoalActionInput = {
  delivered: readonly DeliveredSmsRecord[];
  mockScreens: readonly MockScreenCompletion[];
  /** `resolveDeclaredSms`의 선언. `declaredKnown = false`(변형 없음 · 모름 · 시나리오 불일치)면 C-3 · C-4를 보지 않는다. */
  declared: readonly FlowVariantSms[];
  declaredKnown: boolean;
  /** 판정표 5행과 같은 사용자 발화 수. */
  userTurns: number;
  /** §115 C-5 — 변형의 `goalFollowUpUserTurns`(`goalFollowUpFor`). 부재 = C-1 ~ C-4(종전). */
  followUpUserTurns?: number;
};

/** §115 — 세션 변형의 후속 단계 발화 수. 변형이 없거나 시나리오가 다르면 undefined(종전 판정). */
export function goalFollowUpFor(scenarioId: string, flowVariantId: string | undefined): number | undefined {
  const variant = findFlowVariant(flowVariantId);
  return variant && variant.scenarioId === scenarioId ? variant.goalFollowUpUserTurns : undefined;
}

export function hasCompletedGoalAction(input: GoalActionInput): boolean {
  if (input.followUpUserTurns !== undefined) return followUpDone(input, input.followUpUserTurns); // C-5
  if (input.delivered.some((d) => d.landingSubmitted === true)) return true; // C-1
  if (input.mockScreens.some((m) => m.consented || m.submitted)) return true; // C-2
  if (!input.declaredKnown) return false;
  const required = input.declared.filter((item) => item.required);
  if (input.declared.length === 0) return input.userTurns >= GOAL_NO_SMS_MIN_USER_TURNS; // C-4
  if (required.length === 0) return false;
  const arrivals = required.map((item) => input.delivered.find((d) => d.smsId === item.smsId));
  if (arrivals.some((a) => a === undefined)) return false;
  const lastArrival = Math.max(...arrivals.map((a) => a?.userTurnsAtArrival ?? 0));
  return input.userTurns - lastArrival >= GOAL_AFTER_LAST_SMS_USER_TURNS; // C-3
}

/** §115 C-5 — 필수 문자가 모두 도착했고 마지막 도착 뒤 발화가 후속 단계 몫만큼 지났는가. */
function followUpDone(input: GoalActionInput, followUpUserTurns: number): boolean {
  if (!input.declaredKnown) return false;
  const required = input.declared.filter((item) => item.required);
  if (required.length === 0) return false;
  const arrivals = required.map((item) => input.delivered.find((d) => d.smsId === item.smsId));
  if (arrivals.some((a) => a === undefined)) return false;
  const lastArrival = Math.max(...arrivals.map((a) => a?.userTurnsAtArrival ?? 0));
  return input.userTurns - lastArrival >= followUpUserTurns;
}

/**
 * ⭐ §115 — 문자 백스톱 질의(사용자 발화마다)에서 남은 필수 문자가 없을 때의 다음 행동. 후속 단계 변형만 대상이다.
 * | If | Then |
 * |---|---|
 * | 후속 값 없음(그 밖 모든 변형 — 다른 확인 무력화 고급 포함) | `none` — 종전(`none_pending` · 클라는 더 묻지 않는다) |
 * | 호 전환이 끝났다(확인 창구 화자) | `none` — 원 사기범이 없다(넛지와 같은 판단) |
 * | C-5 아직 거짓 | `pending` — 클라가 다음 발화에 다시 묻는다(`goal_pending`) |
 * | C-5 참(⭐ §117 — 다음 발화 기준 · 아래 주석) | `wrap_up` — 마무리 지시(`none_pending` + `wrapUpInstruction` — 클라는 그 뒤 더 묻지 않는다 = 1회) |
 */
export function planGoalWrapUp(input: Omit<GoalActionInput, "mockScreens"> & { placed: boolean }): "none" | "pending" | "wrap_up" {
  if (input.followUpUserTurns === undefined || input.placed) return "none";
  // ⭐ §117 — 백스톱 질의의 `userTurns`는 **응답까지 끝난** 발화 수다. 이 지시는 맥락 주입이라 **다음** 발화의 응답에 실리고, 끊기 승인은 그
  // 발화를 포함한 수(클라 주장 = flush + 응답 중 1)로 판정한다 ⇒ 한 발화 앞당겨 맞춘다. 종전에는 C-5가 참이 된 발화에서 모델이 끊지 않으면
  // 지시가 그다음 응답에야 붙어 한 응답 늦었다.
  return followUpDone({ ...input, userTurns: input.userTurns + 1, mockScreens: [] }, input.followUpUserTurns) ? "wrap_up" : "pending";
}

/** 세션의 `mockScreens` 문서를 읽어 판정 사실만 남긴다. 실패는 호출부가 잡는다(미완료로 본다). */
export async function readMockScreenCompletion(
  sessionRef: FirebaseFirestore.DocumentReference,
): Promise<MockScreenCompletion[]> {
  const snap = await sessionRef.collection("mockScreens").get();
  return snap.docs.map((doc) => ({
    landingId: doc.id,
    consented: Boolean(doc.get("consentedAt")),
    submitted: Boolean(doc.get("submittedAt")),
  }));
}

// ── ⭐ P1 M1(2026-10-31 · 운영 세션 b94b9eec 검찰 고급 `fv-h3vn` — 자산 검수 사이트 이체 전에 사용자 발화 11에서 `goal` 끊기 승인) ──────────
// 끊기 판정표 4-c행 입력(`decisionScreenPending`). 실제 사기범은 송금을 받기 전에는 끊지 않는다(`prosecution-call-reality-check-2026-10-31.md`
// §1 R11 · R12 · §3 M1). 4행(확인 무력화) · 4-b행(후속 단계)이 없는 루트는 지금까지 하한(5행)만 넘으면 결정 화면 전에도 `goal`로 끊을 수 있었다.
//
// 결정 화면 판정표(위에서부터 첫 행):
// | # | If(서버 선언 · 서버 기록) | Then |
// |---|---|---|
// | D-1 | 후속 단계 변형(4-b행이 맡는다) | 대상 아님(`false`) — ⭐ D-a(P2 실측 2026-11-01)로 확인 무력화 세션은 대상에 들어왔다(아래 주석) |
// | D-2 | 선언을 해석할 수 없다(변형 없음 · 모름 · 시나리오 불일치) | 대상 아님(`false` — 화면이 올 수 없다) |
// | D-2b | 결정 순간이 **말**인 변형(`VERBAL_DECISION_VARIANTS` — 화면은 앞 단계뿐) | 대상 아님(`false` — 메인 세션 결정 2026-10-31 B안) |
// | D-3 | 선언된 문자 중 `required` ∧ 목적 `transfer` ∨ `link` ∧ 카탈로그에 모의 화면(`fakeLandingId`)이 있는 것이 없다 | 대상 아님(`false` — 말로 끝나는 결말은 범위 밖) |
// | D-4 | 그중 **선언 순서상 마지막** 화면(= 결정 화면)을 마쳤다 — 입력 화면은 그 문자 문서 `landingSubmittedAt` · 설치 화면은 `mockScreens/{landingId}` 응낙 ∨ 제출 | 완료(`false`) |
// | D-5 | 그 밖 | 대기(`true`) — 4-c행이 `goal` · 사유 없음 끊기를 막는다(`give_up`은 막지 않는다) |
// ⚠️ "마지막 화면"인 이유: 검찰 `fv-h3vn`은 사건 조회(본인 확인 입력 — 앞 단계)와 자산 검수 사이트(이체 — 결정 순간)를 둘 다 선언한다. 아무 화면이나 제출로
// 보면 앞 단계 본인 확인만으로 풀린다. 선언 순서 = 단계 순서인지는 `decisionScreen.test.ts`가 전 변형에서 `notBeforeUserTurns` 오름차순으로 고정한다.
// ⛔ 이 값은 끊기를 *막을* 뿐이다 — 끊을지 판단은 여전히 모델이다(H-1~H-5).

/**
 * ⭐ D-2b(메인 세션 결정 2026-10-31 B안) — 모의 화면을 선언했지만 그 화면이 **앞 단계**이고 결정 순간은 말(약속 · 번호 불러 주기)인 변형.
 * 이 변형에서 화면 제출을 끊기 조건으로 삼으면 약속까지 받은 사기범도 `goal`로 끊지 못한다(현실과 다름).
 * ⚠️ P4(대출 체험) · P5(현금 · 금 · 상품권)에서 결정 순간이 서비스 안 화면으로 바뀌면 **이 목록에서 빼서 4-c 대상으로 옮긴다**
 * (`in-service-experience-plan-2026-10-31.md` §5). `decisionScreenHangup.test.ts`가 목록과 대상 장부를 함께 고정한다.
 */
export const VERBAL_DECISION_VARIANTS: readonly string[] = [
  "fv-k9ra", // 자산 보호 고급 — 보관 접수 신청 화면 뒤 인출 · 전달 약속(P5 현금)
  "fv-t8ga", // 자산 보호 고급 — 보관 접수 신청 화면 뒤 금 제출 약속(P5 금)
  "fv-v2mk", // 검찰 고급 — 사건 조회 화면 뒤 상품권 핀 번호(P5 상품권)
  "fv-a6lq", // 검찰 고급 — 사건 조회 화면 뒤 대출 약속(P4 대출)
];

export type DecisionScreenInput = {
  scenarioId: string;
  /** 세션 `flowVariantId`(D-2b). */
  flowVariantId: string | undefined;
  delivered: readonly DeliveredSmsRecord[];
  mockScreens: readonly MockScreenCompletion[];
  declared: readonly FlowVariantSms[];
  declaredKnown: boolean;
  /** 확인 무력화 세션(`isVerifyInterceptSession` · 폴백 `verifyEnabled`). */
  verifyEnabled: boolean;
  /** `goalFollowUpFor` 값(부재 = 후속 단계 변형 아님). */
  followUpUserTurns: number | undefined;
};

/** D-3 — 이 선언의 결정 화면 문자(선언 순서상 마지막 · 없으면 undefined). */
export function finalDecisionScreenSms(scenarioId: string, declared: readonly FlowVariantSms[]): FlowVariantSms | undefined {
  const screens = declared.filter(
    (item) =>
      item.required &&
      (item.purpose === "transfer" || item.purpose === "link") &&
      findInCallSmsItem(scenarioId, item.smsId)?.fakeLandingId !== undefined,
  );
  return screens[screens.length - 1];
}

/** 위 판정표(D-1 ~ D-5). 부수효과 0. */
export function isDecisionScreenPending(input: DecisionScreenInput): boolean {
  // ⭐ D-a(P2 실 키 실측 2026-11-01 · 대출 고급 `fv-m3hd`) — 확인 무력화 세션을 4-c에서 빼고 4행에 맡겼더니, 4행 입력(`goalActionDone`)이 **아무 화면** 제출(설치 응낙)로
  // 참이 되어 이체 문자 전에 goal 끊기가 승인됐다. 이제 확인 무력화 세션도 4-c 대상이다 — 4행(호 전환 · 화면 행동 전 모든 끊기)을 지난 뒤에도 goal 끊기는
  // 선언 순서상 마지막 화면을 마칠 때까지 막힌다(`give_up`은 통과 — 거절하는 참가자를 붙잡아 두지 않는다). `verifyEnabled`는 입력으로 남긴다(호출부 무변경).
  if (input.followUpUserTurns !== undefined) return false; // D-1
  if (!input.declaredKnown) return false; // D-2
  if (input.flowVariantId !== undefined && VERBAL_DECISION_VARIANTS.includes(input.flowVariantId)) return false; // D-2b
  const screen = finalDecisionScreenSms(input.scenarioId, input.declared);
  if (screen === undefined) return false; // D-3
  const landingId = findInCallSmsItem(input.scenarioId, screen.smsId)?.fakeLandingId;
  const submitted = input.delivered.some((d) => d.smsId === screen.smsId && d.landingSubmitted === true);
  const installed =
    landingId !== undefined &&
    resolveMockScreenKind(input.scenarioId, landingId) === "app-install" &&
    input.mockScreens.some((m) => m.landingId === landingId && (m.consented || m.submitted));
  return !(submitted || installed); // D-4 · D-5
}
