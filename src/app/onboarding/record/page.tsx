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
  hasMessengerVoiceSelectReturn,
  getExperienceMode,
  getSelectedScenarioId,
} from "@/lib/recording";
import { resolveCloneReadyRoute } from "@/lib/recording/cloneReadyRoute";
import {
  VOICE_PROFILE_DEFAULT_RETENTION,
  VOICE_PROFILE_LABEL_MAX_LENGTH,
  VOICE_PROFILE_RETENTION_OPTIONS,
  setPendingVoiceProfileSave,
  voiceProfileConsentText,
  type VoiceProfileRetentionDays,
} from "@/lib/voices/voiceProfileConsent";
import { LoadingDots, ProgressSteps, type ProgressStep } from "@/components/ui";

// 지정 대본(1분 안 · 상황 11가지 · 201음절) — 목소리 복제가 억양까지 배우도록 감정 · 말투가 다른 문장을 고루 담는다.
// 판정표: 평서 · 질문 · 다급 · 걱정 · 기쁨 · 부탁 · 놀람 · 화남 · 숫자 · 짧은 대답 · 차분한 다짐.
// ⛔ 돈 · 이체 · 계좌 · 인증번호를 요구하는 문장은 넣지 않는다 — 본인 목소리 녹음이 그 자체로 악용될 수 있다.
// 정확 대사 일치 검증은 하지 않는다(UX.md Validation) — 낭독 유도 목적의 고정 문구다.
const SCRIPT_LINES: { cue: string; text: string }[] = [
  { cue: "또박또박", text: "안녕하세요. 지금부터 제 목소리를 천천히 녹음해 보겠습니다." },
  { cue: "묻듯이", text: "오늘 저녁에 떡볶이 먹을까? 혹시 내일 오후에 시간 괜찮아요?" },
  { cue: "다급하게", text: "잠깐만, 빨리 와 줘! 지금 정말 급하단 말이야!" },
  { cue: "걱정스럽게", text: "어떡하지... 너무 걱정돼서 아무것도 손에 안 잡혀." },
  { cue: "기쁘게", text: "와, 진짜 잘됐다! 정말 축하해!" },
  { cue: "미안한 듯", text: "미안해, 내가 실수했어. 한 번만 이해해 줄래?" },
  { cue: "놀라서", text: "뭐라고? 정말이야? 믿을 수가 없네." },
  { cue: "짜증 내듯", text: "아, 진짜 왜 그래! 그만 좀 해!" },
  { cue: "숫자를 또렷이", text: "약속은 오후 세 시 사십오 분이고, 번호는 공일공, 삼사오육, 칠팔구공이야." },
  { cue: "가볍게", text: "응, 알겠어. 아니야, 괜찮아." },
  { cue: "차분하게", text: "전화로 다급한 이야기를 들으면, 먼저 끊고 직접 확인하겠습니다." },
];

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

  // §144(DECISIONS #257 Q2) — 지인에게 보내기 녹음은 목소리 프로필로 저장해야만 쓸 수 있다. 녹음 뒤 어디로 가는지와
  // 같은 판정(cloneReadyRoute)으로 "보내기 녹음"을 가른다 → 이름 · 기간 · 보관 동의를 녹음 전에 받는다.
  const [isSendRecording] = useState(
    () =>
      resolveCloneReadyRoute({
        messengerVoiceSelectReturn: hasMessengerVoiceSelectReturn(),
        experienceMode: getExperienceMode(),
        scenarioId: getSelectedScenarioId(),
      }).kind === "challenge",
  );
  const [profileLabel, setProfileLabel] = useState("");
  const [retentionDays, setRetentionDays] = useState<VoiceProfileRetentionDays>(VOICE_PROFILE_DEFAULT_RETENTION);
  const [retentionConsented, setRetentionConsented] = useState(false);
  const profileFormOk = !isSendRecording || (retentionConsented && profileLabel.trim().length > 0);

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
    if (!identityChecked || !profileFormOk) return;
    void recorder.start();
  }, [identityChecked, profileFormOk, recorder]);

  const handleCreateClone = useCallback(async () => {
    if (!user || !recorder.audioBlob || recorder.elapsedSeconds < MIN_RECORDING_SECONDS) return;
    setUploadStatus("uploading");
    setUploadError(null);
    // §144 — clone/wait가 클론 준비 뒤 이 값으로 saveVoiceProfile을 부른다.
    if (isSendRecording) setPendingVoiceProfileSave({ label: profileLabel.trim(), retentionDays });
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
  }, [user, recorder.audioBlob, recorder.elapsedSeconds, recorder.mimeType, router, isSendRecording, profileLabel, retentionDays]);

  if (gateState !== "ok") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page p-8 text-center">
        {gateState === "checking" && (
          <p className="text-[18px] text-ink-sub" role="status">
            확인 중입니다...
          </p>
        )}
        {gateState === "check-error" && (
          <p role="alert" className="flex items-center gap-2 text-[17px] text-danger">
            <span aria-hidden="true">⚠</span>
            <span>동의 상태를 확인하지 못했습니다. 페이지를 새로고침해 주세요.</span>
          </p>
        )}
      </main>
    );
  }

  const canRecord = identityChecked && profileFormOk;
  const canCreateClone =
    recorder.status === "stopped" &&
    recorder.elapsedSeconds >= MIN_RECORDING_SECONDS &&
    uploadStatus !== "uploading" &&
    uploadStatus !== "cloning";

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-7 bg-page px-6 pb-10 pt-10">
      <ProgressSteps steps={ONBOARDING_STEPS} currentIndex={1} />

      <div className="flex flex-col gap-3">
        <h1 className="text-[24px] font-bold leading-[1.35] text-ink">
          본인 목소리를
          <br />
          녹음해 주세요
        </h1>
        <p className="text-[17px] leading-[1.6] text-ink-sub">
          녹음한 목소리로 훈련용 가상 통화가 만들어져요. 아래 대본을 괄호 속 말투를 살려 소리 내어 읽어 주세요 (1분 안).
        </p>
      </div>

      <section
        aria-labelledby="script-heading"
        className="rounded-[8px] border-[1.5px] border-line bg-white p-4"
      >
        <h2 id="script-heading" className="mb-2 text-[14px] font-bold tracking-[0.08em] text-ink-sub">
          1분 대본
        </h2>
        <ol className="flex flex-col gap-2">
          {SCRIPT_LINES.map((line) => (
            <li key={line.cue} className="text-[18px] leading-[1.6] text-ink">
              <span className="mr-1.5 text-[15px] text-ink-sub">({line.cue})</span>
              {line.text}
            </li>
          ))}
        </ol>
      </section>

      {/* §144 VP-UI — 보내기 녹음만: 목소리 이름 · 보관 기간 · 보관 동의(필수). 녹음 중에는 바꿀 수 없다. */}
      {isSendRecording && (
        <section aria-labelledby="voice-profile-heading" className="flex flex-col gap-4 rounded-[8px] border-[1.5px] border-line bg-white p-4">
          <h2 id="voice-profile-heading" className="text-[17px] font-bold text-ink">
            이 목소리 저장하기
          </h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold text-ink">목소리 이름</span>
            <input
              type="text"
              value={profileLabel}
              maxLength={VOICE_PROFILE_LABEL_MAX_LENGTH}
              onChange={(event) => setProfileLabel(event.target.value)}
              placeholder="예: 평소 목소리"
              disabled={recorder.status === "recording"}
              className="min-h-[52px] rounded-[8px] border-[1.5px] border-line-strong bg-white px-4 py-3 text-[18px] text-ink focus:border-brand focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-50"
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[15px] font-semibold text-ink">보관 기간</legend>
            <div className="flex gap-3">
              {VOICE_PROFILE_RETENTION_OPTIONS.map((days) => (
                <label key={days} className="flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-[8px] border-[1.5px] border-line-strong px-3 text-[17px] font-semibold text-ink has-[:checked]:border-brand has-[:checked]:bg-brand-tint">
                  <input
                    type="radio"
                    name="voice-retention"
                    value={days}
                    checked={retentionDays === days}
                    onChange={() => setRetentionDays(days)}
                    disabled={recorder.status === "recording"}
                    className="h-5 w-5 accent-brand"
                  />
                  {days}일
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex cursor-pointer select-none items-start gap-3">
            <input
              type="checkbox"
              checked={retentionConsented}
              onChange={(event) => setRetentionConsented(event.target.checked)}
              disabled={recorder.status === "recording"}
              className="mt-0.5 h-8 w-8 shrink-0 rounded-[10px] accent-brand disabled:cursor-not-allowed"
            />
            <span className="text-[16px] leading-[1.5] text-ink">{voiceProfileConsentText(retentionDays)}</span>
          </label>
        </section>
      )}

      <label className="flex cursor-pointer select-none items-start gap-3 py-1">
        <input
          type="checkbox"
          checked={identityChecked}
          onChange={(event) => setIdentityChecked(event.target.checked)}
          disabled={recorder.status === "recording"}
          className="mt-0.5 h-8 w-8 shrink-0 rounded-[10px] accent-brand disabled:cursor-not-allowed"
          aria-describedby="identity-checkbox-label"
        />
        <span id="identity-checkbox-label" className="text-[17px] font-semibold leading-[1.5] text-ink">
          이 목소리는 본인의 것이며, 본인이 직접 녹음합니다.
        </span>
      </label>

      {/* 녹음 상태를 텍스트로도 안내(UX.md Accessibility — Screen Reader "녹음 중/완료"). */}
      <p aria-live="polite" ref={statusMessageRef} className="sr-only">
        {recorder.status === "recording" && "녹음 중입니다."}
        {recorder.status === "stopped" && "녹음이 완료되었습니다."}
      </p>

      <section className="flex flex-col items-center gap-3 rounded-[8px] border-[1.5px] border-line bg-white p-5">
        {recorder.status === "idle" && (
          <>
            <button
              type="button"
              onClick={handleStart}
              disabled={!canRecord}
              aria-label="녹음 시작"
              className="flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-[8px] bg-brand text-[17px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-neutral-tint disabled:text-disabled-ink"
            >
              <span
                aria-hidden="true"
                className="h-[14px] w-[14px] rounded-full border-2 border-white bg-danger"
              />
              녹음 시작
            </button>
            {!canRecord && (
              <p className="text-[16px] text-ink-sub">
                {isSendRecording
                  ? "목소리 이름 · 보관 동의 · 본인 확인을 마쳐야 녹음을 시작할 수 있습니다."
                  : "본인 확인 문항에 먼저 동의해야 녹음을 시작할 수 있습니다."}
              </p>
            )}
          </>
        )}

        {recorder.status === "requesting-permission" && (
          <p className="flex items-center gap-2 text-[18px] text-ink" role="status">
            <LoadingDots className="text-brand" />
            마이크 권한을 요청하는 중입니다
          </p>
        )}

        {recorder.status === "recording" && (
          <>
            <div aria-hidden="true" className="mb-1 flex h-[28px] items-end gap-[3px]">
              {[0, 0.15, 0.3, 0.45, 0.6].map((delay) => (
                <span
                  key={delay}
                  className="call-wave-bar w-[4px] rounded-full bg-danger"
                  style={{ height: "22px", animationDelay: `${delay}s` }}
                />
              ))}
            </div>
            <p className="flex items-center gap-2 font-mono text-[17px] tracking-wider text-danger" role="status">
              <span aria-hidden="true">●</span>
              녹음 중 {formatTime(recorder.elapsedSeconds)} / {formatTime(MAX_RECORDING_SECONDS)}
            </p>
            <button
              type="button"
              onClick={recorder.stop}
              aria-label="녹음 정지"
              className="flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-[8px] bg-danger text-[17px] font-semibold text-white transition-colors hover:bg-danger-hover"
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
            <p role="alert" className="flex items-center gap-2 text-[17px] text-danger">
              <span aria-hidden="true">⚠</span>
              <span>{recorder.errorMessage}</span>
            </p>
            {recorder.status === "permission-denied" && (
              <button
                type="button"
                onClick={handleStart}
                disabled={!canRecord}
                className="min-h-[52px] w-full rounded-[8px] border-[1.5px] border-line-strong bg-surface text-[18px] font-semibold text-ink transition-colors hover:bg-brand-tint disabled:cursor-not-allowed disabled:border-transparent disabled:bg-neutral-tint disabled:text-disabled-ink"
              >
                다시 시도
              </button>
            )}
          </>
        )}

        {recorder.status === "stopped" && recorder.audioUrl && (
          <>
            <div className="flex w-full flex-col gap-3 rounded-[8px] bg-brand-tint p-4">
              <p className="flex items-center gap-2 text-[17px] font-semibold text-brand">
                <svg className="text-brand" width="14" height="14" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 7L5.2 9.7L10.5 3.5"
                    stroke="currentColor"
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
              <p className="text-[16px] text-ink-sub">
                녹음이 너무 짧습니다. 대본을 끝까지 읽고 다시 녹음해 주세요.
              </p>
            )}
            <div className="flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={recorder.reset}
                className="text-[16px] font-semibold text-ink-sub underline"
              >
                다시 녹음하기
              </button>
              <button
                type="button"
                onClick={handleCreateClone}
                disabled={!canCreateClone}
                className="flex min-h-[56px] w-full items-center justify-center rounded-[8px] bg-brand text-[17px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-neutral-tint disabled:text-disabled-ink"
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
        <p role="alert" className="flex items-center gap-2 text-[17px] text-danger">
          <span aria-hidden="true">⚠</span>
          <span>{uploadError}</span>
        </p>
      )}
    </main>
  );
}
