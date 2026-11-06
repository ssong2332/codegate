// 결함 ②(2026-11-06 메인 내장 브라우저 시험 — 마이크 권한 거부 뒤 통화 화면이 "말씀하세요"만 띄우고 40초 넘게 아무 일도 없었다).
// 거부되면 화면은 폴백(글자) 경로로 내려가지만, 그 안내 줄과 입력칸은 기본 닫힘인 키패드 패널 안에만 있어 보이지 않았다.
// 순수 판정 · 문구만(브라우저 API · React 0). 배선 = `src/app/session/play/page.tsx`.
//
// | # | If | Then |
// |---|---|---|
// | 1 | 폴백 ∧ 실시간 상태 `permission-denied` ∧ 통화 중(live · opening) ∧ 입력 패널 닫힘 ∧ 안내를 닫지 않음 | 통화 화면 본문에 안내 카드(다시 시도 · 글자로 대화하기) |
// | 2 | 폴백 ∧ `permission-denied` | 파형 표시 = "마이크 꺼짐"("말씀하세요"라고 하지 않는다 — 말해도 전달되지 않는다) |
// | 3 | 그 밖 | 종전 |
// ⛔ 세션 중 화면이라 '모의' · '훈련용' 표식 낱말 0(G437).

export const MIC_DENIED_COPY = {
  title: "마이크가 꺼져 있어요",
  body: "지금은 말해도 상대에게 들리지 않아요. 주소창 옆 자물쇠에서 마이크를 허용한 뒤 다시 시도하거나, 글자로 대화를 이어 가세요.",
  retry: "다시 시도",
  text: "글자로 대화하기",
  waveLabel: "마이크 꺼짐",
} as const;

export type MicDeniedInput = {
  callMode: "undecided" | "realtime" | "fallback";
  realtimeStatus: string;
  phase: string;
  textInputOpen: boolean;
  dismissed: boolean;
};

/** 1행 — 통화 화면 본문의 안내 카드. */
export function showsMicDeniedNotice(input: MicDeniedInput): boolean {
  return (
    isMicDenied(input) &&
    (input.phase === "live" || input.phase === "opening") &&
    !input.textInputOpen &&
    !input.dismissed
  );
}

/** 2행 — 마이크 거부로 폴백에 내려온 통화인가. */
export function isMicDenied(input: Pick<MicDeniedInput, "callMode" | "realtimeStatus">): boolean {
  return input.callMode === "fallback" && input.realtimeStatus === "permission-denied";
}
