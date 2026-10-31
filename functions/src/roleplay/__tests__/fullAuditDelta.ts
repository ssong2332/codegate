// 2026-10-22(full-scenario-live-audit · docs/research/full-scenario-live-audit-2026-10.md) — 공통 [진행 강제] 두 곳 교체분을 되돌리는 **테스트 헬퍼**.
//
// ⚠️ 테스트 헬퍼다(파일명이 `*.test.ts`가 아니라 테스트 글롭에 잡히지 않는다 · 런타임 코드는 import하지 않는다).
// 두 교체는 **무조건부** 항목이라 모든 조립 산출물이 바뀐다. 그래서 "변경 전 바이트"를 고정한 테스트들(r3NoStallDelta.ts와 같은
// 자리)은 이 교체분만 되돌린 산출물이 이전 기준값과 같은지를 본다 ⇒ 의도된 변경 외에는 한 바이트도 바뀌지 않았음을 매 실행 재증명한다.
//   ① "페이로드는 가상값만" 줄 기관명 예시에서 "국민안전지원센터" 제거(사기범 소속 · 예금주로 새어 나옴)
//   ② "같은 압박을 반복하지 않는다" 항목 끝에 거절된 요구를 같은 형태로 다시 꺼내지 않는다는 1문장 추가
import {
  CLAIM_CONSISTENCY_RULE,
  HANGUP_EXHAUSTED_SENTENCE,
  HANGUP_NO_NEW_DEMAND_SENTENCE,
  IMPOSSIBLE_IDENTITY_VALUE_SENTENCE,
  LIVE_NO_IDLE_RULE,
  OUT_OF_SERVICE_SENTENCE,
  OFF_TOPIC_REPLY_SENTENCE,
  SMS_NOT_YET_SENT_SENTENCE,
  SMS_TOOL_SPEECH_SENTENCE,
  USER_MENTIONED_FINANCIAL_SENTENCE,
} from "../promptAssembly";

export const FULL_AUDIT_PAYLOAD_NEW = '**실존하지 않는 기관명**을 쓰되(예: "OO은행"), 숫자는';
export const FULL_AUDIT_PAYLOAD_OLD = '**실존하지 않는 기관명**을 쓰되(예: "OO은행", "국민안전지원센터"), 숫자는';
//   ⭐ §104(2026-10-22 · 2차) — ②의 문장을 "바로 다음 대답에서는 다시 꺼내지 않는다 · 다른 카드를 쓴 뒤에만"으로 바꿨다(되돌림 대상은 새 문장 전체).
//   ③ §104 — Live 전용 2곳(조건형 · 있을 때만 걷어 낸다): 문자 도구 줄 끝 `SMS_NOT_YET_SENT_SENTENCE` · NO_STALL_RULE 뒤 `LIVE_NO_IDLE_RULE` 1항.
export const FULL_AUDIT_REPEAT_ADDED =
  " 상대가 거절한 요구(예: 성함·생년월일)는 압박 문구나 근거만 바꿔 바로 다음 대답에서 다시 꺼내지 않는다 — 그 대답에서는 다른 요구로 바꾸거나, 더 작은 요구로 낮추거나, 아직 쓰지 않은 다른 수법(불이익 암시·확인 절차 차단 등)으로 넘어간다. 거절된 요구는 그 사이에 다른 카드를 쓴 뒤에만 다시 꺼낸다.";
/** ⑩ P0 [지금, 이전, 횟수] — "once" = 모든 조립에 정확히 1회 · "maybe" = 0 또는 1회. */
export const P0_TEXT_CHANGES: readonly (readonly [string, string, "once" | "maybe"])[] = [
  [OUT_OF_SERVICE_SENTENCE, "", "once"],
  [
    "카드번호·주민번호·인증번호를 불러 달라, 화면에 뜬 번호를 읽어 달라 등",
    "카드번호·주민번호·인증번호를 불러 달라, 현금을 찾아 어디로 가라, 앱을 설치하라, 화면에 뜬 번호를 읽어 달라 등",
    "once",
  ],
  ["(전액이 어려우면 일부만)", "(전액이 어려우면 일부만, 이체가 어려우면 다른 방법으로)", "once"],
  ["(흐름에 남은 다음 요구, 추가 정보, 비밀 유지 요구 등)", "(추가 이체, 추가 정보, 비밀 유지 요구 등)", "once"],
  ["본인확인 항목 확인, 안내 문자·링크 확인 등", "본인확인 항목 확인, 안내 문자·링크 확인, 조회용 앱 설치 등", "maybe"],
  ["안내 링크 확인 등", "안내 링크 확인, 앱 설치 등", "maybe"],
];

/** 두 교체로 늘어난 글자 수. */
// §104 — 전 경로 공통으로 늘 실리는 [대화 방식] 1문장(주변 이야기 받아치기)도 더한다(조건형 ③④는 NONE 조립에 없어 빼지 않는다).
export const FULL_AUDIT_LENGTH_DELTA =
  FULL_AUDIT_PAYLOAD_NEW.length - FULL_AUDIT_PAYLOAD_OLD.length + FULL_AUDIT_REPEAT_ADDED.length + OFF_TOPIC_REPLY_SENTENCE.length + USER_MENTIONED_FINANCIAL_SENTENCE.length +
  // §129 — NO_STALL_RULE 뒤 무조건부 1항(줄바꿈 포함).
  1 + CLAIM_CONSISTENCY_RULE.length +
  // 2026-10-31 — 본인확인 항목 끝 무조건부 1문장(있을 수 없는 생년월일 · 날짜 되묻기).
  IMPOSSIBLE_IDENTITY_VALUE_SENTENCE.length +
  // P0(2026-10-31) — [진행 강제] 무조건부 교체분("once" 행)의 길이 차이.
  P0_TEXT_CHANGES.filter(([, , mode]) => mode === "once").reduce((sum, [now, before]) => sum + now.length - before.length, 0);

function replaceOnce(text: string, from: string, to: string, label: string): string {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label} 구절이 조립 산출물에 ${count}회 있다(1회여야 한다)`);
  return text.replace(from, to);
}

/** ③ §104 Live 전용 2곳 — 0회 또는 1회만 허용(2회 이상이면 throw). 조건형이라 없는 조립(폴백 · 오프닝)도 정상이다. */
function removeAtMostOnce(text: string, fragment: string, label: string): string {
  const count = text.split(fragment).length - 1;
  if (count > 1) throw new Error(`${label} 구절이 조립 산출물에 ${count}회 있다(0 또는 1회여야 한다)`);
  return count === 1 ? text.replace(fragment, "") : text;
}

/** 조립 산출물에서 교체분을 되돌린다. ①② 새 구절이 정확히 1회씩 없으면 throw(조용한 무변환 0 — 죽은 대조 차단). */
export function revertFullAudit(assembled: string): string {
  const payloadReverted = replaceOnce(assembled, FULL_AUDIT_PAYLOAD_NEW, FULL_AUDIT_PAYLOAD_OLD, "페이로드 예시");
  const repeatReverted = replaceOnce(payloadReverted, FULL_AUDIT_REPEAT_ADDED, "", "거절 요구 반복 금지");
  const smsReverted = removeAtMostOnce(repeatReverted, SMS_NOT_YET_SENT_SENTENCE, "문자 도착 전 완료형 금지");
  const idleReverted = removeAtMostOnce(smsReverted, `\n${LIVE_NO_IDLE_RULE}`, "Live 대기 말 금지");
  // ④ §104 — 끊기 슬롯 TOOL · SIGNAL의 두 경우 머리에 넣은 2문장(자금 소진 · 끊는 응답 새 요구 금지 — NONE 조립에는 없다).
  const exhaustReverted = removeAtMostOnce(idleReverted, HANGUP_EXHAUSTED_SENTENCE, "자금 소진 끊기");
  const newDemandReverted = removeAtMostOnce(exhaustReverted, HANGUP_NO_NEW_DEMAND_SENTENCE, "끊는 응답 새 요구 금지");
  // ⑤ §104 — [대화 방식] 첫 항목 끝 1문장(주변 이야기 받아치기 — 전 경로 공통이라 정확히 1회).
  const offTopicReverted = replaceOnce(newDemandReverted, OFF_TOPIC_REPLY_SENTENCE, "", "주변 이야기 받아치기");
  // ⑥ §127 — "페이로드는 가상값만" 줄의 참가자 언급 은행 되받기 1문장(무조건부 — 정확히 1회).
  const userMentionedReverted = replaceOnce(offTopicReverted, USER_MENTIONED_FINANCIAL_SENTENCE, "", "참가자 언급 은행 되받기");
  // ⑦ §129(DECISIONS #245) — NO_STALL_RULE 바로 뒤 "하지 않은 일을 확인됐다고 하지 않는다" 1항(무조건부 — 정확히 1회) ·
  //    Live 문자 도구 줄 끝 "도구 이름 · 인자를 말하지 않는다" 1문장(조건형 — 0 또는 1회).
  const claimReverted = replaceOnce(userMentionedReverted, `\n${CLAIM_CONSISTENCY_RULE}`, "", "하지 않은 일 확인 금지");
  const toolSpeechReverted = removeAtMostOnce(claimReverted, SMS_TOOL_SPEECH_SENTENCE, "도구 이름 발화 금지");
  // ⑨ 2026-10-31(운영 세션 c8184afd 실기 신고) — 본인확인 항목(TRUE · FALSE 중 하나) 끝 "있을 수 없는 값 되묻기" 1문장(무조건부 — 정확히 1회).
  const impossibleReverted = replaceOnce(toolSpeechReverted, IMPOSSIBLE_IDENTITY_VALUE_SENTENCE, "", "있을 수 없는 신상 값 되묻기");
  // ⑧ §129 — 시나리오 문면 교체(그 시나리오 조립에만 있다 — 0 또는 1회): 금액 자리 "얼마만" → 구체 금액(D5) · 상담원 인용구 존댓말(에뮬 D13) ·
  //    지인 카톡 "ㅇㅇ" 자리표시 금지 1문장(D10).
  // ⑩ P0(2026-10-31 · in-service-experience-plan §2.1 K3) — [진행 강제] 서비스 밖 행동 예시 제거 · 금지 1문장(무조건부 — 정확히 1회) ·
  //    고급 선행 요구 예시의 "조회용 앱 설치" · "앱 설치" 제거(조건형 — 0 또는 1회). LIVE_NO_IDLE · 자금 소진 문장은 위에서 상수째 걷어 낸다.
  const p0Reverted = P0_TEXT_CHANGES.reduce((text, [now, before, mode]) => {
    if (mode === "once") return replaceOnce(text, now, before, `P0 "${now.slice(0, 12)}"`);
    const count = text.split(now).length - 1;
    if (count > 1) throw new Error(`P0 문면 "${now}"이 조립 산출물에 ${count}회 있다(0 또는 1회여야 한다)`);
    return count === 1 ? text.replace(now, before) : text;
  }, impossibleReverted);
  const probe129Reverted = PROBE_129_TEXT_CHANGES.reduce(
    (text, [now, before]) => {
      const count = text.split(now).length - 1;
      if (count > 1) throw new Error(`§129 문면 "${now}"이 조립 산출물에 ${count}회 있다(0 또는 1회여야 한다)`);
      return count === 1 ? text.replace(now, before) : text;
    },
    p0Reverted,
  );
  // ⑪ P2(2026-10-31 · X6) — 계좌 문자에 이체 화면 링크를 병기한 루트(대출 · 통관 · 유포 협박 · 자산 보호)의 수법 · 단계 문면에 "문자 속 링크의 이체 화면에서"
  //    절을 더했다(그 시나리오 조립에만 · 대출은 수법 2개라 2회까지). 0회 이상 전부 되돌린다.
  return P2_TEXT_CHANGES.reduce((text, [now, before]) => text.split(now).join(before), probe129Reverted);
}

/** ⑪ P2 시나리오 문면 교체 — [지금, 이전] 쌍(전부 되돌림). `functions/src/scenarios/*.prompt.ts` · `flowVariants.ts`와 글자 단위로 같다. */
export const P2_TEXT_CHANGES: readonly (readonly [string, string])[] = [
  [
    "계좌는 네가 불러 주지 말고 문자로 보낸 것을 확인하게 하고, 그 문자 속 링크의 이체 화면에서 보내게 한다(은행 앱 · 창구 · ATM에서 따로 보내라고 하지 않는다). 구체적 유포 내용·대상 묘사는 하지 않는다.",
    "계좌는 네가 불러 주지 말고 문자로 보낸 것을 확인하게 하고, 구체적 유포 내용·대상 묘사는 하지 않는다.",
  ],
  [
    "계좌는 네가 불러 주지 말고 문자로 보낸 것을 확인하게 하고, 그 문자 속 링크의 이체 화면에서 보내게 한다(은행 앱 · 창구 · ATM에서 따로 보내라고 하지 않는다).",
    "계좌는 네가 불러 주지 말고 문자로 보낸 것을 확인하게 한다.",
  ],
  [
    "문자로 보낸 계좌에 예치금을 넣게 한다 — 그 문자 속 링크의 이체 화면에서 보내게 하고, 은행 앱 · 창구 · ATM에서 따로 보내라고 하지 않는다.",
    "문자로 보낸 계좌에 예치금을 넣게 한다.",
  ],
  [
    "문자로 보낸 계좌로 옮기게 한다 — 그 문자 속 링크의 이체 화면에서 보내게 하고, 은행 앱 · 창구 · ATM에서 따로 보내라고 하지 않는다.",
    "문자로 보낸 계좌로 옮기게 한다.",
  ],
  ["문자로 보낸 계좌에 예치금을 문자 속 링크의 이체 화면에서 넣으라고", "문자로 보낸 계좌에 예치금을 넣으라고"],
  ["문자로 보낸 계좌로 문자 속 링크의 이체 화면에서 이체하라고", "문자로 보낸 계좌로 이체하라고"],
  ["문자로 보낸 계좌에 공탁금을 문자 속 링크의 이체 화면에서 넣으라고", "문자로 보낸 계좌에 공탁금을 넣으라고"],
  // P2-c — 메신저 자녀 · 지인 사칭 "송금 직접 요구" 수법의 이체 화면 링크 마커 절.
  [
    "가상값으로만 부르고, 계좌를 알려 주는 메시지에 `[[LINK:child-bank-transfer]]` 마커로 이체 화면 링크를 함께 보낸다(은행 앱 · 창구 · ATM에서 따로 보내라고 하지 않는다).",
    "가상값으로만 부른다.",
  ],
  [
    "가상값으로만 부르고, 계좌를 알려 주는 메시지에 `[[LINK:friend-bank-transfer]]` 마커로 송금 화면 링크를 함께 보낸다(은행 앱 · 창구 · ATM에서 따로 보내라고 하지 않는다).",
    "가상값으로만 부른다.",
  ],
];

/** ⑧ §129 시나리오 문면 교체 — [지금, 이전] 쌍. */
export const PROBE_129_TEXT_CHANGES: readonly (readonly [string, string])[] = [
  ["지금 300만 원만 바로 보내줘", "지금 얼마만 바로 보내줘"],
  ["지금 50만 원만 좀 보내주시면", "지금 얼마만 좀 보내주시면"],
  ["그 금액만 지금 넣어주세요", "얼마만 지금 넣어주세요"],
  ["엄마 지금 200만 원만 급하게", "엄마 지금 얼마만 급하게"],
  ["'150만 원만 좀 보내줄 수 있어?", "'얼마만 좀 보내줄 수 있어?"],
  ["고액 결제 시도가 확인됐습니다'", "고액 결제 시도가 확인됐다'"],
  ["정부 지원금 대상자로 확인됐습니다'", "정부 지원금 대상자로 확인됐다'"],
  [' 자음 "ㅇㅇ"으로 채우지도 않는다.', ""],
  // F4(2026-10-31) — 남은 금액 자리 "얼마" → 구체 금액(계좌 문자 금액 · 사례 C17) · 근거 없는 환급 수수료는 금액을 뺀다.
  ["'지금 100만 원 준비해서", "'지금 얼마 준비해서"],
  ["관세 7만 8천 원을 지금", "관세 얼마를 지금"],
  ["기존 대출 185만 원을 오늘", "기존 대출 얼마를 오늘"],
  ["정리하시려면 300만 원을 오늘", "정리하시려면 얼마를 오늘"],
  ["처리 수수료를 먼저 넣으셔야", "처리 수수료 얼마를 먼저 넣으셔야"],
];

