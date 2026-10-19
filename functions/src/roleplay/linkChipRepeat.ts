// 링크 칩 반복 부착 정리(PR-A3, 2026-10-20 — 감사 B 매트릭스 1일차 #4). 순수 함수.
//
// 증상: 모델이 `[[LINK:id]]` 마커를 매 응답에 붙여, 링크를 말하지 않는 대사("안녕하세요, 고객님. 배송 업무 담당자입니다.")에도
// 같은 칩이 4턴 연속 붙었다(parcel 3난이도 S0~S3 · subsidy S1~S3 등). 마커 추출(`linkMarker.ts`)은 그대로 두고(⛔ G161 —
// 전역 정규식 · 다중 마커 능력을 좁히지 않는다), **저장 직전**에 아래 표로 칩만 거른다.
//
// | 조건(위에서부터) | 결과 |
// |---|---|
// | 이번 응답에 칩 없음 | 없음(무변경) |
// | 칩의 랜딩이 이 세션 이전 사기범 메시지에 **아직 없다** | 붙인다(첫 칩 — 무변경) |
// | 이미 나온 랜딩이지만 이번 대사가 링크·앱을 가리킨다(`LINK_REFERENCE`) | 붙인다(재안내) |
// | 이미 나온 랜딩이고 이번 대사가 링크·앱을 가리키지 않는다 | **뺀다**(마커는 이미 텍스트에서 지워졌다) |
//
// - 칩 단위로 판정한다 — 한 응답의 서로 다른 랜딩 칩은 각자 표를 탄다(다중 마커 능력 유지).
// - ⛔ 첫 칩은 대사 내용과 무관하게 남긴다 — 빼면 링크 단계에 영영 도달하지 못할 수 있다(과소 부착이 반복보다 해롭다).
//   ⇒ 한계: 첫 칩이 링크를 말하지 않는 대사(예: 오프닝 인사)에 붙는 경우는 그대로다.
// - ⛔ 리포트 앵커(첫 칩을 실은 사기범 메시지 — `report/mockScreenTimeline.ts`)는 바뀌지 않는다 — 첫 칩은 빼지 않는다.
import type { MessageDoc, MessengerAttachment } from "../shared/types";

/** 대사가 링크·앱을 가리키는가 — 넓게 잡는다(넓으면 칩이 남을 뿐 = 종전 동작). */
export const LINK_REFERENCE =
  /링크|URL|url|접속|클릭|눌러|누르|설치|앱|어플|아래|여기서|여기에서|여기로|여기\s|이곳|페이지|사이트|신청서|화면/;

export function dropRepeatedLinkChips(
  attachments: readonly MessengerAttachment[] | undefined,
  replyText: string,
  history: ReadonlyArray<Pick<MessageDoc, "role" | "attachments">>,
): MessengerAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  const shownLandingIds = new Set(
    history
      .filter((message) => message.role === "scammer")
      .flatMap((message) => (message.attachments ?? []).map((attachment) => attachment.fakeLandingId)),
  );
  const refersToLink = LINK_REFERENCE.test(replyText);
  const kept = attachments.filter(
    (attachment) => !shownLandingIds.has(attachment.fakeLandingId) || refersToLink,
  );
  return kept.length > 0 ? kept : undefined;
}
