// 폐기 트리거 · PII 마스킹 · 인젝션 방어 (Track C, T10/T11, AC-021/AC-024).
// 소유: Track C. 폐기 트리거 로직(이 파일 하단)은 T10이 채웠다. maskPII의 정규식 기반 토큰화는
// 이번 T11이 실구현했다(아래 커버 범위/알려진 한계 참고).
//
// maskPII는 Architecture.md §4가 명시한 크로스트랙 의존 해소법("C가 guardrails/maskPII(text):
// string을 먼저 passthrough 스텁으로 커밋 → A(T7)는 이를 import해 개발")을 따라 T7이 먼저
// passthrough 스텁으로 채워 넣었던 함수다. 이번 T11에서 시그니처(`maskPII(text: string): string`)는
// 그대로 두고 내부만 정규식 기반 토큰화로 교체했다 — roleplay/index.ts(sendMessage)가 이미 사용자
// 입력·LLM 응답 양쪽에 이 함수를 저장 직전 호출하고 있으므로(ADR-0004), 호출부를 건드리지 않아도
// 실제 마스킹이 즉시 적용된다.
//
// 커버 범위(Architecture.md §6.5/ADR-0004가 언급한 "전화번호·계좌형 숫자·주민번호형·금액·이름 후보"
// 중, 정규식으로 오탐 없이 식별 가능한 4종을 하카톤 스코프로 선정 — T11 태스크 지시와 동일):
//   1. 이메일 주소                              → [이메일]
//   2. 주민등록번호형(6자리-7자리, 예: 901231-1234567)     → [주민번호]
//   3. 전화번호형(예: 010-1234-5678, 01012345678, 02-123-4567) → [전화]
//   4. 위에 해당하지 않는 8자리 이상 연속 숫자(계좌번호형)     → [계좌]
// 적용 순서가 중요하다 — 더 구체적인 패턴(이메일→주민번호→전화)을 먼저 토큰화한 뒤, 남은 8자리
// 이상 숫자열을 계좌형으로 잡는다. 이미 토큰(`[전화]` 등)으로 치환된 구간은 숫자가 아니므로 뒤 단계
// 패턴에 재매칭되지 않는다.
//
// ⚠️ 알려진 한계(레드팀 스팟체크 결과, T11 구현 보고서 참고 — ADR-0004가 이미 "마스킹 오탐/미탐
// 가능"을 수용된 트레이드오프로 명시):
//   (1) 금액(예: "500만원")·이름 후보는 정규식만으로는 일반 숫자·흔한 단어와 구분이 안 돼 오탐률이
//       너무 높다 — 이번 하카톤 스코프에서 제외(다음 라운드 과제로 남김, NER 수준 처리 필요).
//   (2) 하이픈 없이 붙여 쓴 13자리 주민번호(예: "9012311234567")는 주민번호 패턴이 아니라 계좌형
//       패턴에 걸려 `[계좌]`로 라벨링된다 — 라벨은 다르지만 원문이 저장되지 않는 AC-024 핵심 요구
//       (마스킹/토큰화 자체)는 여전히 충족한다.
//   (3) 사용자가 숫자를 "공일공에 하나둘삼사에 오육칠팔" 처럼 문자로 풀어 쓰면 정규식으로 잡히지
//       않는다 — 구조적 방어(서버 조립 프롬프트·role 분리)와 별개의 잔존 리스크로, 실 LLM 단계에서
//       추가 완화가 필요하면 별도 태스크로 분리 권장.
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const RRN_PATTERN = /\b\d{6}-\d{7}\b/g;
const PHONE_PATTERN = /\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g;
const ACCOUNT_PATTERN = /\b\d[\d -]{6,}\d\b/g;

export function maskPII(text: string): string {
  let masked = text;
  masked = masked.replace(EMAIL_PATTERN, "[이메일]");
  masked = masked.replace(RRN_PATTERN, "[주민번호]");
  masked = masked.replace(PHONE_PATTERN, "[전화]");
  masked = masked.replace(ACCOUNT_PATTERN, (match) => {
    // ACCOUNT_PATTERN 자체가 "8자리 이상 연속 숫자"라는 의미상 제약을 문자 길이(대시/공백 포함
    // 8자 이상)로만 근사하므로, 실제 숫자 개수를 다시 세어 8자리 미만이면 원문을 그대로 둔다
    // (예: "1234-567"처럼 대시 포함 8자지만 숫자는 7개뿐인 경우 오탐 방지).
    const digitCount = match.replace(/[- ]/g, "").length;
    return digitCount >= 8 ? "[계좌]" : match;
  });
  return masked;
}

// --- 생성물 즉시 폐기 트리거 (T10, AC-021, ADR-0003, API.md `onSessionEnded`) ---
//
// Architecture.md §2 폴더 구조가 "guardrails/ = 폐기 트리거·PII 마스킹·인젝션 방어(C, T10/T11)"로
// 이 모듈에 트리거 소유권을 명시했으므로, session/index.ts(createSession/endSession)·
// report/index.ts(generateReport)와 동일한 패턴으로 실제 트리거 정의를 여기 두고
// functions/src/index.ts는 재export만 한다(진입점은 얇게 유지).
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { getVoiceProvider } from "../voice/provider";
import type { DeletionLogDoc, SessionDoc } from "../shared/types";
import { purgeSessionArtifacts, type PurgeDeps } from "./purge";

ensureFirebaseAdminApp();

/**
 * 실제 폐기 처리(부수효과 배선) — purge.ts의 순수 집계 로직에 실제 Storage/VoiceProvider 구현을
 * 주입하고, deletionLogs 기록 + session.voiceId 클리어까지 완료한다. `onSessionEnded` 트리거
 * 본체와 분리해 두어 에뮬레이터 검증 스크립트나 향후 수동 재시도 경로에서도 재사용 가능하다.
 */
export async function purgeSession(
  sessionId: string,
  uid: string,
  voiceId: string | undefined,
): Promise<DeletionLogDoc> {
  const bucket = getStorage().bucket();
  const provider = getVoiceProvider();

  const deps: PurgeDeps = {
    listStorageFiles: async (prefix) => {
      const [files] = await bucket.getFiles({ prefix });
      return files.map((file) => file.name);
    },
    deleteStorageFile: async (path) => {
      await bucket.file(path).delete();
    },
    deleteVoice: async (id) => {
      // AC-021 핵심 — Mock은 no-op이지만 반드시 호출해서, 실 ElevenLabsVoiceProvider로 교체된
      // 뒤에도(provider.ts 교체점) 이 호출 지점 자체는 그대로 동작하게 한다.
      await provider.deleteVoice(id);
    },
  };

  const { targets, overallResult } = await purgeSessionArtifacts(sessionId, uid, voiceId, deps);

  const db = getFirestore();
  const deletionLog: DeletionLogDoc = {
    sessionId,
    uid,
    deletedAt: Timestamp.now(),
    targets,
    overallResult,
  };
  await db.collection("deletionLogs").add(deletionLog);

  // session.voiceId 클리어(AC-021 "서버에 영구 저장되지 않는다") — target 일부가 실패해도 여기서는
  // 항상 클리어한다. 재시도가 필요하면 deletionLogs.targets[].ref가 원래 voiceId를 보존하고 있으므로
  // (ADR-0003 "재시도 가능하도록 결과를 target별로 남긴다"), session 문서 자체를 재시도 소스로 쓸
  // 필요가 없다. voiceId 필드가 원래 없던 세션(클론 전 종료)에도 안전한 no-op이다.
  await db.collection("sessions").doc(sessionId).update({ voiceId: FieldValue.delete() });

  return deletionLog;
}

/**
 * `sessions/{sid}.status`가 `ended`로 바뀌면 발화(Architecture.md §5/§6.2, ADR-0003, API.md
 * `onSessionEnded`). endSession/sendMessage(limit_reached)의 status write 자체가 이 트리거를
 * 유발한다 — 클라가 직접 호출하지 않는다.
 */
export const onSessionEnded = onDocumentUpdated("sessions/{sessionId}", async (event) => {
  const before = event.data?.before.data() as SessionDoc | undefined;
  const after = event.data?.after.data() as SessionDoc | undefined;
  if (!after || before?.status === after.status || after.status !== "ended") {
    return;
  }
  const sessionId = event.params.sessionId;
  try {
    const log = await purgeSession(sessionId, after.uid, after.voiceId);
    logger.info("onSessionEnded: 생성물 폐기 처리 완료", {
      sessionId,
      overallResult: log.overallResult,
      targetCount: log.targets.length,
    });
  } catch (err) {
    // purgeSession 내부의 개별 target 실패는 이미 deletionLogs에 partial/failed로 기록된다
    // (ADR-0003) — 이 catch는 그 기록 자체가 실패하는 것과 같은 진짜 예외 상황(Firestore 장애 등)
    // 대비다. 트리거를 다시 throw하면 Cloud Functions가 재시도를 반복하며 세션 종료 흐름과
    // 무관하게 노이즈를 만들 수 있어(triggerReportGeneration, report/index.ts와 동일 원칙) 흡수만
    // 하고 로그를 남긴다.
    logger.error("onSessionEnded: 폐기 트리거 처리 중 예외", { sessionId, err });
  }
});
