// 페르소나 권한 판별표 — 순수 상수 + 순수 함수 (Architecture.md §50.4.4, 사용자 라이브 신고
// ②(본인확인 + 즉답 압박) + ⑩ⓐⓑ(이름 단정·신원확인 요구) 대응).
//
// ⚠️ **판정 질문은 오직 하나**: *"이 페르소나가 신원을 밝히는 기관·기업·서비스의 담당자인가,
// 아니면 이미 참가자를 아는 지인인가, 아니면 신원을 밝히지 않는 협박범인가."* 이 축은 라이브에서
// 실제로 갈라야 하는 것(본인확인·이름 단정이 캐릭터와 부합하는가)과 정확히 일치해야 한다.
//
// ⛔ **기존 플래그를 재사용하지 않는다(근거를 남긴다, §50.4.4)**:
//   - `hasVerifyIntercept`(verifyIntercept.ts) = **근사값이지 판별자가 아니다.** 6종을 맞히지만
//     `messenger-parcel-smishing-sms`·`messenger-subsidy-smishing-sms`(둘 다 기관 사칭)를 "기관
//     아님"으로 오분류한다(카탈로그 미보유일 뿐 페르소나는 기관이다).
//   - `L3_DEPTH_TABLE`(l3Depth.ts) = **의미가 다르다.** 협박 2종이 `procedural`인데 기관이 아니다
//     (l3Depth.ts:50-51이 그 사실을 주석으로 이미 적고 있다).
// ⇒ 이름이 겹친다고 재사용하면 안 되고, 이 표를 새로 둔다.

export type PersonaAuthority = "institution" | "acquaintance" | "anonymous";

/**
 * ⚠️ 키는 `PUBLIC_SCENARIOS`와 **1:1이어야 한다**(`__tests__/personaAuthority.test.ts`의
 * `deepEqual` 게이트, `l3Depth.ts`와 같은 형태). 시나리오가 추가되면 이 표를 채우기 전까지
 * 테스트가 실패한다 — 조용한 누락 불가.
 *
 * ⚠️ 이 표는 처방(prescription)이지 서술(description)이 아니다(`l3Depth.ts:13-15` 관례 계승).
 */
export const PERSONA_AUTHORITY: Record<string, PersonaAuthority> = {
  // ── institution 8종 — 신원을 밝히는 기관·기업·서비스의 담당자를 사칭 ─────────────
  "institutional-impersonation": "institution",
  "card-company-impersonation": "institution",
  "loan-refinance-scam": "institution",
  "tax-refund-scam": "institution",
  "courier-customs-scam": "institution",
  "bank-security-verify-scam": "institution",
  "messenger-parcel-smishing-sms": "institution",
  "messenger-subsidy-smishing-sms": "institution",
  // ── acquaintance 4종 — 가족·지인 사칭(이름을 이미 아는 사이라 본인확인 자체가 성립하지 않는다) ──
  "family-accident-deepvoice": "acquaintance",
  "grandchild-impersonation": "acquaintance",
  "messenger-child-impersonation-kakao": "acquaintance",
  "messenger-friend-loan-kakao": "acquaintance",
  // ── anonymous 2종 — 신원을 밝히지 않는 협박범(본인확인·이름 단정 둘 다 캐릭터를 깬다) ─────────
  "kidnapping-threat": "anonymous",
  "reputation-blackmail-scam": "anonymous",
};

/** 선행 요구로 본인확인 항목을 확인해도 캐릭터와 부합하는가(institution만 true). */
export function asksIdentityCheck(scenarioId: string): boolean {
  return PERSONA_AUTHORITY[scenarioId] === "institution";
}
