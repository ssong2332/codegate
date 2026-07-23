// 스미싱 링크 마커 파싱 (T29, Architecture.md §13.2/13.4, AC-032/045).
//
// **왜 sentinel 토큰과 같은 패턴을 재사용하는가(판단 근거, 신규 메커니즘 아님)**: T26 architect가
// 확정한 `[[SIGNAL:ESCALATE_VOICE]]` 처리 방식 — 역할극 LLM의 **어시스턴트 출력에만** 있는 고정
// 제어 마커를 서버가 스캔·파싱한 뒤 **텍스트에서 제거**하고, 사용자에게는 마커 원문을 노출하지
// 않은 채 구조화된 의미(여기서는 attachments)로 변환해 클라에 돌려준다(§13.2) — 를 스미싱 링크
// 표현에도 그대로 적용한 것이다. 사용자 입력은 절대 신호로 해석하지 않는다는 원칙(AC-024)도
// 동일하게 적용된다 — 이 함수는 LLM 완성 텍스트(오프닝 대사·sendMessage 응답)에만 호출되고,
// 사용자 입력에는 호출되지 않는다(functions/src/roleplay/openingLine.ts·index.ts 참고).
import type { MessengerAttachment } from "../shared/types";

const LINK_MARKER_PATTERN = /\[\[LINK:([a-zA-Z0-9_-]+)\]\]/g;

// 콘텐츠(T27)가 정의한 고정 라벨 맵 — scenarioPrompts가 사용하는 fakeLandingId와 1:1.
// 매핑에 없는 id가 나오면(콘텐츠 오탈자 등) 조용히 실패하지 않고 기본 라벨로 대체한다.
const LINK_LABELS: Record<string, string> = {
  "parcel-redelivery": "재배송 신청 확인하기",
  "subsidy-apply": "지원금 신청하기",
};
const DEFAULT_LINK_LABEL = "확인하기";

/**
 * 어시스턴트 완성 텍스트에서 `[[LINK:id]]` 마커를 찾아 attachments로 변환하고, 텍스트에서는
 * 마커 자체를 제거한다(사용자는 마커 원문을 보지 않는다). 마커가 없으면 원문을 그대로 반환한다
 * (attachments 필드 없음).
 */
export function extractLinkMarker(text: string): {
  text: string;
  attachments?: MessengerAttachment[];
} {
  const attachments: MessengerAttachment[] = [];

  const cleaned = text
    .replace(LINK_MARKER_PATTERN, (_match, fakeLandingId: string) => {
      attachments.push({
        kind: "link",
        displayText: LINK_LABELS[fakeLandingId] ?? DEFAULT_LINK_LABEL,
        fakeLandingId,
        harmless: true,
      });
      return "";
    })
    // 마커 제거로 생긴 연속 공백·구두점 앞 공백만 정리한다(문장 구조 자체는 건드리지 않음).
    // 마커가 문장 끝("...확인해 주세요 [[LINK:id]].")에 있으면 제거 후 "확인해 주세요 ."처럼
    // 구두점 앞에 공백이 남는데, 이걸 마저 지운다.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([.,!?])/g, "$1")
    .trim();

  if (attachments.length === 0) {
    return { text };
  }
  return { text: cleaned, attachments };
}
