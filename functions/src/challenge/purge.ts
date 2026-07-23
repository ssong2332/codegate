// 챌린지 폐기 핵심 로직 (T36, ADR-0005 §Consequences "폐기 기계 재사용", AC-041).
//
// guardrails/purge.ts(T10)와 동일한 아키텍처 원칙(순수 집계 로직 + 의존성 주입된 부수효과 실행자)을
// 따르되, 챌린지는 세션과 달리 Storage 파일을 별도로 나열/삭제하지 않는다 — 이 태스크(T36)는
// Database.md §Storage Layout이 정의한 `users/{uid}/challenges/{cid}/voice_input.webm` 전용 업로드
// 경로/화면을 새로 만들지 않고, 대신 사용자1이 이미 완료해 둔 온보딩 세션 녹음(voiceInputStoragePath,
// functions/src/voice/index.ts)을 소스 오디오로 재사용해 챌린지 전용 ElevenLabs voice만 새로
// 발급한다(구현 보고서에 명시한 판단, Database.md와의 편차 — architect 확인 권장). 그 결과 챌린지가
// "소유"하는 유일한 삭제 대상은 스코프 고정된 ElevenLabs voice 하나뿐이다.
//
// overallResult 집계는 guardrails/purge.ts의 computeOverallResult를 그대로 재사용한다(중복 금지 —
// target 배열이 비어있으면 success, 전부 성공/전부 실패/일부 실패 판정 로직이 세션 폐기와 동일하다).
import type { DeletionResult, DeletionTarget } from "../shared/types";
import { computeOverallResult } from "../guardrails/purge";

export type ChallengePurgeDeps = {
  /** VoiceProvider.deleteVoice 위임. Mock은 no-op이지만 반드시 호출한다(AC-021/ADR-0003과 동일 원칙). */
  deleteVoice(voiceId: string): Promise<void>;
};

export type ChallengePurgeResult = {
  targets: DeletionTarget[];
  overallResult: DeletionResult;
};

/** 챌린지 voiceId 하나를 폐기한다. 실패해도 throw하지 않고 target을 failed로 기록한다(재시도 근거). */
export async function purgeChallengeArtifacts(
  voiceId: string,
  deps: ChallengePurgeDeps,
): Promise<ChallengePurgeResult> {
  const targets: DeletionTarget[] = [];
  try {
    await deps.deleteVoice(voiceId);
    targets.push({ kind: "elevenlabs_voice", ref: voiceId, result: "success" });
  } catch {
    targets.push({ kind: "elevenlabs_voice", ref: voiceId, result: "failed" });
  }
  return { targets, overallResult: computeOverallResult(targets) };
}

/** 기간제 자동 삭제 스캔(스케줄 함수, §14.3)이 "어떤 챌린지를 지울지" 판정하는 순수 로직만 분리했다
 * — Cloud Scheduler를 에뮬레이터에서 실제로 트리거하기 어려워(구현 보고서 참고), 이 함수만 fake
 * "now"로 유닛테스트하고 onSchedule 본체는 이 함수 + Firestore 쿼리 배선만 담당하게 했다. */
export type PurgeCandidate = { id: string; status: string; retentionDeleteAtMs: number };

export function selectChallengesToPurge(candidates: readonly PurgeCandidate[], nowMs: number): string[] {
  return candidates
    .filter((c) => c.status !== "deleted" && c.retentionDeleteAtMs <= nowMs)
    .map((c) => c.id);
}
