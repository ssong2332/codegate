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
// | — | 그 밖 · 선언을 해석할 수 없음(변형 없음 · 모름) · 읽기 실패 | 미완료(4행 fail-closed) |
// ⛔ 끊을지 판단은 여전히 모델이다(H-1~H-5) — 이 값은 4행이 **막지 않게** 할 뿐이다. 하한 5 · 6 · 7행은 그대로.
// ⚠️ `userTurns`는 경로마다 판정표 5행과 같은 값이다(실시간 = 클라 주장 · 폴백 = 서버 계수 — OQ-A120과 같은 등급).
import type { DeliveredSmsRecord } from "../inCallSms/smsGate";
import type { FlowVariantSms } from "../scenarios/flowVariants";

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

/** `mockScreens` 문서에서 판정에 쓰는 사실 2개(시각 값의 존재만). */
export type MockScreenCompletion = { consented: boolean; submitted: boolean };

export type GoalActionInput = {
  delivered: readonly DeliveredSmsRecord[];
  mockScreens: readonly MockScreenCompletion[];
  /** `resolveDeclaredSms`의 선언. `declaredKnown = false`(변형 없음 · 모름 · 시나리오 불일치)면 C-3 · C-4를 보지 않는다. */
  declared: readonly FlowVariantSms[];
  declaredKnown: boolean;
  /** 판정표 5행과 같은 사용자 발화 수. */
  userTurns: number;
};

export function hasCompletedGoalAction(input: GoalActionInput): boolean {
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

/** 세션의 `mockScreens` 문서를 읽어 판정 사실만 남긴다. 실패는 호출부가 잡는다(미완료로 본다). */
export async function readMockScreenCompletion(
  sessionRef: FirebaseFirestore.DocumentReference,
): Promise<MockScreenCompletion[]> {
  const snap = await sessionRef.collection("mockScreens").get();
  return snap.docs.map((doc) => ({ consented: Boolean(doc.get("consentedAt")), submitted: Boolean(doc.get("submittedAt")) }));
}
