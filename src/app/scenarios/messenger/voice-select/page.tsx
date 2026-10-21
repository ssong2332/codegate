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
//
// ⭐ D-130(UX v1.42 · PRD AC-046 갱신 고지 v1.29 · Architecture §87 · DECISIONS #198) — ①·②는 **send 모드에서만**
// 그린다(`shouldShowCloneVoiceOptions`). self(본인이 체험)에서 사기범이 내 목소리로 말하면 훈련 의미가 없다.
// self에서는 녹음 복귀 트립도 만들지 않고(①의 핸들러 가드) 남은 복귀 플래그는 버린다. 서버 `createSession`도
// recorded · reused를 거부한다(2중 방어). 오늘 send는 이 화면에 오지 않으므로 실제로는 ③만 보인다.
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
  // T72(UX-029) — 난이도는 이 화면보다 앞에서 확정되며, 여기서는 소비·보존만 한다.
  getSelectedDifficultyLevel,
  setSelectedDifficultyLevel,
  getExperienceMode,
  shouldShowCloneVoiceOptions,
} from "@/lib/recording";
import { fetchStoredVoices, type StoredVoiceSummary } from "@/lib/voices/fetchStoredVoices";
import { scenarios, GENERIC_VOICE_ID, resolveScenarioEscalation } from "@/content/scenarios";
import { Badge, Banner, Button, LoadingDots, LoadingHintLine, LoadingStatus } from "@/components/ui";
import { SESSION_PREP_HINTS } from "@/lib/motion/routeMotion";

type PageState = "no-scenario" | "returning-error" | "ready";

export default function MessengerVoiceSelectPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  // sessionStorage 조회는 클라 전용이라 lazy 초기값으로 한 번만 읽는다(다른 화면과 동일 관례).
  const [scenarioId] = useState<string | null>(() => getSelectedScenarioId());
  const scenario = scenarioId ? scenarios[scenarioId] : null;
  // hasMessengerVoiceSelectReturn을 peek만 해서 렌더 분기를 정하고, 실제 소비(consume)는 아래
  // effect에서 1회만 한다(react-hooks/set-state-in-effect 회피, 다른 화면과 동일 패턴).
  // D-130 — ①·② 노출 여부. 모드 힌트는 이 화면보다 앞(UX-026)에서 확정된다(부재 = self로 본다).
  const [showCloneOptions] = useState<boolean>(() => shouldShowCloneVoiceOptions(getExperienceMode()));
  // D-130 — self에서는 녹음 복귀 트립을 처리하지 않는다(recorded로 세션을 만들지 않는다).
  const [isReturningFlow] = useState<boolean>(() => showCloneOptions && hasMessengerVoiceSelectReturn());

  const [pageState, setPageState] = useState<PageState>(() => {
    // T194-a(Architecture.md §84.4.1 C-4 · UX-025 v1.38) — 진입 가드도 (시나리오 × 난이도) 술어다. 난이도는 이 화면보다 앞(UX-029)에서
    // 확정된 세션 전 힌트를 쓴다(부재 = 서버 기본값 중급과 같은 결과). 택배 초급 · 중급으로는 이 화면에 들어올 수 없다.
    if (!scenarioId || !scenario || !resolveScenarioEscalation(scenario, getSelectedDifficultyLevel())) return "no-scenario";
    return "ready";
  });
  const [storedVoices, setStoredVoices] = useState<StoredVoiceSummary[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // 보관 목소리 조회(Empty면 ②를 숨긴다 — §13.6 "MVP는 ①+③로 성립"). 실패해도 ①·③은 그대로
  // 쓸 수 있어(P-4 비차단) 조용히 빈 목록으로 흡수한다.
  useEffect(() => {
    // D-130 — ②를 그리지 않는 모드(self)에서는 보관 목소리를 조회하지 않는다.
    if (!user || !showCloneOptions) return;
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
  }, [user, showCloneOptions]);

  // D-130 — self에서 남은 녹음 복귀 플래그(예: 이 변경 전 탭에서 시작한 녹음)는 처리하지 않고 버린다.
  // 플래그가 남으면 clone/wait가 계속 이 화면으로 되돌린다. 지우기만 하므로 Strict Mode 이중 호출에도 안전하다.
  useEffect(() => {
    if (showCloneOptions) return;
    consumeMessengerVoiceSelectReturn();
  }, [showCloneOptions]);

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
        const difficultyLevel = getSelectedDifficultyLevel();
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
          // T72(UX-029/AC-064) — 난이도는 이 화면보다 **앞 단계**(UX-029)에서 확정된다. 녹음
          // 왕복(record→clone/wait) 동안에도 sessionStorage 힌트로 살아남아 여기서 소비된다.
          // 부재면 서버가 중급으로 확정한다(조용한 임의 난이도 진행 금지 — 서버 응답으로 확인 가능).
          ...(difficultyLevel ? { difficultyLevel } : {}),
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
      // T72 — clearPendingSession은 난이도 힌트도 지우므로 지우기 **전에** 읽고 **뒤에** 되심는다
      // (세션 셸 배지·후속 화면이 계속 참조한다). 값 자체는 아래 createSession에도 그대로 넘긴다.
      const difficultyLevel = getSelectedDifficultyLevel();
      clearPendingSession();
      if (difficultyLevel) setSelectedDifficultyLevel(difficultyLevel);
      const sessionId = getOrCreatePendingSessionId();
      if (!sessionId) throw new Error("no-session-storage");
      const result = await createSession({
        sessionId,
        scenarioId,
        voiceId,
        channel: "messenger",
        surface: scenario.surface,
        voiceSelectionSource,
        ...(difficultyLevel ? { difficultyLevel } : {}),
      });
      void result;
      router.push("/session/messenger");
    } catch {
      setStarting(false);
      setStartError("훈련을 시작하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  const handleStartRecording = () => {
    // D-130 — self에서는 녹음 복귀 트립을 만들지 않는다(①을 그리지 않지만 핸들러에도 같은 가드를 둔다).
    if (!showCloneOptions || !scenarioId || starting) return;
    const difficultyLevel = getSelectedDifficultyLevel();
    clearPendingSession();
    // clearPendingSession이 방금 지운 선택 시나리오 id를 복원한다 — record→clone/wait 왕복 뒤
    // 이 화면으로 돌아왔을 때도 어떤 시나리오였는지 알아야 createSession을 마무리할 수 있다.
    setPendingSelectedScenarioId(scenarioId);
    // T72 — 난이도(UX-029에서 이미 확정)도 같은 이유로 복원한다. 안 그러면 녹음 왕복만으로
    // 사용자가 고른 난이도가 조용히 사라져 중급으로 진행된다.
    if (difficultyLevel) setSelectedDifficultyLevel(difficultyLevel);
    getOrCreatePendingSessionId();
    setMessengerVoiceSelectReturn();
    router.push("/onboarding/record");
  };

  if (pageState === "no-scenario") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-lg text-danger">
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
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page p-8 text-center">
        <LoadingStatus label="목소리 클론이 준비됐습니다. 훈련을 시작하는 중입니다" hints={SESSION_PREP_HINTS} />
      </main>
    );
  }

  if (pageState === "returning-error") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-lg text-danger">
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
    <main className="drilldown-step mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-6 pb-10">
      <header className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push("/scenarios/messenger")}
          className="flex min-h-[48px] w-fit items-center gap-1 rounded-lg px-2 -ml-2 text-lg font-medium text-ink-sub hover:bg-neutral-tint"
        >
          <span aria-hidden="true">←</span> 뒤로
        </button>
        {/* 전이 플로우.dc.html "이 대화는 통화로 이어질 수 있어요" 배너 재사용(Banner 공용
            컴포넌트, sticky·닫기 불가 — AC-047과 동일한 상시 고지 원칙). */}
        <Banner variant="caution" sticky>
          <span className="font-semibold text-caution">이 대화는 통화로 이어질 수 있어요.</span>{" "}
          상대가 메시지 도중 전화를 걸어올 수 있는 시나리오예요.
        </Banner>
        <h1 className="text-2xl font-bold text-ink">통화용 목소리를 정해 주세요</h1>
        <p className="text-lg leading-relaxed text-ink-sub">
          이 시나리오는 통화로 이어질 수 있어 목소리가 필요할 수 있습니다. 지금 미리 정해 두면
          나중에 끊김 없이 전화로 넘어갑니다.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {/* "지금 30초 녹음"은 선택 후 별도 확정이 아니라 클릭 즉시 녹음 화면으로 이동하는
            단일 액션이라(D-25 기존 로직 무변경) SelectableCard(선택→별도 확정 버튼)의 상시
            "미선택" 원 어포던스를 그대로 쓰지 않고, 디자인 시스템의 카드 톤(테두리/라운드/배지)만
            재사용한 커스텀 카드로 둔다 — 판단 근거는 팀 보고 참고.
            D-130 — ①·②는 send 모드에서만 그린다(self = ③만). */}
        {showCloneOptions && (
          <button
            type="button"
            onClick={handleStartRecording}
            disabled={starting}
            className="flex min-h-[64px] flex-col items-start gap-2 rounded-[8px] border-[1.5px] border-line bg-white p-5 text-left transition-colors hover:border-brand disabled:opacity-50"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[17px] font-bold text-ink">지금 30초 녹음</span>
              <Badge variant="caution">30초 소요</Badge>
            </span>
            <span className="text-base leading-relaxed text-ink-sub">
              본인 목소리를 녹음해 통화에서 그대로 씁니다.
            </span>
          </button>
        )}

        {showCloneOptions && storedVoices.length > 0 && (
          <div className="flex flex-col gap-3 rounded-[8px] border-[1.5px] border-line bg-white p-5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[17px] font-bold text-ink">저장된 내 목소리 사용</span>
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
                      className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[8px] border-[1.5px] p-3 transition-colors ${
                        selected
                          ? "border-brand bg-brand-tint"
                          : "border-line bg-white hover:border-line-strong"
                      }`}
                    >
                      <input
                        type="radio"
                        name="stored-voice"
                        value={voice.voiceId}
                        checked={selected}
                        onChange={() => setSelectedVoiceId(voice.voiceId)}
                        className="h-5 w-5 accent-brand"
                      />
                      <span className="text-[18px] font-semibold text-ink">{voice.label}</span>
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

        <div className="flex flex-col gap-3 rounded-[8px] border-[1.5px] border-line bg-white p-5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-bold text-ink">기본 남성·여성 목소리</span>
            <Badge variant="neutral">녹음 없이 시작</Badge>
          </span>
          <span className="text-base leading-relaxed text-ink-sub">
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
        <p role="alert" className="flex items-center gap-2 text-lg text-danger">
          <span aria-hidden="true">⚠</span>
          <span>{startError}</span>
        </p>
      )}

      {/* UX D-134 — 세션 생성(createSession)은 길게는 15초쯤 걸린다. 경과 시간에 따라 안심 문구만 덧붙인다(진행률 없음). */}
      {starting && (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2.5 text-lg text-ink-sub" role="status">
            <LoadingDots className="text-brand" />
            연결하는 중
          </p>
          <LoadingHintLine hints={SESSION_PREP_HINTS} />
        </div>
      )}
    </main>
  );
}
