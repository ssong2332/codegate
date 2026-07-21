// 생성물 즉시 폐기 핵심 로직 (Track C, T10). API.md `onSessionEnded`/ADR-0003/AC-021.
//
// 순수 집계 함수(computeOverallResult, sessionStoragePrefix)는 Firestore/Storage 없이 유닛
// 테스트 가능하다. purgeSessionArtifacts는 의도적으로 부수효과(Storage 나열/삭제, ElevenLabs
// voice 삭제)를 PurgeDeps로 주입받는 구조로 짰다 — (a) 프로덕션에서는 guardrails/index.ts가 실제
// Storage/VoiceProvider 구현을 주입하고, (b) 유닛 테스트에서는 가짜(fake) 구현을 주입해 target별
// success/partial/failed 집계 로직(ADR-0003 "부분 실패 처리")을 에뮬레이터 없이 검증한다
// (analyzeConversation.ts가 세운 "순수 로직과 부수효과 분리" 관례와 동일 원칙, T9 참고).
import type { DeletionResult, DeletionTarget } from "../shared/types";

/**
 * Database.md Storage Layout 컨벤션과 1:1(voice/index.ts의 voiceInputStoragePath와 동일 규칙,
 * `users/{uid}/sessions/{sid}/` 하위 전체 — 녹음 원본 + 합성 오디오 + 사칭 이미지).
 */
export function sessionStoragePrefix(uid: string, sessionId: string): string {
  return `users/${uid}/sessions/${sessionId}/`;
}

/** target별 result를 종합해 deletionLogs.overallResult를 산출한다(ADR-0003 "target별 결과 기록"). */
export function computeOverallResult(targets: DeletionTarget[]): DeletionResult {
  if (targets.length === 0) return "success"; // 지울 대상이 애초에 없던 경우(예: 클론 전 종료) — 실패 아님.
  const successCount = targets.filter((t) => t.result === "success").length;
  if (successCount === targets.length) return "success";
  if (successCount === 0) return "failed";
  return "partial";
}

export type PurgeDeps = {
  /**
   * prefix 하위 Storage 객체 경로를 나열한다. `sessions/{sid}/artifacts` 서브컬렉션(폐기 매니페스트,
   * Database.md/API.md)이 아니라 **Storage 실제 상태를 직접 나열**하는 쪽을 택했다 — artifacts
   * 서브컬렉션은 합성물(오디오/이미지)만 기록하도록 설계돼 있어(Database.md
   * `sessions/{sid}/artifacts` 스키마) 원본 녹음 `voice_input.webm`을 포함하지 않고, 게다가 T5가
   * 실제로 그 서브컬렉션에 문서를 쓴 적이 없어(T5 구현 보고서 known gap) 항상 비어 있다. Storage
   * prefix 나열은 두 문제를 모두 피하면서 Architecture.md §6.2("Storage
   * users/{uid}/sessions/{sid}/** 삭제")를 문자 그대로 만족한다.
   */
  listStorageFiles(prefix: string): Promise<string[]>;
  /** Storage 객체 1개 삭제. 실패 시 throw(개별 target을 failed로 기록하기 위함). */
  deleteStorageFile(path: string): Promise<void>;
  /** VoiceProvider.deleteVoice 위임 — Mock은 no-op(항상 성공)이지만 반드시 호출한다(AC-021, 실 ElevenLabs 교체 대비). */
  deleteVoice(voiceId: string): Promise<void>;
};

export type PurgeResult = {
  targets: DeletionTarget[];
  overallResult: DeletionResult;
};

/**
 * sessionId/uid의 생성물을 폐기한다. voiceId가 없으면(클론 완료 전 종료된 세션 등) ElevenLabs
 * target은 생략한다. 개별 target 실패가 전체 처리를 막지 않는다(ADR-0003 "부분 실패 처리").
 */
export async function purgeSessionArtifacts(
  sessionId: string,
  uid: string,
  voiceId: string | undefined,
  deps: PurgeDeps,
): Promise<PurgeResult> {
  const targets: DeletionTarget[] = [];

  // ① Storage 삭제 — users/{uid}/sessions/{sid}/** 전체(녹음·합성 오디오·이미지, Architecture.md §6.2).
  const prefix = sessionStoragePrefix(uid, sessionId);
  let files: string[] = [];
  try {
    files = await deps.listStorageFiles(prefix);
  } catch {
    // 목록 조회 자체가 실패하면 무엇이 있었는지 알 수 없다 — prefix 자체를 실패 target으로 기록해
    // 감사 로그에 남긴다(재시도 근거, ADR-0003).
    targets.push({ kind: "storage", ref: prefix, result: "failed" });
    files = [];
  }
  for (const path of files) {
    try {
      await deps.deleteStorageFile(path);
      targets.push({ kind: "storage", ref: path, result: "success" });
    } catch {
      targets.push({ kind: "storage", ref: path, result: "failed" });
    }
  }

  // ② ElevenLabs voice 삭제(외부 잔존 방지 — ADR-0003 "이게 핵심") — voiceId가 있을 때만 대상.
  if (voiceId) {
    try {
      await deps.deleteVoice(voiceId);
      targets.push({ kind: "elevenlabs_voice", ref: voiceId, result: "success" });
    } catch {
      targets.push({ kind: "elevenlabs_voice", ref: voiceId, result: "failed" });
    }
  }

  return { targets, overallResult: computeOverallResult(targets) };
}
