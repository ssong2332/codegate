// ⭐ Edge 재시험 2(2026-11-07 · 정부지원금 스미싱 고급 · 세션 로그 `[§129] 포기 신호를 목표로 기록`) — 사기범이 계좌번호를 물어 참가자가
// "새솔은행 110-123-456789 이에요"라고 답했는데, 저장 전 개인정보 가림(`guardrails` `maskPII`)으로 모델에는 "새솔은행 [계좌] 이에요"가 들어갔고
// 모델이 "확인이 어려우시면 이번 신청은 보류하겠습니다"라며 스스로 포기 신호를 보냈다(서버 강제 포기 아님 — 로그). 원인(추정 — 모델 입력 문면 기준):
// 가림 표지가 "상대가 실제로 말한 값"이라는 설명이 어디에도 없어 빈칸 · 답 회피로 읽혔다.
// 판정표 M(모델 입력에서만 — 저장값 · 리포트 · 화면 무변경):
// | # | If(참가자 글) | Then |
// |---|---|---|
// | M1 | 가림 표지 `[계좌]` · `[전화]` · `[주민번호]` · `[이메일]` | `[계좌번호: 상대가 실제로 말했고 기록에서만 가림]` 꼴로 바꾼다 |
// | M2 | 그 밖 | 그대로(바이트 동일) |
// 호출부: 참가자 입력 감싸기(`roleplay/promptAssembly.ts` `wrapUserInputAsData` — 텍스트 경로 전부) · 통화로 넘어온 Live 앞선 대화(`realtime/priorChatContext.ts`).
// ⚠️ 사기범 글에는 쓰지 않는다(사기범 대사는 가리지 않는다 — `roleplay/scammerReplyMasking.ts`). ⛔ 잎 모듈(import 0).

const MASK_TOKEN_LABELS: Readonly<Record<string, string>> = {
  "[계좌]": "계좌번호",
  "[전화]": "전화번호",
  "[주민번호]": "주민번호",
  "[이메일]": "이메일 주소",
};

/** 판정표 M. */
export function explainMaskedTokens(text: string): string {
  return text.replace(/\[(?:계좌|전화|주민번호|이메일)\]/g, (token) => `[${MASK_TOKEN_LABELS[token]}: 상대가 실제로 말했고 기록에서만 가림]`);
}
