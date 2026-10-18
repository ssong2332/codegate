// 텍스트 폴백의 문자 요청 마커 `[[SMS:identity|transfer|link]]` (T191 문자 도달 조건 설계 · PRD AC-099 (b)(f)).
//
// `escalationSignal.ts`·`linkMarker.ts`와 같은 sentinel 패턴이다 — 텍스트 경로는 서버가 사기범 텍스트를 쥐므로
// 마커를 저장 전에 지울 수 있다(ADR-0007이 마커를 기각한 이유는 *오디오* 경로였다). 실시간(Live) 경로에는 쓰지 않는다
// (그쪽은 `send_prepared_sms` 도구의 `purpose` 인자).
//
// ⚠️ 마커가 있다고 문자가 가지 않는다 — 추출한 목적은 `inCallSms/smsDelivery.ts`의 단일 통로(같은 `resolveSmsGate`)를
// 통과해야 도착한다.
const SMS_MARKER_PATTERN = /\[\[\s*SMS\s*:\s*([a-z_]*)\s*\]\]/gi;

/**
 * LLM 완성 텍스트에서 `[[SMS:*]]` 마커를 **전부** 지우고(참가자는 원문을 보지 않는다) 첫 마커의 목적 원값을
 * 돌려준다(검증은 게이트가 한다 — enum 밖 값도 그대로 넘겨 `not_allowed` 로그로 남긴다). 마커가 없으면 원문 그대로.
 * ⛔ 사용자 입력에는 호출하지 않는다 — 사용자 입력의 흉내는 `promptAssembly.ts` `escapeSentinelLookalikes`가 LLM 전달 전에 무력화한다.
 */
export function extractSmsMarker(text: string): { text: string; purpose?: string; markerCount: number } {
  let purpose: string | undefined;
  let markerCount = 0;
  const cleaned = text
    .replace(SMS_MARKER_PATTERN, (_match, raw: string) => {
      markerCount += 1;
      if (purpose === undefined) purpose = raw.toLowerCase();
      return "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([.,!?])/g, "$1")
    .trim();
  if (markerCount === 0) return { text, markerCount: 0 };
  return { text: cleaned, markerCount, ...(purpose !== undefined ? { purpose } : {}) };
}
