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

/**
 * T190-8a(docs/Architecture.md §74.22 (2) · UX-022 v1.33 (7) 정본 · PRD OQ-52 (ㄴ) · AC-091 (g)) — **에스컬레이션 가능
 * 시나리오**(`scenario.escalation` 보유)의 시작 전 고지 **변형 1벌**. 바뀌는 줄은 제목 · 고지 ① · 고지 ①-2(신설) 셋뿐이고
 * `kakaoDisclaimer` · `stopHint` · `confirmLabel`은 위 `MESSENGER_START_NOTICE` 값을 그대로 쓴다(같은 문장 사본 0).
 * ⛔ 비에스컬레이션 시나리오에는 쓰지 않는다 — 오지 않을 전화를 예고하면 거짓 약속이다(AC-087 (e) 취지).
 * ⭐ 고지 ①-2가 벨 화면 프리롤(`PREROLL_NOTICE`)이 맡던 합성 음성 고지를 세션 시작으로 옮긴다 — 에스컬레이션 벨
 * 화면에는 문구가 0이다(T190-8b).
 */
export const MESSENGER_START_NOTICE_WITH_CALL = {
  title: "훈련을 시작합니다",
  notice:
    "지금부터 받는 메시지와 전화는 실제 연락이 아니라 AI 훈련 프로그램이 보내는 훈련용 연락입니다.",
  callVoiceNotice: "전화로 이어지면 그 목소리도 AI로 합성된 훈련용 음성입니다.",
} as const;

/**
 * T190-6(UX-014 v1.33 (11) ② 정본 · D-100 · AC-092 (d)(e)) — **세션 전** 화면 모양 줄 문면. 선택지 라벨
 * ("iOS형" · "One UI형")은 `src/lib/phone/deviceSkin.ts`의 `DEVICE_SKIN_CHOICE_LABELS`가 정본이다.
 * ⛔ 세션 중 화면에 이 줄·스킨 이름·감지 실패 안내 0(AC-092 (d)).
 */
export const DEVICE_SKIN_PICKER_COPY = {
  /** 접힘 — "화면 모양: {라벨}" 앞부분. */
  collapsedPrefix: "화면 모양: ",
  changeLabel: "바꾸기",
  /** 펼침(감지 실패 또는 "바꾸기") 안내. */
  expandedPrompt: "사용하시는 휴대폰과 같은 화면 모양을 골라 주세요.",
} as const;

/**
 * T190-8b(docs/Architecture.md §74.22 (1) ⓓ · UX-014 v1.33 (11) ① 정본 · D-102 · PRD AC-091 (d)(e)) — 통화 벨 직전 고지
 * (`pre-call-notice` — 경로 ① 자가 통화 · ③ 수신자 통화). 고지 ① = 위 `PREROLL_NOTICE` 바이트 그대로(재사용 — 여기 사본 0).
 * 고지 ② = `MESSENGER_START_NOTICE.stopHint`와 같은 문장(UX 정본이 같은 문장을 지정했다).
 */
export const PRE_CALL_NOTICE = {
  title: "곧 훈련 전화가 걸려 옵니다",
  stopHint: "언제든 '훈련 종료'로 멈출 수 있습니다.",
  confirmLabel: "준비됐어요",
} as const;
