// UX-025 목소리 선택 화면의 경로 노출 규칙 — UX D-130 · PRD AC-046 갱신 고지(v1.29) · Architecture §87 · DECISIONS #198.
//
// ①"지금 30초 녹음" · ②"저장된 내 목소리 사용"은 **send(다른 사람에게 보내기) 모드에서만** 그린다.
// self(본인이 체험) 모드에서는 통화 상대(사기범)가 참가자 본인 목소리로 말하게 되어 훈련 의미가 없다
// (사용자 신고 2026-10-20 — 보이스 쪽 AC-057 self clone 배제와 같은 이유). 모드 힌트 부재(직접 URL ·
// 새 탭)도 self로 본다 — `createSession`은 자가 세션만 만들고 서버도 두 경로를 거부한다(2중 방어).
//
// ⚠️ 오늘 send 모드는 이 화면에 오지 않는다(UX-024가 send에서 에스컬레이션 시나리오를 숨기고 UX-029는 send를
// UX-019로 보낸다 — #21/OQ-28 보류). 따라서 실제로는 언제나 ③ 기본 남/여 목소리만 보인다.
import type { ExperienceMode } from "./pendingSession";

export function shouldShowCloneVoiceOptions(mode: ExperienceMode | null): boolean {
  return mode === "send";
}
