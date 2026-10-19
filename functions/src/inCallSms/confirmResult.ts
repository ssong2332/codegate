// A-1 ⑦(2026-10-19 · audit-A R1) — 필수 문자 도착 뒤 "확인 결과" 신호(순수 판정 · 서버 소유 문면).
//
// 재현(loan 3난이도 × Live·폴백 6/6): 참가자가 문자대로 "보냈어요"라고 한 뒤 사기범이 "입금 확인 중·기다려 주세요"만
// 4~5턴 반복했다. 앱에는 입금·처리의 **결과**를 표현하는 신호가 하나도 없었다(문자 백스톱은 필수 문자 1통이 가면
// `none_pending`이 되고 그 뒤로 아무 지시도 없다). 이 모듈이 그 신호 1줄을 만든다.
//
// ── 판정표(⛔ 이 순서 그대로 — 위에서 첫 매치) ────────────────────────────────────────────────
// | # | If | Then(`reason`) |
// |---|---|---|
// | 1 | 결과 신호 대상 목적(transfer · link)의 **필수** 문자가 아직 하나도 도착하지 않았다 | `no_required_arrival` |
// | 2 | 이번 발화가 그 문자 도착 이후의 발화가 아니다(`userTurns ≤ 도착 시 발화 수`) | `before_reply` |
// | 3 | 이번 발화가 "했다" 류 완료 주장이 아니다(`isCompletionClaim`) | `no_claim` |
// | 4 | 도착 이후 앞선 발화 중에 이미 완료 주장이 있었다(= 1회 보장, 상태 저장 없음) | `already_claimed` |
// | 5 | 그 외 | `confirm`(지시 1줄) |
// ⛔ identity(인증번호)는 대상이 아니다 — 인증번호의 "결과"는 `roleplay/otpCheck.ts`가 서버 대조로 따로 낸다(#300 · §78).
// ⛔ 공유 판정 패턴(`report/analyzeConversation.ts`의 COMPLIANCE_PATTERN · RESISTANCE_PATTERN — T191 J-2가 바이트 동일로
//    고정)은 import도 수정도 하지 않는다. 이 파일의 정규식은 이 신호 전용이다.
// ⛔ 잎 모듈(타입 import만) — Firestore · LLM 0. 폴백(`roleplay/index.ts`)과 Live 응답(`inCallSms/buildDoc.ts`)이 이 파일의
//    문면 상수를 쓴다(클라 저작 0 — G101/G386 관례).
// ⛔ 문면에 횟수·턴 번호 0(F11/G130) · 따옴표 대사 예시 0 · "재촉"·"다급" 0(smsGate 문면 규칙과 같은 기준).
import type { FlowVariantSms, SmsPurpose } from "../scenarios/flowVariants";
// T194-c-1 G608 — 값 import는 카탈로그 판별자 1개뿐이다(Firestore · LLM 0 유지 — 위 "잎 모듈" 행의 예외).
import { isInCallInstallSms } from "../scenarios/mockScreens";
import type { DeliveredSmsRecord } from "./smsGate";

/** 결과 신호 대상 목적. identity는 `otpCheck`가 소유한다(위 머리 주석). */
export const CONFIRM_RESULT_PURPOSES: readonly SmsPurpose[] = ["transfer", "link"];

/** 목적별 "무엇이 끝났다고 알릴지"(조사 포함 — 문면 조립 시 그대로 끼운다). */
const RESULT_PHRASE: Record<"transfer" | "link", string> = {
  transfer: "입금 확인이 끝났다고",
  link: "신청과 본인확인 처리가 끝났다고",
};

function isConfirmPurpose(purpose: SmsPurpose): purpose is "transfer" | "link" {
  return (CONFIRM_RESULT_PURPOSES as readonly string[]).includes(purpose);
}

/**
 * 폴백 턴 지시 — 참가자가 **방금** 완료를 주장한 턴에 즉시 싣는다.
 * "마무리"는 [진행 강제]의 끊기 규칙(T192 슬롯)이 정한 방식을 따르게 가리키기만 한다(새 끊기 메커니즘 0).
 */
export function buildConfirmResultInstruction(purpose: "transfer" | "link"): string {
  return `(상대가 방금 문자 안내대로 마쳤다고 말했다. 이번 대답에서 ${RESULT_PHRASE[purpose]} 그럴듯하게 알려 주고, 곧바로 다음 요구로 넘어가거나 더 요구할 것이 없으면 [진행 강제]의 통화 끝내기 항목이 정한 대로 마무리하라. 아직 확인 중이라거나 기다려 달라는 말은 하지 마라.)`;
}

/**
 * Live 응답 필드(`deliverInCallSms` → `confirmResultInstruction`) — 문자 도착 응답 시점에는 참가자가 아직 답하지 않았으므로
 * **조건형**이다(클라가 언제 주입하든 "상대가 마쳤다고 말하면"에만 적용된다). ⚠️ 클라 배선은 이 변경에 없다(A-2).
 */
export function buildLiveConfirmResultInstruction(purpose: "transfer" | "link"): string {
  return `(상대가 이 문자 안내대로 마쳤다고 말하면, 그 말에 대답할 때 ${RESULT_PHRASE[purpose]} 그럴듯하게 알려 주고, 곧바로 다음 요구로 넘어가거나 더 요구할 것이 없으면 [진행 강제]의 통화 끝내기 항목이 정한 대로 마무리하라. 확인 중이라거나 기다려 달라는 말은 하지 마라.)`;
}

/**
 * 이 선언 항목이 결과 신호 대상인가(필수 + transfer/link). Live 응답 조립이 같은 조건을 쓴다.
 * T194-c-1 G608(docs/Architecture.md §84.15.4 · Q-X3) — **설치 화면을 여는 문자(Q2)는 제외**한다. 결과 신호의 "신청과 본인확인 처리가
 * 끝났다 · 마무리하라"는 설치 문자에 거짓이고, 설치 직후 끊기를 불러 AC-105 기회를 닫는다. 판별자는 목적이 아니라 그 문자의 카탈로그 랜딩
 * kind(`isInCallInstallSms`)다 — 그래서 `scenarioId`가 필요하다. 설치 결과의 신호는 응낙 구조화 이벤트 하나뿐이다(X9).
 */
export function confirmResultPurposeFor(
  item: FlowVariantSms | undefined,
  scenarioId: string,
): "transfer" | "link" | undefined {
  if (!item || !item.required || !isConfirmPurpose(item.purpose)) return undefined;
  if (isInCallInstallSms(scenarioId, item.smsId)) return undefined;
  return item.purpose;
}

// ── 완료 주장 판정(문장 단위) ─────────────────────────────────────────────────────────────────
// 판정표 — ⛔ 새 형태가 나오면 임의로 넓히지 말고 행을 추가할 것.
// | 갈래 | 패턴 | 예 |
// |---|---|---|
// | 계좌(transfer) | 보냈 · 부쳤 · 입금/이체/송금 + 했·완료 · 넣었 | "알겠어요, 보냈어요" · "이체했습니다" |
// | 링크(link) | 눌렀 · 들어갔 · 접속했 · 입력했 · 신청했 · 진행했 · 인증했 | "링크 눌러서 신청했어요" |
// | 공통(완료 동사) | 다 했 · 했어요 · 했습니다 · 완료했/완료됐 · 마쳤 · 끝냈 — ⚠️ **단독으로는 주장이 아니다**(아래 행과 곱한다) | — |
// | 공통(행동 대상 허용목록 · A-1 리뷰 Major-2) | 같은 문장에 행동 대상(송금·입금·이체·계좌·링크·신청·설치·앱·인증) 또는 지시 따름(말씀하신 대로·안내대로·알려 주신 대로·시키신 대로·하라는 대로·문자 안내대로)이 있을 때만 공통 완료 동사를 주장으로 센다 | "말씀하신 대로 했어요" · "이체 다 했어요" ⭕ / "아들한테 얘기했어요" · "의심했어요" · "말했어요" ✖ |
// | 제외(부정·유보) | 안/못 + 동사 · 않았 · 아직 · 싫 · 안 할 · 못 하겠 · 할까요 · 하나요 · 해야 | "아직 안 보냈어요" |
// | 제외(다른 행동) | 전화했 · 물어봤 · 신고했 · 확인했 · 알아봤 | "은행에 전화했어요" — 문자 안내를 마친 것이 아니다 |
// | 제외(의문문) | 그 문장이 `?`로 끝난다 | "보냈는데 확인됐어요?"의 첫 절은 같은 문장이라 제외된다 |
const CLAIM_BY_PURPOSE: Record<"transfer" | "link", RegExp> = {
  transfer: /보냈|부쳤|(?:입금|이체|송금)\s*(?:했|해\s*드렸|완료)|넣었|넣어\s*드렸/,
  link: /눌렀|들어갔|접속했|입력했|신청했|진행했|인증했/,
};
const CLAIM_GENERIC = /다\s*했|했어요|했습니다|완료(?:했|됐)|마쳤|끝냈/;
/**
 * A-1 리뷰 Major-2 — 공통 완료 동사는 이 허용목록과 **같은 문장**에 있을 때만 센다(허용목록 방향 — 제외목록을 늘리는 방식은
 * J-2에서 두 번 샜다). "문자"는 넣지 않았다("아들한테 문자로 얘기했어요"가 걸린다) — 문자는 "문자 안내대로"로만 센다.
 */
const CLAIM_GENERIC_TARGET =
  /송금|입금|이체|계좌|링크|신청|설치|앱|인증|말씀하신\s*대로|안내(?:하신|해\s*주신)?\s*대로|알려\s*주신\s*대로|시키신\s*대로|하라는\s*대로|하라고\s*하신\s*대로|문자(?:\s*안내)?\s*대로/;
const CLAIM_EXCLUDE =
  /(?:안|못)\s*(?:보냈|했|넣었|눌렀|해)|않았|아직|싫|안\s*할|못\s*하겠|할까요|하나요|해야|전화했|물어봤|신고했|확인했|알아봤/;

/** 문장 하나(종결 부호 포함)씩 자른다. 종결 부호가 없으면 끝까지가 한 문장이다. */
function sentencesOf(text: string): string[] {
  return text.match(/[^.?!\n]+[.?!]?/g) ?? [];
}

/** 이 발화가 문자 안내(목적)를 마쳤다는 주장을 담은 평서문을 하나라도 포함하는가. */
export function isCompletionClaim(text: string, purpose: "transfer" | "link"): boolean {
  return sentencesOf(text).some((raw) => {
    const sentence = raw.trim();
    if (sentence.length === 0 || sentence.endsWith("?")) return false;
    if (CLAIM_EXCLUDE.test(sentence)) return false;
    return CLAIM_BY_PURPOSE[purpose].test(sentence) || (CLAIM_GENERIC.test(sentence) && CLAIM_GENERIC_TARGET.test(sentence));
  });
}

export type ConfirmResultReason =
  | "no_required_arrival"
  | "before_reply"
  | "no_claim"
  | "already_claimed"
  | "confirm";

export type ConfirmResultPlan = {
  reason: ConfirmResultReason;
  purpose?: "transfer" | "link";
  instruction?: string;
};

export type ConfirmResultInput = {
  /** T194-c-1 G608 — 설치 문자 제외 판별(`confirmResultPurposeFor`)의 입력. */
  scenarioId: string;
  declared: readonly FlowVariantSms[];
  delivered: readonly DeliveredSmsRecord[];
  /** 이번 발화 포함 사용자 발화 수(폴백 `userTurnsNow` — 문자 게이트와 같은 변수). */
  userTurns: number;
  /** 이번 사용자 발화(마스킹 후). */
  currentUserText: string;
  /**
   * 이번 발화 **전**까지의 사용자 발화 원문(대화 순서 · 1-기반 순번 k = 배열 index k-1). 도착 이후 발화만 골라
   * 4행(1회 보장)을 판정한다. ⚠️ 실시간에서 강등된 세션은 실시간 구간 전사가 아직 없어 순번이 서버 계수보다 작다 —
   * 그때는 앞선 주장을 못 보고 한 번 더 낼 수 있다(열화 방향 = 결과 신호 1회 추가 · 대기 반복보다 낫다).
   */
  priorUserTexts: readonly string[];
};

/** ⛔ 판정표 순서 그대로(위 머리 주석). 부수효과 0. */
export function planConfirmResult(input: ConfirmResultInput): ConfirmResultPlan {
  const deliveredIds = new Map(input.delivered.map((d) => [d.smsId, d.userTurnsAtArrival ?? 0] as const));
  let target: { purpose: "transfer" | "link"; arrival: number } | undefined;
  for (const item of input.declared) {
    const purpose = confirmResultPurposeFor(item, input.scenarioId);
    const arrival = deliveredIds.get(item.smsId);
    if (purpose === undefined || arrival === undefined) continue;
    if (target === undefined || arrival > target.arrival) target = { purpose, arrival };
  }
  if (target === undefined) return { reason: "no_required_arrival" };
  if (!(input.userTurns > target.arrival)) return { reason: "before_reply", purpose: target.purpose };
  if (!isCompletionClaim(input.currentUserText, target.purpose)) return { reason: "no_claim", purpose: target.purpose };
  const priorsAfterArrival = input.priorUserTexts.slice(target.arrival);
  if (priorsAfterArrival.some((text) => isCompletionClaim(text, target.purpose))) {
    return { reason: "already_claimed", purpose: target.purpose };
  }
  return {
    reason: "confirm",
    purpose: target.purpose,
    instruction: buildConfirmResultInstruction(target.purpose),
  };
}
