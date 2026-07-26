// Cloud Functions 진입점 — 배포 대상 함수는 모두 여기서 export한다.
// 폴더 = 트랙 경계(Architecture.md §2/§4). 각 함수 본문은 담당 트랙 모듈에서 채우고, 이 파일은
// 재export만 한다(T2 스캐폴딩 원칙 유지).

// Callable functions
// synthesizeDeepvoice는 2026-07-22에 제거됐다 — UX-014 통합 이후 호출하는 화면이 없고 본문이
// placeholder를 반환하는 상태였다(functions/src/voice/index.ts 상단 제거 이력 참고).
export { createVoiceClone } from "./voice";
export { createSession, endSession, updateMessengerSkin, requestEscalation } from "./session";
// 보이스→메신저 역방향 전이(T40 fast-follow, AC-039) — session 모듈에 함수 자체는 이미 있으므로
// export만 추가한다(기존 줄은 건드리지 않음, 다른 태스크와의 diff 충돌 회피).
export { requestReverseEscalation } from "./session";
export { sendMessage } from "./roleplay";
// 실시간 음성 통화 자격증명 발급(2026-07-22) — 브라우저가 ElevenLabs Agents와 직접 speech-to-speech
// 대화를 하되 API 키는 서버에만 두기 위한 서명 URL 발급 지점.
export { createRealtimeCall } from "./realtime";
// 실시간 통화 전사 제출(finding #1) — 음성 대화도 리포트가 분석하도록 종료 직전 클라가 제출한다.
export { submitRealtimeTranscript } from "./realtime/submitTranscript";
export { generateReport } from "./report";
// 즉시 되감기 판정(T70, UX-028/UF-009, AC-062/063) — 원 리포트를 읽기 전용으로만 참조하고
// reports/{rid}/rewindAttempts에만 append한다(ADR-0008, AC-007 불변식 보호).
export { judgeRewindAnswer } from "./rewind";
// 통화 중 문자(T68, UX-027/UF-008, ADR-0007, AC-059/060/061) — 문자 도착(실시간 경로)·확인 기록.
// 본문은 100% 서버 카탈로그(scenarios/inCallSms.ts)가 원천이며 클라가 내용을 주입할 경로가 없다.
export { deliverInCallSms, recordInCallSmsEvent } from "./inCallSms";
// 확인 시도 무력화(T83, UX-031/UF-011, ADR-0009, AC-071) — 확인 권유 도착·모의 재연결 기록.
// ⚠️ **실제 전화를 걸지 않는다**(AC-019): 두 함수 모두 통신·전화 관련 API 의존이 0건이고, 하는 일은
// Firestore write 1건 + 모델 지시 문자열 반환뿐이다. 창구명·번호는 100% 서버 카탈로그가 원천이다.
export { deliverVerifyOffer, deliverVerifyReconnect } from "./verifyIntercept";
// 인앱 모의 화면 상호작용(T84, UX-023 kind=`app-install`/UF-012, §15.9.6, AC-072/AC-073) —
// 목업이 열린 것·가짜 "권한 허용"에 응한 것을 세션 타임라인에 남긴다.
// ⚠️ **참가자 기기에 실제로 무언가가 설치되지 않는다**(AC-072): 이 함수의 요청·응답·스키마
// 어디에도 실 설치 파일·스토어 URL·실존 앱명·OS 권한 필드가 없고, 하는 일은 Firestore write 1건뿐이다.
export { recordMockScreenEvent } from "./mockScreens";
// 초급 사전 브리핑(T72, UX-029, §15.3.4, AC-066) — 세션 **시작 전** 화면에서만 소비되는 수법
// 라벨 조회. 대화 중 실시간 판정 경로는 신설하지 않는다(D-6 유지).
export { getBeginnerBriefing } from "./scenarios/beginnerBriefing";
// 2인 소셜 챌린지 — 사용자1 생성·클론 스코프·공유 링크(T36, Architecture.md §14, ADR-0005).
export { createChallenge, deleteChallenge, listMyChallenges } from "./challenge";
// 2인 소셜 챌린지 — 사용자2 동의·체험·신고·결과공유(T37, §14.7/ADR-0006). challenge/index.ts와
// 순환 참조를 피하려고 별도 모듈(userAccess.ts)에서 직접 export한다.
export {
  getChallengeLanding,
  consentChallenge,
  reportChallenge,
  setChallengeResultSharing,
} from "./challenge/userAccess";

// Trigger functions (클라 직접 호출 아님) — API.md `onSessionEnded` (Track C, T10, AC-021).
// 실제 정의는 functions/src/guardrails/index.ts(트리거 소유 모듈, Architecture.md §2)에 있다.
export { onSessionEnded } from "./guardrails";
// Scheduled function(클라 직접 호출 아님, 이 코드베이스 첫 onSchedule) — 챌린지 복제 음성 기간제
// 자동 삭제(T36, Architecture.md §14.3, ADR-0005 "폐기 기계 재사용").
export { purgeExpiredChallenges } from "./challenge";
