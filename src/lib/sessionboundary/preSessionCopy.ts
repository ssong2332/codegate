// T187 — **세션 전** 고지 문면 정본 (docs/Architecture.md §72.5 D1 · PRD v1.18 AC-087/AC-088 ·
// UX-014 `incoming` · UX-022 v1.29 노트 (2) `start-notice`).
//
// ⭐ 왜 별도 모듈인가: 세션 중 화면을 그리는 파일에 표식 낱말 리터럴이 하나도 남지 않게 해서
// 낱말 검사(G437)를 **파일 단위로** 정확하게 만들기 위해서다. 여기서 빼 낸 식별자가 세션 중
// **상태**로 새는 것은 AST 사용처 가드(G438)가 막는다.
// ⛔ 문면은 UX 정본을 글자 그대로 옮긴다 — 의역 금지(G444 ⑤가 글자 단위로 대조한다).
// ⭐ 법무 결론(PRD OQ-49)으로 문면이 바뀌면 이 파일과 postSessionCopy.ts 두 곳만 고친다.

/** 통화 벨 화면(UX-014 `incoming`)의 세션 전 고지. play/page.tsx에서 **바이트 그대로** 옮겼다. */
export const PREROLL_NOTICE =
  "지금부터 재생되는 음성은 실제 전화가 아니라 AI로 합성된 훈련용 음성입니다.";

/** 메신저 시작 전 고지(UX-022 `start-notice`) — `kakaoDisclaimer`는 카카오 표면에서만 보인다. */
export const MESSENGER_START_NOTICE = {
  title: "메시지 훈련을 시작합니다",
  notice:
    "지금부터 받는 메시지는 실제 연락이 아니라 AI 훈련 프로그램이 보내는 훈련용 메시지입니다.",
  kakaoDisclaimer: "카카오톡 실제 서비스와 무관한 훈련용 재현입니다.",
  stopHint: "언제든 '훈련 종료'로 멈출 수 있습니다.",
  confirmLabel: "메시지 보기",
} as const;
