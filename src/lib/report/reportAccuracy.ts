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
export function splitSmsEvents<E extends SmsEventLike, S extends { timeLabel?: string; events: readonly E[] }>(
  sms: S,
): { sms: S; event: E; timeLabel?: string }[] {
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
