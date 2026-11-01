// ⭐ 화면 행동만 인정(실기기 신고 2026-11-01 · 카드사 고급 fv-x7ue — *"다운하고 권한 허용 없이 했다고 하니까 넘어갔어"* ·
// *"피해금 이관 전용 계좌도 그냥 했다고 하니까 넘어가는데?"* · 메인 "간소화안으로" ①). 실제 사기범은 원격 앱 · 입금 내역으로 **실제로 했는지**를
// 안다 — 말로만 "했다"면 "아직 확인이 안 되는데요"라고 되돌린다. 이 앱의 서버도 화면에서 한 일(설치 화면 권한 허용 · 이체 · 입력 제출)을 안다.
//
// ── 화면 사실(ScreenFact) 원천 ───────────────────────────────────────────────────────────────
// | 표면 | 보낸 화면 | 마쳤는가 |
// |---|---|---|
// | 통화 중 문자 | 도착 문자 문서의 `fakeLandingId`(`readDeliveredSms`) | 설치 화면 = `mockScreens/{landingId}.consentedAt` · 그 밖 = 문자 문서 `landingSubmittedAt` |
// | 메신저 링크 칩 | 사기범 메시지 첨부의 `fakeLandingId` | 설치 화면 = `consentedAt` · 그 밖 = `mockScreens/{landingId}.submittedAt` |
//
// ── 판정표 SA(이번 참가자 발화 · ⛔ 위에서 첫 매치) ─────────────────────────────────────────────
// | # | If | Then |
// |---|---|---|
// | SA0 | 적용 제외 변형(`SCREEN_ACTION_EXEMPT_VARIANTS` — #192 바이트 고정) · 보낸 화면 0 | 없음(종전 지시 그대로) |
// | SA1 | 이번 발화가 어떤 종류(설치 · 이체 · 입력)의 완료 주장 ∧ 그 종류의 화면 중 아직 마치지 않은 것이 있고 같은 종류에 마친 화면이 없다 | 미완료 지시(종류별) — 같은 턴의 "확인 결과"(A-1 ⑦) · "송금 받은 것으로 친다"(§131 R1) 지시는 싣지 않는다 |
// | SA2 | 그 밖(주장 없음 · 그 종류를 이미 화면에서 마쳤다) | 없음 — 마친 화면은 말과 상관없이 넘어간다(실시간 = 응낙 · 제출 맥락 주입 · 폴백 = 아래 상태 줄) |
//
// ── 백스톱 보류(판정표 SB — `planSmsBackstop` 입력 `installPendingSince`) ─────────────────────────
// | # | If | Then |
// |---|---|---|
// | SB1 | 적용 변형 ∧ 도착한 통화 중 설치 문자 중 권한 허용 기록이 없는 것이 있다 | 가장 늦게 도착한 그 문자의 도착 발화 수 — 백스톱이 다음 필수 문자를 밀지 않는다(Q3 2026-11-01 — 시한 없음) |
// | SB2 | 그 밖 | `undefined`(종전 백스톱) |
// ⚠️ 보류는 백스톱(강제 발송)만이다 — 게이트(`resolveSmsGate`)는 그대로라 모델이 스스로 부르면 간다. Q3(실측 관찰 · 메인 "권고대로") — 끝내 설치하지 않는
//    참가자는 설치 없이 이관 단계로 넘어가지 않고, 재촉 단계(판정표 SP)가 다른 압박 뒤 포기로 끝낸다(영원히 멈추지 않게 하는 쪽이 보류 시한이 아니라 포기다).
// ⛔ 순수 함수(Firestore · LLM 0). 문면에 횟수 · 턴 번호 0 · 따옴표 대사 예시 0(턴 지시 스캔 게이트).
import type { MessengerAttachment } from "../shared/types";
import { findMockScreenItem, isBankTransferLanding } from "../scenarios/mockScreens";
import { IN_CALL_SMS } from "../scenarios/inCallSms";
import type { DeliveredSmsRecord } from "../inCallSms/smsGate";
import { isCompletionClaim } from "../inCallSms/confirmResult";
import { USER_TRANSFER_REPORT } from "./actionAcknowledgement";
import { sessionReachableLandingIds } from "../scenarios/reachability";

/** #192 조립 바이트 고정 변형(챌린지 고급) — 이 판정의 지시 · 규칙 · 보류를 모두 받지 않는다(바뀌면 해시 기준값이 깨진다 · 보고 대상). */
export const SCREEN_ACTION_EXEMPT_VARIANTS: readonly string[] = ["fv-akj5", "fv-6s5p"];

/** 이 세션에 화면 행동 판정을 적용하는가(변형 부재 = 적용 · 바이트 고정 변형 = 미적용). */
export function screenActionApplies(flowVariantId: string | undefined): boolean {
  return flowVariantId === undefined || !SCREEN_ACTION_EXEMPT_VARIANTS.includes(flowVariantId);
}

export type ScreenKind = "install" | "transfer" | "form";
/** N1(실기기 신고 2026-11-01 — 요구액 200만 원에 200원을 보내도 통과) — 이체 화면 제출 때 화면이 보낸 **비교 결과만**(금액 값 0 · G138). */
export type AmountComparison = "less" | "equal" | "more";
export const AMOUNT_COMPARISONS: readonly AmountComparison[] = ["less", "equal", "more"];
export function isAmountComparison(value: unknown): value is AmountComparison {
  return typeof value === "string" && (AMOUNT_COMPARISONS as readonly string[]).includes(value);
}
/**
 * `offeredAtUserTurns` = 그 화면을 보낸 시점의 사용자 발화 수(통화 중 문자 = 도착 기록 · 메신저 칩 = 그 메시지 앞 참가자 메시지 수 · 부재 = 모름).
 * `amount` = 이체 화면 제출의 요구액 대비 비교(부재 = 모름 · 옛 화면).
 */
export type ScreenFact = { landingId: string; kind: ScreenKind; done: boolean; offeredAtUserTurns?: number; amount?: AmountComparison };

/** 카탈로그 화면 종류(설치 · 이체 · 입력). 이 시나리오 카탈로그 밖이면 undefined. */
export function screenKindOf(scenarioId: string, landingId: string): ScreenKind | undefined {
  const item = findMockScreenItem(scenarioId, landingId);
  if (!item) return undefined;
  if (item.kind === "app-install") return "install";
  // 훈련용 이체 화면(P2) ∨ 계좌 문자(`kind: "account"`)가 여는 화면(P2 이전 이체 화면 — 예: 카드 피해금 이관 `card-relief-transfer`) = 이체.
  if (isBankTransferLanding(landingId)) return "transfer";
  return (IN_CALL_SMS[scenarioId] ?? []).some((sms) => sms.kind === "account" && sms.fakeLandingId === landingId) ? "transfer" : "form";
}

/** `mockScreens/{landingId}` 문서에서 판정에 쓰는 필드만. `amountComparison` = N1 메신저 이체 화면 제출의 비교 결과(부재 = 모름). */
export type MockScreenRecord = { landingId: string; consented: boolean; submitted: boolean; amountComparison?: AmountComparison };

/** 통화 중 문자 표면의 화면 사실(도착 순서). */
export function inCallScreenFacts(
  scenarioId: string,
  delivered: readonly DeliveredSmsRecord[],
  mockScreens: readonly MockScreenRecord[],
): ScreenFact[] {
  const consented = new Set(mockScreens.filter((m) => m.consented).map((m) => m.landingId));
  const facts: ScreenFact[] = [];
  for (const record of delivered) {
    if (!record.fakeLandingId) continue;
    const kind = screenKindOf(scenarioId, record.fakeLandingId);
    if (!kind) continue;
    facts.push({
      landingId: record.fakeLandingId,
      kind,
      done: kind === "install" ? consented.has(record.fakeLandingId) : record.landingSubmitted === true,
      ...(record.userTurnsAtArrival !== undefined ? { offeredAtUserTurns: record.userTurnsAtArrival } : {}),
      ...(record.landingAmountComparison ? { amount: record.landingAmountComparison } : {}),
    });
  }
  return facts;
}

/** 메신저 링크 칩 표면의 화면 사실(처음 보낸 순서 · 같은 화면은 한 번). */
export function messengerScreenFacts(
  scenarioId: string,
  history: ReadonlyArray<{ role: string; attachments?: readonly MessengerAttachment[] }>,
  mockScreens: readonly MockScreenRecord[],
): ScreenFact[] {
  const byId = new Map(mockScreens.map((m) => [m.landingId, m] as const));
  const seen = new Set<string>();
  const facts: ScreenFact[] = [];
  let userMessages = 0;
  for (const message of history) {
    if (message.role === "user") userMessages += 1;
    if (message.role !== "scammer") continue;
    for (const attachment of message.attachments ?? []) {
      if (seen.has(attachment.fakeLandingId)) continue;
      const kind = screenKindOf(scenarioId, attachment.fakeLandingId);
      if (!kind) continue;
      seen.add(attachment.fakeLandingId);
      const record = byId.get(attachment.fakeLandingId);
      facts.push({
        landingId: attachment.fakeLandingId,
        kind,
        done: kind === "install" ? record?.consented === true : record?.submitted === true,
        offeredAtUserTurns: userMessages,
        ...(record?.amountComparison ? { amount: record.amountComparison } : {}),
      });
    }
  }
  return facts;
}

/** 설치 완료 주장("설치했어요" · "깔았어요" · "권한 허용 눌렀어요") — 앞에 "안 · 못"이 붙거나 물음이면 아니다. */
const INSTALL_CLAIM = /(?<!(?:안|못)\s?)(?:설치(?:했|해\s?놨|해\s?뒀|\s?완료|\s?다\s?했|\s?끝났)|깔았|(?:권한|허용)[^.?!\n]{0,6}(?:했|눌렀|해\s?놨))/;

/** 이 발화가 그 종류 화면의 완료 주장인가. */
export function isScreenClaim(kind: ScreenKind, text: string): boolean {
  const statements = (text.match(/[^.?!\n]+[.?!]?/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 0 && !s.endsWith("?"));
  if (kind === "install") return statements.some((s) => INSTALL_CLAIM.test(s));
  if (kind === "transfer") return isCompletionClaim(text, "transfer") || statements.some((s) => USER_TRANSFER_REPORT.test(s));
  return isCompletionClaim(text, "link");
}

/** SA1 지시 — 종류별(따옴표 대사 예시 0 · 횟수 0). */
export const SCREEN_NOT_DONE_INSTRUCTION: Readonly<Record<ScreenKind, string>> = {
  install:
    "(앱 확인: 상대는 설치했다고 말했지만 앱에는 아직 설치 화면에서 권한 허용을 누른 기록이 없다. 끝난 것으로 받아들이지 말고, 아직 확인이 안 된다며 네가 보낸 링크 화면에서 권한 허용하고 계속하기까지 눌러 달라고 짧게 말하라. 설치가 끝났다거나 확인됐다고 말하지 말고 다음 단계로 넘어가지 마라.)",
  // R5(#465 실측 — 이체 되돌림에 "권한을 허용하고 이관을 완료"가 섞였다) — 이체 화면에는 설치 · 권한 단계가 없다고 못 박는다.
  transfer:
    "(앱 확인: 상대는 보냈다고 말했지만 앱에는 아직 네가 보낸 링크 화면에서 이체한 기록이 없다. 끝난 것으로 받아들이지 말고, 입금 확인이 안 된다며 그 링크 화면에서 다시 진행해 달라고 짧게 말하라. 이체 화면에는 설치나 권한 허용 단계가 없으니 설치 · 권한 이야기는 섞지 마라. 입금이 확인됐다고 말하지 말고 다음 단계로 넘어가지 마라.)",
  form:
    "(앱 확인: 상대는 마쳤다고 말했지만 앱에는 아직 네가 보낸 링크 화면을 제출한 기록이 없다. 끝난 것으로 받아들이지 말고, 아직 접수가 확인되지 않는다며 그 링크 화면에서 마저 진행해 달라고 짧게 말하라. 처리됐다고 말하지 말고 다음 단계로 넘어가지 마라.)",
};

/** 판정표 SA. */
export function planScreenAction(input: {
  applies: boolean;
  facts: readonly ScreenFact[];
  currentUserText: string;
}): { kind: ScreenKind; instruction: string } | undefined {
  if (!input.applies || input.facts.length === 0) return undefined; // SA0
  for (const kind of ["install", "transfer", "form"] as const) {
    const ofKind = input.facts.filter((f) => f.kind === kind);
    if (ofKind.length === 0 || ofKind.some((f) => f.done)) continue; // SA2 — 그 종류를 화면에서 마쳤다
    if (isScreenClaim(kind, input.currentUserText)) return { kind, instruction: SCREEN_NOT_DONE_INSTRUCTION[kind] }; // SA1
  }
  return undefined; // SA2
}

const KIND_LABEL: Readonly<Record<ScreenKind, { name: string; done: string; pending: string }>> = {
  install: { name: "설치 화면", done: "권한 허용까지 마침", pending: "권한 허용 기록 없음" },
  transfer: { name: "이체 화면", done: "이체 마침", pending: "이체 기록 없음" },
  form: { name: "입력 화면", done: "제출 마침", pending: "제출 기록 없음" },
};

/** N1 — 이체 마침 뒤에 붙이는 요구액 비교(맥락을 넘긴 호출만 · 부재 = 붙이지 않는다). */
const AMOUNT_LABEL: Readonly<Record<AmountComparison, string>> = {
  less: "요구한 금액보다 적게 보냄",
  equal: "요구한 금액 그대로 보냄",
  more: "요구한 금액보다 많이 보냄",
};

// ── 재촉 단계(판정표 SP — #465 실측 R1 · R4 · R6) ─────────────────────────────────────────────
// 아직 마치지 않은 화면을 보낸 뒤 지난 참가자 발화 수(`pending`)로 정한다. 그 종류에 마친 화면이 있으면 대상이 아니다(SA2와 같다). ⛔ 위에서 첫 매치.
// | # | If | Then |
// |---|---|---|
// | SP1 | 설치 ∧ 그 설치 화면 뒤에 다른 종류 화면을 이미 보냈다(모델이 스스로 다음 문자 · 칩을 보냄) | `release` — 다음 요구를 이어가도 된다 · 끝났다고는 말하지 않는다 |
// | SP2 | pending ≥ `SCREEN_GIVE_UP_USER_TURNS`(설치 · 이체 · 입력 모두 — Q3 2026-11-01) | `give_up` — 포기로 끝낸다(4-c행은 포기 끊기를 막지 않는다) |
// | SP3 | pending ≥ `SCREEN_PRESSURE_SWITCH_USER_TURNS` | `switch` — 같은 재촉 대신 다른 압박 |
// | SP4 | 그 밖 | `hold` — 마칠 때까지 다음 요구로 넘어가지 않는다 · 끝났다고 말하지 않는다 |
// ⚠️ 판단값 — 재촉 두 번이면 압박을 바꾼다(메인 지시 원문 "같은 재촉 2번이면 다른 압박으로 바꾸고, 그래도 안 되면 끊기"). 끊기는 이체 화면을 여는 데
//    드는 발화(문자 열기 · 은행 앱 · 인증)를 감안해 여섯 번째 발화부터다. 값을 바꾸려면 아래 상수만 바꾼다.
export const SCREEN_PRESSURE_SWITCH_USER_TURNS = 2;
export const SCREEN_GIVE_UP_USER_TURNS = 6;

export type ScreenPressure = "hold" | "switch" | "release" | "give_up";

/** 판정표 SP — 아직 마치지 않은 그 종류 화면 중 가장 늦게 보낸 것 기준. 대상 아님(마침 · 보낸 시점 모름 · 그 종류 없음) = undefined. */
export function screenPressureFor(kind: ScreenKind, facts: readonly ScreenFact[], userTurns: number): ScreenPressure | undefined {
  const ofKind = facts.filter((f) => f.kind === kind);
  if (ofKind.length === 0 || ofKind.some((f) => f.done)) return undefined;
  const offered = ofKind.map((f) => f.offeredAtUserTurns).filter((n): n is number => n !== undefined);
  if (offered.length === 0) return undefined;
  const latest = Math.max(...offered);
  const pending = userTurns - latest;
  const movedOn = facts.some((f) => f.kind !== "install" && f.offeredAtUserTurns !== undefined && f.offeredAtUserTurns >= latest);
  if (kind === "install" && movedOn) return "release"; // SP1
  if (pending >= SCREEN_GIVE_UP_USER_TURNS) return "give_up"; // SP2
  return pending >= SCREEN_PRESSURE_SWITCH_USER_TURNS ? "switch" : "hold"; // SP3 · SP4
}

/** R10 — 아직 마치지 않은 화면 중 하나라도 포기 단계(SP2)인가(포기 단계에서는 새 화면 칩을 붙이지 않는다). */
export function anyScreenGiveUp(facts: readonly ScreenFact[], userTurns: number): boolean {
  return (["install", "transfer", "form"] as const).some((kind) => screenPressureFor(kind, facts, userTurns) === "give_up");
}

/** 재촉 단계 · 금액 문장(따옴표 대사 예시 0 · 횟수 0 — 턴 지시 스캔 게이트 대상). */
export const SCREEN_PRESSURE_SENTENCES = {
  installHold:
    "설치 화면은 상대가 권한 허용을 누르기 전에는 끝난 것이 아니니, 설치가 끝났다거나 확인됐다고 말하지 말고 설치를 마칠 때까지 다음 요구로 넘어가지 마라.",
  installRelease: "설치가 끝났다거나 확인됐다고는 말하지 말되, 설치 없이 다음 요구로 넘어가도 된다.",
  // Q2(#466 실측 — 재촉 중 기다리라는 말과 다시 하라는 말이 엇갈렸다) — 앱 기록이 없으면 아직 안 보낸 것이다.
  // R9(#468 실측) — 이체 화면에는 비밀번호 · 인증번호 칸이 없다(인증은 지문 · 얼굴 버튼 하나).
  transferPending:
    "이체 화면에는 설치나 권한 허용 단계가 없으니 이체를 재촉할 때 설치 · 권한 이야기를 섞지 말고, 입금이 확인됐다고 말하지 마라. 앱 기록이 없으면 아직 보내지 않은 것이니 기다려 보라는 말은 하지 마라. 이체 화면에는 비밀번호나 인증번호를 넣는 칸이 없으니 비밀번호 · 인증번호를 입력하라거나 불러 달라고 하지 마라.",
  // Q4(#466 실측 — 재촉마다 같은 문장 뼈대) — 내용뿐 아니라 문장 뼈대도 바꾼다.
  switch: "같은 재촉을 되풀이하지 말고 급함이나 불이익 같은 다른 압박으로 바꿔 말하라. 앞서 쓴 문장 뼈대도 되풀이하지 마라.",
  giveUp: "여러 번 재촉해도 하지 않으니 더 진행할 수 없다고 보고 포기로 끝내라. 원하던 것을 얻었다고 끝내지는 마라.",
  // Q1(#466 실측 — 메신저 포기 대사가 먼저 끊을게 · 끝내면서 이체 요구를 남김) — 대화방 포기 끝맺음.
  // R10(#468 실측 — 메신저 설치 칩 포기 단계에서 이체 요구로 넘어감) — 이번 대답에서 끝내고 새 요구를 꺼내지 않는다.
  giveUpMessenger:
    "여러 번 재촉해도 하지 않으니 더 진행할 수 없다고 보고 이번 대답에서 포기로 끝내라. 신분증 · 송금 같은 새 요구를 꺼내지 말고, 대화방이니 전화를 끊는다는 말은 하지 말고, 끝내면서 다시 요구를 남기지 마라. 원하던 것을 얻었다고 끝내지는 마라.",
  transferLess:
    "상대가 보낸 돈이 요구한 금액보다 적다. 들어온 만큼은 확인됐다고 하되 모자란 금액을 같은 화면에서 마저 보내라고 하고, 다 받았다거나 끝났다고 말하지 마라.",
  transferMore: "상대가 요구한 금액보다 많이 보냈다. 받은 것으로 치고, 돌려주겠다는 약속은 하지 마라.",
} as const;

/** R2(#465 실측 — 보류 중인 계좌 문자를 "문자로 보내 드린 안내 링크"로 가리켰다) — 문자 종류별 이름. */
const SMS_KIND_LABEL: Readonly<Record<string, string>> = { account: "계좌 안내 문자", link: "링크 문자", otp: "인증번호 문자" };

/** R2 — 선언된 필수 문자 중 아직 도착하지 않은 것의 종류 이름(카탈로그 밖 · 선택 문자 = 제외 · 같은 이름은 한 번). */
export function notYetSentSmsLabels(
  scenarioId: string,
  declared: ReadonlyArray<{ smsId: string; required?: boolean }>,
  delivered: readonly DeliveredSmsRecord[],
): string[] {
  const deliveredIds = new Set(delivered.map((d) => d.smsId));
  const labels = declared
    .filter((item) => item.required === true && !deliveredIds.has(item.smsId))
    .map((item) => SMS_KIND_LABEL[(IN_CALL_SMS[scenarioId] ?? []).find((sms) => sms.smsId === item.smsId)?.kind ?? ""])
    .filter((label): label is string => label !== undefined);
  return [...new Set(labels)];
}

/** 마친 이체 화면 중 가장 늦게 보낸 것의 금액 비교(없으면 undefined). */
export function latestTransferAmount(facts: readonly ScreenFact[]): AmountComparison | undefined {
  return [...facts].reverse().find((f) => f.kind === "transfer" && f.done && f.amount !== undefined)?.amount;
}

/** 상태 줄 뒤 덧붙임(재촉 단계 · 금액 · 아직 안 보낸 문자). */
function pressureSentences(facts: readonly ScreenFact[], userTurns: number, notYetSent: readonly string[], messenger: boolean): string[] {
  const out: string[] = [];
  const install = screenPressureFor("install", facts, userTurns);
  if (install === "release") out.push(SCREEN_PRESSURE_SENTENCES.installRelease);
  else if (install) out.push(SCREEN_PRESSURE_SENTENCES.installHold);
  const giveUp = messenger ? SCREEN_PRESSURE_SENTENCES.giveUpMessenger : SCREEN_PRESSURE_SENTENCES.giveUp;
  if (facts.some((f) => f.kind === "transfer") && !facts.some((f) => f.kind === "transfer" && f.done)) {
    out.push(SCREEN_PRESSURE_SENTENCES.transferPending); // R5
  }
  const others = (["transfer", "form"] as const).map((kind) => screenPressureFor(kind, facts, userTurns));
  if (install === "give_up" || others.includes("give_up")) out.push(giveUp);
  else if (install === "switch" || others.includes("switch")) out.push(SCREEN_PRESSURE_SENTENCES.switch);
  const amount = latestTransferAmount(facts);
  if (amount === "less") out.push(SCREEN_PRESSURE_SENTENCES.transferLess);
  if (amount === "more") out.push(SCREEN_PRESSURE_SENTENCES.transferMore);
  if (notYetSent.length > 0) out.push(`아직 ${notYetSent.join(" · ")}는 보내지 않았다. 보냈다고 말하거나 그 문자 속 계좌 · 링크를 가리키지 마라.`);
  return out;
}

/**
 * 폴백(텍스트) 매 턴 상태 줄 — 서버가 아는 화면 사실을 그대로 알린다(실시간은 응낙 · 제출 순간의 맥락 주입이 같은 사실을 나른다).
 * 적용 제외 · 보낸 화면 0 = undefined(종전 바이트 동일).
 */
export function buildScreenStatusLine(
  applies: boolean,
  facts: readonly ScreenFact[],
  // R1 · R2 · R4 · R5 · R6 · N1 — 넘기면 재촉 단계(판정표 SP) · 금액 비교 · 아직 안 보낸 문자를 덧붙인다. 부재 = 종전 바이트.
  context?: { userTurns: number; notYetSent?: readonly string[]; messenger?: boolean },
): string | undefined {
  if (!applies || facts.length === 0) return undefined;
  const parts = facts.map((f) => {
    const amount = context && f.done && f.amount ? ` · ${AMOUNT_LABEL[f.amount]}` : "";
    return `${KIND_LABEL[f.kind].name} — ${f.done ? KIND_LABEL[f.kind].done : KIND_LABEL[f.kind].pending}${amount}`;
  });
  const extra = context ? pressureSentences(facts, context.userTurns, context.notYetSent ?? [], context.messenger === true) : [];
  return `(앱 화면 기록: ${parts.join(" · ")}. 기록이 없는 화면은 상대가 했다고 말해도 끝난 것으로 보지 않는다.${extra.map((s) => ` ${s}`).join("")})`;
}

/**
 * R1(#465 실측 · 실기기 "보안 앱 설치 그냥 통과되는데") — 실시간 매 발화 화면 기록 줄. `deliverInCallSms` 백스톱 응답 `screenStatusInstruction`으로
 * 돌려주고 클라가 맥락 주입(`screenStatus`)한다. 아직 마치지 않은 화면이 있거나 요구액보다 적게 보낸 이체가 있을 때만 · 그 밖 = undefined(주입 0).
 */
export function buildLiveScreenStatusInstruction(
  applies: boolean,
  facts: readonly ScreenFact[],
  userTurns: number,
  notYetSent: readonly string[],
): string | undefined {
  if (!applies || facts.length === 0) return undefined;
  if (!facts.some((f) => !f.done) && latestTransferAmount(facts) !== "less") return undefined;
  return buildScreenStatusLine(true, facts, { userTurns, notYetSent });
}

/** 판정표 SB — 권한 허용 기록이 없는 통화 중 설치 문자 중 가장 늦게 도착한 것의 도착 발화 수(없거나 미적용 = undefined). */
export function installPendingSince(
  applies: boolean,
  scenarioId: string,
  delivered: readonly DeliveredSmsRecord[],
  mockScreens: readonly MockScreenRecord[],
): number | undefined {
  if (!applies) return undefined;
  const consented = new Set(mockScreens.filter((m) => m.consented).map((m) => m.landingId));
  let since: number | undefined;
  for (const record of delivered) {
    if (!record.fakeLandingId || screenKindOf(scenarioId, record.fakeLandingId) !== "install" || consented.has(record.fakeLandingId)) continue;
    const at = record.userTurnsAtArrival ?? 0;
    since = since === undefined ? at : Math.max(since, at);
  }
  return since;
}

/**
 * 공통 규칙(`promptAssembly.ts` `SCREEN_ACTION_ONLY_RULE`)을 싣는 세션인가 — 적용 변형 ∧ 이 세션이 열 수 있는 모의 화면(통화 중 문자 · 메신저 칩)이 1개 이상.
 * 호출부 6곳(오프닝 · 텍스트 턴 · 실시간 · 통화 복귀 · 통화 중 대화방 · 화면 행동 뒤)이 같은 술어를 쓴다.
 */
export function sessionScreenActionOnly(scenarioId: string, flowVariantId: string | undefined): boolean {
  return screenActionApplies(flowVariantId) && sessionReachableLandingIds(scenarioId, flowVariantId).length > 0;
}
