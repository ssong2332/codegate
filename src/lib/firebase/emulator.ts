// 로컬 에뮬레이터 사용 여부 — 프로토타입 단계 공통 플래그(auth/firestore/storage/functions
// 초기화 파일이 모두 참조). 사용자 결정(2026-07-21): 실 Firebase 프로젝트 연결 전까지는
// 로컬 에뮬레이터로 개발을 진행한다. 새 환경변수 없이 Next.js가 자동으로 설정하는
// NODE_ENV만으로 판단해 프로덕션 빌드에서는 절대 에뮬레이터를 바라보지 않게 한다.
export const useEmulator = process.env.NODE_ENV !== "production";
