// 사용자 결정 2026-11-07 "잘 대처함 칸 추가 (권장)"(메인 전달) — 앱 안 거래 화면의 확인 질문(금 구매 고액 구매 확인 · 다음 PR 출금 문진표)에
// 사실대로 답해 거래가 **보류**된 사실을 리포트 "잘 대처함" 한 줄로 싣는다.
//   ⛔ 판정 입력이 아니다 — 속음 판정(`wasDeceived` · 속은 순간 · 방어 등급 입력)은 이 값과 무관하다. 보류는 속은 순간 0이다.
//   ⛔ 읽는 값은 통화 중 문자 문서의 **시각 두 개뿐**이다(`landingHeldAt` · `landingSubmittedAt`). 문진 답 · 목적 · 금액은 서버에 없다(G138).
//   ⛔ 세션 종료 사유 · 사기범 끊기 기록을 읽지 않는다(G511 — 이 파일은 세션 문서를 받지 않는다).
//   ⛔ 새 '막은 순간' 목록(resistedMoments)을 만들지 않는다 — 리포트 필드 하나(`screenHeld`)만.
// 순수 함수(Firestore 0 — 호출부 `generateReportCore.ts`가 이미 읽은 문자 문서 시각을 넘긴다).
//
// | # | If | Then |
// |---|---|---|
// | Q1 | 문자 문서에 보류 시각(`landingHeldAtMs`)이 있고 같은 문서에 결제 시각(`landingSubmittedAtMs`)이 없다 | 보류로 센다 |
// | Q2 | 보류한 뒤 같은 화면에서 다시 결제했다(`landingSubmittedAtMs` 있음 — 보류 화면의 "주문 화면으로 돌아가기") | 그 문서는 세지 않는다(결제가 속은 순간으로 승격된다) |
// | Q3 | Q1 문서가 1건 이상 | `{ timeLabel }` — 가장 이른 보류 시각("N초 시점" · 기준 = 리포트 시각 기준점 · 음수면 0) |
// | Q4 | Q1 문서 0건(보류 없음 · 옛 세션 · 금 화면 없음) | 없음 — 칸 0 |
// | Q5 | 다른 순간에 이미 속았다(예: 인증번호를 불러 줌) | Q1 ~ Q4 그대로 — 그 거래를 멈춘 사실은 사실대로 적는다(공식 번호 확인 칸과 같음 · 먼저 끊음 칸의 "그 전 속음 0" 조건은 끊기 하나에만 붙는다) |

export type HeldSource = { landingHeldAtMs?: number; landingSubmittedAtMs?: number };

export function resolveScreenHeld(sources: readonly HeldSource[], baseMs: number): { timeLabel: string } | undefined {
  const heldTimes = sources
    .filter((s) => typeof s.landingHeldAtMs === "number" && s.landingSubmittedAtMs === undefined) // Q1 · Q2
    .map((s) => s.landingHeldAtMs as number);
  if (heldTimes.length === 0) return undefined; // Q4
  const earliest = Math.min(...heldTimes);
  return { timeLabel: `${Math.max(0, Math.round((earliest - baseMs) / 1000))}초 시점` }; // Q3
}
