// Edge 재시험 19 ②(2026-11-09 · 기관 사칭 고급 `fv-c5fj` 3통화) — 리플레이가 통화 2(가상 캐피탈 대출 실행 확인 상담원 · 02-0719-3300 · 사기범 아님)의
// 대사를 "02-6478-2718 (사칭)"으로 보였다. 원인: 리플레이 화면(`src/app/report/replay/page.tsx`)이 세션 전체에 시나리오 번호 하나와 '(사칭)'을 고정으로 붙였다
// (메시지 `legIndex`는 서버가 저장하지만 화면이 읽지 않았고, 통화별 번호 · 정당한 통화 여부는 서버 변형에만 있다).
// 리포트 문서에 통화별 발신 표시 스냅샷을 싣는다(표시 전용 — 판정 입력 0 · 추가 read 0).
// | # | If | Then |
// |---|---|---|
// | C1 | 다통화 변형이 아니다(부재 포함) | undefined(필드 0 — 종전 리포트와 같은 바이트) |
// | C2 | 다통화 변형 | 레그 순서대로 `{ callerLabel }` · 정당한 제3자 레그만 `genuine: true` |
import type { FlowVariant } from "../scenarios/flowVariants";

export type ReplayCallLeg = { callerLabel: string; genuine?: true };

export function replayCallLegs(variant: Pick<FlowVariant, "legs" | "multiCall"> | undefined): ReplayCallLeg[] | undefined {
  if (!variant?.multiCall) return undefined;
  return variant.legs.map((leg) => ({ callerLabel: leg.callerLabel, ...(leg.genuine ? { genuine: true as const } : {}) }));
}
