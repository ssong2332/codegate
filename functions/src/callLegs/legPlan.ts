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
// | `hungUpBy` | 2026-11-07 — 현재 레그를 참가자가 먼저 끊었다(`startCallLeg({action:"hangup"})`). 부재 = 사기범 끊기 승인 · 아직 연결 중 |
// | `rejoin` | 2026-11-07 — 참가자가 끊은 레그가 같은 인물로 다시 연결됐다(재다이얼 · 상대 재발신)와 그때의 사용자 발화 수 |
import type { FlowVariant, FlowVariantLeg } from "../scenarios/flowVariants";
import { findDialEntry, lookupDialedNumber, normalizeDialedNumber, type DialEntry } from "../scenarios/dialDirectory";
import { IN_CALL_SMS } from "../scenarios/inCallSms";

export type RelayState = {
  legIndex: number;
  legStartUserTurns: number[];
  connected?: boolean;
  legEnded?: number;
  entry?: "dial" | "transfer" | "incoming";
  hungUpBy?: "participant";
  rejoin?: { kind: LegRejoinKind; atUserTurns: number };
};

/** 참가자가 끊은 레그의 재연결 방식 — `redial` = 참가자가 그 상대 번호로 다시 걸었다 · `callback` = 상대가 다시 걸어 왔다. */
export type LegRejoinKind = "redial" | "callback";

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
  | {
      status: "connected";
      legIndex: number;
      leg: FlowVariantLeg;
      entry: "dial" | "transfer" | "incoming";
      relay: RelayState;
      /** 참가자가 끊은 같은 레그를 다시 이었다(부재 = 새 레그). */
      rejoin?: LegRejoinKind;
    }
  | { status: "genuine"; entry: DialEntry }
  | { status: "unknown_number" }
  | { status: "not_ready"; reason: LegNotReadyReason };

/** ⭐ PR-B — `screen_pending` = 나감 `incoming` 레그의 다음 통화 조건 화면(`opensNextAfterLanding`)을 아직 제출하지 않았다(대출을 신청하지 않았으면 확인 전화는 오지 않는다). */
export type LegNotReadyReason = "not_multi_call" | "leg_in_progress" | "no_next_leg" | "wrong_action" | "screen_pending";

/** ⭐ PR-B — 레그의 다음 통화 조건 화면을 제출했는가(조건 없음 = 참). */
export function legNextReady(leg: Pick<FlowVariantLeg, "opensNextAfterLanding">, submittedLandings: readonly string[] | undefined): boolean {
  return leg.opensNextAfterLanding === undefined || (submittedLandings ?? []).includes(leg.opensNextAfterLanding);
}

/**
 * 다음 레그를 열 수 있는가 · 연다면 무엇으로 이어지는가(Architecture.md §142.4 다이얼 판정표 — 이 순서대로만).
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 다통화 아님 | not_ready |
 * | 2 | 아직 연결 전인 첫 레그(R2 — entry dial) | 대상 = 레그 0 |
 * | 3 | 현재 레그가 끝나지 않았다(`legEnded !== legIndex`) | not_ready(leg_in_progress) |
 * | 4 | 다음 레그 없음 | not_ready(no_next_leg) |
 * | 4-b | ⭐ PR-B — dial · 현재 레그 나감이 incoming · 건 번호에 진짜 안내가 있다 | genuine(기다리는 사이 진짜 번호 확인 = 방어 종료) |
 * | 5 | 행동이 그 레그의 나가는 방식과 맞지 않는다(callback은 dial · incoming 자리에서만 — D4 · PR-B) | not_ready(wrong_action) |
 * | 5-b | ⭐ PR-B — 나감 `incoming`인데 조건 화면(`opensNextAfterLanding`)을 제출하지 않았다 | not_ready(screen_pending) |
 * | 6 | callback · transfer | 연결(가로채기 판정 없음 — 상대가 건다 · 넘긴다) |
 * | 7 | dial — 건 번호가 번호부에 없다 | unknown_number |
 * | 8 | dial — 대상 레그 번호이고 가로채기 조건(원격 지원 앱 응낙) 충족 또는 조건 없음 | 연결 |
 * | 9 | dial — 대상 번호지만 가로채기 조건 불충족 · 또는 진짜 기관 안내가 있는 다른 번호 | genuine(D3 — 자동 안내 · 방어 종료) |
 * | 10 | dial — 그 밖(번호부에 있지만 대상도 진짜 안내도 아님) | unknown_number |
 *
 * 2026-11-07(메인 승인 계약 — 참가자가 먼저 끊기) — 3행 앞에 아래 행을 먼저 본다(현재 레그를 **참가자가** 끊었을 때만 · `hungUpBy`):
 * | # | If | Then |
 * |---|---|---|
 * | P0 | ⭐ PR-B — callback · 그 레그 나감이 `incoming` · 조건 화면 제출됨 · 다음 레그 있음 | 아래 3행부터(= 다음 레그 — 확인 전화가 걸려 온다) |
 * | P1 | callback | 같은 레그를 다시 연결(entry incoming · 같은 인물 · rejoin callback) |
 * | P2 | dial — 그 레그 상대 번호(`legCounterpartNumber`) | 같은 레그를 다시 연결(entry dial · rejoin redial) |
 * | P3 | dial · 마지막 레그 — 그 밖 번호 | 9 · 10행과 같은 판정(진짜 안내 / unknown_number — 다음 레그가 없다) |
 * | P4 | 그 밖 | 아래 3행부터 종전(다음 레그 대상 번호 = 가로채기 판정 · 그 밖 = 진짜 안내 / unknown_number) |
 * 재연결은 `legStartUserTurns`를 그대로 둔다(그 레그 문자 하한 · 끊기 하한이 처음 연결 기준으로 이어진다).
 */
export function planLegStart(input: {
  variant: MultiCallVariant;
  relay: RelayState | undefined;
  action: LegStartAction;
  dialed?: string;
  /** 원격 지원 앱 설치 응낙(화면 행동 — `mockScreens/{landingId}.consentedAt`). */
  installConsented: boolean;
  userTurns: number;
  /** ⭐ PR-B — 제출된 모의 화면 landingId(`mockScreens/{id}.submittedAt`). 부재 = 없음. */
  submittedLandings?: readonly string[];
}): LegStartPlan {
  const { variant, relay, action } = input;
  if (!variant.multiCall) return { status: "not_ready", reason: "not_multi_call" };
  const connected = isLegConnected(variant, relay);
  const current = currentLegIndex(variant, relay);
  const opensNext = (index: number): boolean =>
    variant.legs[index]?.exit === "incoming" && index < variant.legs.length - 1 && legNextReady(variant.legs[index], input.submittedLandings);
  if (relay?.hungUpBy === "participant" && relay.legEnded === current && !(action === "callback" && opensNext(current))) {
    const leg = variant.legs[current];
    const rejoinRelay = (entry: "dial" | "incoming", kind: LegRejoinKind): LegStartPlan => ({
      status: "connected",
      legIndex: current,
      leg,
      entry,
      rejoin: kind,
      relay: {
        legIndex: current,
        legStartUserTurns: [...(relay.legStartUserTurns ?? [])],
        connected: true,
        entry,
        rejoin: { kind, atUserTurns: Math.max(0, Math.floor(input.userTurns)) },
      },
    });
    if (action === "callback") return rejoinRelay("incoming", "callback");
    const counterpart = legCounterpartNumber(variant.scenarioId, leg);
    if (action === "dial" && counterpart !== undefined && normalizeDialedNumber(input.dialed ?? "") === normalizeDialedNumber(counterpart)) {
      return rejoinRelay("dial", "redial");
    }
    if (action === "dial" && current >= variant.legs.length - 1) {
      const entry = lookupDialedNumber(variant.scenarioId, input.dialed ?? "");
      return entry?.genuineNotice ? { status: "genuine", entry } : { status: "unknown_number" };
    }
  }
  let target: number;
  if (!connected && current === 0 && relay?.legEnded === undefined) {
    // R2 — 세션은 문자 화면에서 시작한다. 첫 레그는 참가자 발신(callback = 상대가 먼저 건다 — D4).
    if (action === "transfer") return { status: "not_ready", reason: "wrong_action" };
    target = 0;
  } else {
    if (relay?.legEnded !== current) return { status: "not_ready", reason: "leg_in_progress" };
    if (current >= variant.legs.length - 1) return { status: "not_ready", reason: "no_next_leg" };
    const exit = variant.legs[current].exit;
    // ⭐ PR-B(행 4-b) — 다음 사람이 걸어 오기를 기다리는 레그(나감 incoming)에서 참가자가 진짜 안내가 있는 번호(입금 안내 문자 속 캐피탈 대출센터 등)를
    // 걸면 진짜 안내(방어 종료). 나감이 dial · transfer인 레그는 종전 판정 그대로(아래 5 · 7 ~ 10행).
    if (action === "dial" && exit === "incoming") {
      const dialedEntry = lookupDialedNumber(variant.scenarioId, input.dialed ?? "");
      if (dialedEntry?.genuineNotice) return { status: "genuine", entry: dialedEntry };
    }
    const ok = action === exit || (action === "callback" && (exit === "dial" || exit === "incoming"));
    if (!ok) return { status: "not_ready", reason: "wrong_action" };
    if (exit === "incoming" && !opensNext(current)) return { status: "not_ready", reason: "screen_pending" };
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
 * 2026-11-07 — 레그 상대의 번호(참가자가 다시 걸면 같은 인물로 이어지는 번호). 참가자가 건 레그 = 그 레그 `dialTarget`의 번호부 번호 ·
 * 수신 레그 = 발신자 라벨이 번호 꼴이면 그 번호(배송원 010-0794-2261). 그 밖(이름 라벨 · 번호 없음) = undefined.
 */
export function legCounterpartNumber(scenarioId: string, leg: Pick<FlowVariantLeg, "dialTarget" | "callerLabel">): string | undefined {
  if (leg.dialTarget) return findDialEntry(scenarioId, leg.dialTarget)?.number;
  return /^\d[\d-]{6,}$/.test(leg.callerLabel) ? leg.callerLabel : undefined;
}

export type LegHangupPlan =
  | { status: "ended"; legIndex: number; relay?: RelayState }
  | { status: "not_ready"; reason: "not_multi_call" | "wrong_action" };

/**
 * 2026-11-07(메인 승인 계약) — 참가자가 통화를 먼저 끊었다(`startCallLeg({action:"hangup"})` — 클라가 전사 제출 뒤 부른다).
 * 훈련 종료가 아니다(종료는 화면의 별도 버튼 → `endSession`). 판정표(이 순서대로만):
 * | # | If | Then |
 * |---|---|---|
 * | H1 | 다통화 아님 | not_ready(not_multi_call) |
 * | H2 | 현재 레그가 이미 끝났다(`legEnded === legIndex` — 사기범 끊기 승인 · 앞선 끊기) | ended(쓰기 0 — 먼저 남은 기록을 덮지 않는다) |
 * | H3 | 현재 레그가 연결 전이다(R2 시작 문자 화면 · 진짜 안내 뒤) | not_ready(wrong_action) |
 * | H4 | 그 밖(연결 중) | ended + relay `connected:false · legEnded · hungUpBy:"participant"`(재연결 표식 `rejoin`은 지운다) |
 */
export function planLegHangup(variant: MultiCallVariant, relay: RelayState | undefined): LegHangupPlan {
  if (!variant.multiCall) return { status: "not_ready", reason: "not_multi_call" };
  const current = currentLegIndex(variant, relay);
  if (relay?.legEnded === current) return { status: "ended", legIndex: current };
  if (!isLegConnected(variant, relay)) return { status: "not_ready", reason: "wrong_action" };
  const next: RelayState = {
    legIndex: current,
    legStartUserTurns: [...(relay?.legStartUserTurns ?? [0])],
    connected: false,
    legEnded: current,
    hungUpBy: "participant",
    ...(relay?.entry ? { entry: relay.entry } : {}),
  };
  return { status: "ended", legIndex: current, relay: next };
}

/** 같은 레그 재연결 맥락에 싣는 끊기기 전 이 통화 대화 줄 수 상한 · 줄 길이 상한(판단값). */
export const LEG_REJOIN_MAX_LINES = 24;
export const LEG_REJOIN_LINE_MAX_CHARS = 160;
export type LegRejoinMessage = { role: string; text?: string; legIndex?: number; notSpoken?: boolean };

const REJOIN_SITUATION: Record<LegRejoinKind, string> = {
  redial: "조금 전 상대가 이 통화를 먼저 끊었고, 지금 상대가 같은 번호로 너에게 다시 전화를 걸어 왔다.",
  callback: "조금 전 상대가 이 통화를 먼저 끊었고, 지금 네가 같은 번호로 상대에게 다시 전화를 걸었다.",
};
const REJOIN_OPENING: Record<LegRejoinKind, string> = {
  redial: "'아까 통화가 끊겼네요'처럼 짧게 받은 뒤",
  callback: "'아까 통화가 끊겨서 다시 연락드렸습니다'처럼 짧게 말한 뒤",
};

/**
 * 2026-11-07 — 참가자가 끊은 레그를 같은 인물로 다시 이을 때의 맥락(Live 새 연결 · 폴백 첫 턴). 너는 같은 사람이라 **이 통화에서** 오간 말만 안다
 * (앞 통화 대화는 여전히 싣지 않는다 — `messages` 중 `legIndex`가 이 레그인 줄만 · 부재 = 레그 0). 결정적(추가 LLM 호출 0).
 * `messages`를 안 넘기면(폴백 — 모델 이력에 이미 이 레그 대화가 있다) 상황 문장만.
 */
export function buildLegRejoinContext(
  kind: LegRejoinKind,
  legIndex: number,
  messages?: readonly LegRejoinMessage[],
  /** 2026-11-07(Edge 시험 판 26) — 끊기기 전 이 통화에서 이미 도착한 문자의 설명(`legSentSmsDescriptions`). 부재 · 빈 목록 = 줄 0(종전 바이트). */
  sentSms?: readonly string[],
): string {
  const head = [
    `[끊겼던 통화 다시 연결] ${REJOIN_SITUATION[kind]} 너는 끊기기 전과 같은 사람이다.`,
    `위 [이 통화 전 상황]의 '본인 확인부터'는 처음 연결됐을 때의 규칙이다 — 끊기기 전에 이미 한 본인 확인 · 설명은 처음부터 다시 하지 않는다. ${REJOIN_OPENING[kind]} 끊기기 전 단계에서 이어 간다. 상대가 왜 끊었는지 따지거나 화내지 않는다.`,
    ...(sentSms && sentSms.length > 0
      ? [
          `끊기기 전 이 통화에서 네가 이미 보낸 문자(상대 휴대전화에 이미 도착해 있다): ${sentSms.join(" · ")}. 이 문자를 다시 보내 주겠다거나 곧 보내겠다고 하지 말고, 필요하면 '아까 보내 드린 문자'로 가리킨다.`,
        ]
      : []),
  ];
  if (!messages) return head.join("\n");
  const lines = messages
    .filter((m) => (m.legIndex ?? 0) === legIndex && m.notSpoken !== true && (m.role === "user" || m.role === "scammer"))
    .map((m) => ({ user: m.role === "user", text: (m.text ?? "").trim() }))
    .filter((m) => m.text.length > 0)
    .slice(-LEG_REJOIN_MAX_LINES)
    .map((m) => `${m.user ? "상대" : "너"}: ${clipLine(m.text)}`);
  if (lines.length === 0) return head.join("\n");
  return [...head, "끊기기 전 이 통화에서 오간 말(끝부분):", ...lines].join("\n");
}

/**
 * ⭐ PR-B(기관 사칭 고급 3통화 — 설계 §3 F8) — 정당한 제3자 통화(`genuine` 레그 — 대출 실행 확인 상담원) **뒤에** 같은 인물이 다시 건 레그의 맥락.
 * 너는 앞 통화의 그 사람이다(같은 `speakerId`) — 앞 통화 대화 원문은 싣지 않고, 앱이 아는 확인 결과(서버 `loanReview`)만 1줄 싣는다.
 * | # | If | Then |
 * |---|---|---|
 * | K1 | 이 레그가 첫 레그 · 정당한 제3자 레그이거나, 이 레그 앞에 정당한 제3자 레그가 없다 | undefined(종전) |
 * | K2 | 앞 레그 중 같은 `speakerId` 레그가 없다 | undefined(새 인물 — 종전 `caseBrief` 규칙) |
 * | K3 | 결과 = 실행 | 다시 건 같은 사람 + "대출이 실행돼 대출금이 입금됐다" |
 * | K4 | 그 밖(보류 · 결과 없음) | 다시 건 같은 사람 + "대출 실행이 보류됐다 — 대출금은 들어오지 않았다" |
 */
export function buildLegLoanReviewContext(
  variant: Pick<FlowVariant, "legs">,
  legIndex: number,
  outcome: "approved" | "held" | undefined,
): string | undefined {
  const leg = variant.legs[legIndex];
  if (!leg || legIndex <= 0 || leg.genuine) return undefined;
  const prior = variant.legs.slice(0, legIndex);
  if (!prior.some((p) => p.genuine)) return undefined;
  if (leg.speakerId === undefined || !prior.some((p) => !p.genuine && p.speakerId === leg.speakerId)) return undefined;
  const result =
    outcome === "approved"
      ? "금융회사의 대출 실행 확인 전화가 끝났고, 대출이 실행돼 대출금이 상대 계좌에 입금됐다(앱 확인)."
      : "금융회사의 대출 실행 확인 전화가 끝났고, 대출 실행이 보류됐다 — 대출금은 들어오지 않았다(앱 확인).";
  return [
    "[이 통화 전 상황 — 다시 건 통화]",
    "- 너는 앞서 이 사람과 통화한 바로 그 사람이다. 앞 통화에서 안전계좌 이체와 비대면 대출 신청을 시켰고, 금융회사 확인 전화가 끝나면 다시 연락하겠다고 했다. 이번 통화는 네가 같은 번호로 다시 건 것이라 본인 확인 · 사건 설명을 처음부터 다시 하지 않는다.",
    `- ${result}`,
  ].join("\n");
}

/**
 * 2026-11-07(Edge 시험 판 26 — 다시 걸려 온 배송원이 이미 보낸 반송 문자를 "보내 드릴 테니"라고 다시 말했다) — 이 레그에 선언된 문자 중 이미 도착한 것의 설명
 * (카탈로그 본문 첫 줄 · 발신 번호 — 서버 고정 문면 · 추가 LLM 호출 0). 순서 = 레그 선언 순서. 다른 레그 문자 · 도착 안 한 문자 · 카탈로그 밖 = 제외.
 */
export function legSentSmsDescriptions(
  variant: Pick<FlowVariant, "scenarioId" | "sms">,
  legIndex: number,
  deliveredSmsIds: readonly string[],
): string[] {
  const delivered = new Set(deliveredSmsIds);
  const catalog = IN_CALL_SMS[variant.scenarioId] ?? [];
  const out: string[] = [];
  for (const declared of variant.sms) {
    if ((declared.leg ?? 0) !== legIndex || !delivered.has(declared.smsId)) continue;
    const item = catalog.find((sms) => sms.smsId === declared.smsId);
    if (!item) continue;
    const firstLine = item.body.split("\n")[0]?.trim() ?? "";
    out.push(`'${clipLine(firstLine)}'(${item.senderLabel}에서 보냄)`);
  }
  return out;
}

const clipLine = (text: string): string =>
  text.length > LEG_REJOIN_LINE_MAX_CHARS ? `${text.slice(0, LEG_REJOIN_LINE_MAX_CHARS)}…` : text;

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

/** ⭐ PR-B — 현재 레그가 화면 보류 레그인가(마지막이 아닌 레그라도 이 레그 화면을 마치기 전 goal 끊기를 막는다 — `goalAction.ts` `isLegScreenHoldPending`). */
export function currentLegHoldsScreens(variant: Pick<FlowVariant, "legs" | "multiCall">, relay: RelayState | undefined): boolean {
  return variant.multiCall === true && variant.legs[currentLegIndex(variant, relay)]?.holdUntilScreens === true;
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

// 2026-11-07 실기기 신고(카드사 고급 R1 · 사용자 "a와 이야기 한 내용을 b나 c가 알면 안되지" · "새로 통화가 시작되면 나를 확인하는 과정이 있어야 하는데
// 그게 없어") — 앞 통화 대화 인계 블록(`buildPriorLegContext` — 참가자 발화 전부 + 마지막 8줄, #498)을 **없앴다**. 다음 통화 화자는 앞 통화에서 참가자가
// 한 말을 모르고, 같은 일당이 넘겨받았을 사건 골격(레그 `caseBrief` — 서버 고정 문면)만 안다. 그 골격은 레그 프롬프트(`flowVariants.ts`
// `resolveMultiCallLegPrompt`)에 실린다 — Live · 폴백 · 프로브가 같은 입력을 본다(앞 통화 메시지 읽기 0).

/**
 * 폴백(텍스트 턴) 이력을 레그 경계로 나눈다. 레그 시작 = 앞 레그의 마지막 사용자 발화(`legStartUserTurns`번째)와 그 발화에 대한 사기범 답 1개 뒤.
 * 새 레그의 모델 이력은 `current`만 — 앞 통화(`prior`)는 모델에 싣지 않는다(Live 새 연결과 같은 입력 · 사건 골격은 레그 프롬프트).
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
