// §142(카드사 고급 재구성 PR-2) — 다통화 변형의 통화 사이 화면 흐름(클라 순수 로직 · 브라우저 API · React 0).
//
// 서버가 한 통화의 끝을 알려 주면(`legEnd {exit}`) 화면은 아래 표대로만 움직인다(Architecture.md §142.4 · §142.8).
// | 끝난 방식 | 화면 | 다음 통화를 여는 호출 |
// |---|---|---|
// | `transfer` | **통화 화면 그대로**(`holding` — 통화 시간 계속 · 번호 그대로) + 통화 대기음 `LEG_TRANSFER_HOLD_TONE` · `LEG_TRANSFER_CONNECT_MS` | `startCallLeg({action:"transfer"})` |
// | `dial` | 전화 앱 다이얼(키패드 · 최근 기록 — 2026-11-07 연락처 미리 저장 0) — 참가자가 번호를 눌러 건다 | `startCallLeg({action:"dial", dialed})` |
// | 참가자가 통화를 먼저 끊음(2026-11-07) | 전화 앱 최근 기록 — 훈련 계속(`hangupMeaning` · `afterHangupResponse`) | `startCallLeg({action:"hangup"})` → 뒤는 위 두 줄과 같다 |
// | `dial` · `LEG_CALLBACK_DELAY_MS` 동안 걸지 않음 | 상대가 다시 걸어 온다(D4 — 수신 화면) → 받기 | `startCallLeg({action:"callback"})` |
//
// 서버 응답별 화면:
// | 응답 | 화면 |
// |---|---|
// | `connected` | 새 통화(발신자 라벨 = 응답 `callerLabel`) |
// | `genuine` | 진짜 기관 자동 안내(D3) → 확인 = 훈련 종료(방어 성공) |
// | `unknown_number` | 다이얼에 "없는 번호" 안내 · 다시 걸 수 있다 |
// | `not_ready` | 다통화 흐름 밖 — 종전 사기범 끊기 종료로 간다 |
//
// ⛔ 실제 전화 발신 0 — 키패드는 앱 안 화면이다(번호는 서버 번호부로만 판정한다).

/** 호 전환 대기 길이(판단값 — 보이스톡 연결음 `VOICE_TALK_CONNECT_MS`와 같은 3.5초). */
export const LEG_TRANSFER_CONNECT_MS = 3500;
/**
 * 2026-11-07 실기기 신고("앞 통화가 끝나면 연결되는 과정이 실제와 다른 UX" · "검은 화면은 몰입감을 깬다") — 통화 중 넘김은
 * 화면을 바꾸지 않고 이 대기음만 들린다. 음원 파일 0 — `startRingback`(OscillatorNode)이 합성한다(저작물 음원 0).
 * 값은 판단값: 발신 연결음(`RINGBACK_TONE` 440+480Hz · 1초/2초)과 귀로 구별되게 단음 · 짧은 울림 · 작은 소리.
 */
export const LEG_TRANSFER_HOLD_TONE = { freqsHz: [425], onMs: 250, offMs: 1250, peak: 0.08 } as const;
/** 대기음 상한(판단값) — 새 통화가 연결(실시간 `active`)되면 그때 멈추고, 연결이 늦어도 이 시간 뒤에는 멈춘다. */
export const LEG_TRANSFER_HOLD_TONE_CAP_MS = 20_000;
/** D4 — 참가자가 다시 걸지 않으면 상대가 다시 걸어 오기까지(판단값 30초 — 실측 전). */
export const LEG_CALLBACK_DELAY_MS = 30_000;
/** 참가자 발신 연결음(판단값 — 실제 전화처럼 두세 번 울리고 받는다). */
export const LEG_DIAL_CONNECT_MS = 4500;
/**
 * D2(§142 확인 실측 2026-11-02 — 참가자가 건 통화 4개 중 2개에서 상대가 "…연락드렸습니다"처럼 건 쪽으로 말했다) — 참가자가 건 통화의 첫 신호.
 * 기본 트리거(`GeminiVoiceSession` OPENING_TRIGGER_TURN)는 "전화를 받은 상대에게 … 전화를 건 이유를 밝혀라"라 받는 쪽 레그와 맞지 않는다.
 */
export const LEG_DIALED_OPENING_TURN =
  "(상대가 너에게 건 전화를 너는 방금 받았다 — 네가 전화한 것이 아니다. '연락드렸습니다'처럼 건 쪽의 말을 하지 말고, 전화를 받는 쪽의 짧은 인사 한마디(5초 안팎)만 한 뒤 멈춰서 상대가 왜 전화했는지 말하기를 기다려라. 용건 설명은 상대의 말을 들은 뒤에 한다.)";

/**
 * 통화 첫 연결 신호(레그 판정 — 서버 `callLeg.entry`가 원천). `undefined` = 레그 판정 밖(종전 `openingTurnFor`).
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 레그 전환으로 연 연결 ∧ 참가자가 건 통화(`dial`) | `LEG_DIALED_OPENING_TURN` |
 * | 2 | 레그 전환으로 연 연결(그 밖 — 호 전환 · 재발신) | `null`(기본 트리거 — 종전) |
 * | 3 | 세션 첫 연결(`connectionSeq` 0) ∧ 참가자가 건 통화(R2 첫 통화 — 받기 경로) | `LEG_DIALED_OPENING_TURN` |
 * | 4 | 그 밖 | `undefined` |
 */
export function legOpeningTurnFor(input: {
  legOpening: boolean;
  connectionSeq: number;
  entry: "dial" | "transfer" | "incoming" | undefined;
}): string | null | undefined {
  if (input.legOpening) return input.entry === "dial" ? LEG_DIALED_OPENING_TURN : null;
  if (input.connectionSeq === 0 && input.entry === "dial") return LEG_DIALED_OPENING_TURN;
  return undefined;
}
/** 키패드에 입력할 수 있는 최대 자리 수(서버 `MAX_DIALED_LENGTH` 20자 안 — 하이픈 포함 표시). */
export const DIAL_MAX_DIGITS = 13;

export type LegScreen =
  | { kind: "none" }
  /** 통화 중 넘김 대기 — 통화 사이 화면 0(통화 화면이 그대로 보인다 · `CallLegScreens`는 아무것도 그리지 않는다). */
  | { kind: "holding" }
  | { kind: "connecting"; via: "transfer" | "dial"; label: string }
  /**
   * 전화 앱(2026-11-07 — 실제 휴대폰 전화 앱과 같게). `view` = 지금 보이는 판(부재 = 키패드). `home` · `search` = 휴대폰 홈 화면 · 인터넷 검색
   * (공식 번호를 직접 찾는 길 — `phoneApp.ts`). 번호를 채우는 동작(문자 속 번호 누름 · 검색 결과 누름)은 키패드로 돌아온다.
   */
  | { kind: "dialer"; digits: string; notice?: "unknown_number"; view?: PhoneView }
  | { kind: "incoming"; label: string }
  | { kind: "genuine"; number: string; contactLabel?: string; notice: readonly string[] };

/** 전화 앱의 판(키패드 · 최근 기록 · 홈 화면 · 인터넷 검색). */
export type PhoneView = "keypad" | "recents" | "home" | "search" | "wallet";

/** 참가자가 통화를 먼저 끊은 뒤의 화면 — 실제 휴대폰처럼 전화 앱 최근 기록으로 돌아간다. */
export function screenAfterParticipantHangup(): LegScreen {
  return { kind: "dialer", digits: "", view: "recents" };
}

/**
 * 통화 화면 빨간 종료 버튼의 뜻(2026-11-07 실기기 — "내가 통화를 종료하면 훈련이 종료가 돼서 상대방이 끊을 때까지 기다려야 한다").
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 이미 끝나는 중(종료 래치) | `end_training`(종전 — 대기 건너뛰기) |
 * | 2 | 메신저에서 넘어온 통화 | `messenger`(종전 §110.4 — 대화방 복귀) |
 * | 3 | 다통화 세션 ∧ 통화 중(통화 사이 화면 없음) 또는 넘김 대기 | `end_leg` — 그 통화만 끊고 전화 앱으로(훈련 계속) |
 * | 4 | 그 밖 | `end_training`(종전) |
 */
export function hangupMeaning(input: {
  endLatched: boolean;
  messengerReturn: boolean;
  multiCall: boolean;
  legScreen: LegScreen["kind"];
}): "end_leg" | "messenger" | "end_training" {
  if (input.endLatched) return "end_training";
  if (input.messengerReturn) return "messenger";
  if (input.multiCall && (input.legScreen === "none" || input.legScreen === "holding")) return "end_leg";
  return "end_training";
}

/**
 * 참가자가 끊은 뒤 서버 `startCallLeg({action:"hangup"})` 응답의 처리.
 * | # | If | Then |
 * |---|---|---|
 * | 1 | `ended` | 전화 앱 최근 기록(훈련 계속) · 상대가 다시 걸어 올 예약 |
 * | 2 | 그 밖(서버가 이 행동을 모른다 — 배포 전 · 실패 · 다른 응답) | 종전대로 훈련 종료(종료는 항상 성공 — AC-006) |
 */
export function afterHangupResponse(response: { status: string } | null): "phone_app" | "end_training" {
  return response?.status === "ended" ? "phone_app" : "end_training";
}

/** 통화가 끝난 직후의 화면(넘김 = 통화 화면 유지 · 직접 걸기 = 다이얼). */
export function screenAfterLegEnd(exit: "dial" | "transfer"): LegScreen {
  return exit === "transfer" ? { kind: "holding" } : { kind: "dialer", digits: "" };
}

/**
 * 새 통화가 연결된 뒤 화면의 발신자 라벨.
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 통화 중 넘김(`transfer`) ∧ 넘김 직전에 보이던 라벨이 있다 | 그 라벨 그대로 |
 * | 2 | 그 밖(직접 걸기 · 다시 걸려 온 전화 · 넘김인데 보이던 라벨 없음) | 서버가 준 새 통화 라벨 |
 * 근거(추정 — 실기 대조 전): 실제 전화에서 상대가 내부에서 돌려 연결해도 내 통화 화면의 번호는 처음 연결된 번호 그대로다.
 */
export function labelAfterLegConnect(input: { via: "dial" | "transfer" | "callback"; shownLabel: string | null; nextLabel: string }): string {
  return input.via === "transfer" && input.shownLabel ? input.shownLabel : input.nextLabel;
}

/**
 * 통화 화면 "다시 연결하고 있어요" 안내(§99)를 보이는가. 통화 사이(`suspendForLeg`)와 새 통화 연결(`startLeg`)도 실시간 상태를
 * `reconnecting`으로 쓰지만 끊긴 통화를 다시 잇는 것이 아니다(2026-11-07 실기기 — 넘김 연결 중 배너가 떴다).
 * | # | If | Then |
 * |---|---|---|
 * | 1 | `reconnecting` 아님 | 숨김 |
 * | 2 | 넘김 대기(`holding`) · 다른 통화 사이 화면이 떠 있다 | 숨김 |
 * | 3 | 새 통화(레그) 연결 중(`legOpening`) | 숨김 |
 * | 4 | 그 밖(화면 꺼짐 뒤 다시 잇기 — `startReconnect`가 `legOpening`을 내린다) | 보임 |
 */
export function showsReconnectingNotice(input: { reconnecting: boolean; legScreen: LegScreen["kind"]; legOpening: boolean }): boolean {
  if (!input.reconnecting) return false;
  if (input.legScreen !== "none") return false;
  return !input.legOpening;
}

/** 키패드 입력(숫자 · `*` · `#`만 · 자리 수 상한). */
export function pressDialKey(digits: string, key: string): string {
  if (!/^[0-9*#]$/.test(key)) return digits;
  return digits.length >= DIAL_MAX_DIGITS ? digits : digits + key;
}

export function backspaceDial(digits: string): string {
  return digits.slice(0, -1);
}

/** 숫자만 남긴다(문자 · 연락처의 하이픈 번호를 키패드 값으로). */
export function digitsOf(number: string): string {
  return number.replace(/[^0-9*#]/g, "");
}

/** 한국 전화번호 표기(02 지역번호 · 010 등) — 화면 표시 전용(판정은 서버가 숫자만 비교한다). */
export function formatDialDigits(digits: string): string {
  if (!/^[0-9]+$/.test(digits)) return digits;
  // 2026-11-07 판 27 — 전국 대표번호(15xx · 16xx · 18xx, 8자리)는 4-4로 끊는다("158-8-7742" 표시 결함). 입력 중(4자리 = 그대로 · 5~8자리 = 4-나머지)도 같은 꼴.
  if (/^1[568]/.test(digits) && digits.length >= 4 && digits.length <= 8) return digits.length === 4 ? digits : `${digits.slice(0, 4)}-${digits.slice(4)}`;
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `02-${digits.slice(2)}`;
    if (digits.length <= 9) return `02-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
}

// 2026-11-07 실기기 신고 — 기관 번호를 연락처에 미리 저장해 두던 `LEG_DIAL_CONTACTS` · `dialContactsFor`는 없앴다
// ("내 연락처에 왜 … 대표번호가 저장되어 있는 건데"). 공식 번호는 홈 화면의 인터넷 검색으로 직접 찾는다(`phoneApp.ts` `OFFICIAL_LISTINGS`).

/**
 * 통화 화면에 보일 번호(2026-11-07 — 연락처가 없으니 **번호**가 보인다, 실제 휴대폰과 같게).
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 참가자가 키패드로 건 통화(번호 있음) | 건 번호(하이픈 표기) |
 * | 2 | 라벨이 이미 번호 모양 | 그대로 |
 * | 3 | 라벨이 공식 번호 검색 결과 제목과 같다(`officialNumber` — 서버 레그 라벨 "금융감독기관 대표번호" 등) | 그 공식 번호 |
 * | 4 | 그 밖 | 라벨 그대로 |
 */
export function callDisplayNumber(input: { label: string; dialed?: string; officialNumber?: string | null }): string {
  if (input.dialed && digitsOf(input.dialed).length > 0) return formatDialDigits(digitsOf(input.dialed));
  if (/^[0-9][0-9-\s]{2,}$/.test(input.label.trim())) return input.label.trim();
  return input.officialNumber ?? input.label;
}

/** 화면에 보일 발신자 라벨 — 다통화 통화 라벨(서버 값)이 있으면 그것이 이긴다. 부재 = 종전 라벨. */
export function legCallerLabelOr(legCallerLabel: string | null | undefined, fallback: string): string {
  return legCallerLabel && legCallerLabel.length > 0 ? legCallerLabel : fallback;
}

/** 진짜 기관 자동 안내 화면의 버튼(D3 — 방어 성공으로 훈련을 끝낸다). */
export const LEG_GENUINE_COPY = {
  endButton: "통화 종료",
  /**
   * 실기기 신고 F4(2026-11-02 — 공식 번호로 걸어 끝났는데 "그냥 끝났다"로 느꼈다) — 이 끝이 방어 성공임을 화면이 말한다.
   * ⛔ 세션 중 화면이라 '모의' · '훈련용' 표식 낱말 0(G437).
   */
  defenseTitle: "올바른 대응이에요",
  defenseBody: "문자나 전화로 안내받은 번호가 아니라, 직접 찾은 공식 번호로 확인하셨어요. 통화를 끝내면 결과를 볼 수 있어요.",
  unknownNumber: "없는 번호입니다. 번호를 확인하고 다시 걸어 주세요.",
  callbackHint: "통화가 끊겼습니다.",
} as const;
