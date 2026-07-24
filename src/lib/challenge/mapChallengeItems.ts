// 챌린지 결과 열람(UX-020) 목록 표시용 순수 매핑 (Track A/C, T36, AC-043).
// Firestore Timestamp 등 SDK 타입에 의존하지 않는 순수 함수로 분리해 node:test로 검증한다
// (src/lib/history/mapHistoryItems.ts와 동일한 "부수효과와 로직 분리" 관례). 정렬은 호출부가
// createdAt desc로 미리 해서 넘긴다(이 함수는 순서를 바꾸지 않는다).

export type ChallengeStatus =
  | "pending"
  | "consented"
  | "in_progress"
  | "completed"
  | "expired"
  | "reported"
  | "deleted";

export type ChallengeSource = {
  challengeId: string;
  displayName: string;
  status: ChallengeStatus;
  resultSharingConsented: boolean;
  suspicionTimeLabel: string | null;
  createdAt: Date | null;
  // T49(#20 · MVP #20 · AC-055/OQ-31) — 옵셔널(부재→voice, 기존 호출부·테스트 무회귀).
  channel?: "voice" | "messenger";
  // T56(#23 · MVP #23 · AC-058/OQ-32) — 옵셔널(부재→clone, 기존 호출부·테스트 무회귀).
  voiceMode?: "clone" | "generic";
};

export type ChallengeListItem = {
  challengeId: string;
  displayName: string;
  dateLabel: string;
  statusLabel: string;
};

// UX-020 States "Success(항목별)" 표에 정의된 3가지 텍스트 그대로 — 색이 아니라 텍스트 라벨로만
// 상태를 구분한다(Accessibility 요구).
const COMPLETION_STATUSES: ReadonlySet<ChallengeStatus> = new Set(["completed", "reported"]);

export function mapChallengesToListItems(
  challenges: readonly ChallengeSource[],
): ChallengeListItem[] {
  return challenges
    // 수동/자동 폐기된 챌린지는 목록에서 사라진다(AC-041 — 삭제는 되돌릴 수 없다).
    .filter((challenge) => challenge.status !== "deleted")
    .map((challenge) => ({
      challengeId: challenge.challengeId,
      displayName: challenge.displayName,
      dateLabel: formatDateLabel(challenge.createdAt),
      statusLabel: resolveStatusLabel(challenge),
    }));
}

function resolveStatusLabel(challenge: ChallengeSource): string {
  if (!COMPLETION_STATUSES.has(challenge.status)) {
    return "상대가 아직 해보지 않았습니다";
  }
  // AC-043 — 사용자2가 결과 공유에 동의한 경우에만 상세(의심 시점)를 보여준다. 대화 전문은 이
  // 스키마에 애초에 없다(ChallengeDoc.resultSummary는 completed/suspicionTimeLabel 요약뿐).
  if (!challenge.resultSharingConsented) {
    return "상대가 완료했지만 결과 공유에 동의하지 않았습니다";
  }
  // T49(#20 · AC-055/OQ-31 · D-29) — 메신저 챌린지는 의심 시점을 절대 노출하지 않는다(완료
  // 여부만). 서버(deriveChallengeResultSummary)가 애초에 suspicionTimeLabel을 채우지 않지만,
  // 이 화면 텍스트 자체도 채널로 재확인해 "완료" 단독이 아닌 명시적 문구를 보여준다.
  // T56(#23 · AC-058/OQ-32 · D-34) — generic 보이스 챌린지도 메신저와 동일하게 완료 여부만
  // 표시한다(의심 시점 절대 노출 금지). clone 보이스 챌린지만 의심 시점 문구가 유효하다.
  const channel = challenge.channel ?? "voice";
  const voiceMode = challenge.voiceMode ?? "clone";
  if (channel === "messenger" || (channel === "voice" && voiceMode === "generic")) {
    return "완료 · 상대가 체험을 마침";
  }
  return challenge.suspicionTimeLabel
    ? `완료 · 의심 시점: 약 ${challenge.suspicionTimeLabel}`
    : "완료";
}

function formatDateLabel(date: Date | null): string {
  if (!date) return "날짜 미상";
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
