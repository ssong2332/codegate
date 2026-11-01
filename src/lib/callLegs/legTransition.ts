// §142(카드사 고급 재구성 PR-2) — 다통화 변형의 통화 사이 화면 흐름(클라 순수 로직 · 브라우저 API · React 0).
//
// 서버가 한 통화의 끝을 알려 주면(`legEnd {exit}`) 화면은 아래 표대로만 움직인다(Architecture.md §142.4 · §142.8).
// | 끝난 방식 | 화면 | 다음 통화를 여는 호출 |
// |---|---|---|
// | `transfer` | "연결 중" + 연결음 `LEG_TRANSFER_CONNECT_MS` | `startCallLeg({action:"transfer"})` |
// | `dial` | 전화 앱 다이얼(키패드 · 연락처) — 참가자가 번호를 눌러 건다 | `startCallLeg({action:"dial", dialed})` |
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

/** 호 전환 연결음 길이(판단값 — 보이스톡 연결음 `VOICE_TALK_CONNECT_MS`와 같은 3.5초). */
export const LEG_TRANSFER_CONNECT_MS = 3500;
/** D4 — 참가자가 다시 걸지 않으면 상대가 다시 걸어 오기까지(판단값 30초 — 실측 전). */
export const LEG_CALLBACK_DELAY_MS = 30_000;
/** 참가자 발신 연결음(판단값 — 실제 전화처럼 두세 번 울리고 받는다). */
export const LEG_DIAL_CONNECT_MS = 4500;
/** 키패드에 입력할 수 있는 최대 자리 수(서버 `MAX_DIALED_LENGTH` 20자 안 — 하이픈 포함 표시). */
export const DIAL_MAX_DIGITS = 13;

export type LegScreen =
  | { kind: "none" }
  | { kind: "connecting"; via: "transfer" | "dial"; label: string }
  | { kind: "dialer"; digits: string; notice?: "unknown_number" }
  | { kind: "incoming"; label: string }
  | { kind: "genuine"; number: string; contactLabel?: string; notice: readonly string[] };

/** 통화가 끝난 직후의 화면. */
export function screenAfterLegEnd(exit: "dial" | "transfer"): LegScreen {
  return exit === "transfer" ? { kind: "connecting", via: "transfer", label: "연결 중" } : { kind: "dialer", digits: "" };
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

/**
 * 전화 앱 연락처(참가자 휴대폰에 저장돼 있을 법한 공식 번호 — 서버 번호부 `functions/src/scenarios/dialDirectory.ts`의 `contactLabel` 항목 미러).
 * 드리프트는 `legTransition.test.ts`가 서버 파일과 대조한다. 가상 기관명 · 가상 번호만(실제 번호 0).
 */
export const LEG_DIAL_CONTACTS: Readonly<Record<string, readonly { label: string; number: string }[]>> = {
  "card-company-impersonation": [
    { label: "윤슬카드 고객센터", number: "02-0715-8800" },
    { label: "금융감독기관 대표번호", number: "02-0700-3324" },
  ],
};

export function dialContactsFor(scenarioId: string): readonly { label: string; number: string }[] {
  return LEG_DIAL_CONTACTS[scenarioId] ?? [];
}

/** 화면에 보일 발신자 라벨 — 다통화 통화 라벨(서버 값)이 있으면 그것이 이긴다. 부재 = 종전 라벨. */
export function legCallerLabelOr(legCallerLabel: string | null | undefined, fallback: string): string {
  return legCallerLabel && legCallerLabel.length > 0 ? legCallerLabel : fallback;
}

/** 진짜 기관 자동 안내 화면의 버튼(D3 — 방어 성공으로 훈련을 끝낸다). */
export const LEG_GENUINE_COPY = {
  endButton: "통화 종료",
  unknownNumber: "없는 번호입니다. 번호를 확인하고 다시 걸어 주세요.",
  callbackHint: "통화가 끊겼습니다.",
} as const;
