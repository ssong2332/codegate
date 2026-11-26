import type { ChallengeResultSummarySource } from "@/lib/api/types";

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
  // §144 — 소스 목소리 프로필('내 정보' 허브 사용처 수 · 부재 = 없음).
  voiceProfileId?: string | null;
  // U03 — 받은 사람이 공유에 동의했을 때만 서버가 싣는 요약(판정표 RS). 부재 · null = 없음.
  resultSummary?: ChallengeResultSummarySource | null;
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

/** 미완료 라벨 — 화면(`/challenge/results`)이 "대기" 배지로 바꾼다. */
export const PENDING_STATUS_LABEL = "상대가 아직 해보지 않았습니다";
/**
 * D6(2026-11-07 Edge 실사용 시험 판 33) — 링크 만료(3일)가 지난 미사용 챌린지. 서버 목록 콜러블이 `pending` ∧ 만료 경과를
 * `"expired"`로 내보낸다(`functions/src/challenge/consentGate.ts` `listedChallengeStatus`). 종전에는 이 상태도 미완료 라벨로 묶여
 * "대기"로 보였다. 화면이 "만료" 배지로 바꾼다.
 */
// D6 2차 — 동의만 하고 끝내지 않은 채 기한이 지난 챌린지도 "expired"로 온다. 동의한 본인은 보존기간 안에서 이어 할 수 있으므로
// "더 이상 열 수 없다"가 아니라 "새로 열 수 없다"로 쓴다.
export const EXPIRED_STATUS_LABEL = "링크 기한(3일)이 지나 새로 열 수 없습니다";

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
  if (challenge.status === "expired") return EXPIRED_STATUS_LABEL;
  if (!COMPLETION_STATUSES.has(challenge.status)) {
    return PENDING_STATUS_LABEL;
  }
  // AC-043 — 사용자2가 결과 공유에 동의한 경우에만 요약을 보여준다. 대화 전문은 이 스키마에 애초에 없다.
  if (!challenge.resultSharingConsented) {
    return "상대가 완료했지만 결과 공유에 동의하지 않았습니다";
  }
  return sharedResultLabel(challenge.resultSummary);
}

/** U03 판정표 RS 표시 — 공유 요약 → 한 줄. 요약이 없거나 U03 이전 공유(완료 여부만)면 종전 완료 문구.
 * 채널 · 음성 모드로 갈리지 않는다(사용자 결정 "세 종류 모두 동일" · 종전 AC-055 · OQ-32 숨김을 대체). */
export const SHARED_COMPLETED_ONLY_LABEL = "완료 · 상대가 체험을 마침";
export function sharedResultLabel(summary: ChallengeResultSummarySource | null | undefined): string {
  if (!summary?.outcome) return SHARED_COMPLETED_ONLY_LABEL;
  const parts = [summary.outcome === "held" ? "끝까지 속지 않았어요" : "중간에 넘어간 순간이 있었어요"];
  if (summary.paymentComplied) parts.push("송금 요구에 응했어요");
  const t = summary.suspicionTimeLabel;
  if (summary.defenseAction === "hangup" && t) parts.push(`${t}에 먼저 전화를 끊었어요`);
  if (summary.defenseAction === "screen_held" && t) parts.push(`${t}에 확인 질문에 사실대로 답해 거래를 멈췄어요`);
  if (summary.defenseAction === "official_check") parts.push("진짜 번호로 직접 확인했어요");
  const missed = summary.missedSignals ?? [];
  if (missed.length > 0) parts.push(`놓친 신호: ${missed.map((m) => `${m.tactic}(${m.timeLabel})`).join(", ")}`);
  return parts.join(" · ");
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
