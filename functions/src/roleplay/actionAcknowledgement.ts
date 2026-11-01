// §131(12) · §131(13) — 참가자가 **한 일 · 하지 않은 일**과 사기범 대사가 어긋나는 두 결함.
//
// (12) 프로브 2026-10-24b D7(메신저판) — 자녀 카톡 순응 U7 *"네, 알겠어요."* 뒤 S8 *"이체 캡처 보내줘서 고마워, 진짜 살았다."* 참가자는 이체도
//      캡처도 하지 않았다. ⇒ 판정표 A(사후 손질 — 사기범 대사 저장 전):
// | # | If | Then |
// |---|---|---|
// | A1 | 대사 문장이 송금 · 이체 완료를 받았다고 말한다(`TRANSFER_ACK`) ∧ 참가자가 송금했다고 말한 적 없다(`userReportedTransfer` 거짓) | 그 문장을 지운다 |
// | A2 | 대사 문장이 사진 · 캡처 · 신분증을 받았다고 말한다(`PHOTO_ACK`) ∧ 참가자가 사진을 보낸 적 없다(`photo` 턴 0) | 그 문장을 지운다 |
// | A3 | 지우면 대사가 비거나 해당 없음 | 원문 그대로(빈 말풍선 0) |
//
// (13) 메인 세션 라이브 확인 2026-10-24(§131 조사 (a)) — 참가자가 *"200만원 보냈어"* 라고 했는데 통화 뒤 대화방에서 *"아까 말한 200만 원, 지금 보내야
//      접수가 넘어간대"* 로 같은 금액을 다시 요구했다. 원인: 복귀 지시가 "통화에서 멈춘 요청을 이어간다"뿐이고 참가자가 이미 했다고 말한 일을
//      모델에 따로 알리지 않았다. ⇒ 판정표 R(턴 지시 — sendMessage · 통화 뒤 복귀 · 통화 중 대화방):
// | # | If | Then |
// |---|---|---|
// | R1 | 참가자가 송금했다고 말했다(`userReportedTransfer`) | `TRANSFER_REPORTED_INSTRUCTION` 1줄 — 같은 송금을 다시 요구하지 말고 받은 것으로 치고 다음 수법(추가 명목 · 다른 요구)으로 |
// | R2 | 그 밖 | 없음(종전 문면 바이트 동일) |
// ⛔ 순수 함수 · 로그 0. ⛔ 리포트 판정(`report/analyzeConversation.ts` H4)과 같은 이행 보고 어형이다 — 두 곳을 함께 바꾼다.

import { splitSentences } from "./callAnnouncement";

type HistoryLine = { role: "scammer" | "user"; textMasked: string; photo?: true };

/** 참가자 이행 보고(리포트 H4 `TRANSFER_DONE_REPORT`와 같은 어형 — 앞에 "안 · 못"이 붙으면 아니다). */
export const USER_TRANSFER_REPORT = /(?<!(?:안|못)\s?)(?:보냈|송금했|이체했|입금했|부쳤)(?:어|습|다|는데|고|지|요)/;

export function userReportedTransfer(history: readonly HistoryLine[], currentUserText?: string): boolean {
  const userTexts = [...history.filter((m) => m.role === "user").map((m) => m.textMasked), ...(currentUserText ? [currentUserText] : [])];
  return userTexts.some((text) => USER_TRANSFER_REPORT.test(text));
}

export function userSentPhoto(history: readonly HistoryLine[], currentIsPhoto = false): boolean {
  return currentIsPhoto || history.some((m) => m.role === "user" && m.photo === true);
}

/** A1 — 송금 · 이체를 받았다는 말. */
const TRANSFER_ACK =
  /(?:보내|이체해|입금해|송금해|부쳐)\s*(?:줘서|주셔서|준\s*거|주신\s*거)|(?:입금|이체|송금)\s*(?:이|은|도)?\s*(?:확인(?:됐|되었|했)|완료(?:됐|되었)|잘\s*(?:됐|들어왔))|돈\s*(?:잘\s*)?(?:받았|들어왔)/;
/** A1은 돈 낱말이 같은 문장에 있을 때만 — "신분증 사진 보내줘서 고마워"(사진 이야기)를 송금 확인으로 읽지 않게. */
const MONEY_WORDS = /이체|입금|송금|돈|\d[\d,]*\s*(?:만\s*)?원|만\s*원/;
/** A2 — 사진 · 캡처 · 신분증을 받았다는 말. */
const PHOTO_ACK = /(?:사진|캡처|캡쳐|신분증|스샷)[^.?!\n]{0,10}(?:받았|잘\s*왔|확인했|보내\s*줘서|보내\s*주셔서|고마워|감사)/;

export function stripUnperformedAcknowledgement(
  text: string,
  facts: { transferReported: boolean; photoSent: boolean },
): string {
  const kept = splitSentences(text).filter(
    (sentence) =>
      !(!facts.transferReported && TRANSFER_ACK.test(sentence) && MONEY_WORDS.test(sentence)) &&
      !(!facts.photoSent && PHOTO_ACK.test(sentence)),
  );
  const joined = kept.join(" ");
  return joined.trim().length > 0 && kept.length !== splitSentences(text).length ? joined : text;
}

// ── R3(#465 실측 · 메신저 자녀 사칭 fv-tdgg — 이체 화면 미제출인데 예비 모델이 "입금 확인됐어 엄마 고마워ㅠㅠ …" 한 문장으로 단정 → A1이 문장을
//    통째로 지우면 빈 답이 되어 A3가 원문을 남겼다) — 이체 화면을 아직 마치지 않았으면 대사 안의 송금 확인 단정을 결정적으로 막는다.
// | # | If | Then |
// |---|---|---|
// | U1 | 이체 화면을 보냈고 아직 마치지 않았다 ∧ 대사의 어떤 절(문장 · 이모티콘 경계)이 송금 확인 단정(A1 어형 + 돈 낱말) | 대사 전체를 미확인 되돌림 1줄(말투 맞춤)로 바꾼다 · 같은 응답의 목표 끊기 신호는 받지 않는다 |
// | U2 | 그 밖 | 그대로 |
// ⚠️ 문장 일부만 지우지 않는 이유: 송금 확인 뒤 문장은 대개 마무리 · 작별("폰 수리 끝나면 연락할게")이라 남기면 같은 거짓이 이어진다.

/** 절 나눔 — 문장 경계 + 메신저 이모티콘 경계(ㅠㅠ · ㅜㅜ · ㅋㅋ · ㅎㅎ · ^^ — 마침표 없이 이어 쓰는 말투). */
function clausesOf(text: string): string[] {
  return splitSentences(text)
    .flatMap((sentence) => sentence.split(/(?<=[ㅠㅜㅋㅎ]{2,}|\^\^)\s*/))
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

/** U1 판정 — 대사에 송금 확인 단정이 있는가(A1과 같은 어형 · 같은 절에 돈 낱말). */
export function assertsTransferConfirmed(text: string): boolean {
  return clausesOf(text).some((clause) => TRANSFER_ACK.test(clause) && MONEY_WORDS.test(clause));
}

/** U1 되돌림 1줄(따옴표 0 · 숫자 0). 반말 대사면 반말 · 그 밖 존댓말. */
export const TRANSFER_NOT_CONFIRMED_REPLY = {
  casual: "잠깐만, 아직 입금 확인이 안 돼. 보낸 링크 화면에서 송금 다시 해 줘.",
  polite: "아직 입금 확인이 되지 않습니다. 보내 드린 링크 화면에서 이체를 다시 진행해 주세요.",
} as const;

/** 존댓말 어미가 보이면 존댓말. */
const POLITE_ENDING = /(?:니다|습니까|십니까|세요|십시오|어요|아요|에요|예요|해요|죠|군요|네요)(?=[\s.?!~…ㅠㅜ]|$)/;

/** U1 · U2. */
export function guardUnconfirmedTransfer(text: string, transferScreenPending: boolean): { text: string; replaced: boolean } {
  if (!transferScreenPending || !assertsTransferConfirmed(text)) return { text, replaced: false }; // U2
  return { text: POLITE_ENDING.test(text) ? TRANSFER_NOT_CONFIRMED_REPLY.polite : TRANSFER_NOT_CONFIRMED_REPLY.casual, replaced: true }; // U1
}

/** R1 지시(따옴표 대사 예시 0 · 턴 지시 스캔 게이트 대상). */
export const TRANSFER_REPORTED_INSTRUCTION =
  "(참가자는 이미 돈을 보냈다고 말했다. 그 송금은 받은 것으로 치고, 같은 돈을 같은 이유로 다시 보내라고 요구하지 않는다. 더 요구하려면 수법 목록 안에서 새 명목을 대거나 다른 요구로 넘어간다.)";
