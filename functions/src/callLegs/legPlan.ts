// §142(카드사 고급 재구성 · Architecture.md §142.2~§142.4) — 다통화 레그 런타임의 **순수 판정**(잎 모듈 · Firestore 0).
// 콜러블(`callLegs/index.ts`) · 끊기(`scammerHangup/*`) · 문자 게이트(`inCallSms/smsGate.ts`) · 토큰(`realtime/*`)이 이 파일 하나를 본다.
//
// 상태(세션 문서 `relay` — 서버만 쓴다):
// | 필드 | 뜻 |
// |---|---|
// | `legIndex` | 지금(또는 다음에 열) 통화의 레그 번호. 부재 = 0 |
// | `legStartUserTurns[i]` | 레그 i가 시작될 때의 세션 사용자 발화 수(문자 하한 · 끊기 5행의 기준) |
// | `connected` | 현재 레그 통화가 연결됐는가. 첫 레그가 `incoming`이면 부재여도 연결로 본다(세션 시작 = 수신 통화) |
// | `legEnded` | 마지막으로 끝난 레그 번호(끊기 승인이 쓴다) — `legIndex`와 같으면 다음 레그를 열 차례 |
// | `entry` | 현재 레그가 실제로 열린 방식(`startCallLeg`가 쓴다 — D2: 참가자가 건 통화인가). 부재 = 변형 레그 정의 |
import type { FlowVariant, FlowVariantLeg } from "../scenarios/flowVariants";
import { lookupDialedNumber, type DialEntry } from "../scenarios/dialDirectory";

export type RelayState = {
  legIndex: number;
  legStartUserTurns: number[];
  connected?: boolean;
  legEnded?: number;
  entry?: "dial" | "transfer" | "incoming";
};

export type MultiCallVariant = Pick<FlowVariant, "scenarioId" | "legs" | "multiCall">;

/** 현재 레그 번호(부재 · 범위 밖 = 보정: 부재 0 · 범위 밖 마지막). */
export function currentLegIndex(variant: Pick<FlowVariant, "legs">, relay: Pick<RelayState, "legIndex"> | undefined): number {
  const raw = relay?.legIndex ?? 0;
  return Number.isInteger(raw) && raw >= 0 && raw < variant.legs.length ? raw : variant.legs.length - 1;
}

/** 레그 i 시작 시점의 사용자 발화 수(부재 = 0). */
export function legStartUserTurns(relay: Pick<RelayState, "legStartUserTurns"> | undefined, legIndex: number): number {
  const value = relay?.legStartUserTurns?.[legIndex];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** 현재 레그가 마지막이 아닌가(= 끊기 승인이 세션 끝이 아니라 레그 끝이다). */
export function isNonLastLeg(variant: Pick<FlowVariant, "legs">, relay: RelayState | undefined): boolean {
  return currentLegIndex(variant, relay) < variant.legs.length - 1;
}

/** 현재 레그 통화가 연결돼 있는가(첫 레그 수신은 세션 시작으로 연결). */
export function isLegConnected(variant: Pick<FlowVariant, "legs">, relay: RelayState | undefined): boolean {
  if (relay?.connected !== undefined) return relay.connected;
  return (variant.legs[0]?.entry ?? "incoming") === "incoming";
}

export type LegStartAction = "dial" | "transfer" | "callback";

export type LegStartPlan =
  | { status: "connected"; legIndex: number; leg: FlowVariantLeg; entry: "dial" | "transfer" | "incoming"; relay: RelayState }
  | { status: "genuine"; entry: DialEntry }
  | { status: "unknown_number" }
  | { status: "not_ready"; reason: "not_multi_call" | "leg_in_progress" | "no_next_leg" | "wrong_action" };

/**
 * 다음 레그를 열 수 있는가 · 연다면 무엇으로 이어지는가(Architecture.md §142.4 다이얼 판정표 — 이 순서대로만).
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 다통화 아님 | not_ready |
 * | 2 | 아직 연결 전인 첫 레그(R2 — entry dial) | 대상 = 레그 0 |
 * | 3 | 현재 레그가 끝나지 않았다(`legEnded !== legIndex`) | not_ready(leg_in_progress) |
 * | 4 | 다음 레그 없음 | not_ready(no_next_leg) |
 * | 5 | 행동이 그 레그의 나가는 방식과 맞지 않는다(callback은 dial 자리에서만 — D4) | not_ready(wrong_action) |
 * | 6 | callback · transfer | 연결(가로채기 판정 없음 — 상대가 건다 · 넘긴다) |
 * | 7 | dial — 건 번호가 번호부에 없다 | unknown_number |
 * | 8 | dial — 대상 레그 번호이고 가로채기 조건(원격 지원 앱 응낙) 충족 또는 조건 없음 | 연결 |
 * | 9 | dial — 대상 번호지만 가로채기 조건 불충족 · 또는 진짜 기관 안내가 있는 다른 번호 | genuine(D3 — 자동 안내 · 방어 종료) |
 * | 10 | dial — 그 밖(번호부에 있지만 대상도 진짜 안내도 아님) | unknown_number |
 */
export function planLegStart(input: {
  variant: MultiCallVariant;
  relay: RelayState | undefined;
  action: LegStartAction;
  dialed?: string;
  /** 원격 지원 앱 설치 응낙(화면 행동 — `mockScreens/{landingId}.consentedAt`). */
  installConsented: boolean;
  userTurns: number;
}): LegStartPlan {
  const { variant, relay, action } = input;
  if (!variant.multiCall) return { status: "not_ready", reason: "not_multi_call" };
  const connected = isLegConnected(variant, relay);
  const current = currentLegIndex(variant, relay);
  let target: number;
  if (!connected && current === 0 && relay?.legEnded === undefined) {
    // R2 — 세션은 문자 화면에서 시작한다. 첫 레그는 참가자 발신(callback = 상대가 먼저 건다 — D4).
    if (action === "transfer") return { status: "not_ready", reason: "wrong_action" };
    target = 0;
  } else {
    if (relay?.legEnded !== current) return { status: "not_ready", reason: "leg_in_progress" };
    if (current >= variant.legs.length - 1) return { status: "not_ready", reason: "no_next_leg" };
    const exit = variant.legs[current].exit;
    const ok = action === exit || (action === "callback" && exit === "dial");
    if (!ok) return { status: "not_ready", reason: "wrong_action" };
    target = current + 1;
  }
  const leg = variant.legs[target];
  const nextRelay = (entry: "dial" | "transfer" | "incoming"): LegStartPlan => ({
    status: "connected",
    legIndex: target,
    leg,
    entry,
    relay: {
      legIndex: target,
      legStartUserTurns: [...(relay?.legStartUserTurns ?? []).slice(0, target), Math.max(0, Math.floor(input.userTurns))],
      connected: true,
      entry,
    },
  });
  if (action === "transfer") return nextRelay("transfer");
  if (action === "callback") return nextRelay("incoming");
  const entry = lookupDialedNumber(variant.scenarioId, input.dialed ?? "");
  if (!entry) return { status: "unknown_number" };
  if (entry.numberId === leg.dialTarget) {
    const intercepted = leg.interceptRequires !== "install" || input.installConsented;
    if (intercepted) return nextRelay("dial");
    return entry.genuineNotice ? { status: "genuine", entry } : { status: "unknown_number" };
  }
  return entry.genuineNotice ? { status: "genuine", entry } : { status: "unknown_number" };
}

/**
 * 끊기 판정에 넘길 레그 보정값. 마지막이 아닌 레그의 끊기는 "그 통화의 일을 마쳤다"이므로 결정 화면(4-c) · 후속 단계(4-b)를 보지 않고,
 * 하한(5행)은 레그 시작 뒤 발화 수로 본다. 마지막 레그는 종전 입력 그대로(4-c = 안전계좌 이체 화면).
 */
export function legHangupAdjustments(
  variant: Pick<FlowVariant, "legs" | "multiCall">,
  relay: RelayState | undefined,
  userTurns: number,
): { nonLastLeg: boolean; turnsSinceLegStart: number } | undefined {
  if (!variant.multiCall) return undefined;
  const leg = currentLegIndex(variant, relay);
  return { nonLastLeg: leg < variant.legs.length - 1, turnsSinceLegStart: userTurns - legStartUserTurns(relay, leg) };
}

/**
 * 레그 화자의 목소리 자리(D5 — 통화마다 다른 인물 · 같은 인물은 같은 목소리). 같은 성별 인물들 사이에서 처음 나온 순서가 자리 번호다
 * (자리 0 = 그 성별의 종전 기본 목소리). 같은 `speakerId`(감독기관 레그 2 · 4)는 같은 자리.
 */
export function legVoiceSlot(
  variant: Pick<FlowVariant, "legs">,
  legIndex: number,
): { gender: "male" | "female"; slot: number } {
  const leg = variant.legs[legIndex] ?? variant.legs[variant.legs.length - 1];
  const order: string[] = [];
  for (const [i, other] of variant.legs.entries()) {
    if (other.speakerGender !== leg.speakerGender) continue;
    const id = other.speakerId ?? `#${i}`;
    if (!order.includes(id)) order.push(id);
  }
  const ownId = leg.speakerId ?? `#${variant.legs.indexOf(leg)}`;
  return { gender: leg.speakerGender, slot: Math.max(0, order.indexOf(ownId)) };
}

/** 이 세션의 현재 레그(다통화 변형만 — 아니면 undefined). 토큰 · 폴백 · 성별 해석이 같은 값을 쓴다. */
export function resolveSessionCallLeg(
  variant: (Pick<FlowVariant, "legs" | "multiCall" | "scenarioId">) | undefined,
  session: { scenarioId: string; relay?: RelayState },
): { legIndex: number; gender: "male" | "female"; voiceSlot: number; callerLabel: string; entry: "dial" | "transfer" | "incoming" } | undefined {
  if (!variant || !variant.multiCall || variant.scenarioId !== session.scenarioId) return undefined;
  const legIndex = currentLegIndex(variant, session.relay);
  const { gender, slot } = legVoiceSlot(variant, legIndex);
  return { legIndex, gender, voiceSlot: slot, callerLabel: variant.legs[legIndex].callerLabel, entry: resolveLegEntry(variant, session.relay, legIndex) };
}

/**
 * §142 N3 — 메시지를 쓰는 지점(실시간 전사 제출 · 폴백 턴)이 그 메시지에 남길 통화 번호 = 그 시점의 서버 현재 레그.
 * 다통화가 아니면 undefined(필드 부재 — 종전 문서 그대로). 전사는 레그 끝(끊기 승인 뒤 · 다음 레그 열기 전)에 제출되므로 끝난 레그 번호다.
 */
export function messageLegIndex(
  variant: (Pick<FlowVariant, "legs" | "multiCall" | "scenarioId">) | undefined,
  session: { scenarioId: string; relay?: RelayState },
): number | undefined {
  if (!variant || !variant.multiCall || variant.scenarioId !== session.scenarioId) return undefined;
  return currentLegIndex(variant, session.relay);
}

/**
 * D2(§142 확인 실측 2026-11-02) — 현재 레그가 실제로 열린 방식. 참가자가 건 통화(`dial`)면 클라가 "받는 쪽" 첫 신호를 보낸다.
 * | # | If | Then |
 * |---|---|---|
 * | 1 | `relay.entry`가 있고 그 relay의 레그가 지금 레그다 | 그 값(서버 `startCallLeg`가 쓴 실제 방식 — R2 재발신은 incoming) |
 * | 2 | 그 밖 | 변형 레그 정의(`entry` 부재 = incoming) |
 */
export function resolveLegEntry(
  variant: Pick<FlowVariant, "legs">,
  relay: RelayState | undefined,
  legIndex: number,
): "dial" | "transfer" | "incoming" {
  if (relay?.entry && relay.legIndex === legIndex) return relay.entry;
  return variant.legs[legIndex]?.entry ?? "incoming";
}

/**
 * 앞 레그 인계 블록(D5 — 새 연결은 앞 통화를 모른다). 같은 일당이 이어받은 설정이라 정보는 알고 있되, 앞 사람이 아니며 그 말을 되풀이하지 않는다.
 * 입력 = 이번 레그 시작 전까지의 대화(세션 `messages` — 앞 레그 전사는 레그 끝에 제출된다). 결정적(추가 LLM 호출 0).
 *
 * 2026-11-07 실기기 신고(세션 1d84811b — "방금 한 말만 반영되고 그 전 대화는 반영 안 된다") — 종전에는 마지막 16줄만 실어 4번째 통화쯤이면
 * 첫 통화에서 참가자가 말한 사실(카드 신청 여부 · 밖이라 못 받음 등)이 빠졌다. 이제 줄 고르기 규칙(이 순서대로):
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 사용자 · 사기범 줄이 아니다 · 빈 줄 · 참가자에게 도달하지 않은 줄(`notSpoken`) | 뺀다 |
 * | 2 | 참가자 줄 | 전부 싣는다(앞 통화들 전체 — 참가자가 말한 사실 · 한 일) |
 * | 3 | 참가자 줄 바로 앞의 상대 줄(그 답의 질문 — "네"만으로는 뜻이 없다) | 싣는다(`PRIOR_LEG_CONTEXT_LINE_MAX_CHARS`자로 자름) |
 * | 4 | 마지막 `PRIOR_LEG_RECENT_LINES`줄(직전 통화 끝부분) | 싣는다 |
 * | 5 | 고른 줄이 `PRIOR_LEG_MAX_LINES`를 넘는다 | 끝부분(4행) 밖의 상대 줄을 오래된 것부터 빼고 · 그래도 넘으면 오래된 참가자 줄을 뺀다 |
 * 줄에 `legIndex`(§142 N3)가 있으면 통화마다 머리줄을 넣는다. 빠진 줄 자리는 "(…)" 한 줄로 표시한다.
 */
export const PRIOR_LEG_MAX_LINES = 48;
export const PRIOR_LEG_RECENT_LINES = 8;
export const PRIOR_LEG_USER_LINE_MAX_CHARS = 160;
export const PRIOR_LEG_CONTEXT_LINE_MAX_CHARS = 100;
export type PriorLegMessage = { role: string; text?: string; legIndex?: number; notSpoken?: boolean };

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text);

export function buildPriorLegContext(messages: readonly PriorLegMessage[]): string | undefined {
  const rows = messages
    .filter((m) => (m.role === "user" || m.role === "scammer") && m.notSpoken !== true && typeof m.text === "string" && m.text.trim().length > 0)
    .map((m) => ({ user: m.role === "user", text: m.text!.trim(), leg: m.legIndex }));
  if (rows.length === 0) return undefined;
  const recentFrom = Math.max(0, rows.length - PRIOR_LEG_RECENT_LINES);
  const keep = rows.map((row, i) => row.user || i >= recentFrom || rows[i + 1]?.user === true);
  const count = () => keep.filter(Boolean).length;
  for (let i = 0; i < recentFrom && count() > PRIOR_LEG_MAX_LINES; i += 1) if (!rows[i].user) keep[i] = false;
  for (let i = 0; i < recentFrom && count() > PRIOR_LEG_MAX_LINES; i += 1) keep[i] = false;

  const byLeg = rows.some((row) => row.leg !== undefined);
  const lines: string[] = [];
  let lastLeg: number | undefined;
  let gap = false;
  rows.forEach((row, i) => {
    if (byLeg && row.leg !== undefined && row.leg !== lastLeg) {
      lines.push(`— ${row.leg + 1}번째 통화 —`);
      lastLeg = row.leg;
      gap = false;
    }
    if (!keep[i]) {
      if (!gap) lines.push("(…)");
      gap = true;
      return;
    }
    gap = false;
    const max = row.user || i >= recentFrom ? PRIOR_LEG_USER_LINE_MAX_CHARS : PRIOR_LEG_CONTEXT_LINE_MAX_CHARS;
    lines.push(`${row.user ? "참가자" : "앞 통화 상대"}: ${clip(row.text, max)}`);
  });
  return [
    "[앞선 통화 기록] 이 통화 전에 참가자가 같은 일당의 다른 사람들과 나눈 통화들이다. 너는 그 사람들이 아니다.",
    "참가자가 한 말은 첫 통화부터 빠짐없이 싣는 것을 우선했고, 상대 말은 참가자 답의 바로 앞 질문과 직전 통화 끝부분만 실었다.",
    "기록에 나온 사실(참가자가 말한 정보 · 한 일 · 이미 답한 것)은 이미 전달받은 것처럼 자연스럽게 이어 가되, 앞 사람의 말을 되풀이하거나 기록을 읽어 주지 않는다. 참가자가 이미 답한 것을 처음 듣는 것처럼 다시 묻지 않는다.",
    ...lines,
  ].join("\n");
}

/**
 * 폴백(텍스트 턴) 이력을 레그 경계로 나눈다. 레그 시작 = 앞 레그의 마지막 사용자 발화(`legStartUserTurns`번째)와 그 발화에 대한 사기범 답 1개 뒤.
 * 새 레그의 모델 이력은 `current`만 — 앞 통화는 `buildPriorLegContext(prior)`로 인계한다(Live 새 연결과 같은 입력).
 */
export function splitLegHistory<T extends { role: "user" | "scammer" }>(
  messages: readonly T[],
  legStartTurns: number,
): { prior: T[]; current: T[] } {
  if (legStartTurns <= 0) return { prior: [], current: [...messages] };
  let users = 0;
  let cut = messages.length;
  for (const [i, m] of messages.entries()) {
    if (m.role !== "user") continue;
    users += 1;
    if (users === legStartTurns) {
      cut = messages[i + 1]?.role === "scammer" ? i + 2 : i + 1;
      break;
    }
  }
  return { prior: messages.slice(0, cut), current: messages.slice(cut) };
}

/**
 * 결함 ①(2026-11-06 메인 내장 브라우저 시험 — 수신 화면은 시나리오 기본 번호, 받고 나면 배송원 번호로 바뀌었다) — 세션이 **수신 통화로 시작하는**
 * 다통화 변형이면 첫 레그 발신자 라벨(벨이 울릴 때부터 그 번호가 떠야 한다). 받기 전에는 통화 토큰(`callLeg.callerLabel`)이 아직 없다.
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 다통화 아님 · 다른 시나리오 · 첫 레그가 참가자 발신(R2 — 시작 문자 화면) | undefined(종전 시나리오 라벨) |
 * | 2 | 그 밖 | 레그 0 `callerLabel` |
 */
export function startCallerLabelFor(
  variant: (Pick<FlowVariant, "legs" | "multiCall" | "scenarioId">) | undefined,
  scenarioId: string,
): string | undefined {
  if (!variant?.multiCall || variant.scenarioId !== scenarioId) return undefined;
  const first = variant.legs[0];
  if (!first || (first.entry ?? "incoming") !== "incoming") return undefined;
  return first.callerLabel;
}
