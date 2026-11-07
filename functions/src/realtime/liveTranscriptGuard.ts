// 실시간 통화(Gemini Live) 자막 · 저장 전사 거르기 (2026-11-07 · Edge 시나리오 시험 판 3 · 16 · 23 —
// `docs/research/edge-scenario-test-2026-11-07.md`). 순수 함수 · 부수효과 0.
//
// Live 경로는 출력이 오디오라 텍스트 경로의 결정적 후처리(표식 추출 · R9 비밀번호 문장 제거 · 실명 치환)가 소리에는 닿지 않는다.
// 소리는 지시 블록(`roleplay/promptAssembly.ts` `buildLiveCallSafetyBlock` L1 ~ L3)이 유일한 층이고, 이 모듈은 **글로 남는 것**
// — 통화 자막 · 리포트용 저장 전사 · 재연결 때 다시 넣는 전사 — 을 거른다.
//
// 판정표(사기범 줄 — `guardLiveScammerLine`):
// | 행 | If | Then |
// |---|---|---|
// | S1 | 겹대괄호 표식(`[[LINK:…]]` · `[[SIGNAL:…]]` · `[[SMS:…]]` 등 · 끝이 잘린 `[[LINK:pa`도) | 지운다(판 23) |
// | S2 | 실존 민간 회사명(택배 · 통신 · 보험 · 증권 · 쇼핑몰 · 캐피탈 · 저축은행 — `realCompanyNames.ts` 표) | 업종 이름 · 가상 자리표시로(판 16) |
// | S3 | 그 밖 | 원문 그대로(바이트 동일) |
//
// 판정표(참가자 줄 — `guardLiveUserLine`):
// | 행 | If | Then |
// |---|---|---|
// | U1 | 바로 앞 사기범 줄이 비밀번호를 묻는다(`asksPasswordAloud`) ∧ 참가자 줄에 숫자 3개 이상 묶음(아라비아 · "일 이 삼 사") | 그 묶음을 `[비밀번호]`로(판 3) |
// | U2 | 그 밖 | 원문 그대로(참가자 말은 기록이다) |
// ⚠️ U1은 이미 Live로 간 소리를 되돌리지 못한다 — 화면 · 저장 · 재연결 주입에 실제 비밀번호가 남지 않게 할 뿐이다.
// ⚠️ 은행 · 카드사 실명(`realFinancialNames.ts`)은 S2에 넣지 않는다 — 참가자가 먼저 말한 은행을 되받는 경우 "말씀하신 은행"으로 바꿔야 하는데
//    (§127) 자막은 그 판단 입력을 갖지 않는다. 은행 · 카드는 지시 문면(세션 가상 은행명)이 막는다.
// ⛔ 아래 "사본 시작" ~ "사본 끝" 구간은 `src/lib/realtime/liveTranscriptGuard.ts`와 **글자까지 같아야 한다**
//    (루트 `liveTranscriptGuard.test.ts`가 두 파일을 읽어 대조한다 — 빌드 루트가 달라 import로 공유하지 않는다).
import { replaceRealCompanyNames } from "../guardrails/realCompanyNames";

// ── 사본 시작 ──
/** S1 — 겹대괄호 표식. 닫는 `]]`가 없어도(끼어들기로 잘린 조각) 줄 끝까지면 지운다. */
const CONTROL_MARKER = /\[\[[^[\]\n]{0,80}(?:\]\]|$)/g;

/** 비밀번호를 말로 묻는 문장(R9 판정표 P의 동사 + 통화에서 묻는 말투 — 어떻게 · 뭐 · 확인 · 되시). 인증번호는 대상이 아니다. */
const PASSWORD_ASK =
  /(?:비밀\s?번호|비번|보안\s?카드|핀\s?번호|PIN)[^.?!\n]{0,24}(?:입력|눌러|누르|불러|알려|말씀|말해|적어|넣어|쳐|확인|어떻게|뭐|무엇|되시|되세요|되나요|주시겠|주세요|부탁)/i;

/** U1 — 아라비아 숫자 3개 이상 묶음(사이 공백 · 줄표 · 점 · 쉼표 허용). */
const DIGIT_RUN = /\d(?:[\s\-.,·]*\d){2,}/g;
/** U1 — 한 글자 한자어 숫자 3개 이상 묶음("일 이 삼 사" · "일이삼사요"). 앞뒤가 다른 한글 낱말이면 숫자로 보지 않는다(뒤 어미는 남긴다). */
const SPOKEN_DIGIT_RUN = /(?<![가-힣])[공영일이삼사오육칠팔구](?:[\s,·\-]*[공영일이삼사오육칠팔구]){2,}(?=(?:이?요|예요|이에요|입니다|이고요?|번이?요?)?(?![가-힣]))/g;

export const PASSWORD_MASK = "[비밀번호]";

/** S1. 지울 것이 없으면 원문 그대로. */
export function stripControlMarkers(text: string): string {
  if (!text.includes("[[")) return text;
  return text.replace(CONTROL_MARKER, " ").replace(/[ \t]{2,}/g, " ").replace(/ +([.,?!])/g, "$1").trim();
}

/** 사기범 줄이 비밀번호를 말로 묻는가(U1의 조건). */
export function asksPasswordAloud(scammerLine: string | undefined): boolean {
  return typeof scammerLine === "string" && PASSWORD_ASK.test(scammerLine);
}

/** U1 · U2. */
export function guardLiveUserLineWith(text: string, previousScammerLine: string | undefined): string {
  if (!asksPasswordAloud(previousScammerLine)) return text;
  const masked = text.replace(DIGIT_RUN, PASSWORD_MASK).replace(SPOKEN_DIGIT_RUN, PASSWORD_MASK);
  return masked === text ? text : masked;
}

/** S1 ~ S3 — 회사명 치환은 호출부가 넘긴다(서버 = `guardrails/realCompanyNames.ts` · 화면 = 같은 표의 사본). */
export function guardLiveScammerLineWith(text: string, replaceCompanies: (t: string) => { text: string }): string {
  return replaceCompanies(stripControlMarkers(text)).text;
}
// ── 사본 끝 ──

/** 서버 — 사기범 줄(S1 ~ S3). */
export function guardLiveScammerLine(text: string): string {
  return guardLiveScammerLineWith(text, replaceRealCompanyNames);
}

/** 서버 — 참가자 줄(U1 · U2). */
export function guardLiveUserLine(text: string, previousScammerLine: string | undefined): string {
  return guardLiveUserLineWith(text, previousScammerLine);
}
