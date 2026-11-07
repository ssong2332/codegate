// 2026-11-07 Edge 시험(판 1 · 5 · 9 · 19 · 26 · 27) — 리포트가 실제로 일어난 일만, 시간순으로 보여 주게 하는 화면 쪽 판정. 순수 함수.
//
// ⛔ 금지: 서버가 준 사실 밖의 내용을 지어내지 않는다(금액 값은 저장되지 않으므로 비교 결과만 말한다 — G138).
// ⚠️ 값 import 없는 잎 모듈(`timelineOrder.ts` 머리말과 같은 이유 — 앱 `tsc` · 루트 테스트 러너 둘 다 풀 수 있게).
//
// | # | If | Then |
// |---|---|---|
// | F1 | 속은 순간 중 표시 시각("N초 시점")을 읽을 수 있는 것이 있다 | **가장 이른 시각**의 순간이 "처음 속은 시각"(같은 초면 배열 앞쪽) |
// | F2 | 읽을 수 있는 시각이 하나도 없다 | 배열 첫 순간(종전) |
// | F3 | 순간 0건 | -1 |
// | S1 | 문자 항목 하나에 이벤트가 여럿(도착 · 열람 · 링크) | 이벤트마다 **따로** 타임라인 줄 — 각자 자기 시각으로 정렬된다(문자별 묶음 해제) |
// | M1 | 이체 화면(`bankTransfer`) | "훈련용 이체 화면이 표시됐습니다." |
// | M2 | 설치 화면(`app-install`) | "앱 설치 안내 화면이 표시됐습니다."(종전) |
// | M3 | 그 밖 입력 화면 | "본인확인 입력 화면이 표시됐습니다."(종전) |
// | M4 | 제출함(`submitted`) ∧ 이체 화면 | "이 화면에서 이체를 진행했습니다." + 금액 비교 한 문장(있을 때만) |
// | M5 | 제출함 ∧ 그 밖 화면 | "이 화면에서 입력 내용을 제출했습니다." |
// | M6 | 제출 사실 없음 ∧ 응하지 않고 닫음(분기 "다") ∧ 이체 화면 | "잘 대응한 지점입니다 — 이체하지 않고 화면을 닫았습니다."(판 32 — "권한 허용"은 설치 화면 말이다) |
// | M7 | 제출 사실 없음 ∧ 분기 "다" ∧ 그 밖 입력 화면 | "잘 대응한 지점입니다 — 입력 내용을 보내지 않았습니다." |
// | M8 | 그 밖 | 종전 분기 문구(`mockScreenTimelineCopy.ts`) |
// | O1 | `officialCheck` 있음 | "{이름}({번호})로 직접 걸어 확인했습니다" — 잘 대처한 행동 |
// | H1 | `participantHangup` 있음(사용자 결정 2026-11-07 "방어로 집계" — 먼저 끊었고 그 전에 속은 순간 없음) | "잘 대처함 · 먼저 전화를 끊음" |
// | Q1 | `screenHeld` 있음(사용자 결정 2026-11-07 "잘 대처함 칸 추가" — 거래 화면 확인 질문에 사실대로 답해 보류 · 서버 `report/screenHeld.ts`) | "잘 대처함 · 확인 질문에 사실대로 답함" |
// | Q2 | `screenHeld` 모양이 다름(시각 문자열이 "N초 시점"이 아님 · 객체 아님) | 칸 0 |

function parseSeconds(timeLabel: string | null | undefined): number | null {
  const m = typeof timeLabel === "string" ? timeLabel.trim().match(/^(\d+)초 시점$/) : null;
  return m ? Number(m[1]) : null;
}

/** F1 · F2 · F3 — "처음 속은 시각"으로 쓸 순간의 원래 배열 인덱스. */
export function pickFirstDeceivedIndex(moments: readonly { timeLabel?: string }[]): number {
  if (moments.length === 0) return -1;
  let best = -1;
  let bestSeconds = Number.POSITIVE_INFINITY;
  moments.forEach((moment, index) => {
    const seconds = parseSeconds(moment.timeLabel);
    if (seconds !== null && seconds < bestSeconds) {
      best = index;
      bestSeconds = seconds;
    }
  });
  return best === -1 ? 0 : best;
}

export type SmsEventLike = { event: string; timeLabel?: string };

/** S1 — 문자 항목을 이벤트 단위 줄로 편다(정렬 시각 = 그 이벤트의 시각 · 없으면 항목 시각). */
// 이벤트 타입은 `S`에서 꺼낸다 — 따로 둔 타입 인자 `E`는 제약(`SmsEventLike`)으로만 추론돼 호출부의 `what` 등이 사라졌다(next build 타입 검사 실패 · 통합 브랜치에서 수정).
export function splitSmsEvents<S extends { timeLabel?: string; events: readonly SmsEventLike[] }>(
  sms: S,
): { sms: S; event: S["events"][number]; timeLabel?: string }[] {
  return sms.events.map((event) => {
    const timeLabel = event.timeLabel ?? sms.timeLabel;
    return timeLabel === undefined ? { sms, event } : { sms, event, timeLabel };
  });
}

export type MockScreenFactEntry = {
  kind: "credential-form" | "app-install";
  bankTransfer?: boolean;
  submitted?: boolean;
  amountComparison?: "less" | "equal" | "more";
};

/** M1 · M2 · M3 — 어떤 화면이었는가. */
export function mockScreenWhat(entry: MockScreenFactEntry): string {
  if (entry.bankTransfer) return "훈련용 이체 화면이 표시됐습니다.";
  return entry.kind === "app-install" ? "앱 설치 안내 화면이 표시됐습니다." : "본인확인 입력 화면이 표시됐습니다.";
}

const AMOUNT_SENTENCE: Record<"less" | "equal" | "more", string> = {
  less: "요구받은 금액보다 적게 보냈습니다.",
  equal: "요구받은 금액을 그대로 보냈습니다.",
  more: "요구받은 금액보다 많이 보냈습니다.",
};

/** M4 · M5 — 제출 사실 문장. 제출 사실이 없으면 `null`(M6 — 종전 문구를 쓴다). */
export function mockScreenSubmittedText(entry: MockScreenFactEntry): string | null {
  if (!entry.submitted) return null;
  if (!entry.bankTransfer) return "이 화면에서 입력 내용을 제출했습니다.";
  const amount = entry.amountComparison ? AMOUNT_SENTENCE[entry.amountComparison] : undefined;
  return amount ? `이 화면에서 이체를 진행했습니다. ${amount}` : "이 화면에서 이체를 진행했습니다.";
}

/**
 * M8(2026-11-07 Edge 재시험 — 기관 사칭 고급 문자 링크 이체 화면 · 980만 원 요구에 300만 원 제출인데 "적게 보냄" 문장 0) — 통화 중 문자 경로의
 * 이체 제출 순간 카드에 붙는 금액 문장. 서버가 그 순간에만 `amountComparison`을 싣는다(메신저 경로는 화면 항목 M4가 낸다 — 중복 0).
 * 값이 3종이 아니면 `null`(문장 0 — 옛 리포트).
 */
export function momentAmountText(moment: { amountComparison?: unknown }): string | null {
  const value = moment.amountComparison;
  return value === "less" || value === "equal" || value === "more" ? AMOUNT_SENTENCE[value] : null;
}

/** M6 · M7 — 응하지 않고 닫은 입력 · 이체 화면의 칭찬 문구. 설치 화면이면 `null`(종전 "권한 허용" 문구가 맞다). */
export function mockScreenDeclinedText(entry: MockScreenFactEntry): string | null {
  if (entry.kind === "app-install") return null;
  return entry.bankTransfer
    ? "잘 대응한 지점입니다 — 이체하지 않고 화면을 닫았습니다."
    : "잘 대응한 지점입니다 — 입력 내용을 보내지 않았습니다.";
}

export type OfficialCheckView = { label: string; number: string };

/** O1 — 서버 값 읽기(모양이 다르면 `null` = 블록 0). */
export function readOfficialCheck(raw: unknown): OfficialCheckView | null {
  if (!raw || typeof raw !== "object") return null;
  const { label, number } = raw as { label?: unknown; number?: unknown };
  if (typeof label !== "string" || typeof number !== "string" || label.trim() === "" || number.trim() === "") return null;
  return { label, number };
}

export const OFFICIAL_CHECK_TITLE = "잘 대처함 · 공식 번호로 직접 확인";

/** O1 — 문장. */
export function officialCheckText(view: OfficialCheckView): string {
  return `${view.label}(${view.number})로 직접 걸어 사실을 확인했습니다. 상대가 알려 준 번호가 아니라 스스로 찾은 공식 번호로 확인한 것은 가장 확실한 대처입니다.`;
}

export type ParticipantHangupView = { legIndex: number; timeLabel?: string };

/** H1 — 서버 값 읽기(모양이 다르면 `null` = 블록 0). */
export function readParticipantHangup(raw: unknown): ParticipantHangupView | null {
  if (!raw || typeof raw !== "object") return null;
  const { legIndex, timeLabel } = raw as { legIndex?: unknown; timeLabel?: unknown };
  if (typeof legIndex !== "number" || !Number.isInteger(legIndex) || legIndex < 0) return null;
  return typeof timeLabel === "string" && parseSeconds(timeLabel) !== null ? { legIndex, timeLabel } : { legIndex };
}

export const PARTICIPANT_HANGUP_TITLE = "잘 대처함 · 먼저 전화를 끊음";

/** H1 — 문장(시각 표기는 화면의 `formatMomentLabel` 결과를 받는다 · 없으면 시각 없이). */
export function participantHangupText(momentLabel: string | null): string {
  const when = momentLabel ? `${momentLabel}에 ` : "";
  return `${when}상대의 요구에 응하기 전에 먼저 전화를 끊었습니다. 의심이 들면 바로 끊는 것이 가장 빠르고 확실한 대처입니다.`;
}

export type ScreenHeldView = { timeLabel: string };

/** Q1 · Q2 — 서버 값 읽기(모양이 다르면 `null` = 칸 0). */
export function readScreenHeld(raw: unknown): ScreenHeldView | null {
  if (!raw || typeof raw !== "object") return null;
  const { timeLabel } = raw as { timeLabel?: unknown };
  return typeof timeLabel === "string" && parseSeconds(timeLabel) !== null ? { timeLabel } : null;
}

export const SCREEN_HELD_TITLE = "잘 대처함 · 확인 질문에 사실대로 답함";

/** Q1 — 문장(시각 표기는 화면의 `formatMomentLabel` 결과를 받는다 · 없으면 시각 없이). 금 구매 확인 · 출금 문진표 공통. */
export function screenHeldText(momentLabel: string | null): string {
  const when = momentLabel ? `${momentLabel}에 ` : "";
  return `${when}거래 전 확인 질문에 수사기관 · 금융기관의 요구를 받았다고 사실대로 답해 거래가 보류됐습니다. 수사기관 · 금융기관은 전화로 금 구매나 현금 인출을 요구하지 않습니다.`;
}
