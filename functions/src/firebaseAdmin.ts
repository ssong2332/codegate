// Firebase Admin SDK 초기화(단일 진입점, 공용 인프라 — 특정 트랙 전용 아님).
//
// T2/T19/T6 시점까지는 어떤 Functions 모듈도 admin Firestore를 직접 쓰지 않았다(T19 voice/index.ts는
// VoiceProvider 목업만 배선했고 Firestore write는 T4/T5로 미뤘다; T6 seed.ts는 배포 스크립트 안에서
// 자체적으로 initializeApp()을 호출하는 별도 실행 컨텍스트다). T7(sendMessage/createSession)이
// sessions/{sid}·messages 서브컬렉션을 실제로 읽고 쓰는 첫 콜러블이라 이 헬퍼를 추가한다.
//
// firebase-admin v14는 모듈형 API를 쓴다(`admin.firestore()` 네임스페이스 API는 동작하지 않는다 —
// functions/src/scenarios/seed.ts에서 이미 겪은 이슈, T6 메모 참고). Cloud Functions 런타임은 모듈이
// 콜드스타트 시 1회 로드되므로, 이 함수를 각 모듈 최상단에서 호출해도 `getApps().length` 가드 덕분에
// 중복 initializeApp() 호출 에러가 나지 않는다.
import { getApps, initializeApp } from "firebase-admin/app";

export function ensureFirebaseAdminApp(): void {
  if (getApps().length === 0) {
    initializeApp();
  }
}
