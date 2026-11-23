// 2026-11-24 페르소나 점검 N3 — 참가자의 송금 이행 보고("보냈어요" · "이체 완료했어요") 어형. 잎 모듈(값 import 0).
// 리포트 H4(`report/analyzeConversation.ts`)와 끊기 판정표 VD(`scammerHangup/goalAction.ts`)가 **이 정규식 하나**를 쓴다.
// 클라 사본 `src/lib/realtime/transferClaim.ts`는 드리프트 시험이 source 문자열로 고정한다.
// ⛔ `g` 플래그 금지(`.test()`가 lastIndex를 이어 쓴다).
export const TRANSFER_DONE_REPORT =
  /(?<!(?:안|못)\s?)(?:보냈|송금했|이체했|입금했|부쳤)(?:어|습|다|는데|고|지)|(?:이체|송금|입금)\s*(?:를\s*|은\s*|는\s*)?(?:다\s*)?완료\s*(?:했|됐|되었|하였)/;
