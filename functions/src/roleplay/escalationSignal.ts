// 구조화 트리거 신호(sentinel 토큰) 파싱 (T30, Architecture.md §13.2, DECISIONS #15, AC-034/024).
//
// linkMarker.ts와 동일한 패턴(어시스턴트 출력에만 있는 고정 제어 마커를 서버가 스캔·제거한 뒤
// 구조화된 의미로 변환) — 신규 메커니즘이 아니다. 이 함수는 **LLM 완성 텍스트(sendMessage 응답)
// 에만** 호출된다. 사용자 입력에는 절대 호출하지 않는다(AC-024) — 사용자 입력의 `[[SIGNAL:...]]`
// 흉내는 promptAssembly.ts의 escapeSentinelLookalikes가 LLM에 전달되기 전에 이미 무력화한다.
const SIGNAL_MARKER_PATTERN = /\[\[SIGNAL:([A-Z_]+)\]\]/g;
const ESCALATE_VOICE_SIGNAL = "ESCALATE_VOICE";

/**
 * 어시스턴트 완성 텍스트에서 `[[SIGNAL:*]]` 마커를 전부 찾아 텍스트에서 제거하고(사용자는 마커
 * 원문을 보지 않는다), 그중 `ESCALATE_VOICE`가 있었는지를 별도 boolean으로 반환한다. 마커가 없으면
 * 원문을 그대로 반환한다.
 */
export function extractEscalationSignal(text: string): { text: string; escalate: boolean } {
  let escalate = false;
  let found = false;

  // 매치가 하나라도 있었는지는 replace 콜백의 부수효과(found)로만 판정한다 — 전역(g) 정규식의
  // .test()/.exec() 상태(lastIndex)를 별도로 건드리지 않기 위해서다(재사용 시 상태 버그 방지,
  // linkMarker.ts와 동일하게 "매치 개수" 자체를 신뢰 근거로 삼는다).
  const cleaned = text
    .replace(SIGNAL_MARKER_PATTERN, (_match, signalName: string) => {
      found = true;
      if (signalName === ESCALATE_VOICE_SIGNAL) escalate = true;
      return "";
    })
    // linkMarker.ts와 동일한 마무리 정리 — 마커 제거로 생긴 연속 공백·구두점 앞 공백만 정리한다.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([.,!?])/g, "$1")
    .trim();

  if (!found) {
    return { text, escalate: false };
  }
  return { text: cleaned, escalate };
}
