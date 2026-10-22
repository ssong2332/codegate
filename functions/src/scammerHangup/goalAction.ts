// §108(2026-10-22 사용자 결정 · 메인 세션 A안 · DECISIONS #223) — 끊기 판정표 4행의 "목표 화면 행동 완료" 입력(`goalActionDone`).
// 실시간 콜러블(`scammerHangup/index.ts`)과 텍스트 폴백(`roleplay/index.ts`)이 **이 파일 하나**를 부른다(AC-103 (f) "같은 조건").
//
// 판정표(위에서부터 · 하나라도 참이면 완료):
// | # | 서버 기록 | 뜻 |
// |---|---|---|
// | C-1 | 통화 중 문자 문서 `landingSubmittedAt` | 문자 링크가 연 화면(이체 · 신청)을 제출했다 |
// | C-2 | `mockScreens` 문서 `consentedAt` ∨ `submittedAt` | 앱 설치 화면 응낙 · 화면 제출(통화 중 설치 화면 포함) |
// ⛔ 클라 주장값 0(끊기 허용 범위를 넓히는 값은 서버 기록만 — §79.20 (0) 2). 읽기 실패는 미완료로 본다(4행 fail-closed).
import type { DeliveredSmsRecord } from "../inCallSms/smsGate";

/** `mockScreens` 문서에서 판정에 쓰는 사실 2개(시각 값의 존재만). */
export type MockScreenCompletion = { consented: boolean; submitted: boolean };

export function hasCompletedGoalAction(input: {
  delivered: readonly DeliveredSmsRecord[];
  mockScreens: readonly MockScreenCompletion[];
}): boolean {
  if (input.delivered.some((d) => d.landingSubmitted === true)) return true;
  return input.mockScreens.some((m) => m.consented || m.submitted);
}

/** 세션의 `mockScreens` 문서를 읽어 판정 사실만 남긴다. 실패는 호출부가 잡는다(미완료로 본다). */
export async function readMockScreenCompletion(
  sessionRef: FirebaseFirestore.DocumentReference,
): Promise<MockScreenCompletion[]> {
  const snap = await sessionRef.collection("mockScreens").get();
  return snap.docs.map((doc) => ({ consented: Boolean(doc.get("consentedAt")), submitted: Boolean(doc.get("submittedAt")) }));
}
