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
 * ⭐ R3-C ②-b · ②-c(2026-10-20 · 정본 Architecture §79.22 (6)) — "곧바로 다음 요구로 넘어가거나 … 마무리하라"를 남은 요구 유무 분기
 * + "정한 대로 하라"로 바꿨다(끊어도 되는지는 끊기 슬롯이 정한다 — "마무리하라"는 끊기를 지시하는 것으로 읽혔다). 분기 구절은
 * promptAssembly.ts NO_STALL_RULE과 바이트 동일하고 앞뒤 구절은 종전 그대로다(G625 단언).
 */
export function buildConfirmResultInstruction(purpose: "transfer" | "link"): string {
  return `(상대가 방금 문자 안내대로 마쳤다고 말했다. 이번 대답에서 ${RESULT_PHRASE[purpose]} 그럴듯하게 알려 주고, 상대에게 더 요구할 것이 남아 있으면 그 요구로 넘어가고, 더 요구할 것이 남지 않았으면 [진행 강제]의 통화 끝내기 항목이 정한 대로 하라. 아직 확인 중이라거나 기다려 달라는 말은 하지 마라.)`;
}

/**
 * ⭐ §132.7(DECISIONS #248 · 실 키 회귀 프로브 2026-10-24b N4 — 카드사 중급 재측정) — 참가자가 문자 링크의 이체 화면을 **제출**했는데 실시간
 * 사기범은 그 사실을 몰랐다(앱이 기록만 하고 모델에는 아무것도 넣지 않았다). 참가자가 머뭇거리자 "아직 이체가 완료되지 않은 것으로 확인됩니다"
 * 뒤 이체 재촉 12턴 · 끊기 없음. 앱이 확인한 사실이라 조건형이 아니다(참가자 말과 무관). 마무리 분기는 위 `buildConfirmResultInstruction`과 같은 구절.
 */
export const LANDING_SUBMITTED_INSTRUCTION =
  "(앱 확인: 상대가 방금 문자 링크 화면에서 이체하기를 눌러 이체를 마쳤다. 이체가 끝난 것으로 받아들이고, 아직 완료되지 않았다거나 다시 이체하라는 말은 하지 마라. 이번 대답에서 입금 확인이 끝났다고 그럴듯하게 알려 주고, 상대에게 더 요구할 것이 남아 있으면 그 요구로 넘어가고, 더 요구할 것이 남지 않았으면 [진행 강제]의 통화 끝내기 항목이 정한 대로 하라.)";

/**
 * §129 D7(2026-10-24 실 키 회귀 프로브 — 은행 사칭 중급: 참가자는 *"그 다음엔 어떻게 해요?"* 라고만 했는데 *"네, 이체 확인되었습니다"* 후 목표 끊기).
 * 조건형 지시를 무조건 지시로 읽었다(추정) ⇒ 조건이 아닐 때 할 일을 같은 지시 안에 붙인다. ⚠️ 모델 행동 완화(결정적 차단 아님).
 */
export const LIVE_CONFIRM_NOT_YET_SENTENCE =
  " 상대가 마쳤다고 말하지 않고 묻거나 망설이기만 하면 끝났다고 알리지 말고, 문자 안내대로 진행해 달라고 다시 안내하라.";

/**
 * Live 응답 필드(`deliverInCallSms` → `confirmResultInstruction`) — 문자 도착 응답 시점에는 참가자가 아직 답하지 않았으므로
 * **조건형**이다(클라가 언제 주입하든 "상대가 마쳤다고 말하면"에만 적용된다). ⚠️ 클라 배선은 이 변경에 없다(A-2).
 */
export function buildLiveConfirmResultInstruction(purpose: "transfer" | "link"): string {
  return `(상대가 이 문자 안내대로 마쳤다고 말하면, 그 말에 대답할 때 ${RESULT_PHRASE[purpose]} 그럴듯하게 알려 주고, 상대에게 더 요구할 것이 남아 있으면 그 요구로 넘어가고, 더 요구할 것이 남지 않았으면 [진행 강제]의 통화 끝내기 항목이 정한 대로 하라. 확인 중이라거나 기다려 달라는 말은 하지 마라.${LIVE_CONFIRM_NOT_YET_SENTENCE})`;
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
// | 공통(행동 대상 허용목록 · A-1 리뷰 Major-2) | 같은 문장에 행동 대상 또는 지시 따름(말씀하신 대로·안내대로·알려 주신 대로·시키신 대로·하라는 대로·문자 안내대로)이 있을 때만 공통 완료 동사를 주장으로 센다 | "말씀하신 대로 했어요" · "이체 다 했어요" ⭕ / "아들한테 얘기했어요" · "의심했어요" · "말했어요" ✖ |
// | 공통(행동 대상은 목적별 · A-2 QA ⓑ) | 행동 대상은 **그 세션 목적의 것만** 센다 — transfer = 송금·입금·이체·계좌 / link = 링크·신청·설치·앱·인증 | transfer 세션의 "앱 설치했어요" · "링크 눌러서 신청했어요" ✖(다른 목적의 행동) |
// | 제외(부정·유보) | 안/못 + 동사(계좌 갈래 + **링크 갈래 동사** — A-2 QA ⓒ) · 않았 · 아직 · 싫 · 안 할 · 못 하겠 · 할까요 · 하나요 · 해야 | "아직 안 보냈어요" · link "보냈는데 안 들어갔대요" |
// | 제외(다른 행동) | 전화했 · 물어봤 · 신고했 · 확인했 · 알아봤 | "은행에 전화했어요" — 문자 안내를 마친 것이 아니다 |
// | 제외(되돌림 · A-2 QA ⓓ) | **발화 어디든** 취소 · 되돌렸 · 돌려받 — 절 · 문장 단위가 아니라 발화 전체에 건다(뒤 문장에서 되돌려도 주장이 아니다) | "보냈다가 취소했어요" · "보냈어요. 근데 취소했어요" |
// | 절 나눔(A-2 QA ⓐ) | 한 문장 안에서 **종결 어미(요·다·죠) 뒤**의 쉼표, 또는 그 뒤 공백 + 그런데/근데 앞에서 절을 나눈다. 아래 의문문 · 부정·유보 · 다른 행동 · 주장 판정은 **절 단위**, 행동 대상 허용목록은 **문장 단위**다 | "방금 보냈어요, 확인되나요?" · "보냈어요 그런데 아직 안 들어갔나요?" ⭕(앞 절이 주장) |
// | 제외(의문문) | 그 절이 `?`로 끝난다. 연결 어미(-는데 등)로 이어진 절은 나누지 않는다 | "보냈는데 확인됐어요?"는 한 절이라 제외된다(종전 그대로) |
// | 제외(뒤 절 번복 · A-2 리뷰 Major 1) | 주장 절 **뒤의** 평서 절이 부정·유보(아니/아뇨/아냐로 시작 · 아직 · 안/못 + 동사 · 않았)이면 **그 문장 전체**를 제외한다. 뒤 절이 질문(`?`)이면 번복이 아니다(ⓐ 유지) | "보냈어요, 아니 아직 안 보냈어요" · "보냈어요, 못 보냈어요" ✖ / "보냈어요 그런데 아직 안 들어갔나요?" ⭕ |
const CLAIM_BY_PURPOSE: Record<"transfer" | "link", RegExp> = {
  transfer: /보냈|부쳤|(?:입금|이체|송금)\s*(?:했|해\s*드렸|완료)|넣었|넣어\s*드렸/,
  link: /눌렀|들어갔|접속했|입력했|신청했|진행했|인증했/,
};
const CLAIM_GENERIC = /다\s*했|했어요|했습니다|완료(?:했|됐)|마쳤|끝냈/;
/**
 * A-1 리뷰 Major-2 — 공통 완료 동사는 아래 두 허용목록(지시 따름 · 목적별 행동 대상) 중 하나와 **같은 문장**에 있을 때만 센다
 * (허용목록 방향 — 제외목록을 늘리는 방식은 J-2에서 두 번 샜다). "문자"는 넣지 않았다("아들한테 문자로 얘기했어요"가 걸린다)
 * — 문자는 "문자 안내대로"로만 센다.
 * 지시 따름은 목적 무관이다 — 어느 목적이든 "시킨 대로 했다"는 그 세션 목적의 완료 주장이다.
 */
const CLAIM_FOLLOWED_INSTRUCTION =
  /말씀하신\s*대로|안내(?:하신|해\s*주신)?\s*대로|알려\s*주신\s*대로|시키신\s*대로|하라는\s*대로|하라고\s*하신\s*대로|문자(?:\s*안내)?\s*대로/;
/** A-2 QA ⓑ — 행동 대상은 목적별(다른 목적의 행동을 이 목적의 완료로 세지 않는다). 종전 단일 목록을 목적별로 나눴다(항목 추가 0). */
const CLAIM_GENERIC_TARGET: Record<"transfer" | "link", RegExp> = {
  transfer: /송금|입금|이체|계좌/,
  link: /링크|신청|설치|앱|인증/,
};
// A-2 QA ⓒ — 부정 대상 동사에 링크 갈래 동사(들어갔·접속했·입력했·신청했·진행했·인증했)를 더했다(행 추가 · 기존 항목 무변경).
const CLAIM_EXCLUDE =
  /(?:안|못)\s*(?:보냈|했|넣었|눌렀|해|들어갔|접속했|입력했|신청했|진행했|인증했)|않았|아직|싫|안\s*할|못\s*하겠|할까요|하나요|해야|전화했|물어봤|신고했|확인했|알아봤/;
/** A-2 QA ⓓ — 되돌림. 발화 전체에 건다(판정표 "제외(되돌림)" 행). */
const CLAIM_REVERSED = /취소|되돌렸|돌려받/;
/** A-2 리뷰 Major 1 — 뒤 절 번복(부정·유보). 부정 동사 목록은 `CLAIM_EXCLUDE`와 같다(목록을 새로 늘리지 않는다). */
const CLAIM_RETRACTED =
  /^(?:아니|아뇨|아냐)|아직|(?:안|못)\s*(?:보냈|했|넣었|눌렀|해|들어갔|접속했|입력했|신청했|진행했|인증했)|않았/;
/** A-2 QA ⓐ — 절 경계: 종결 어미(요·다·죠) 뒤의 쉼표, 또는 그 뒤 공백 + 그런데/근데. 연결 어미 뒤는 나누지 않는다. */
const CLAUSE_BOUNDARY = /(?<=[요다죠])\s*,\s*|(?<=[요다죠])\s+(?=그런데|근데)/;

/** 문장 하나(종결 부호 포함)씩 자른다. 종결 부호가 없으면 끝까지가 한 문장이다. */
function sentencesOf(text: string): string[] {
  return text.match(/[^.?!\n]+[.?!]?/g) ?? [];
}

/** 이 발화가 문자 안내(목적)를 마쳤다는 주장을 담은 평서 절을 하나라도 포함하는가(판정표 — 위 머리 주석). */
export function isCompletionClaim(text: string, purpose: "transfer" | "link"): boolean {
  if (CLAIM_REVERSED.test(text)) return false;
  return sentencesOf(text).some((raw) => {
    const sentence = raw.trim();
    if (sentence.length === 0) return false;
    const targeted = CLAIM_GENERIC_TARGET[purpose].test(sentence) || CLAIM_FOLLOWED_INSTRUCTION.test(sentence);
    const clauses = sentence.split(CLAUSE_BOUNDARY).map((c) => c.trim());
    const claimAt = clauses.findIndex((clause) => {
      if (clause.length === 0 || clause.endsWith("?")) return false;
      if (CLAIM_EXCLUDE.test(clause)) return false;
      return CLAIM_BY_PURPOSE[purpose].test(clause) || (CLAIM_GENERIC.test(clause) && targeted);
    });
    if (claimAt < 0) return false;
    // A-2 리뷰 Major 1 — 주장 절 뒤의 평서 절이 앞 절을 번복하면 문장 전체 제외(판정표 "뒤 절 번복" 행).
    return !clauses.slice(claimAt + 1).some((clause) => !clause.endsWith("?") && CLAIM_RETRACTED.test(clause));
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
