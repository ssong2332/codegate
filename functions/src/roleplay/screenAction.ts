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
// | SB1 | 적용 변형 ∧ 도착한 통화 중 설치 문자 중 권한 허용 기록이 없는 것이 있다 | 가장 늦게 도착한 그 문자의 도착 발화 수 — 백스톱이 그 뒤 `INSTALL_HOLD_USER_TURNS` 발화 동안 다음 필수 문자를 밀지 않는다 |
// | SB2 | 그 밖 | `undefined`(종전 백스톱) |
// ⚠️ 보류는 백스톱(강제 발송)만이다 — 게이트(`resolveSmsGate`)는 그대로라 모델이 스스로 부르면 간다. 끝내 설치하지 않는 참가자는 보류가 끝난 뒤 흐름이 이어진다
//    (설치를 거절해도 다음 요구로 넘어가는 수법 문면과 같은 방향 · 영원히 멈추지 않게).
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
export type ScreenFact = { landingId: string; kind: ScreenKind; done: boolean };

/** 카탈로그 화면 종류(설치 · 이체 · 입력). 이 시나리오 카탈로그 밖이면 undefined. */
export function screenKindOf(scenarioId: string, landingId: string): ScreenKind | undefined {
  const item = findMockScreenItem(scenarioId, landingId);
  if (!item) return undefined;
  if (item.kind === "app-install") return "install";
  // 훈련용 이체 화면(P2) ∨ 계좌 문자(`kind: "account"`)가 여는 화면(P2 이전 이체 화면 — 예: 카드 피해금 이관 `card-relief-transfer`) = 이체.
  if (isBankTransferLanding(landingId)) return "transfer";
  return (IN_CALL_SMS[scenarioId] ?? []).some((sms) => sms.kind === "account" && sms.fakeLandingId === landingId) ? "transfer" : "form";
}

/** `mockScreens/{landingId}` 문서에서 판정에 쓰는 필드만. */
export type MockScreenRecord = { landingId: string; consented: boolean; submitted: boolean };

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
    facts.push({ landingId: record.fakeLandingId, kind, done: kind === "install" ? consented.has(record.fakeLandingId) : record.landingSubmitted === true });
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
  for (const message of history) {
    if (message.role !== "scammer") continue;
    for (const attachment of message.attachments ?? []) {
      if (seen.has(attachment.fakeLandingId)) continue;
      const kind = screenKindOf(scenarioId, attachment.fakeLandingId);
      if (!kind) continue;
      seen.add(attachment.fakeLandingId);
      const record = byId.get(attachment.fakeLandingId);
      facts.push({ landingId: attachment.fakeLandingId, kind, done: kind === "install" ? record?.consented === true : record?.submitted === true });
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
  transfer:
    "(앱 확인: 상대는 보냈다고 말했지만 앱에는 아직 네가 보낸 링크 화면에서 이체한 기록이 없다. 끝난 것으로 받아들이지 말고, 입금 확인이 안 된다며 그 링크 화면에서 다시 진행해 달라고 짧게 말하라. 입금이 확인됐다고 말하지 말고 다음 단계로 넘어가지 마라.)",
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

/**
 * 폴백(텍스트) 매 턴 상태 줄 — 서버가 아는 화면 사실을 그대로 알린다(실시간은 응낙 · 제출 순간의 맥락 주입이 같은 사실을 나른다).
 * 적용 제외 · 보낸 화면 0 = undefined(종전 바이트 동일).
 */
export function buildScreenStatusLine(applies: boolean, facts: readonly ScreenFact[]): string | undefined {
  if (!applies || facts.length === 0) return undefined;
  const parts = facts.map((f) => `${KIND_LABEL[f.kind].name} — ${f.done ? KIND_LABEL[f.kind].done : KIND_LABEL[f.kind].pending}`);
  return `(앱 화면 기록: ${parts.join(" · ")}. 기록이 없는 화면은 상대가 했다고 말해도 끝난 것으로 보지 않는다.)`;
}

/** 판정표 SB — 설치 응낙이 없을 때 백스톱이 다음 필수 문자를 미루는 발화 수(원천 = `smsGate.ts` — 순환 import를 피해 거기 둔다). */
export { INSTALL_HOLD_USER_TURNS } from "../inCallSms/smsGate";

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
