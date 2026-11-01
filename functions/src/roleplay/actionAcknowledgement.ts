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

// ── R9(#468 실측 · 자녀 사칭 — 화면에 없는 "비밀번호 여섯 자리 입력"을 안내) — 실제 비밀번호 입력을 부추기는 문장을 결정적으로 뺀다 ──────────────
// 이 앱의 이체 · 인증 화면에는 비밀번호 칸이 없다(본인 인증 = 지문 · 얼굴 버튼 하나). 참가자가 습관대로 실제 비밀번호를 치지 않게 한다(BA3와 같은 원칙).
// | # | If | Then |
// |---|---|---|
// | P1 | 대사의 문장 · 절이 비밀번호 · 비번 · 보안카드를 입력 · 불러 · 알려 · 눌러 달라는 말 | 그 절을 뺀다 |
// | P2 | 다 빠지면 | 화면 버튼만 누르면 된다는 1줄(말투 맞춤) |
// | P3 | 그 밖 | 그대로 |
// ⚠️ 인증번호(문자로 온 6자리)는 대상이 아니다 — 인증번호 문자를 선언한 루트의 설계 단계다(그 밖 루트의 인증번호 요구는 지시 문면이 막는다).
const PASSWORD_REQUEST = /(?:비밀\s?번호|비번|보안\s?카드)[^.?!\n]{0,20}(?:입력|눌러|누르|불러|알려|말해|적어|넣어|쳐)/;

export const PASSWORD_FREE_REPLY = {
  casual: "링크 화면에서 이체하기 버튼만 누르면 돼.",
  polite: "링크 화면에서 이체하기 버튼만 눌러 주시면 됩니다.",
} as const;

/** P1 ~ P3. */
export function stripPasswordRequests(text: string): { text: string; stripped: boolean } {
  const clauses = clausesOf(text);
  const kept = clauses.filter((clause) => !PASSWORD_REQUEST.test(clause));
  if (kept.length === clauses.length) return { text, stripped: false }; // P3
  if (kept.length === 0) return { text: POLITE_ENDING.test(text) ? PASSWORD_FREE_REPLY.polite : PASSWORD_FREE_REPLY.casual, stripped: true }; // P2
  return { text: kept.join(" "), stripped: true }; // P1
}

/** R1 지시(따옴표 대사 예시 0 · 턴 지시 스캔 게이트 대상). */
export const TRANSFER_REPORTED_INSTRUCTION =
  "(참가자는 이미 돈을 보냈다고 말했다. 그 송금은 받은 것으로 치고, 같은 돈을 같은 이유로 다시 보내라고 요구하지 않는다. 더 요구하려면 수법 목록 안에서 새 명목을 대거나 다른 요구로 넘어간다.)";

// ── R15 ⓐ(#479 확인 실측 ② S5 · 예비 모델 — 설치 기록 없이 "설치 끝난 거 맞지? 고마워"로 설치를 끝난 일로 치고 다음 요구로 넘어감) — 판정표 I ──────────────
// 지시(설치 화면 재촉 문장)는 주 모델 · 예비 모델 모두 받지만 예비 모델이 무시했다. 출력 단계에서 결정적으로 막는다(모델 무관).
// | # | If | Then |
// |---|---|---|
// | I1 | 메신저 단계 ∧ 보낸 설치 화면을 아직 마치지 않았다(권한 허용 기록 없음) ∧ 대사의 어떤 절이 설치 완료 단정(부정 · 조건 · 허용 언급 없는 "설치 … 끝났/됐/완료") | 대사 전체를 설치 미확인 1줄(말투 맞춤)로 |
// | I2 | 그 밖(통화 단계 · 카드사 고급 등 처음부터 통화 = 대상 아님) | 그대로 |
// ⚠️ "설치는 됐는데 허용을 아직 안 누른 것 같아"처럼 허용 · 권한을 함께 말하는 절은 재촉이라 대상이 아니다. "설치 끝나면"(조건)도 아니다.
const INSTALL_DONE = /설치\s*(?:가|는|도|를)?\s*(?:다\s*)?(?:끝났|끝난\s*거|끝난\s*것|끝냈|됐|된\s*거|된\s*것|완료\s*(?:됐|된|했)|마쳤|마친\s*거|잘\s*됐)/;
// 묻는 꼴("다 됐어?")은 확인 질문이라 대상이 아니다 — "끝난 거 맞지?"처럼 단정에 동의를 구하는 꼴은 대상.
const INSTALL_NOT_DONE = /안\s*(?:됐|된|끝|했)|아직|못\s*했|않|허용|권한|[는은]지|(?:됐|끝났|했|마쳤)(?:어|니|나|냐|어요|나요)\s*\?/;

export const INSTALL_NOT_CONFIRMED_REPLY = {
  casual: "잠깐만, 아직 설치 완료가 안 떴어. 보낸 링크 화면에서 설치하고 허용까지 눌러 줘.",
  polite: "아직 설치 완료가 확인되지 않습니다. 보내 드린 링크 화면에서 설치와 허용까지 진행해 주세요.",
} as const;

/** I1 판정 — 대사에 설치 완료 단정이 있는가. */
export function assertsInstallDone(text: string): boolean {
  return clausesOf(text).some((clause) => INSTALL_DONE.test(clause) && !INSTALL_NOT_DONE.test(clause));
}

/** I1 · I2. */
export function guardUnconfirmedInstall(text: string, installScreenPending: boolean): { text: string; replaced: boolean } {
  if (!installScreenPending || !assertsInstallDone(text)) return { text, replaced: false }; // I2
  return { text: POLITE_ENDING.test(text) ? INSTALL_NOT_CONFIRMED_REPLY.polite : INSTALL_NOT_CONFIRMED_REPLY.casual, replaced: true }; // I1
}

// ── R16(#479 확인 실측 ② S12 — 이체 칩 미완료인데 말로만 "보냈어요" → "이체 기록이 확인이 안 돼서 나중에 다시 연락할게"로 작별) — 판정표 F ─────────────
// 이 상태의 goal 끊기는 4-c행이 막는다(대화는 이어진다) — 작별 대사만 나가면 떠난다고 해 놓고 다음 메시지를 또 보내는 모순이 된다.
// | # | If | Then |
// |---|---|---|
// | F1 | 메신저 단계 ∧ 보낸 이체 칩을 아직 마치지 않았다(기록 없음 · 요구액보다 적음) ∧ 이번 응답이 포기 끝맺음이 아니다 ∧ 대사의 어떤 절이 작별 · 나중 연락 | 대사 전체를 이체 미확인 재촉 1줄(U1과 같은 문장 · 말투 맞춤)로 |
// | F2 | 그 밖(포기 끝맺음 — 4-c가 통과시키는 정상 작별 · 통화 단계) | 그대로 |
const FAREWELL = /(?:나중에|이따|다음에|좀\s*있다)\s*(?:다시\s*)?연락|다시\s*연락\s*(?:할게|할께|드릴게|드리겠|하겠|줄게)|(?:이만|이제|그럼)\s*(?:갈게|들어갈게|끊을게|마칠게)|이만\s*(?:마치겠|줄이겠)/;

/** F1 판정 — 대사에 작별 · 나중 연락 절이 있는가. */
export function saysFarewell(text: string): boolean {
  return clausesOf(text).some((clause) => FAREWELL.test(clause));
}

/** F1 · F2. */
export function guardFarewellWhileTransferPending(
  text: string,
  input: { messengerStage: boolean; transferChipPending: boolean; givingUp: boolean },
): { text: string; replaced: boolean } {
  if (!input.messengerStage || !input.transferChipPending || input.givingUp || !saysFarewell(text)) return { text, replaced: false }; // F2
  return { text: POLITE_ENDING.test(text) ? TRANSFER_NOT_CONFIRMED_REPLY.polite : TRANSFER_NOT_CONFIRMED_REPLY.casual, replaced: true }; // F1
}
