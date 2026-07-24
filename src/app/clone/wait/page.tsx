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
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getPendingSessionId,
  getSelectedScenarioId,
  setOpeningAudioUrl,
  hasMessengerVoiceSelectReturn,
} from "@/lib/recording";
import { createSession } from "@/lib/api";
import { Button, ProgressSteps, type ProgressStep } from "@/components/ui";

type CloneState = "checking" | "pending" | "ready" | "failed" | "no-session" | "read-error";
type StartState = "idle" | "starting" | "start-error" | "no-scenario";

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

  // Effect 1 — cloneStatus 구독만 담당(클론 진행 상태 표시). voiceId가 확보되면 저장만 하고,
  // 실제 createSession 호출은 Effect 2로 넘긴다.
  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = onSnapshot(
      doc(db, "sessions", sessionId),
      (snapshot) => {
        const data = snapshot.data();
        const status = data?.cloneStatus;
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
    if (cloneState !== "ready" || !sessionId || !voiceId) return;
    // T30(UX-025) — "즉시 녹음" 경로로 메신저 에스컬레이션 목소리 선택 화면에서 온 경우, 이 화면이
    // createSession을 대신 호출하지 않고 voice-select로 복귀시킨다(D-25, 그 화면이 channel=
    // "messenger"/voiceSelectionSource="recorded"로 createSession을 마무리한다). 일반 보이스
    // 온보딩 흐름은 이 분기와 무관하게 무변경.
    if (hasMessengerVoiceSelectReturn()) {
      router.push("/scenarios/messenger/voice-select");
      return;
    }
    let cancelled = false;
    (async () => {
      const scenarioId = getSelectedScenarioId();
      if (!scenarioId) {
        if (!cancelled) setStartState("no-scenario");
        return;
      }
      setStartState("starting");
      try {
        const result = await createSession({ sessionId, scenarioId, voiceId });
        if (cancelled) return;
        if (result.openingAudioUrl) setOpeningAudioUrl(result.openingAudioUrl);
        router.push("/session/play");
      } catch {
        if (!cancelled) setStartState("start-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloneState, sessionId, voiceId, startAttempt, router]);

  const handleRetryStart = () => setStartAttempt((n) => n + 1);
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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-7 bg-[#FAF8F5] px-6 pb-10 pt-10">
      <ProgressSteps steps={ONBOARDING_STEPS} currentIndex={2} />

      <div className="flex flex-col gap-3">
        <h1 className="text-[24px] font-bold leading-[1.35] text-[#22303A]">
          {isReady ? "가상 음성이 준비됐어요" : "가상 음성을 만들고 있어요"}
        </h1>
        <p className="text-[15px] leading-[1.6] text-[#6B655C]">
          잠시만 기다려 주세요. 훈련용 가상 음성을 준비하고 있어요.
        </p>
      </div>

      {showProgressCard && (
        <div className="flex flex-1 flex-col justify-center">
          <div className="flex flex-col gap-6 rounded-[20px] border-[1.5px] border-[#E2DDD3] bg-white p-6">
            {steps.map((step) => (
              <div key={step.label} className="flex items-center gap-4">
                <div
                  aria-hidden="true"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    step.done ? "bg-[#0E6B62]" : "bg-[#E4F0EC]"
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
                    <span className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-[#E4F0EC] border-t-[#0E6B62]" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-[16px] font-semibold text-[#22303A]">{step.label}</p>
                  <p className="mt-0.5 text-[13px] text-[#6B655C]">{step.sub}</p>
                </div>
              </div>
            ))}
            <div className="h-[6px] overflow-hidden rounded-full bg-[#F2EFE9]">
              <div
                className={`h-full rounded-full transition-all duration-700 ${!isReady ? "animate-pulse" : ""}`}
                style={{
                  width: isReady ? "100%" : "55%",
                  background: "linear-gradient(90deg, #0E6B62, #4FA398, #0E6B62)",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {isPending && (
        <p className="flex items-center justify-center gap-2 text-[15px] text-[#6B655C]" role="status">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-[#0E6B62]"
          />
          잠시만 기다려 주세요. 내 목소리로 클론을 만들고 있습니다...
        </p>
      )}

      {isReady && startState === "starting" && (
        <p className="flex items-center justify-center gap-2 text-[15px] text-[#6B655C]" role="status">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-[#0E6B62]"
          />
          목소리 클론이 준비됐습니다. 훈련을 시작하는 중입니다...
        </p>
      )}

      {isReady && startState === "start-error" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p role="alert" className="flex items-center gap-2 text-[15px] text-[#C6392F]">
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
          <p role="alert" className="flex items-center gap-2 text-[15px] text-[#C6392F]">
            <span aria-hidden="true">⚠</span>
            <span>선택한 시나리오 정보를 찾을 수 없습니다. 시나리오를 다시 선택해 주세요.</span>
          </p>
          <Button type="button" variant="secondary" onClick={handleRetryScenarios}>
            시나리오 선택으로
          </Button>
        </div>
      )}

      {(cloneState === "failed" || cloneState === "read-error" || cloneState === "no-session") && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p role="alert" className="flex items-center gap-2 text-[15px] text-[#C6392F]">
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
