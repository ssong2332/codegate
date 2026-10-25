// §134 — 통화 중 새로고침 복원(§99 · `initialPhase === "live"` → 글 대화 `callMode:"fallback"`)의 "이어서 통화하기" 판정.
//
// 실기 신고(2026-10-25 · Chrome 155 Android): 통화 중 주소창으로 다시 열면 화면은 "듣고 있어요"인데 아무것도 뜨지 않고
// 알림음만 주기적으로 났다. 원인(코드): 복원된 글 대화 경로의 연속 자동 청취(`page.tsx` #7 effect)가 브라우저 음성 인식을
// 400ms 간격으로 다시 연다 — Android는 인식을 열고 닫을 때마다 시스템 알림음을 낸다(추정 — 확인: 아래 버튼을 누르기 전
// 알림음이 멎는지). 새 문서라 사용자 활성화가 없어 상대 음성 자동재생도 막힌다(`act.hasBeenActive=false`).
//
// | # | If | Then |
// |---|---|---|
// | R1 | 새로고침 복원 아님(받기를 이 화면에서 눌렀다) | 버튼 없음(종전) |
// | R2 | 복원 · 사용자 활성화 있음(`hasBeenActive`) | 버튼 없음(종전 — 같은 문서에서 이미 탭했다) |
// | R3 | 복원 · 활성화 없음 또는 판별 API 없음 | "이어서 통화하기" 버튼 · 누르기 전에는 자동 청취를 열지 않는다 |
//
// ⭐ §136(실기 신고 2026-10-25 · 갤럭시 Chrome 155 — 새로고침 뒤 이어서 통화해도 사기범 소리가 안 들림).
// 확인된 원인(코드): 복원은 글 대화(`callMode:"fallback"`)로 갔고, 그 경로의 상대 음성은 서버 `sendMessage`가
// `getVoiceProvider()`로 합성하는데 그 함수는 **늘 `MockVoiceProvider`(무음 WAV)** 를 돌려준다(`functions/src/voice/provider.ts`).
// 그래서 `fb.play=ok`(재생 성공)인데 소리가 없었다. ⇒ 복원 뒤에는 글 대화가 아니라 **실시간 통화를 다시 연다**(§99 재연결과 같은
// 맥락 첫 턴 · 서버 `createRealtimeCall`은 진행 중 세션에 새 토큰을 발급한다 — functions 변경 0).
//
// | # | If | Then |
// |---|---|---|
// | S1 | R2(활성화 있음) | 화면이 열리자마자 실시간 다시 연결(버튼 없음) |
// | S2 | R3 | 버튼 탭 = 사용자 활성화 → 그 탭 안에서 통화 오디오 준비 · 실시간 다시 연결 |
// | S3 | 다시 연결 실패 | 종전 글 대화로 이어간다(오프닝 음성은 다시 틀지 않는다 — 이미 지난 통화다) |
// | W1 | R3 버튼이 떠 있음(마이크 · 소리 멈춤) | 파형 · "말씀하세요" 표시 0 |

export type UserActivationLike = { hasBeenActive: boolean } | null | undefined;

/** 위 표 R1 ~ R3. */
export function needsResumeTap(input: { restored: boolean; userActivation: UserActivationLike }): boolean {
  if (!input.restored) return false;
  return !input.userActivation?.hasBeenActive;
}

/** 위 표 W1 — 파형(발화 상태 표시)을 그려도 되는가. */
export function showsCallWaveform(input: { phaseShowsWave: boolean; callMode: string; resumeTapNeeded: boolean }): boolean {
  return input.phaseShowsWave && input.callMode !== "realtime" && !input.resumeTapNeeded;
}

export const RESUME_TAP_COPY = {
  title: "통화가 잠시 끊겼어요",
  body: "화면이 새로 열려 소리와 마이크가 멈췄습니다. 아래 버튼을 누르면 이어서 통화합니다.",
  action: "이어서 통화하기",
} as const;
