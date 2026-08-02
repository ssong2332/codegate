// challenge 모듈 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1 대응
// (Architecture.md §14, ADR-0005, T36). API.md에는 아직 반영 안 됨 — architect 확인/문서 갱신 권장
// (createSession의 sessionId 필드 등 기존 선례와 동일한 "서버 코드가 문서보다 먼저 나간" 패턴).
import type { ChallengeReportReason, ChallengeStatus, MessengerChannel } from "../shared/types";
import type { DifficultyLevel } from "../shared/difficulty";
import type { VoiceMode } from "../scenarios/publicMeta";

// --- createChallenge (UX-019 · AC-041/044/048/049) ---
// difficultyLevel(T72 추가, 옵셔널·하위호환, §15.3.2/UX-029/AC-064) — 발신자가 고른, **수신자가 겪을**
// 강도. 서버가 enum 검증 후 챌린지 문서에 기록하고 consentChallenge가 사용자2 체험 세션에 복사한다.
export type CreateChallengeRequest = {
  scenarioId: string;
  displayName: string;
  difficultyLevel?: DifficultyLevel;
};
export type CreateChallengeResponse = {
  challengeId: string;
  /** 평문 토큰 — 이 응답에서 1회만 반환된다. 서버는 SHA-256 해시만 저장한다(§14.4). */
  shareToken: string;
  /** ISO 문자열 — Firestore Timestamp를 그대로 onCall 응답에 실을 수 없어 변환한다. */
  linkExpiresAt: string;
};

// --- deleteChallenge (UX-020 수동 삭제 · AC-041) ---
export type DeleteChallengeRequest = {
  challengeId: string;
};
export type DeleteChallengeResponse = {
  status: "deleted";
};

// --- listMyChallenges (UX-020 목록 · AC-041/043, T31급 리뷰 Critical #1 수정) ---
// reviewer 발견: 이전엔 클라가 challenges 컬렉션을 직접 read해(firestore.rules creatorUid 소유자
// read 허용) voiceId·linkTokenHash까지 그대로 브라우저로 전송되고 있었다 — ADR-0005 §14.2
// "raw voiceId를 반환하는 경로가 어디에도 없다(사용자1·사용자2 공통)"를 정면 위반. 이 콜러블이
// resolveChallengeByTokenHash와 동일한 원칙(민감 필드는 서버가 절대 응답에 싣지 않는다)으로
// 목록을 안전하게 가공해 반환하고, firestore.rules는 challenges read를 전면 거부로 좁혔다(index.ts
// 참고) — 이제 이 콜러블이 유일한 조회 경로다.
export type ListMyChallengesRequest = Record<string, never>;
export type ListMyChallengesItem = {
  challengeId: string;
  displayName: string;
  status: string;
  resultSharingConsented: boolean;
  suspicionTimeLabel: string | null;
  /** ISO 문자열 — Firestore Timestamp를 그대로 onCall 응답에 실을 수 없어 변환한다. */
  createdAt: string | null;
  /** T47 추가(#20, §14.8.3) — 부재→"voice". 메신저 챌린지는 suspicionTimeLabel이 항상 null임을
   * 클라 표시 로직(UX-020 D-29)이 채널로 재확인할 수 있게 한다. */
  channel: MessengerChannel;
  /** T56 추가(#23, §14.9.3) — 부재→"clone". generic 보이스 챌린지도 suspicionTimeLabel이 항상
   * null임을 클라 표시 로직(UX-020 D-34)이 재확인할 수 있게 한다. */
  voiceMode: VoiceMode;
};
export type ListMyChallengesResponse = {
  challenges: ListMyChallengesItem[];
};

// --- getChallengeLanding (T37 · UX-021 · AC-040/048, §14.7.5) ---
// 사용자2 진입(무로그인·토큰). 소모하지 않는다(크롤러 선fetch 방지, §14.4). 음성·voiceId·scenario
// 상세는 절대 반환하지 않는다(서프라이즈 유지 + AC-041 추출 차단).
export type GetChallengeLandingRequest = { token: string };
export type GetChallengeLandingResponse = {
  displayName: string;
  status: ChallengeStatus;
  expired: boolean;
  /** T47 추가(#20, §14.8.2) — 부재 없이 항상 확정값("voice"|"messenger")을 반환한다. 클라(UX-021)
   * 가 동의 후 UX-014(voice) vs UX-022(messenger)로 분기하는 데 쓴다(D-28). */
  channel: MessengerChannel;
  /** T72 추가(§15.3.2, UX-021/AC-040/064) — 발신자가 고른 강도(부재→"intermediate"). 동의 **전에**
   * 표시해 사전 동의의 정보량을 늘린다(특히 고급이면 "강한 압박이 이어질 수 있습니다" 고지).
   * ⚠️ 난이도는 동의 게이트를 우회·완화·게이팅하지 않는다(D-42/AC-065) — 표시 정보만 늘린다.
   * 비민감 필드다(voiceId/linkTokenHash와 달리 반환해도 AC-041 위반이 아니다). */
  difficultyLevel: DifficultyLevel;
};

// --- consentChallenge (T37 · UX-021 · AC-040/048, §14.7.5) ---
// 익명 사인인 후 호출(§14.7/ADR-0006 A1). openingAudioUrl은 API.md 명시 계약엔 아직 없지만
// createSession.openingAudioUrl과 동일한 선례(비차단 합성, 실패 시 필드 자체 생략)를 따른다.
export type ConsentChallengeRequest = { token: string };
export type ConsentChallengeResponse = {
  sessionId: string;
  openingAudioUrl?: string;
  // 사용자 신고(2026-07-24) 수정분 — generateOpeningLine 결과 텍스트를 ElevenLabs 세션의
  // firstMessage로 쓰기 위해 반환한다(resume 시에는 새 오프닝을 만들지 않아 비어 있음).
  // 실제로는 userAccess.ts 핸들러가 신설 당시부터 이 필드를 반환해 왔고 클라 타입
  // (src/lib/api/types.ts)에는 이미 있었는데, 이 서버 타입에만 누락돼 있었다(타입 검사가
  // 못 잡는 드리프트 — §48 architect 감사에서 발견, 소급 정정).
  openingMessageText?: string;
};

// --- reportChallenge (T37 · UX-021 · AC-049) ---
export type ReportChallengeRequest = {
  token: string;
  reason: ChallengeReportReason;
  note?: string;
};
export type ReportChallengeResponse = { status: "reported" };

// --- setChallengeResultSharing (T37 · UX-018 · AC-043) ---
export type SetChallengeResultSharingRequest = { token: string; share: boolean };
export type SetChallengeResultSharingResponse = { shared: boolean };
