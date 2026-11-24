// ⭐ 2026-11-24(페르소나 점검 N11 · 지인 사칭 고급 fv-bxvp — S2 "948-2716-5093-27" → S4 "9012-3456-7890-12") — 텍스트 경로 계좌번호 고정.
// 프롬프트의 "이 번호를 그대로 쓴다 · 다른 계좌번호를 지어내지 않는다"(`promptAssembly.ts` applySessionAccount)는 확률적 지시라, 모델이 지어낸 번호를
// 결정적으로 세션 계좌로 되돌린다. 근거 · 판정표 정본 = `docs/research/persona-consistency-2026-11-24.md` 판정표 AP.
// | # | If | Then |
// |---|---|---|
// | AP1 | 줄표로 이은 숫자 3 ~ 5묶음 · 숫자 10 ~ 14자리 · 첫 자리 0 아님 ∧ 바로 앞 16자 안에 계좌 · 은행 · 예금주 · 입금 · 이체 · 송금 | 후보 |
// | AP2 | 후보가 세션 계좌 또는 이 시나리오 문자 본문 속 계좌 | 그대로 |
// | AP3 | 그 밖(지어낸 번호) | 세션 계좌번호로 |
// | AP4 | 전화번호(0 시작) · 카드번호(16자리) · 날짜 · 앞에 계좌 낱말 없음 | 그대로 |
// ⚠️ Live 소리는 대상 밖(이미 나간 소리) — 텍스트 sendMessage · 오프닝만.
import { IN_CALL_SMS } from "../scenarios/inCallSms";

const ACCOUNT_LIKE = /(?<![\d-])[1-9]\d{1,5}(?:-\d{1,6}){2,4}(?![\d-])/g;
const ACCOUNT_CONTEXT = /계좌|은행|예금주|입금|이체|송금/;
const SMS_ACCOUNT = /\d{3}-\d{4}-\d{4}-\d{2}/g;

/** 이 시나리오 문자 본문에 실린 계좌번호 전부(AP2). */
function scenarioSmsAccounts(scenarioId: string): Set<string> {
  return new Set((IN_CALL_SMS[scenarioId] ?? []).flatMap((item) => item.body.match(SMS_ACCOUNT) ?? []));
}

export function pinSessionAccountNumber(text: string, scenarioId: string, sessionAccountNumber: string): string {
  const known = scenarioSmsAccounts(scenarioId).add(sessionAccountNumber);
  return text.replace(ACCOUNT_LIKE, (candidate, offset: number) => {
    const digits = candidate.replace(/-/g, "").length;
    if (digits < 10 || digits > 14) return candidate;
    if (!ACCOUNT_CONTEXT.test(text.slice(Math.max(0, offset - 16), offset))) return candidate;
    return known.has(candidate) ? candidate : sessionAccountNumber;
  });
}
