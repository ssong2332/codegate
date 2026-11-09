// Edge 재시험 19 ②(2026-11-09 · 기관 사칭 고급 `fv-c5fj` 3통화) — 리플레이가 통화 2(가상 캐피탈 대출 실행 확인 상담원 · 02-0719-3300 · 사기범 아님)의
// 대사를 "02-6478-2718 (사칭)"으로 보였다. 화면이 세션 전체에 시나리오 번호 하나와 '(사칭)'을 고정으로 붙였기 때문이다.
// 리포트 문서의 통화별 발신 표시 스냅샷(`callLegs` — 서버 `functions/src/report/replayCallLegs.ts`)과 메시지 `legIndex`로 말풍선마다 고른다.
//
// 판정표 R — 상대 말풍선의 발신 표시
// | # | If | Then |
// |---|---|---|
// | R1 | 리포트에 `callLegs` 없음(다통화 아님 · 옛 리포트 · 형식 밖) | 시나리오 번호 + '(사칭)'(종전) |
// | R2 | `callLegs`가 있고 메시지 `legIndex`(부재 = 0 — 서버 관례)의 통화가 있다 · 그 통화가 사기범 | 그 통화 번호 + '(사칭)' |
// | R3 | 같은데 그 통화가 정당한 제3자(`genuine`) | 그 통화 번호 · '(사칭)' 없음 |
// | R4 | `legIndex`가 범위 밖 · 정수 아님 | 시나리오 번호 + '(사칭)'(종전) |

export type ReplayCallLeg = { callerLabel: string; genuine?: true };

/** 리포트 문서의 `callLegs`를 읽는다. 형식이 하나라도 어긋나면 null(R1 — 종전 표시). */
export function readReplayCallLegs(raw: unknown): ReplayCallLeg[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ReplayCallLeg[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { callerLabel, genuine } = item as { callerLabel?: unknown; genuine?: unknown };
    if (typeof callerLabel !== "string" || callerLabel.trim().length === 0) return null;
    out.push(genuine === true ? { callerLabel, genuine: true } : { callerLabel });
  }
  return out;
}

export function replayCallerFor(
  legIndex: number | undefined,
  callLegs: readonly ReplayCallLeg[] | null,
  fallbackLabel: string,
): { label: string; impersonation: boolean } {
  if (!callLegs) return { label: fallbackLabel, impersonation: true };
  const index = legIndex ?? 0;
  const leg = Number.isInteger(index) ? callLegs[index] : undefined;
  if (!leg) return { label: fallbackLabel, impersonation: true };
  return { label: leg.callerLabel, impersonation: leg.genuine !== true };
}
