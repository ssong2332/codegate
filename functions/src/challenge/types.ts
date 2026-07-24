// challenge 모듈 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1 대응
// (Architecture.md §14, ADR-0005, T36). API.md에는 아직 반영 안 됨 — architect 확인/문서 갱신 권장
// (createSession의 sessionId 필드 등 기존 선례와 동일한 "서버 코드가 문서보다 먼저 나간" 패턴).
import type { ChallengeReportReason, ChallengeStatus } from "../shared/types";

// --- createChallenge (UX-019 · AC-041/044/048/049) ---
export type CreateChallengeRequest = {
  scenarioId: string;
  displayName: string;
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
};

// --- consentChallenge (T37 · UX-021 · AC-040/048, §14.7.5) ---
// 익명 사인인 후 호출(§14.7/ADR-0006 A1). openingAudioUrl은 API.md 명시 계약엔 아직 없지만
// createSession.openingAudioUrl과 동일한 선례(비차단 합성, 실패 시 필드 자체 생략)를 따른다.
export type ConsentChallengeRequest = { token: string };
export type ConsentChallengeResponse = {
  sessionId: string;
  openingAudioUrl?: string;
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
