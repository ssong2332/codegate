// ElevenLabs 클론 + TTS (Track A, T4/T5). API.md `createVoiceClone`/`synthesizeDeepvoice` 1:1.
// T19: 두 콜러블을 `VoiceProvider` 인터페이스(provider.ts) 뒤의 `getVoiceProvider()`로 배선했다
// — 지금은 항상 MockVoiceProvider가 선택된다(ElevenLabs 키 미준비, OQ-14). 이렇게 하면
// Storage/Firestore 연동(T4/T5) 없이도 콜러블 자체는 "unimplemented"가 아니라 실제로 동작하는
// 목업 응답을 반환해 트랙 A 후속(T4/T5)과 프론트를 언블록한다.
//
// T4: createVoiceClone에 ① Storage `voice_input.webm` 존재 확인(제출된 sessionId가 온보딩
// "사전 세션 id"일 수 있어 sessions/{sid} 문서가 아직 없을 수 있다 — src/lib/recording/
// pendingSession.ts 참고) ② provider.createClone() 호출 ③ `sessions/{sid}`에 voiceId/cloneStatus
// 반영(문서가 없으면 최소 필드로 생성 — scenarioId는 아직 모르므로 생략, createSession이 시나리오
// 선택 후 같은 문서를 채택해 보강한다)을 채웠다.
// TODO(T5): ① 시나리오 `deepvoiceLines`에서 `lineId`로 실제 대사 원문 조회(클라가 임의 문장
// 합성 불가) ② provider.synthesize() 결과를 Storage `.../synth/{artifactId}.mp3`에 admin write
// ③ `sessions/{sid}/artifacts/{artifactId}` 메타 write(AC-022, 폐기 매니페스트).
// TODO(T1/T4): ElevenLabs 키 준비되면 provider.ts의 getVoiceProvider()만 교체 — 이 파일은 불변.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { getVoiceProvider } from "./provider";
import type {
  CreateVoiceCloneRequest,
  CreateVoiceCloneResponse,
  SynthesizeDeepvoiceRequest,
  SynthesizeDeepvoiceResponse,
} from "./types";

ensureFirebaseAdminApp();

// Database.md §Storage Layout `users/{uid}/sessions/{sid}/voice_input.webm` 1:1(고정 파일명 —
// src/app/onboarding/record/page.tsx가 업로드하는 경로와 동일해야 한다).
export function voiceInputStoragePath(uid: string, sessionId: string): string {
  return `users/${uid}/sessions/${sessionId}/voice_input.webm`;
}

export const createVoiceClone = onCall<CreateVoiceCloneRequest, Promise<CreateVoiceCloneResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { sessionId } = request.data ?? {};
    if (!sessionId) {
      throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
    }
    const uid = request.auth.uid;

    const db = getFirestore();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const existingSnap = await sessionRef.get();
    // API.md Auth: "sid 소유 uid == caller". 온보딩 사전 id는 보통 아직 문서가 없어 통과하지만,
    // 이미 다른 uid가 점유한 sessionId(충돌/재사용 시도)는 여기서 차단한다.
    if (existingSnap.exists && existingSnap.data()?.uid !== uid) {
      throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
    }

    // 처리① Storage에서 녹음 read(API.md) — Mock은 실제 바이트가 필요 없어 존재 확인만 하고
    // 경로만 provider에 넘긴다. 실 ElevenLabs 구현체가 바이트가 필요하면 provider.ts의
    // voiceInputStoragePath 계약을 그대로 활용해 다운로드를 추가하면 된다(인터페이스 불변).
    const storagePath = voiceInputStoragePath(uid, sessionId);
    const [recordingExists] = await getStorage().bucket().file(storagePath).exists();
    if (!recordingExists) {
      throw new HttpsError(
        "failed-precondition",
        "녹음 파일을 찾을 수 없습니다. 먼저 본인 목소리를 녹음해 주세요.",
      );
    }

    // 처리② VoiceProvider 클론 생성(현재 Mock, T19).
    const provider = getVoiceProvider();
    const result = await provider.createClone({ sessionId, uid, voiceInputStoragePath: storagePath });
    const cloneStatus = result.cloneStatus === "ready" ? "ready" : "failed";

    // 처리③ sessions/{sid} 반영. scenarioId는 이 시점엔 아직 모른다(시나리오 선택 전) —
    // Database.md의 "required"는 완성된 세션 기준이며, 지금은 클론 진행 중인 부분 상태다.
    const patch = {
      uid,
      voiceId: result.voiceId,
      cloneStatus,
      voiceProvider: result.isMock ? ("mock" as const) : ("elevenlabs" as const),
      // 이 콜러블에 도달했다는 것 자체가 녹음(UX-002, 본인 확인 체크박스 통과)까지 마쳤다는 뜻이다
      // (createSession의 동일 가정 패턴, functions/src/session/index.ts NOTE 참고).
      identitySelfConfirmed: true,
    };
    if (existingSnap.exists) {
      await sessionRef.set(patch, { merge: true });
    } else {
      await sessionRef.set(
        { sessionId, status: "created", createdAt: Timestamp.now(), ...patch },
        { merge: true },
      );
    }

    if (cloneStatus !== "ready") {
      throw new HttpsError("internal", "음성 클론 생성에 실패했습니다.");
    }

    return {
      voiceId: result.voiceId,
      cloneStatus: "ready",
      isMock: result.isMock,
    };
  },
);

export const synthesizeDeepvoice = onCall<
  SynthesizeDeepvoiceRequest,
  Promise<SynthesizeDeepvoiceResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, lineId } = request.data ?? {};
  if (!sessionId || !lineId) {
    throw new HttpsError("invalid-argument", "sessionId와 lineId가 필요합니다.");
  }
  const uid = request.auth.uid;

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const existingSnap = await sessionRef.get();
  // API.md Auth: "sid 소유 uid == caller" — createVoiceClone/createSession/endSession과 동일한
  // 소유권 검증 패턴(보안 하드닝, T5 자가점검에서 발견된 갭 해소). 이 read는 TODO(T5)의
  // sessions/{sid}.voiceId 조회가 구현되면 재사용해 중복 read를 피할 수 있다.
  if (existingSnap.exists && existingSnap.data()?.uid !== uid) {
    throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
  }

  const provider = getVoiceProvider();
  // TODO(T5): voiceId는 sessions/{sid}.voiceId를 조회해서 넘겨야 한다(지금은 T4 미구현이라
  // Mock 전용 placeholder를 쓴다 — Mock은 voiceId 내용을 실제로 사용하지 않는다).
  const synthesis = await provider.synthesize({
    sessionId,
    voiceId: "mock-voice-input-not-yet-wired",
    text: `(TODO T5: lineId=${lineId} 대사 원문을 시나리오에서 조회해 전달)`,
  });

  const artifactId = `mock-artifact-${sessionId}-${lineId}-${Date.now()}`;

  return {
    audioUrl: synthesis.audioUrl,
    artifactId,
    synthetic: true,
    syntheticLabel: synthesis.syntheticLabel,
    isMock: synthesis.isMock,
  };
});
