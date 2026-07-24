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
import { hasVerifiedAge } from "@/lib/age";
import { createVoiceClone } from "@/lib/api";
import {
  MAX_RECORDING_SECONDS,
  MIN_RECORDING_SECONDS,
  useVoiceRecorder,
  getOrCreatePendingSessionId,
  setIdentityConfirmed,
} from "@/lib/recording";
import { ProgressSteps, type ProgressStep } from "@/components/ui";

// 지정 대본(약 30초 낭독 분량) — UX.md UX-002 "지정된 30초 한국어 대본". 정확 대사 일치 검증은
// 하루 스코프 밖(UX.md Validation)이라 낭독 유도 목적의 고정 문구만 제공한다.
const SCRIPT_TEXT =
  "안녕하세요. 저는 지금부터 제 목소리로 인공지능 음성 클론을 만들어 보려고 합니다. " +
  "이 훈련은 가족을 사칭하는 보이스피싱 전화를 미리 겪어보고, 실제 상황에서 침착하게 " +
  "대처하는 연습을 하기 위한 것입니다. 아무리 다급하고 놀라운 소식을 전화로 듣더라도, " +
  "그 자리에서 돈을 보내지 않고 반드시 다른 방법으로 직접 확인하겠습니다.";

// 온보딩 진행 표시(디자인 시스템 "5 · 상단 진행 표시") — 이 화면(녹음)과 clone/wait(클론 대기)
// 두 화면에서만 노출한다(온보딩 플로우.dc.html의 2/3·3/3 진행바와 동일 스코프).
const ONBOARDING_STEPS: ProgressStep[] = [
  { label: "1/3 동의" },
  { label: "2/3 목소리 등록" },
  { label: "3/3 준비 완료" },
];

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
    (async () => {
      try {
        const granted = await hasGrantedConsent(user.uid);
        if (cancelled) return;
        if (!granted) {
          setGateState("redirecting");
          router.replace("/onboarding/consent");
          return;
        }
        // T14: 연령 확인(UX-011, AC-014)이 동의 다음·녹음 이전에 끼워 들어간다 — URL 직접 접근으로
        // age-gate를 건너뛰는 것을 막기 위해 기존 동의 확인 가드와 동일한 패턴으로 추가했다
        // (그 외 이 useEffect의 동의 확인 로직·상태 전이는 무변경).
        const ageVerified = await hasVerifiedAge(user.uid);
        if (cancelled) return;
        if (!ageVerified) {
          setGateState("redirecting");
          router.replace("/onboarding/age-gate");
          return;
        }
        setGateState("ok");
      } catch {
        if (!cancelled) setGateState("check-error");
      }
    })();
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        {gateState === "checking" && (
          <p className="text-[16px] text-[#6B655C]" role="status">
            확인 중입니다...
          </p>
        )}
        {gateState === "check-error" && (
          <p role="alert" className="flex items-center gap-2 text-[15px] text-[#C6392F]">
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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-7 bg-[#FAF8F5] px-6 pb-10 pt-10">
      <ProgressSteps steps={ONBOARDING_STEPS} currentIndex={1} />

      <div className="flex flex-col gap-3">
        <h1 className="text-[24px] font-bold leading-[1.35] text-[#22303A]">
          본인 목소리를
          <br />
          녹음해 주세요
        </h1>
        <p className="text-[15px] leading-[1.6] text-[#6B655C]">
          녹음한 목소리로 훈련용 가상 통화가 만들어져요. 아래 대본을 소리 내어 읽어 주세요 (약 30초).
        </p>
      </div>

      <section
        aria-labelledby="script-heading"
        className="rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-4"
      >
        <h2 id="script-heading" className="mb-2 text-[12px] font-bold tracking-[0.08em] text-[#6B655C]">
          30초 대본
        </h2>
        <p className="text-[16px] leading-[1.7] text-[#22303A]">{SCRIPT_TEXT}</p>
      </section>

      <label className="flex cursor-pointer select-none items-start gap-3 py-1">
        <input
          type="checkbox"
          checked={identityChecked}
          onChange={(event) => setIdentityChecked(event.target.checked)}
          disabled={recorder.status === "recording"}
          className="mt-0.5 h-8 w-8 shrink-0 rounded-[10px] accent-[#0E6B62] disabled:cursor-not-allowed"
          aria-describedby="identity-checkbox-label"
        />
        <span id="identity-checkbox-label" className="text-[15px] font-semibold leading-[1.5] text-[#22303A]">
          이 목소리는 본인의 것이며, 본인이 직접 녹음합니다.
        </span>
      </label>

      {/* 녹음 상태를 텍스트로도 안내(UX.md Accessibility — Screen Reader "녹음 중/완료"). */}
      <p aria-live="polite" ref={statusMessageRef} className="sr-only">
        {recorder.status === "recording" && "녹음 중입니다."}
        {recorder.status === "stopped" && "녹음이 완료되었습니다."}
      </p>

      <section className="flex flex-col items-center gap-3 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-5">
        {recorder.status === "idle" && (
          <>
            <button
              type="button"
              onClick={handleStart}
              disabled={!canRecord}
              aria-label="녹음 시작"
              className="flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-[#0E6B62] text-[17px] font-semibold text-white transition-colors hover:bg-[#0B564F] disabled:cursor-not-allowed disabled:bg-[#F2EFE9] disabled:text-[#C9C2B6]"
            >
              <span
                aria-hidden="true"
                className="h-[14px] w-[14px] rounded-full border-2 border-white bg-[#C6392F]"
              />
              녹음 시작
            </button>
            {!canRecord && (
              <p className="text-[14px] text-[#6B655C]">
                본인 확인 문항에 먼저 동의해야 녹음을 시작할 수 있습니다.
              </p>
            )}
          </>
        )}

        {recorder.status === "requesting-permission" && (
          <p className="flex items-center gap-2 text-[16px] text-[#22303A]" role="status">
            <span
              aria-hidden="true"
              className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-[#0E6B62]"
            />
            마이크 권한을 요청하는 중입니다...
          </p>
        )}

        {recorder.status === "recording" && (
          <>
            <div aria-hidden="true" className="mb-1 flex h-[28px] items-end gap-[3px]">
              {[0, 0.15, 0.3, 0.45, 0.6].map((delay) => (
                <span
                  key={delay}
                  className="call-wave-bar w-[4px] rounded-full bg-[#C6392F]"
                  style={{ height: "22px", animationDelay: `${delay}s` }}
                />
              ))}
            </div>
            <p className="flex items-center gap-2 font-mono text-[15px] tracking-wider text-[#C6392F]" role="status">
              <span aria-hidden="true">●</span>
              녹음 중 {formatTime(recorder.elapsedSeconds)} / {formatTime(MAX_RECORDING_SECONDS)}
            </p>
            <button
              type="button"
              onClick={recorder.stop}
              aria-label="녹음 정지"
              className="flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-[#C6392F] text-[17px] font-semibold text-white transition-colors hover:bg-[#A82F27]"
            >
              <span aria-hidden="true" className="h-[14px] w-[14px] rounded-[3px] bg-white" />
              녹음 정지
            </button>
          </>
        )}

        {(recorder.status === "permission-denied" ||
          recorder.status === "unsupported" ||
          recorder.status === "error") && (
          <>
            <p role="alert" className="flex items-center gap-2 text-[15px] text-[#C6392F]">
              <span aria-hidden="true">⚠</span>
              <span>{recorder.errorMessage}</span>
            </p>
            {recorder.status === "permission-denied" && (
              <button
                type="button"
                onClick={handleStart}
                disabled={!canRecord}
                className="min-h-[52px] w-full rounded-[14px] border-[1.5px] border-[#E2DDD3] text-[16px] font-semibold text-[#22303A] transition-colors hover:border-[#C9C2B6] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[#F2EFE9] disabled:text-[#C9C2B6]"
              >
                다시 시도
              </button>
            )}
          </>
        )}

        {recorder.status === "stopped" && recorder.audioUrl && (
          <>
            <div className="flex w-full flex-col gap-3 rounded-[16px] bg-[#E4F0EC] p-4">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-[#0E6B62]">
                <svg width="14" height="14" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 7L5.2 9.7L10.5 3.5"
                    stroke="#0E6B62"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                녹음 완료 ({formatTime(recorder.elapsedSeconds)})
              </p>
              <audio controls src={recorder.audioUrl} className="w-full" />
            </div>
            {recorder.elapsedSeconds < MIN_RECORDING_SECONDS && (
              <p className="text-[14px] text-[#6B655C]">
                녹음이 너무 짧습니다. 대본을 끝까지 읽고 다시 녹음해 주세요.
              </p>
            )}
            <div className="flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={recorder.reset}
                className="text-[14px] font-semibold text-[#6B655C] underline"
              >
                다시 녹음하기
              </button>
              <button
                type="button"
                onClick={handleCreateClone}
                disabled={!canCreateClone}
                className="flex min-h-[56px] w-full items-center justify-center rounded-[14px] bg-[#0E6B62] text-[17px] font-semibold text-white transition-colors hover:bg-[#0B564F] disabled:cursor-not-allowed disabled:bg-[#F2EFE9] disabled:text-[#C9C2B6]"
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
        <p role="alert" className="flex items-center gap-2 text-[15px] text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>{uploadError}</span>
        </p>
      )}
    </main>
  );
}
