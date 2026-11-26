"use client";

// UX-003 클론 생성 대기 (Track A, T4, AC-018).
// Entry: UX-002에서 "클론 생성" 버튼이 이미 createVoiceClone 콜러블을 호출·완료한 뒤 이 화면으로
// 이동한다(record page 참고). 이 화면은 sessions/{sid}.cloneStatus를 구독해 단계형 진행 상태를
// 보여준다(UX.md D-4 "전용 화면으로 분리"). Mock은 항상 즉시 성공하므로 정교한 타임아웃/재시도
// 로직은 만들지 않는다(프로토타입 우선순위, 태스크 지시).
//
// **Phase B(2026-07-22 사용자 결정) — 온보딩 순서 변경**: 시나리오 선택(UX-004)이 이제 녹음보다
// 먼저 온다. 이 화면은 클론이 준비되면 scenarios/page.tsx가 sessionStorage에 남겨둔
// selectedScenarioId를 읽어 createSession을 대신 호출하고(사용자가 다시 시나리오를 고를 필요
// 없음), 바로 /session/play로 이동한다. cloneStatus 구독(Effect 1)과 createSession 호출
// (Effect 2)을 분리해 "다시 시도"가 스냅샷 재발화 없이도 실제로 재호출되게 한다.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getPendingSessionId,
  getSelectedScenarioId,
  setOpeningAudioUrl,
  setOpeningMessageText,
  hasMessengerVoiceSelectReturn,
  getSelectedDifficultyLevel,
  getExperienceMode,
} from "@/lib/recording";
import {
  cloneWaitHeading,
  resolveCloneReadyAction,
  resolveCloneReadyRoute,
  saveProfileThenReturn,
} from "@/lib/recording/cloneReadyRoute";
import { createSession, saveVoiceProfile } from "@/lib/api";
import {
  VOICE_PROFILE_CONSENT_VERSION,
  clearPendingVoiceProfileSave,
  peekPendingVoiceProfileSave,
} from "@/lib/voices/voiceProfileConsent";
import { familyAddressRequestField } from "@/lib/familyAddress";
import { Button, LoadingDots, ProgressSteps, type ProgressStep } from "@/components/ui";
import {
  isVoiceDegraded,
  VOICE_DEGRADED_NOTICE,
  type VoiceProviderName,
} from "@/lib/report/degradedDisclosure";

type CloneState = "checking" | "pending" | "ready" | "failed" | "no-session" | "read-error";
type StartState = "idle" | "starting" | "start-error" | "no-scenario" | "no-voice" | "saving" | "save-error";

// record/page.tsx와 동일한 온보딩 진행 표시(3단계 중 마지막).
const ONBOARDING_STEPS: ProgressStep[] = [
  { label: "1/3 동의" },
  { label: "2/3 목소리 등록" },
  { label: "3/3 준비 완료" },
];

export default function CloneWaitPage() {
  const router = useRouter();
  // sessionStorage 조회는 클라이언트 전용(SSR 없음)이라 lazy 초기값으로 한 번만 읽는다 — effect
  // 본문에서 동기적으로 setState를 호출하지 않기 위함(react-hooks/set-state-in-effect).
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [cloneState, setCloneState] = useState<CloneState>(sessionId ? "checking" : "no-session");
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [startState, setStartState] = useState<StartState>("idle");
  const [startAttempt, setStartAttempt] = useState(0);
  // §144 — 보내기 녹음 저장 실패 시 돌아갈 만들기 화면 · 서버 문구.
  const [saveBack, setSaveBack] = useState<{ href: string; message: string } | null>(null);
  // T158(§48.3, AC-084, P-31 ⓕ) — 목소리 축 강등 신호. `createVoiceClone`이 항상 write하는
  // `sessions/{sid}.voiceProvider`(functions/src/voice/index.ts:77)를 아래 Effect 1이 이미
  // 구독 중인 같은 스냅샷에서 함께 읽는다(신규 read 0건). 대사 축(`llmProvider`)과는 다른 값이라
  // 섞지 않는다(48.3).
  const [voiceProvider, setVoiceProvider] = useState<VoiceProviderName | null>(null);
  // §145.1 — 프로필 저장은 화면이 떠날 때만 취소한다(저장 중 서버가 사전 세션 voiceId를 지워 Effect 2가 다시 돌아도 계속).
  const mountedRef = useRef(true);
  const profileSaveStartedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Effect 1 — cloneStatus 구독만 담당(클론 진행 상태 표시). voiceId가 확보되면 저장만 하고,
  // 실제 createSession 호출은 Effect 2로 넘긴다.
  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = onSnapshot(
      doc(db, "sessions", sessionId),
      (snapshot) => {
        const data = snapshot.data();
        const status = data?.cloneStatus;
        const provider = data?.voiceProvider;
        if (provider === "mock" || provider === "elevenlabs") setVoiceProvider(provider);
        if (status === "ready") {
          setVoiceId((data?.voiceId as string) ?? null);
          setCloneState("ready");
        } else if (status === "failed") {
          setCloneState("failed");
        } else {
          setCloneState("pending");
        }
      },
      () => setCloneState("read-error"),
    );
    return () => unsubscribe();
  }, [sessionId]);

  // Effect 2 — 클론이 준비되면 createSession을 1회 호출한다. startAttempt를 늘리면(재시도 버튼)
  // 이 effect가 다시 실행되어 스냅샷 재발화 없이도 재호출된다. 인라인 async IIFE로 감싼다
  // (session/end/page.tsx·report/page.tsx와 동일한 회피 패턴 — effect 본문에서 직접 setState를
  // 호출하면 react-hooks/set-state-in-effect가 "동기 setState"로 오탐한다).
  useEffect(() => {
    // U02 — voiceId 없음도 판정한다(판정표 CR). 예전엔 여기서 멈춰 "준비됐어요"만 남았다.
    if (cloneState !== "ready" || !sessionId) return;
    // 저장이 시작된 뒤엔 saveProfileThenReturn이 이동 · 오류를 맡는다(서버 폐기로 voiceId가 바뀌어 다시 돌아도 CR3로 앞지르지 않음).
    if (profileSaveStartedRef.current) return;
    // T30(UX-025) — "즉시 녹음" 경로로 메신저 에스컬레이션 목소리 선택 화면에서 온 경우, 이 화면이
    // createSession을 대신 호출하지 않고 voice-select로 복귀시킨다(D-25, 그 화면이 channel=
    // "messenger"/voiceSelectionSource="recorded"로 createSession을 마무리한다). 일반 보이스
    // 온보딩 흐름은 이 분기와 무관하게 무변경.
    // 2026-11-26 — "지인에게 보내기"(send)에서 녹음하러 온 경우도 세션을 만들지 않고 UX-019 챌린지 만들기로 돌아간다
    // (판정표 = cloneReadyRoute.ts). 예전엔 이 분기가 없어 본인 체험 통화가 시작됐다.
    const route = resolveCloneReadyRoute({
      messengerVoiceSelectReturn: hasMessengerVoiceSelectReturn(),
      experienceMode: getExperienceMode(),
      scenarioId: getSelectedScenarioId(),
    });
    // §144(DECISIONS #257) — 보내기 녹음은 녹음 화면에서 받은 이름 · 기간 · 동의로 목소리 프로필을 저장하고, 그 목소리가 골라진
    // 만들기 화면으로 돌아간다. 저장 값이 없으면(녹음 화면을 거치지 않음) 목소리 없이 만들기로 — 거기서 고르거나 새로 녹음.
    const pending = peekPendingVoiceProfileSave();
    const action = resolveCloneReadyAction(route, voiceId, pending !== null);
    if (action.kind === "go") {
      if (action.clearPending) clearPendingVoiceProfileSave();
      router.push(action.href);
      return;
    }
    if (action.kind === "need-record") {
      // 아래 일반 경로와 같은 async 감쌈(react-hooks/set-state-in-effect 회피).
      void (async () => setStartState("no-voice"))();
      return;
    }
    if (action.kind === "save" && pending) {
      // 한 번만 저장한다(재실행 · StrictMode 이중 실행에서 프로필이 둘 생기지 않게 — 위 가드). cleanup으로 취소하지 않는다 — 판정표 SR.
      profileSaveStartedRef.current = true;
      // 일반 경로와 같은 async 감쌈(react-hooks/set-state-in-effect 회피).
      void (async () => {
        setStartState("saving");
        await saveProfileThenReturn({
          save: () =>
            saveVoiceProfile({
              sessionId,
              label: pending.label,
              retentionDays: pending.retentionDays,
              consented: true,
              consentTextVersion: VOICE_PROFILE_CONSENT_VERSION,
            }),
          clearPending: clearPendingVoiceProfileSave,
          isMounted: () => mountedRef.current,
          go: (href) => router.push(href),
          onError: (err) => {
            const message =
              err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
                ? (err as { message: string }).message
                : "목소리를 저장하지 못했습니다.";
            setSaveBack({ href: action.href, message });
            setStartState("save-error");
          },
          challengeHref: action.href,
        });
      })();
      return;
    }
    if (action.kind !== "start") return;
    const startVoiceId = action.voiceId;
    let cancelled = false;
    (async () => {
      const scenarioId = getSelectedScenarioId();
      if (!scenarioId) {
        if (!cancelled) setStartState("no-scenario");
        return;
      }
      setStartState("starting");
      try {
        // T72(UX-029/AC-064) — 난이도는 드릴다운 마지막 단계에서 이미 확정돼 sessionStorage 힌트로
        // 넘어온다(녹음 왕복을 거쳐도 유지). 부재면 필드를 아예 보내지 않아 서버가 중급으로
        // 확정하고, 그 확정값을 응답으로 되돌려준다(조용한 임의 난이도 진행 금지).
        const difficultyLevel = getSelectedDifficultyLevel();
        const result = await createSession({
          sessionId,
          scenarioId,
          voiceId: startVoiceId,
          ...(difficultyLevel ? { difficultyLevel } : {}),
          // §110.5 — 난이도 화면에서 고른 호칭(이 탭 힌트 · 부재 = 종전 문면).
          ...familyAddressRequestField(scenarioId),
        });
        if (cancelled) return;
        if (result.openingAudioUrl) setOpeningAudioUrl(result.openingAudioUrl);
        // 사용자 신고(2026-07-24) — 실시간 통화 "AI가 먼저 말해야" 수정, ScenarioListView.tsx와
        // 동일 근거.
        if (result.openingMessage.text) setOpeningMessageText(result.openingMessage.text);
        router.push("/session/play");
      } catch {
        if (!cancelled) setStartState("start-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloneState, sessionId, voiceId, startAttempt, router]);

  // U02 — 저장 실패 뒤 "다시 시도"가 저장 가드에 막혀 아무 일도 안 했다 → 가드를 풀고 다시 판정한다.
  const handleRetryStart = () => {
    profileSaveStartedRef.current = false;
    setStartAttempt((n) => n + 1);
  };
  const handleRetryScenarios = () => router.push("/scenarios");
  const handleRetryRecord = () => router.push("/onboarding/record");

  const isPending = cloneState === "checking" || cloneState === "pending";
  const isReady = cloneState === "ready";
  const showProgressCard = isPending || isReady;
  // 실제 서버 신호는 pending/ready 이진값뿐이라(Mock VoiceProvider, T19), 목업의 3단계
  // "분석 중 → 생성 중 → 준비 완료" 타이머는 재현하지 않는다(가짜 진행률 조작 금지). 대신 이 화면에
  // 도달했다는 사실 자체가 이미 참인 "목소리 확인 완료" 단계 + 실제 cloneStatus를 반영하는
  // "가상 음성 생성" 단계, 2단계로 정직하게 축약했다(아래 report 참조).
  const steps = [
    {
      label: "목소리 확인 완료",
      sub: "녹음한 목소리를 서버로 안전하게 전달했어요",
      done: true,
    },
    {
      label: isReady ? "가상 음성 생성 완료" : "가상 음성 생성 중",
      sub: isReady ? "안전하게 사용할 준비가 끝났어요" : "음색과 억양을 반영해 만들고 있어요",
      done: isReady,
    },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-7 bg-page px-6 pb-10 pt-10">
      <ProgressSteps steps={ONBOARDING_STEPS} currentIndex={2} />

      <div className="flex flex-col gap-3">
        <h1 className="text-[24px] font-bold leading-[1.35] text-ink">
          {cloneWaitHeading(cloneState, startState)}
        </h1>
        {/* U02 — 기다림 문구는 만드는 중에만(준비 뒤 오류 화면에 "잠시만 기다려 주세요"가 남지 않게). */}
        {isPending && (
          <p className="text-[17px] leading-[1.6] text-ink-sub">
            잠시만 기다려 주세요. 훈련용 가상 음성을 준비하고 있어요.
          </p>
        )}
        {/* P-31 ⓕ(§48.3, AC-084) — 목소리 축 강등 고지. "준비 완료" 상태(isReady)에만 붙는다.
            부재/elevenlabs면 아무 말도 하지 않는다(긍정 표기 금지, G274와 같은 원칙). */}
        {isReady && isVoiceDegraded(voiceProvider) && (
          <p role="status" className="text-[17px] leading-[1.6] text-ink-sub">
            {VOICE_DEGRADED_NOTICE}
          </p>
        )}
      </div>

      {showProgressCard && (
        /* UX.md v1.18 P-30(세로 여백 상한) · D-62 · D-63 — login/page.tsx와 같은 형태.
           `justify-center` 를 위·아래 두 탄성 스페이서로 분해하고 **카드 위**에만 상한을 건다
           (D-62 = max(375×812 실측 132.55px, 256px) = 256px). 남는 높이는 카드 아래(= 카드 ↔
           하단 상태 문구 사이)에 쌓인다(D-63). 짧은 화면 배치는 산술적으로 무변경.
           ⛔ 카드 폭·내부 여백·gap-7·pt-10/pb-10·로딩/오류 분기는 손대지 않았다. */
        <div className="flex flex-1 flex-col">
          <div aria-hidden="true" className="max-h-[256px] flex-1" />
          <div className="flex flex-col gap-6 rounded-[8px] border-[1.5px] border-line bg-white p-6">
            {steps.map((step) => (
              <div key={step.label} className="flex items-center gap-4">
                <div
                  aria-hidden="true"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    step.done ? "bg-brand" : "bg-brand-tint"
                  }`}
                >
                  {step.done ? (
                    <svg width="16" height="16" viewBox="0 0 13 13" fill="none">
                      <path
                        d="M2.5 7L5.2 9.7L10.5 3.5"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-brand-tint border-t-brand" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-[18px] font-semibold text-ink">{step.label}</p>
                  <p className="mt-0.5 text-[15px] text-ink-sub">{step.sub}</p>
                </div>
              </div>
            ))}
            <div className="h-[6px] overflow-hidden rounded-full bg-neutral-tint">
              <div
                className={`h-full rounded-full transition-all duration-700 ${!isReady ? "animate-pulse" : ""}`}
                style={{
                  width: isReady ? "100%" : "55%",
                  background: "linear-gradient(90deg, var(--brand), #5C86C2, var(--brand))",
                }}
              />
            </div>
          </div>
          <div aria-hidden="true" className="flex-1" />
        </div>
      )}

      {isPending && (
        <p className="flex items-center justify-center gap-2.5 text-[17px] text-ink-sub" role="status">
          <LoadingDots className="text-brand" />
          잠시만 기다려 주세요. 내 목소리로 클론을 만들고 있습니다
        </p>
      )}

      {isReady && startState === "starting" && (
        <p className="flex items-center justify-center gap-2.5 text-[17px] text-ink-sub" role="status">
          <LoadingDots className="text-brand" />
          목소리 클론이 준비됐습니다. 훈련을 시작하는 중입니다
        </p>
      )}

      {isReady && startState === "saving" && (
        <p className="flex items-center justify-center gap-2.5 text-[17px] text-ink-sub" role="status">
          <LoadingDots className="text-brand" />
          목소리를 저장하는 중입니다
        </p>
      )}

      {isReady && startState === "save-error" && saveBack && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p role="alert" className="flex items-center gap-2 text-[17px] text-danger">
            <span aria-hidden="true">⚠</span>
            <span>{saveBack.message}</span>
          </p>
          <Button type="button" onClick={handleRetryStart}>
            다시 시도
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push(saveBack.href)}>
            챌린지 만들기로 돌아가기
          </Button>
        </div>
      )}

      {isReady && startState === "start-error" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p role="alert" className="flex items-center gap-2 text-[17px] text-danger">
            <span aria-hidden="true">⚠</span>
            <span>훈련을 시작하지 못했습니다. 다시 시도해 주세요.</span>
          </p>
          <Button type="button" onClick={handleRetryStart}>
            다시 시도
          </Button>
        </div>
      )}

      {isReady && startState === "no-scenario" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p role="alert" className="flex items-center gap-2 text-[17px] text-danger">
            <span aria-hidden="true">⚠</span>
            <span>선택한 시나리오 정보를 찾을 수 없습니다. 시나리오를 다시 선택해 주세요.</span>
          </p>
          <Button type="button" variant="secondary" onClick={handleRetryScenarios}>
            시나리오 선택으로
          </Button>
        </div>
      )}

      {isReady && startState === "no-voice" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p role="alert" className="flex items-center gap-2 text-[17px] text-danger">
            <span aria-hidden="true">⚠</span>
            <span>녹음한 목소리 정보를 찾을 수 없습니다. 다시 녹음해 주세요.</span>
          </p>
          <Button type="button" variant="secondary" onClick={handleRetryRecord}>
            재녹음으로 돌아가기
          </Button>
        </div>
      )}

      {(cloneState === "failed" || cloneState === "read-error" || cloneState === "no-session") && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p role="alert" className="flex items-center gap-2 text-[17px] text-danger">
            <span aria-hidden="true">⚠</span>
            <span>
              {cloneState === "no-session"
                ? "진행 중인 녹음 정보를 찾을 수 없습니다. 다시 녹음해 주세요."
                : "목소리 클론 생성에 실패했습니다. 다시 시도해 주세요."}
            </span>
          </p>
          <Button type="button" variant="secondary" onClick={handleRetryRecord}>
            재녹음으로 돌아가기
          </Button>
        </div>
      )}
    </main>
  );
}
