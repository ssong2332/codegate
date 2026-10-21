// 시안 E2 준비 화면 · 경계 판(UX D-141 (5) · D-143 · docs/Architecture.md §97.7 · §100) — 순수 규칙(단위 테스트 대상).
//
// ⭐ §100(UX D-143 · 2026-10-22) — 준비 화면은 **서버가 실제로 끝낸 준비 단계만** 하나씩 체크한다. 사용자 원문:
//    *"4번은 다른 방향으로 변경하자. 보통 10~15초가 나오는데, 다른 방식으로 전환"* → 선택지 중 '실제 준비 단계 표시'.
//    신호는 createSession 스트리밍 조각(`functions/src/session/prepStages.ts`)과 최종 응답뿐이다 — 시간이 지났다고 체크하지 않는다.
// ⛔ 진행률 · 퍼센트 · "1/3" 숫자 표기 · 경과 초 · 예상 시간 표기 금지(D-134 유지 — 체크는 실제 신호가 온 단계에만).

import type { LoadingHint } from "../motion/routeMotion.ts";

/** 서버가 끝내는 순서 그대로. `functions/src/session/prepStages.ts` CREATE_SESSION_PREP_STAGES와 같아야 한다(G700). */
export const PREP_STAGE_ORDER = ["scenario", "opening", "saved"] as const;
export type PrepStage = (typeof PREP_STAGE_ORDER)[number];

export function isPrepStage(value: unknown): value is PrepStage {
  return typeof value === "string" && (PREP_STAGE_ORDER as readonly string[]).includes(value);
}

/** 단계 문면 — 대기(아직 시작 전 — "…하기") / 진행 중(…하고 있어요) / 완료(…했어요). 채널마다 둘째 단계 말만 다르다. */
export type PrepStepCopy = { stage: PrepStage; waiting: string; active: string; done: string };

export function prepStepsFor(channel: "voice" | "messenger"): readonly PrepStepCopy[] {
  return [
    { stage: "scenario", waiting: "훈련 내용 고르기", active: "훈련 내용을 고르고 있어요", done: "훈련 내용을 골랐어요" },
    channel === "voice"
      ? { stage: "opening", waiting: "상대가 할 첫마디 만들기", active: "상대가 할 첫마디를 만들고 있어요", done: "상대가 할 첫마디를 만들었어요" }
      : { stage: "opening", waiting: "상대가 보낼 첫 메시지 만들기", active: "상대가 보낼 첫 메시지를 만들고 있어요", done: "상대가 보낼 첫 메시지를 만들었어요" },
    { stage: "saved", waiting: "훈련 열 준비", active: "훈련을 열 준비를 하고 있어요", done: "훈련을 열 준비가 끝났어요" },
  ];
}

/**
 * 받은 신호 → 끝난 단계 수(앞에서부터). 서버는 단계를 차례로 끝내므로 뒤 단계 신호는 앞 단계도 끝났다는 뜻이다.
 * 줄어들지 않는다(늦게 온 앞 단계 신호가 체크를 지우지 않는다). 모르는 값은 무시한다.
 */
export function advancePrepDone(doneCount: number, stage: unknown): number {
  if (!isPrepStage(stage)) return doneCount;
  return Math.max(doneCount, PREP_STAGE_ORDER.indexOf(stage) + 1);
}

/** 최종 응답이 왔다 = 세 단계가 모두 끝났다(스트리밍을 못 받은 경우에도 참인 유일한 신호). */
export const PREP_ALL_DONE = PREP_STAGE_ORDER.length;

export type PrepStepState = "done" | "active" | "waiting";

/** 끝난 단계는 완료 · 그다음 하나는 진행 중(서버가 지금 하고 있는 일) · 나머지는 대기. */
export function prepStepState(index: number, doneCount: number): PrepStepState {
  if (index < doneCount) return "done";
  return index === doneCount ? "active" : "waiting";
}

/** 낭독(role=status) — 방금 끝난 단계와 지금 하는 단계. 숫자 · "n단계" 표기 0. */
export function prepAnnouncement(steps: readonly PrepStepCopy[], doneCount: number): string {
  const lastDone = doneCount > 0 ? steps[Math.min(doneCount, steps.length) - 1]?.done : undefined;
  const active = steps[doneCount]?.active;
  return [lastDone && `${lastDone}.`, active && `지금은 ${active}.`].filter(Boolean).join(" ");
}

/** 오래 걸릴 때만 덧붙이는 안심 문구(D-134 SESSION_PREP_HINTS 중 0초 문구는 단계 목록이 대신한다). */
export function slowPrepHints(hints: readonly LoadingHint[]): readonly LoadingHint[] {
  return hints.filter((h) => h.afterMs > 0);
}

/** 대기 중 예방 요령 — 시안 E2 TIPS 문면 그대로(일반 원칙만 — 시나리오 흐름 · 수법 순서는 말하지 않는다). */
export const PREP_TIPS: readonly string[] = [
  "검찰·경찰·금감원은 전화로 돈을 옮기라고 하지 않습니다.",
  "문자로 온 링크로 신분증·카드번호를 넣지 마세요.",
  // 리뷰 Minor — 메신저 경로에서도 맞게 채널 중립(전화 · 메시지 둘 다).
  "의심되면 멈추고, 내가 직접 찾은 대표번호로 확인하세요.",
];

/**
 * §100.5(2026-10-22 실기 신고 — 카드사 시나리오에 "검찰·경찰·금감원…" 요령이 먼저 나왔다) — 요령은 **시나리오의 사칭 유형**에 맞춰 고른다.
 * ⛔ 새 안내를 지어내지 않는다: 문장은 위 PREP_TIPS 또는 리포트 대처법(`functions/src/report/analyzeConversation.ts`
 *    `pickCorrectAction`)의 문장을 **글자 그대로** 쓴다(G703이 원문에 있는지 본다). 채널(보이스/메신저) 변형도 그 함수 그대로다.
 */
const TIP = {
  institutionNoMoney: PREP_TIPS[0],
  smsLink: PREP_TIPS[1],
  authorityVoice: "전화로 신원(경찰·기관 등)을 주장해도 그 자리에서 믿지 말고, 공식 대표번호로 직접 걸어 확인하세요.",
  verifyKnownNumber: "상대가 확인 전화를 막으려 해도 반드시 알고 있는 번호로 직접 전화해 사실을 확인하세요.",
  moneyVoice: "계좌번호나 송금을 요구받으면 절대 응하지 말고, 전화를 끊은 뒤 112(경찰)나 가족에게 직접 확인하세요.",
  moneyMessenger: "계좌번호나 송금을 요구받으면 절대 응하지 말고, 대화를 멈춘 뒤 112(경찰)나 가족에게 직접 확인하세요.",
  urgencyVoice: "아무리 다급해 보여도 그 자리에서 결정하지 말고, 일단 전화를 끊고 잠시 시간을 두어 사실관계를 확인하세요.",
  family: "감정이 흔들리더라도 실제 그 사람이 맞는지부터 다른 방법(직접 전화·영상통화)으로 확인하세요.",
  commonVoice: "전화를 끊고 알고 있는 번호로 직접 다시 연락해 사실을 확인하세요.",
  commonMessenger: "대화를 멈추고 알고 있는 번호로 직접 연락해 사실을 확인하세요.",
} as const;

/** 사칭 유형 — 판정표(docs/Architecture.md §100.5). 시나리오가 늘면 여기 한 줄을 더한다(G703이 빠진 시나리오를 잡는다). */
export type PrepTipKind = "institution" | "tax" | "finance" | "courier" | "family" | "threat" | "smishing";

export const PREP_TIP_KIND_BY_SCENARIO: Readonly<Record<string, PrepTipKind>> = {
  "institutional-impersonation": "institution",
  "prosecution-cooperation-call": "institution",
  "asset-protection-notice-call": "institution",
  "tax-refund-scam": "tax",
  "card-company-impersonation": "finance",
  "bank-security-verify-scam": "finance",
  "loan-refinance-scam": "finance",
  "card-delivery-call": "finance",
  "courier-customs-scam": "courier",
  "family-accident-deepvoice": "family",
  "grandchild-impersonation": "family",
  "kidnapping-threat": "family",
  "messenger-child-impersonation-kakao": "family",
  "messenger-friend-loan-kakao": "family",
  "reputation-blackmail-scam": "threat",
  "messenger-parcel-smishing-sms": "smishing",
  "messenger-subsidy-smishing-sms": "smishing",
};

/** 유형 · 채널 → 요령(앞이 유형에 가장 맞는 것 · 마지막은 공통). 표에 없는 시나리오는 공통 요령만. */
export function prepTipsFor(scenarioId: string | null | undefined, channel: "voice" | "messenger"): readonly string[] {
  const m = channel === "messenger";
  const money = m ? TIP.moneyMessenger : TIP.moneyVoice;
  const common = m ? TIP.commonMessenger : TIP.commonVoice;
  switch (scenarioId ? PREP_TIP_KIND_BY_SCENARIO[scenarioId] : undefined) {
    case "institution":
      return [TIP.institutionNoMoney, TIP.authorityVoice, common];
    case "tax":
      return [TIP.authorityVoice, money, common];
    case "finance":
      return [TIP.verifyKnownNumber, money, common];
    case "courier":
      return [TIP.verifyKnownNumber, money, common];
    case "family":
      return [TIP.family, money, common];
    case "threat":
      return [TIP.urgencyVoice, money, common];
    case "smishing":
      return [TIP.smsLink, TIP.verifyKnownNumber, common];
    default:
      return [common, PREP_TIPS[2]];
  }
}

/** 예방 요령 바꾸는 간격(ms) — 한 문장을 천천히 두 번 읽을 시간. */
export const PREP_TIP_INTERVAL_MS = 5000;

export function prepTipIndex(elapsedMs: number, count: number = PREP_TIPS.length): number {
  const n = Math.max(1, count);
  return Math.floor(Math.max(0, elapsedMs) / PREP_TIP_INTERVAL_MS) % n;
}

/** 진입 경계 판이 머무는 시간(ms). 그 뒤 훈련 화면으로 간다(판을 누르면 바로). */
export const ENTRY_BOARD_MS = 1200;

/** 진입 경계 판 문면 — 채널별. 받기 탭(통화 화면 안의 오디오 잠금 해제)과 무관한 세션 전 안내다. */
export function entryBoardCopy(channel: "voice" | "messenger"): { title: string; lines: readonly string[] } {
  return {
    title: "지금부터 훈련",
    lines: [channel === "voice" ? "진짜 전화가 아닙니다." : "진짜 문자·메신저가 아닙니다.", "실제 돈은 오가지 않아요."],
  };
}

/** 종료 경계 판 문면. */
// 줄은 짧게(작은 화면에서 한 줄 띠) — "훈련이 끝났다"는 바로 아래 제목 "이것은 훈련이었습니다"가 말한다.
export const EXIT_BOARD = { title: "끝.", line: "여기부터는 실제 화면입니다." } as const;
