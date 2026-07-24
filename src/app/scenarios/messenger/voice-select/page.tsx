"use client";

// UX-025 조건부 목소리 선택 서브플로우 (T30, docs/UX.md Screen ID UX-025, AC-046/034/036).
// 경로 판단(근거): 형제 화면 /scenarios/messenger(UX-024)의 하위 단계라 같은 디렉터리 아래에 둔다 —
// UX.md가 정확한 슬러그를 못박지 않아 implementer 판단으로 "voice-select"를 골랐다(UX-024→
// voice-select→UX-022 흐름이 경로만 봐도 드러나게).
//
// Entry: UX-024(/scenarios/messenger)에서 scenario.escalation 있는 시나리오를 고른 직후(D-25 —
// 에스컬레이션 발생 순간이 아니라 시나리오 선택 직후에 미리 목소리를 확보한다). Exit: voiceId
// 확보 → createSession(channel="messenger", voiceSelectionSource) 후 /session/messenger.
//
// 세 경로(§13.6): ①즉시 녹음(UX-002/003 재사용 후 이 화면으로 복귀) ②기존 보관 목소리 재사용
// (users/{uid}/voices에 항목이 있을 때만 노출 — 숨김이지 비활성이 아니다) ③남/여 기본 보이스
// (FALLBACK_VOICE_MALE_ID/FEMALE_ID, 서버가 해석 — 본인 목소리 아님을 명시).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCurrentUser } from "@/lib/auth";
import { createSession } from "@/lib/api";
import type { VoiceSelectionSource } from "@/lib/api";
import {
  clearPendingSession,
  consumeMessengerVoiceSelectReturn,
  getOrCreatePendingSessionId,
  getPendingSessionId,
  getSelectedScenarioId,
  hasMessengerVoiceSelectReturn,
  setMessengerVoiceSelectReturn,
  setSelectedScenarioId as setPendingSelectedScenarioId,
} from "@/lib/recording";
import { fetchStoredVoices, type StoredVoiceSummary } from "@/lib/voices/fetchStoredVoices";
import { scenarios, GENERIC_VOICE_ID } from "@/content/scenarios";
import { Badge, Banner, Button } from "@/components/ui";

type PageState = "no-scenario" | "returning-error" | "ready";

export default function MessengerVoiceSelectPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  // sessionStorage 조회는 클라 전용이라 lazy 초기값으로 한 번만 읽는다(다른 화면과 동일 관례).
  const [scenarioId] = useState<string | null>(() => getSelectedScenarioId());
  const scenario = scenarioId ? scenarios[scenarioId] : null;
  // hasMessengerVoiceSelectReturn을 peek만 해서 렌더 분기를 정하고, 실제 소비(consume)는 아래
  // effect에서 1회만 한다(react-hooks/set-state-in-effect 회피, 다른 화면과 동일 패턴).
  const [isReturningFlow] = useState<boolean>(() => hasMessengerVoiceSelectReturn());

  const [pageState, setPageState] = useState<PageState>(() => {
    if (!scenarioId || !scenario || !scenario.escalation) return "no-scenario";
    return "ready";
  });
  const [storedVoices, setStoredVoices] = useState<StoredVoiceSummary[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // 보관 목소리 조회(Empty면 ②를 숨긴다 — §13.6 "MVP는 ①+③로 성립"). 실패해도 ①·③은 그대로
  // 쓸 수 있어(P-4 비차단) 조용히 빈 목록으로 흡수한다.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const voices = await fetchStoredVoices(user.uid);
        if (!cancelled) setStoredVoices(voices);
      } catch {
        if (!cancelled) setStoredVoices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // "즉시 녹음" 복귀 트립 처리 — clone/wait가 이 화면으로 돌려보낸 경우, pending 세션 문서의
  // cloneStatus/voiceId를 읽어 createSession을 마무리한다(D-25, §13.6). 인라인 async IIFE로 감싼다
  // (다른 화면과 동일한 react-hooks/set-state-in-effect 회피 패턴).
  const returnConsumedRef = useRef(false);
  useEffect(() => {
    if (!isReturningFlow || !scenario || !scenarioId) return;
    // ref는 React Strict Mode(dev)의 mount→cleanup→mount 이중 호출에도 같은 컴포넌트 인스턴스에서
    // 값이 유지된다(useState 지연 초기값과 달리) — consumeMessengerVoiceSelectReturn()이 sessionStorage
    // 를 지우는 부수효과라 이중 호출 중 첫 번째만 실제로 소비되게 이 ref로 한 번만 실행을 보장한다.
    if (returnConsumedRef.current) return;
    if (!consumeMessengerVoiceSelectReturn()) return;
    returnConsumedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const pendingId = getPendingSessionId();
        if (!pendingId) throw new Error("no-pending-session");
        const snap = await getDoc(doc(db, "sessions", pendingId));
        const data = snap.data();
        const voiceId = data?.voiceId as string | undefined;
        const cloneStatus = data?.cloneStatus as string | undefined;
        if (cloneStatus !== "ready" || !voiceId) {
          throw new Error("clone-not-ready");
        }
        const result = await createSession({
          sessionId: pendingId,
          scenarioId,
          voiceId,
          channel: "messenger",
          surface: scenario.surface,
          voiceSelectionSource: "recorded",
        });
        void result;
        if (!cancelled) router.push("/session/messenger");
      } catch {
        if (!cancelled) setPageState("returning-error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReturningFlow, scenario, scenarioId]);

  const startWithVoice = async (voiceId: string, voiceSelectionSource: VoiceSelectionSource) => {
    if (!scenario || !scenarioId || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      clearPendingSession();
      const sessionId = getOrCreatePendingSessionId();
      if (!sessionId) throw new Error("no-session-storage");
      const result = await createSession({
        sessionId,
        scenarioId,
        voiceId,
        channel: "messenger",
        surface: scenario.surface,
        voiceSelectionSource,
      });
      void result;
      router.push("/session/messenger");
    } catch {
      setStarting(false);
      setStartError("훈련을 시작하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  const handleStartRecording = () => {
    if (!scenarioId || starting) return;
    clearPendingSession();
    // clearPendingSession이 방금 지운 선택 시나리오 id를 복원한다 — record→clone/wait 왕복 뒤
    // 이 화면으로 돌아왔을 때도 어떤 시나리오였는지 알아야 createSession을 마무리할 수 있다.
    setPendingSelectedScenarioId(scenarioId);
    getOrCreatePendingSessionId();
    setMessengerVoiceSelectReturn();
    router.push("/onboarding/record");
  };

  if (pageState === "no-scenario") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>선택한 시나리오 정보를 찾을 수 없습니다. 시나리오를 다시 선택해 주세요.</span>
        </p>
        <div className="w-full max-w-xs">
          <Button variant="secondary" type="button" onClick={() => router.push("/scenarios/messenger")}>
            시나리오 선택으로
          </Button>
        </div>
      </main>
    );
  }

  if (isReturningFlow && pageState !== "returning-error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p className="flex items-center gap-2 text-lg text-[#22303A]" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
          />
          목소리 클론이 준비됐습니다. 훈련을 시작하는 중입니다...
        </p>
      </main>
    );
  }

  if (pageState === "returning-error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>목소리 클론을 확인하지 못했습니다. 다시 시도해 주세요.</span>
        </p>
        <div className="w-full max-w-xs">
          <Button variant="secondary" type="button" onClick={() => router.push("/onboarding/record")}>
            재녹음으로 돌아가기
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="drilldown-step mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-10">
      <header className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push("/scenarios/messenger")}
          className="flex min-h-[48px] w-fit items-center gap-1 rounded-lg px-2 -ml-2 text-base font-medium text-[#6B655C] hover:bg-[#F2EFE9]"
        >
          <span aria-hidden="true">←</span> 뒤로
        </button>
        {/* 전이 플로우.dc.html "이 대화는 통화로 이어질 수 있어요" 배너 재사용(Banner 공용
            컴포넌트, sticky·닫기 불가 — AC-047과 동일한 상시 고지 원칙). */}
        <Banner variant="caution" sticky>
          <span className="font-semibold text-[#B96A1B]">이 대화는 통화로 이어질 수 있어요.</span>{" "}
          상대가 메시지 도중 전화를 걸어올 수 있는 시나리오예요.
        </Banner>
        <h1 className="text-2xl font-bold text-[#22303A]">통화용 목소리를 정해 주세요</h1>
        <p className="text-base leading-relaxed text-[#6B655C]">
          이 시나리오는 통화로 이어질 수 있어 목소리가 필요할 수 있습니다. 지금 미리 정해 두면
          나중에 끊김 없이 전화로 넘어갑니다.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {/* "지금 30초 녹음"은 선택 후 별도 확정이 아니라 클릭 즉시 녹음 화면으로 이동하는
            단일 액션이라(D-25 기존 로직 무변경) SelectableCard(선택→별도 확정 버튼)의 상시
            "미선택" 원 어포던스를 그대로 쓰지 않고, 디자인 시스템의 카드 톤(테두리/라운드/배지)만
            재사용한 커스텀 카드로 둔다 — 판단 근거는 팀 보고 참고. */}
        <button
          type="button"
          onClick={handleStartRecording}
          disabled={starting}
          className="flex min-h-[64px] flex-col items-start gap-2 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-5 text-left transition-colors hover:border-[#0E6B62] disabled:opacity-50"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-bold text-[#22303A]">지금 30초 녹음</span>
            <Badge variant="caution">30초 소요</Badge>
          </span>
          <span className="text-sm leading-relaxed text-[#6B655C]">
            본인 목소리를 녹음해 통화에서 그대로 씁니다.
          </span>
        </button>

        {storedVoices.length > 0 && (
          <div className="flex flex-col gap-3 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[17px] font-bold text-[#22303A]">저장된 내 목소리 사용</span>
              <Badge variant="success">보관된 목소리</Badge>
            </span>
            {/* reviewer 리뷰(디자인 시스템 롤아웃) — SelectableCard(button+aria-pressed)로 바꿨더니
                네이티브 라디오그룹 시맨틱스(스크린리더 "N개 중 1개 선택됨" 안내)가 사라지는 접근성
                회귀였다. 시각 스타일은 SelectableCard와 동일하게 유지하되 &lt;label&gt;+&lt;input
                type="radio"&gt;로 되돌린다(1회성 선택 항목이라 진짜 라디오그룹 의미가 맞음 — 형제
                화면들의 동일 패턴과도 일관). */}
            <ul className="flex flex-col gap-2" role="radiogroup" aria-label="저장된 내 목소리">
              {storedVoices.map((voice) => {
                const selected = selectedVoiceId === voice.voiceId;
                return (
                  <li key={voice.voiceId}>
                    <label
                      className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[16px] border-[1.5px] p-3 transition-colors ${
                        selected
                          ? "border-[#0E6B62] bg-[#E4F0EC]"
                          : "border-[#E2DDD3] bg-white hover:border-[#C9C2B6]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="stored-voice"
                        value={voice.voiceId}
                        checked={selected}
                        onChange={() => setSelectedVoiceId(voice.voiceId)}
                        className="h-5 w-5 accent-[#0E6B62]"
                      />
                      <span className="text-[16px] font-semibold text-[#22303A]">{voice.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              onClick={() => selectedVoiceId && void startWithVoice(selectedVoiceId, "reused")}
              disabled={!selectedVoiceId || starting}
            >
              이 목소리로 시작
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-bold text-[#22303A]">기본 남성·여성 목소리</span>
            <Badge variant="neutral">녹음 없이 시작</Badge>
          </span>
          <span className="text-sm leading-relaxed text-[#6B655C]">
            본인 목소리가 아닌 기본 합성 음성입니다.
          </span>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              type="button"
              onClick={() => void startWithVoice(GENERIC_VOICE_ID, "fallback_male")}
              disabled={starting}
            >
              남성 음성
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => void startWithVoice(GENERIC_VOICE_ID, "fallback_female")}
              disabled={starting}
            >
              여성 음성
            </Button>
          </div>
        </div>
      </div>

      {startError && (
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>{startError}</span>
        </p>
      )}

      {starting && (
        <p className="flex items-center gap-2 text-base text-[#6B655C]" role="status">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
          />
          연결하는 중...
        </p>
      )}
    </main>
  );
}
