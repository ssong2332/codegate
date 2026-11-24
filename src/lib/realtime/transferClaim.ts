// 2026-11-24 페르소나 점검 N3 — 서버 `functions/src/shared/transferClaim.ts`의 화면 사본(같은 글자 · `transferClaim.test.ts`가 고정).
// 실시간 `end_call` 판정 요청에 "참가자가 보냈다고 말했는가"(판정표 VD)를 싣는 데 쓴다.
export const TRANSFER_DONE_REPORT =
  /(?<!(?:안|못)\s?)(?:보냈|송금했|이체했|입금했|부쳤)(?:어|습|다|는데|고|지)|(?:이체|송금|입금)\s*(?:를\s*|은\s*|는\s*)?(?:다\s*)?완료\s*(?:했|됐|되었|하였)/;

/** 판정표 VD3 — 이 통화의 참가자 줄 중 송금 이행 보고가 있는가. */
export function participantSaidSent(userTexts: readonly string[]): boolean {
  return userTexts.some((text) => TRANSFER_DONE_REPORT.test(text));
}
