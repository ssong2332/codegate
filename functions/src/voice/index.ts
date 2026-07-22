// ElevenLabs 클론 (Track A, T4). API.md `createVoiceClone` 1:1.
// T19: 콜러블을 `VoiceProvider` 인터페이스(provider.ts) 뒤의 `getVoiceProvider()`로 배선했다
// — 지금은 항상 MockVoiceProvider가 선택된다(ElevenLabs 키 미준비, OQ-14). 이렇게 하면
// Storage/Firestore 연동 없이도 콜러블 자체는 "unimplemented"가 아니라 실제로 동작하는
// 목업 응답을 반환해 프론트를 언블록한다.
//
// T4: createVoiceClone에 ① Storage `voice_input.webm` 존재 확인(제출된 sessionId가 온보딩
// "사전 세션 id"일 수 있어 sessions/{sid} 문서가 아직 없을 수 있다 — src/lib/recording/
// pendingSession.ts 참고) ② provider.createClone() 호출 ③ `sessions/{sid}`에 voiceId/cloneStatus
// 반영(문서가 없으면 최소 필드로 생성 — scenarioId는 아직 모르므로 생략, createSession이 시나리오
// 선택 후 같은 문서를 채택해 보강한다)을 채웠다.
// TODO(T1/T4): ElevenLabs 키 준비되면 provider.ts의 getVoiceProvider()만 교체 — 이 파일은 불변.
//
// **제거 이력(2026-07-22)**: `synthesizeDeepvoice` 콜러블을 삭제했다. UX-014 통합 이후 오프닝
// 음성은 createSession이 반환하는 openingAudioUrl로, 통화 중 음성은 실시간 speech-to-speech
// (functions/src/realtime)로 처리하게 되면서 호출하는 화면이 하나도 남지 않았다. 게다가 본문이
// 끝내 placeholder(`voiceId: "mock-voice-input-not-yet-wired"`, 대사 원문 대신 TODO 문자열)를
// 반환하는 상태였어서, 배포된 채로 두면 언젠가 그 가짜 응답이 화면에 실릴 위험이 있었다.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { getVoiceProvider } from "./provider";
import type { CreateVoiceCloneRequest, CreateVoiceCloneResponse } from "./types";

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

