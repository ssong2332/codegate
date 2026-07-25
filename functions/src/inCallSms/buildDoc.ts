// 카탈로그 항목 → Firestore 문서 변환 (T68). 부수효과 없는 순수 함수라 단위 테스트 대상이다.
import type { InCallSmsItem } from "../scenarios/inCallSms";
import type { InCallSmsDoc } from "../shared/types";

/**
 * ⚠️ **여기서 나가는 필드가 곧 클라가 볼 수 있는 전부다**(AC-060 구조적 금지의 마지막 관문).
 * `url` 같은 실 네비게이션 필드는 소스 타입(`InCallSmsItem`)에도 없고 여기서도 만들지 않는다 —
 * 링크는 `linkDisplayText` + `fakeLandingId`(기존 인앱 가짜 랜딩 참조)로만 표현된다.
 * `announceInstruction`(모델용 지시)은 **문서에 쓰지 않는다** — 그건 프롬프트 재료이지 사용자가
 * 볼 문자 내용이 아니다(AC-024 "프롬프트 클라 미노출" 계승).
 */
export function buildInCallSmsDoc(
  item: InCallSmsItem,
  arrivedAt: FirebaseFirestore.Timestamp,
): InCallSmsDoc {
  return {
    smsId: item.smsId,
    kind: item.kind,
    senderLabel: item.senderLabel,
    body: item.body,
    // 종류별 필드는 해당 kind일 때만 채운다(부재를 판별자로 오버로드하지 않되, 무의미한 빈 값도
    // 만들지 않는다 — kind가 유일한 판별자다, §14.9.1 원칙).
    ...(item.kind === "otp" && item.otpCode ? { otpCode: item.otpCode } : {}),
    ...(item.kind === "link" && item.linkDisplayText
      ? { linkDisplayText: item.linkDisplayText }
      : {}),
    ...(item.kind === "link" && item.fakeLandingId ? { fakeLandingId: item.fakeLandingId } : {}),
    arrivedAt,
  };
}
