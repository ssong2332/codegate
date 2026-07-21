"use client";

// UX-002 본인 목소리 녹음 + 본인 확인 (Track C, T3, AC-020/AC-018).
// 진입 가드(AC-017): 동의(users/{uid}/consents) 없이는 이 화면에 머물 수 없다 — 동의 여부를
// 확인해 미동의 시 /onboarding/consent로 되돌린다(UX.md UX-002 Entry "UX-001 동의 완료").
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { useCurrentUser } from "@/lib/auth";
import { hasGrantedConsent } from "@/lib/consent";
import { createVoiceClone } from "@/lib/api";
import {
  MAX_RECORDING_SECONDS,
  MIN_RECORDING_SECONDS,
  useVoiceRecorder,
  getOrCreatePendingSessionId,
  setIdentityConfirmed,
} from "@/lib/recording";

// 지정 대본(약 30초 낭독 분량) — UX.md UX-002 "지정된 30초 한국어 대본". 정확 대사 일치 검증은
// 하루 스코프 밖(UX.md Validation)이라 낭독 유도 목적의 고정 문구만 제공한다.
const SCRIPT_TEXT =
  "안녕하세요. 저는 지금부터 제 목소리로 인공지능 음성 클론을 만들어 보려고 합니다. " +
  "이 훈련은 가족을 사칭하는 보이스피싱 전화를 미리 겪어보고, 실제 상황에서 침착하게 " +
  "대처하는 연습을 하기 위한 것입니다. 아무리 다급하고 놀라운 소식을 전화로 듣더라도, " +
  "그 자리에서 돈을 보내지 않고 반드시 다른 방법으로 직접 확인하겠습니다.";

type ConsentGateState = "checking" | "ok" | "redirecting" | "check-error";
type UploadStatus = "idle" | "uploading" | "cloning" | "error";

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function RecordPage() {
  const { user, loading: userLoading } = useCurrentUser();
  const router = useRouter();

  const [gateState, setGateState] = useState<ConsentGateState>("checking");
  const [identityChecked, setIdentityChecked] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const statusMessageRef = useRef<HTMLParagraphElement>(null);

  const recorder = useVoiceRecorder();

  useEffect(() => {
    if (userLoading || !user) return;
    let cancelled = false;
    hasGrantedConsent(user.uid)
      .then((granted) => {
        if (cancelled) return;
        if (granted) {
          setGateState("ok");
        } else {
          setGateState("redirecting");
          router.replace("/onboarding/consent");
        }
      })
      .catch(() => {
        if (!cancelled) setGateState("check-error");
      });
    return () => {
      cancelled = true;
    };
  }, [user, userLoading, router]);

  const handleStart = useCallback(() => {
    if (!identityChecked) return;
    void recorder.start();
  }, [identityChecked, recorder]);

  const handleCreateClone = useCallback(async () => {
    if (!user || !recorder.audioBlob || recorder.elapsedSeconds < MIN_RECORDING_SECONDS) return;
    setUploadStatus("uploading");
    setUploadError(null);
    const pendingSessionId = getOrCreatePendingSessionId();
    try {
      const path = `users/${user.uid}/sessions/${pendingSessionId}/voice_input.webm`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, recorder.audioBlob, {
        contentType: recorder.mimeType ?? "audio/webm",
      });
      setIdentityConfirmed(true);
    } catch {
      setUploadStatus("error");
      setUploadError("녹음 업로드에 실패했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
      return;
    }

    // T4: 업로드 직후 실제 createVoiceClone 콜러블 호출(AC-018) — 서버가 Storage 녹음 확인 →
    // VoiceProvider(현재 Mock, T19) → sessions/{sid}.voiceId/cloneStatus 반영까지 수행한다.
    setUploadStatus("cloning");
    try {
      await createVoiceClone({ sessionId: pendingSessionId });
      router.push("/clone/wait");
    } catch {
      setUploadStatus("error");
      setUploadError("목소리 클론 생성에 실패했습니다. 다시 시도해 주세요.");
    }
  }, [user, recorder.audioBlob, recorder.elapsedSeconds, recorder.mimeType, router]);

  if (gateState !== "ok") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        {gateState === "checking" && (
          <p className="text-lg text-gray-600" role="status">
            확인 중입니다...
          </p>
        )}
        {gateState === "check-error" && (
          <p role="alert" className="flex items-center gap-2 text-base text-red-700">
            <span aria-hidden="true">⚠</span>
            <span>동의 상태를 확인하지 못했습니다. 페이지를 새로고침해 주세요.</span>
          </p>
        )}
      </main>
    );
  }

  const canRecord = identityChecked;
  const canCreateClone =
    recorder.status === "stopped" &&
    recorder.elapsedSeconds >= MIN_RECORDING_SECONDS &&
    uploadStatus !== "uploading" &&
    uploadStatus !== "cloning";

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-bold">본인 목소리 등록</h1>

      <section aria-labelledby="script-heading" className="rounded border border-gray-300 p-4">
        <h2 id="script-heading" className="mb-2 text-lg font-semibold">
          아래 대본을 소리 내어 읽어 주세요 (약 30초)
        </h2>
        <p className="text-lg leading-relaxed">{SCRIPT_TEXT}</p>
      </section>

      <label className="flex min-h-[48px] items-start gap-3 rounded border border-gray-300 p-4 text-lg">
        <input
          type="checkbox"
          checked={identityChecked}
          onChange={(event) => setIdentityChecked(event.target.checked)}
          disabled={recorder.status === "recording"}
          className="mt-1 h-6 w-6 shrink-0"
          aria-describedby="identity-checkbox-label"
        />
        <span id="identity-checkbox-label">
          이 목소리는 본인의 것이며, 본인이 직접 녹음합니다.
        </span>
      </label>

      {/* 녹음 상태를 텍스트로도 안내(UX.md Accessibility — Screen Reader "녹음 중/완료"). */}
      <p aria-live="polite" ref={statusMessageRef} className="sr-only">
        {recorder.status === "recording" && "녹음 중입니다."}
        {recorder.status === "stopped" && "녹음이 완료되었습니다."}
      </p>

      <section className="flex flex-col items-center gap-4 rounded border border-gray-300 p-6">
        {recorder.status === "idle" && (
          <button
            type="button"
            onClick={handleStart}
            disabled={!canRecord}
            aria-label="녹음 시작"
            className="flex min-h-[56px] w-full max-w-xs items-center justify-center gap-2 rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            🎙 녹음 시작
          </button>
        )}
        {!canRecord && recorder.status === "idle" && (
          <p className="text-base text-gray-600">
            본인 확인 문항에 먼저 동의해야 녹음을 시작할 수 있습니다.
          </p>
        )}

        {recorder.status === "requesting-permission" && (
          <p className="flex items-center gap-2 text-lg" role="status">
            <span
              aria-hidden="true"
              className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
            />
            마이크 권한을 요청하는 중입니다...
          </p>
        )}

        {recorder.status === "recording" && (
          <>
            <p className="flex items-center gap-2 text-2xl font-bold text-red-700" role="status">
              <span aria-hidden="true">●</span>
              녹음 중 {formatTime(recorder.elapsedSeconds)} / {formatTime(MAX_RECORDING_SECONDS)}
            </p>
            <button
              type="button"
              onClick={recorder.stop}
              aria-label="녹음 정지"
              className="min-h-[56px] w-full max-w-xs rounded bg-red-600 px-6 py-3 text-lg font-bold text-white hover:bg-red-700"
            >
              정지
            </button>
          </>
        )}

        {(recorder.status === "permission-denied" || recorder.status === "unsupported" || recorder.status === "error") && (
          <>
            <p role="alert" className="flex items-center gap-2 text-base text-red-700">
              <span aria-hidden="true">⚠</span>
              <span>{recorder.errorMessage}</span>
            </p>
            {recorder.status === "permission-denied" && (
              <button
                type="button"
                onClick={handleStart}
                disabled={!canRecord}
                className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                다시 시도
              </button>
            )}
          </>
        )}

        {recorder.status === "stopped" && recorder.audioUrl && (
          <>
            <p className="text-lg font-semibold text-green-700">
              녹음 완료 ({formatTime(recorder.elapsedSeconds)})
            </p>
            <audio controls src={recorder.audioUrl} className="w-full max-w-xs" />
            {recorder.elapsedSeconds < MIN_RECORDING_SECONDS && (
              <p className="text-base text-gray-600">
                녹음이 너무 짧습니다. 대본을 끝까지 읽고 다시 녹음해 주세요.
              </p>
            )}
            <div className="flex w-full max-w-xs flex-col gap-3">
              <button
                type="button"
                onClick={recorder.reset}
                className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
              >
                재녹음
              </button>
              <button
                type="button"
                onClick={handleCreateClone}
                disabled={!canCreateClone}
                className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {uploadStatus === "uploading"
                  ? "업로드 중..."
                  : uploadStatus === "cloning"
                    ? "클론 생성 중..."
                    : "클론 생성"}
              </button>
            </div>
          </>
        )}
      </section>

      {uploadError && (
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>{uploadError}</span>
        </p>
      )}
    </main>
  );
}
