// §131(7)(프로브 2026-10-24b N1 — 지인 사칭 카톡 고급 거절 · 루트 urgent-transfer) — 첫 메시지가 *"저는 새솔은행 여신관리팀 직원인데요, …
// 고객님 명의로 대출 신청이 접수된 건이 있어서"* 로 시작해 끝까지 은행 직원으로 대화했다(1차 Claude Haiku 생성). 같은 세션의 순응판은 "대학 동기"로
// 정상이었다 — 확률적 이탈이다(추정: 거절 응답 + "대출" 문맥이 대출 사기 틀로 끌었다).
//
// 판정표 P(지인 · 가족 사칭 메신저 시나리오만 — 아래 `PERSONA_GUARDED_SCENARIOS`):
// | # | If | Then |
// |---|---|---|
// | P1 | 대상 시나리오 · 사기범 대사 경로 | 프롬프트 맨 끝에 역할 고정 1줄(`PERSONA_ANCHOR_INSTRUCTION`) · LLM 요청에 `personaGuard` |
// | P2 | 응답이 `INSTITUTION_PERSONA` — 기관 · 금융사 직원 자기소개("○○은행 … 직원인데요" · "상담원입니다") 또는 "고객님" 호칭 | 쓸 수 없는 응답(`persona-drift`) → 다음 단계 모델 → 끝은 Mock(수법 문구) |
// | P3 | 그 밖 시나리오 | 검사 0 · 지시 0(종전 바이트 동일) |
// ⛔ "은행 직원이 그러는데"처럼 **남을 말하는** 문장은 이탈이 아니다 — 자기소개 어미(인데요 · 입니다 · 이에요)와 "저는/제가"만 본다.
// ⛔ 순수 함수 · 로그 0.

/** 관계 이름(역할 고정 지시에 넣는다). */
export const PERSONA_GUARDED_SCENARIOS: Readonly<Record<string, string>> = {
  "messenger-friend-loan-kakao": "지인(친구)",
  "messenger-child-impersonation-kakao": "자녀",
};

const INSTITUTION_NOUNS = "은행|카드사|캐피탈|저축은행|금융감독원|금감원|금융위원회|검찰청?|경찰청?|경찰서|수사관|여신|대출\\s*상담|고객\\s*센터|콜\\s*센터|상담원|보험사|통신사";
/** P2 — 기관 직원 자기소개 · "고객님" 호칭. */
export const INSTITUTION_PERSONA = new RegExp(
  `(?:저는|제가|여기는)\\s*[^.?!\\n]{0,20}(?:${INSTITUTION_NOUNS})[^.?!\\n]{0,15}(?:직원|팀장|과장|대리|주임|담당자?|상담원|입니다|이에요|예요|인데요)` +
    `|(?:${INSTITUTION_NOUNS})[^.?!\\n]{0,12}(?:직원|팀장|과장|대리|주임|담당자|상담원)\\s*(?:인데요|입니다|이에요|예요)` +
    `|고객님`,
);

export function personaGuardFor(scenarioId: string): RegExp | undefined {
  return scenarioId in PERSONA_GUARDED_SCENARIOS ? INSTITUTION_PERSONA : undefined;
}

/** P1 — 역할 고정 1줄(따옴표 대사 예시 0 · 턴 지시 스캔 게이트 대상). */
export function personaAnchorInstruction(scenarioId: string): string | undefined {
  const relation = PERSONA_GUARDED_SCENARIOS[scenarioId];
  if (!relation) return undefined;
  return `[역할 고정] 너는 처음부터 끝까지 참가자의 ${relation}다. 대화가 대출 · 계좌 · 보험 이야기로 흘러도 은행 · 카드사 · 수사기관 직원이나 상담원으로 자기를 소개하지 않고, 상대를 고객님이라고 부르지 않는다.`;
}

// ── §131(11)(프로브 N5 — 카톡 대화인데 통화 표현 3세션) ─────────────────────────────────────────────
// 판정표 W(메신저 단계 사기범 대사 — 오프닝 · sendMessage 메신저 단계 · 화면 행동 뒤 먼저 보내기 · 통화 뒤 복귀):
// | # | If | Then |
// |---|---|---|
// | W1 | 문장 맨 앞 "여보세요"(부호 포함) | 지운다(지우면 빈 대사면 원문) |
// | W2 | "(친구 폰|이 번호|다른 번호)으로 전화하는/전화한" — 지금 대화를 전화라고 말함 | "연락하는/연락한" |
// | W3 | "통화(를/는)? (여기서)? 마치/끝내/끊 + 미래 · 현재 어미(겠 · 을게 · ㄹ게 · 습니다 · 자)" — 지금 대화를 통화로 끝냄 | "통화" → "대화" |
// ⛔ "내가 지금 전화할게"(전환 예고) · "통화가 안 돼"(핑계) · "아까 통화 끊어서 미안"(지난 통화)은 바꾸지 않는다 — 실제 통화를 가리키는 말이다.
// ⛔ 통화 중 대화방(`chatDuringCall`)에는 쓰지 않는다 — 그때 "통화 끊을게"는 실제 통화를 가리킬 수 있다.
const LEADING_HELLO = /(^|[.?!\n]\s*)여보세요\s*[?？!.,~…]*\s*/g;
const CHAT_AS_CALL = /(친구\s*폰|이\s*번호|다른\s*번호|이\s*폰)(\s*(?:으로|로))\s*전화(하는|한|하고|해서|했)/g;
const END_CHAT_AS_CALL = /통화(\s*(?:를|는)?\s*(?:여기서\s*|이만\s*|그만\s*)?)(마치|끝내|끊)(?=겠|을게|을께|ㄹ게|습니다|자|을\s*게|어야|을\s*거)/g;

export function fixMessengerCallWording(text: string): string {
  const fixed = text
    .replace(LEADING_HELLO, "$1")
    .replace(CHAT_AS_CALL, (_m, via: string, particle: string, tail: string) => `${via}${particle} 연락${tail}`)
    .replace(END_CHAT_AS_CALL, (_m, middle: string, verb: string) => `대화${middle}${verb}`)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return fixed.length > 0 ? fixed : text;
}
