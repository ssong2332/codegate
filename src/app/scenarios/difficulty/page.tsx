"use client";

// UX-029 난이도 선택 — 초급/중급/고급 (T72, docs/UX.md UX-029/D-41~D-43/P-12/P-22,
// docs/PRD.md AC-064/065/066/067, Architecture.md §15.3).
//
// **드릴다운의 마지막 단계**다(D-41): 유형(UX-015) → 체험/발송(UX-026) → [보이스+발송]방식(UX-016)
// → 시나리오(UX-017/UX-024) → **난이도(이 화면)** → 세션 생성 또는 UX-019(챌린지 만들기).
// 난이도를 시나리오 **뒤**에 둔 이유: 난이도는 "어떤 상황인가"가 아니라 "그 상황을 얼마나 세게
// 겪을 것인가"라 시나리오를 정한 뒤에 물어야 의미가 서며, 앞에 두면 "난이도가 시나리오 목록을
// 필터링한다"는 오해를 준다(난이도는 어떤 시나리오도 감추지 않는다).
//
// **이 화면이 하류 Exit를 통째로 넘겨받았다.** 예전에는 시나리오 목록 화면(ScenarioListView·
// scenarios/messenger)이 곧바로 createSession/challenge 라우팅을 했다 — 난이도가 "생성 직전"
// 단계이므로 그 분기 로직을 여기로 옮겼다(세션/챌린지 생성 지점이 한 곳으로 모여 난이도가 어느
// 경로에서도 누락될 수 없다). 분기 판정 자체(send/self, 에스컬레이션 여부, 채널)는 이관 전과
// **동일한 규칙**이며 새로 만든 판정은 없다.
//
// ⚠️ **AC-065(난이도 무게이팅)** — 이 화면은 어떤 안전장치도 건드리지 않는다: 동의 게이트(서버
// createSession의 consents 확인)·상시 종료(AC-006)·합성/모의 표식(AC-022)·사전 고지(AC-012)·
// 2인 안전제약(AC-040/042/043)은 세 난이도에서 완전히 동일하다. 고급 선택 시 **고지가 늘어날
// 뿐**(아래 ADVANCED_*_NOTICE) 어떤 컨트롤도 숨기거나 완화하지 않는다.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSession, getBeginnerBriefing } from "@/lib/api";
import {
  clearPendingSession,
  getExperienceMode,
  getOrCreatePendingSessionId,
  getSelectedScenarioId,
  setOpeningAudioUrl,
  setOpeningMessageText,
  setSelectedDifficultyLevel,
  setSelectedScenarioId,
} from "@/lib/recording";
import {
  ADVANCED_ONLY_LINE,
  ADVANCED_SELF_NOTICE,
  ADVANCED_SEND_NOTICE,
  DIFFICULTY_NOT_ALLOWED_REASON,
  PRE_SESSION_BURDEN_NOTICE,
  DIFFICULTY_LABEL,
  DIFFICULTY_SELF_DESCRIPTION,
  DIFFICULTY_SEND_DESCRIPTION,
  DIFFICULTY_SUMMARY,
  RECOMMENDED_DIFFICULTY_LEVEL,
  SCENARIO_TRAIT_LABEL,
  readFunctionsErrorReason,
  selectableDifficultyLevels,
  type DifficultyLevel,
} from "@/lib/difficulty";
import { scenarios, GENERIC_VOICE_ID, resolveScenarioEscalation } from "@/content/scenarios";
import { Badge, Button, LoadingDots, LoadingHintLine, SelectableCard } from "@/components/ui";
import { SESSION_PREP_HINTS } from "@/lib/motion/routeMotion";
import PersonaCardInputFields from "@/components/PersonaCardInputFields";
import {
  EMPTY_PERSONA_CARD_FORM,
  personaCardErrorLine,
  personaCardInputVisible,
  personaCardKindFor,
  personaInvalidLine,
  readPersonaCardForm,
  type PersonaCardForm,
  type PersonaCardInput,
} from "@/lib/personacard/personaCardInput";

type PageState = "ready" | "starting" | "start-error" | "difficulty-fallback";

export default function DifficultySelectPage() {
  const router = useRouter();
  // 직전 단계에서 확정된 시나리오·모드. lazy initializer로 마운트 시 1회만 읽는다(다른 드릴다운
  // 화면과 동일 패턴 — 이 앱은 정적 export라 하이드레이션 불일치가 없다).
  const [scenarioId] = useState<string | null>(() => getSelectedScenarioId());
  const [isSendMode] = useState<boolean>(() => getExperienceMode() === "send");

  // T191 S5(UX-029 v1.34 (3) · D-104) — 고급 전용 시나리오는 고급 카드 1장이 **처음부터 선택된 상태**다.
  const [selected, setSelected] = useState<DifficultyLevel | null>(() =>
    scenarioId && scenarios[scenarioId]?.advancedOnly === true ? "advanced" : null,
  );
  const [state, setState] = useState<PageState>("ready");
  const [startError, setStartError] = useState<string | null>(null);
  const [appliedLevel, setAppliedLevel] = useState<DifficultyLevel | null>(null);
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);
  // §88(UX D-131 (1)) — "이번 훈련 속 내 정보"(선택 · 기본 비움). 고급 × 대상 4종 × self일 때만 그린다(send는 UX-019가 받는다).
  const [personaForm, setPersonaForm] = useState<PersonaCardForm>(EMPTY_PERSONA_CARD_FORM);

  // 초급 사전 브리핑(D-43/AC-066) — **세션 시작 전**에만 보여준다. 대화 중 실시간 판정 표시가
  // 아니다(D-6 유지). 실패는 비차단(P-4): 브리핑을 못 받아도 난이도 선택·진행은 그대로 된다.
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingSignals, setBriefingSignals] = useState<string[] | null>(null);
  const [briefingError, setBriefingError] = useState(false);

  const scenario = scenarioId ? scenarios[scenarioId] : undefined;
  const isAdvancedOnly = scenario?.advancedOnly === true;
  // T191 S5(UX 계약 C-9 · D-106) — 부담 고지는 고급 고지 **바로 아래**(고급이 선택돼 있을 때만).
  const showBurdenNotice = scenario?.preSessionBurdenNotice === true && selected === "advanced";
  // §88(UX D-131 (1)) — self 모드에서만(send의 받는 분 정보는 UX-019가 받는다).
  const showPersonaInput = !isSendMode && personaCardInputVisible(scenarioId, selected, scenario?.channel);
  // §92(UX D-135) — 시나리오 카드 종류가 칸 · 안내 · 오류 문면을 정한다(자녀 칸은 자녀 납치 협박에만).
  const personaKind = personaCardKindFor(scenarioId);
  useEffect(() => {
    // UX 계약 C-10 — 이벤트는 종류만(시나리오 ID · 수법 0).
    if (showBurdenNotice) console.info(JSON.stringify({ event: "burden_notice_shown" }));
  }, [showBurdenNotice]);

  const handleSelect = (level: DifficultyLevel) => {
    setSelected(level);
    // 난이도를 바꾸면 열려 있던 초급 브리핑은 접는다(다른 난이도에는 해당 없는 정보).
    if (level !== "beginner") setBriefingOpen(false);
  };

  const handleToggleBriefing = useCallback(async () => {
    if (!scenarioId) return;
    if (briefingOpen) {
      setBriefingOpen(false);
      return;
    }
    setBriefingOpen(true);
    if (briefingSignals) return; // 이미 받아 둔 값 재사용.
    setBriefingError(false);
    try {
      const { signals } = await getBeginnerBriefing({ scenarioId });
      setBriefingSignals(signals);
    } catch {
      setBriefingError(true);
    }
  }, [scenarioId, briefingOpen, briefingSignals]);

  /** self·보이스 / self·메신저(비에스컬레이션)의 세션 생성 — 난이도만 추가된 기존 로직 그대로. */
  const startSelfSession = async (level: DifficultyLevel, sid: string, personaCardInput: PersonaCardInput | undefined) => {
    const isMessenger = scenario?.channel === "messenger";
    // "시작" = 새 훈련의 시작점. 직전 훈련을 "훈련 종료" 없이 빠져나온 경우 이전 사전 세션 id가
    // 남아 있을 수 있어 여기서 비우고 새 id를 발급한다(이관 전 ScenarioListView의 검증된 판단).
    // ⚠️ clearPendingSession은 난이도 힌트도 함께 지우므로, 지운 **뒤에** 이번 선택을 다시 심는다.
    clearPendingSession();
    setSelectedScenarioId(sid);
    setSelectedDifficultyLevel(level);
    const sessionId = getOrCreatePendingSessionId();
    if (!sessionId) return;

    const result = await createSession({
      sessionId,
      scenarioId: sid,
      voiceId: GENERIC_VOICE_ID,
      difficultyLevel: level,
      ...(isMessenger ? { channel: "messenger" as const, surface: scenario?.surface } : {}),
      // §88 — 넣은 칸이 있을 때만 싣는다(비면 필드 부재 = 카드 0 = 사기범이 이름 · 생년월일을 묻는다).
      ...(personaCardInput ? { personaCardInput } : {}),
    });
    // 오프닝 재생 힌트는 보이스 경로에서만 쓴다(메신저는 텍스트 전용 — 이관 전 동작 그대로).
    if (!isMessenger) {
      if (result.openingAudioUrl) setOpeningAudioUrl(result.openingAudioUrl);
      if (result.openingMessage.text) setOpeningMessageText(result.openingMessage.text);
    }

    const destination = isMessenger ? "/session/messenger" : "/session/play";
    // AC-064 "조용히 임의 난이도로 진행하지 않는다" — 서버가 확정한 값이 내가 고른 값과 다르면
    // (전달 누락·enum 밖) 곧바로 넘어가지 않고 무엇으로 진행되는지 1줄로 알린 뒤 사용자가 잇게 한다.
    if (result.difficultyLevel !== level) {
      setAppliedLevel(result.difficultyLevel);
      setPendingDestination(destination);
      setState("difficulty-fallback");
      return;
    }
    router.push(destination);
  };

  const handleStart = async () => {
    if (!selected || !scenarioId || state === "starting") return;
    // §88(UX D-131 (3)) — 입력 블록이 보일 때만 읽는다(숨은 칸의 값은 보내지 않는다). 형식 오류면 진행하지 않고 1줄로 알린다.
    let personaCardInput: PersonaCardInput | undefined;
    if (showPersonaInput) {
      const read = readPersonaCardForm(personaForm, undefined, personaKind ?? undefined);
      if (!read.ok) {
        setStartError(personaInvalidLine(personaKind));
        return;
      }
      personaCardInput = read.input;
    }
    setState("starting");
    setStartError(null);
    try {
      if (isSendMode) {
        // (send) UX-019 챌린지 만들기 — 그 화면이 난이도를 요약에 명시하고 createChallenge로 넘긴다.
        setSelectedDifficultyLevel(selected);
        router.push(`/challenge/create?scenarioId=${encodeURIComponent(scenarioId)}`);
        return;
      }
      // T194-a(Architecture.md §84.4.1 C-1 · UX D-124 ① · PRD AC-046 읽기 고지) — "에스컬레이션 가능"은 **고른 난이도까지 본**
      // (시나리오 × 난이도) 술어다. 택배 문자는 고급을 고른 경우에만 UX-025로 간다(초급 · 중급은 오지 않을 통화의 목소리를 묻지 않는다).
      if (resolveScenarioEscalation(scenario, selected)) {
        // (self·메신저 에스컬레이션 가능) UX-025 목소리 선택이 세션 생성을 마무리한다(D-25).
        // 난이도는 목소리 선택보다 **앞**이다(UX-024 v1.11 갱신) — 여기서 확정해 힌트로 넘긴다.
        setSelectedScenarioId(scenarioId);
        setSelectedDifficultyLevel(selected);
        router.push("/scenarios/messenger/voice-select");
        return;
      }
      await startSelfSession(selected, scenarioId, personaCardInput);
    } catch (err) {
      // T191 S5(UX 계약 C-2 · UX-029 v1.34 (3)) — 서버의 고급 전용 거부는 같은 1줄로 알린다(⛔ 중급 폴백 0).
      // 재시도는 그대로 같은 버튼이다(P-4).
      // §88 — 서버의 내 정보 거부(형식 · 대상 밖)는 D-131 (3) 문면으로 알린다.
      const reason = readFunctionsErrorReason(err);
      setStartError(
        reason === DIFFICULTY_NOT_ALLOWED_REASON
          ? ADVANCED_ONLY_LINE
          : (personaCardErrorLine(reason, personaKind) ?? "훈련을 시작하지 못했습니다. 다시 시도해 주세요."),
      );
      setState("ready");
    }
  };

  // 시나리오 맥락이 없으면(직접 URL 진입·세션스토리지 소실) 시나리오 선택부터 다시 시작한다.
  if (!scenarioId || !scenario) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-page p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-lg text-danger">
          <span aria-hidden="true">⚠</span>
          <span>시나리오 정보를 찾을 수 없습니다. 시나리오 선택부터 다시 시작해 주세요.</span>
        </p>
        <div className="w-full max-w-xs">
          <Button type="button" onClick={() => router.push("/scenarios")}>
            처음부터 다시 고르기
          </Button>
        </div>
      </main>
    );
  }

  const isMessenger = scenario.channel === "messenger";
  const typeLabel = isMessenger ? "메신저피싱" : "보이스피싱";
  const modeLabel = isSendMode ? "지인에게 보내기" : "본인이 체험";
  const advancedNotice = isSendMode ? ADVANCED_SEND_NOTICE : ADVANCED_SELF_NOTICE;

  return (
    // 실기 신고(2026-10-21) — `w-full`: body가 flex 열이라 `mx-auto`만 있으면 폭이 내용 길이를 따라간다. 난이도와
    // 펼침 블록(고급 고지 · 내 정보)에 상관없이 max-w 안에서 늘 같은 폭이 되게 고정한다(스크롤바 폭은 globals.css).
    <main className="drilldown-step mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 p-6 pb-28 lg:max-w-3xl xl:max-w-5xl">
      <header className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex min-h-[48px] w-fit items-center gap-1 rounded-lg px-2 -ml-2 text-lg font-medium text-ink-sub hover:bg-neutral-tint"
        >
          <span aria-hidden="true">←</span> 뒤로
        </button>
        {/* 단계 표시(P-12 #2) — 지금까지의 선택 경로를 텍스트로 안내한다. */}
        <p className="text-base font-semibold text-brand" aria-current="step">
          {typeLabel} › {modeLabel} › {scenario.title} › 난이도
        </p>
        <h1 className="text-2xl font-bold text-ink">
          {isSendMode ? "상대가 얼마나 세게 겪을까요?" : "얼마나 세게 겪어볼까요?"}
        </h1>
        <p className="text-lg leading-relaxed text-ink-sub">
          같은 상황을 어느 강도로 훈련할지 고릅니다. 어떤 난이도를 골라도{" "}
          <strong className="font-semibold text-ink">
            사전 고지·동의·언제든 훈련 종료·끝난 뒤 &apos;훈련이었습니다&apos; 안내는 똑같이 적용
          </strong>
          됩니다.
        </p>
        {/* AC-067 — 시나리오의 기존 고정 문자열은 삭제하지 않고 "성향"으로 라벨을 바꿔 유지한다.
            "난이도"라는 단어는 아래 3단계에만 쓴다(한 화면에서 두 뜻으로 쓰이지 않게). */}
        <p className="text-base text-ink-sub">
          {SCENARIO_TRAIT_LABEL}: {scenario.difficulty}
        </p>
      </header>

      {/* T191 S5(UX-029 v1.34 (3)) — 고급 전용: 카드 위 1줄 · 고급 1장만(초급 · 중급 카드는 비활성 표시도 0). */}
      {isAdvancedOnly && <p className="text-lg font-semibold text-ink">{ADVANCED_ONLY_LINE}</p>}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3">
        {selectableDifficultyLevels(scenario).map((level) => (
          <SelectableCard
            key={level}
            className="min-h-[48px]"
            selected={selected === level}
            onClick={() => handleSelect(level)}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {/* 색 단독 표기 금지(P-22) — 항상 텍스트 라벨을 함께 쓴다. */}
                <span>
                  {DIFFICULTY_LABEL[level]} — {DIFFICULTY_SUMMARY[level]}
                </span>
                {level === RECOMMENDED_DIFFICULTY_LEVEL && (
                  <Badge variant="neutral">추천</Badge>
                )}
              </span>
            }
            description={
              isSendMode ? DIFFICULTY_SEND_DESCRIPTION[level] : DIFFICULTY_SELF_DESCRIPTION[level]
            }
          />
        ))}
      </div>

      {/* 고급 고지(UX-029 States) — 확인 다이얼로그를 띄우지 않고(D-2/P-9) 선택 직후 인라인으로
          알린다. aria-live로 스크린리더에도 즉시 전달된다. 고지가 늘어날 뿐 안전 컨트롤은 그대로다. */}
      <p aria-live="polite" className="sr-only">
        {selected === "advanced" ? advancedNotice : ""}
        {showBurdenNotice ? ` ${PRE_SESSION_BURDEN_NOTICE}` : ""}
      </p>
      {selected === "advanced" && (
        <div className="rounded-[8px] border-[1.5px] border-caution/40 bg-caution-tint p-4">
          <p className="text-[17px] font-semibold leading-relaxed text-caution">
            <span aria-hidden="true">⚠ </span>
            {advancedNotice}
          </p>
          {/* 심리적 부담이 큰 시나리오는 기존 시나리오 설명의 경고를 함께 강조한다(UX-029 States). */}
          <p className="mt-2 text-[16px] leading-relaxed text-ink-sub">
            {SCENARIO_TRAIT_LABEL}: {scenario.difficulty}
          </p>
        </div>
      )}
      {/* T191 S5(UX-029 v1.34 (5) · D-106) — 셀프 감금 부담 고지. 고급 고지와 같은 인라인 형식 · 다이얼로그 ·
          체크 · 추가 탭 0 · 경고 아이콘 · 경고색 0(안내다 — P-36). 낭독은 위 aria-live가 고급 고지에 이어 읽는다. */}
      {showBurdenNotice && (
        <p className="rounded-[8px] border-[1.5px] border-line bg-white p-4 text-[17px] leading-relaxed text-ink">
          {PRE_SESSION_BURDEN_NOTICE}
        </p>
      )}

      {/* §88(UX D-131 (1)) — 고급 고지 · 부담 고지 아래. 처음부터 펼침 · 세 칸 모두 비움(선택). */}
      {showPersonaInput && (
        <PersonaCardInputFields
          mode="self"
          kind={personaKind ?? undefined}
          value={personaForm}
          onChange={setPersonaForm}
          disabled={state === "starting"}
        />
      )}

      {/* 초급 사전 브리핑(D-43/AC-066) — "이 대화에서 나올 수 있는 위험 신호 미리 보기". */}
      {/* T191 S5(UX 계약 C-3 · OQ-U72) — 서버가 공통 신호 0개(빈 배열)를 주면 진입 자체를 그리지 않는다. */}
      {selected === "beginner" && !(briefingSignals && briefingSignals.length === 0) && (
        <div className="rounded-[8px] border-[1.5px] border-line bg-white p-4">
          <button
            type="button"
            onClick={() => void handleToggleBriefing()}
            aria-expanded={briefingOpen}
            className="flex min-h-[48px] w-full items-center justify-between gap-2 text-left text-[17px] font-semibold text-brand"
          >
            <span>이 대화에서 나올 수 있는 위험 신호 미리 보기</span>
            {/* UX D-134 — 화살표 하나를 돌린다(펼침 = 위). reduced-motion이면 즉시 바뀐다. */}
            <span
              aria-hidden="true"
              className={`inline-block transition-transform duration-200 motion-reduce:transition-none ${briefingOpen ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </button>
          {briefingOpen && (
            <div className="motion-reveal mt-2">
              {briefingError ? (
                <p role="alert" className="text-[16px] text-danger">
                  위험 신호를 불러오지 못했습니다. 훈련은 그대로 시작할 수 있어요.
                </p>
              ) : briefingSignals ? (
                <>
                  <p className="text-[16px] leading-relaxed text-ink">
                    이 대화에서는 아래와 같은 신호가 나옵니다. 대화 중에는 따로 알려주지 않으니
                    직접 알아채 보세요.
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {briefingSignals.map((signal) => (
                      <li key={signal}>
                        <Badge variant="caution">{signal}</Badge>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p role="status" className="flex items-center gap-2.5 text-[16px] text-ink-sub">
                  <LoadingDots className="text-brand" />
                  불러오는 중입니다
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 난이도 전달 실패 폴백 고지(AC-064 "침묵 실패 금지") — 조용히 다른 난이도로 넘어가지 않는다. */}
      {state === "difficulty-fallback" && appliedLevel && (
        <div className="rounded-[8px] border-[1.5px] border-caution/40 bg-caution-tint p-4">
          <p role="alert" className="text-[17px] leading-relaxed text-caution">
            난이도가 제대로 전달되지 않아 <strong>{DIFFICULTY_LABEL[appliedLevel]}</strong>으로
            진행합니다.
          </p>
          <div className="mt-3">
            <Button
              type="button"
              onClick={() => pendingDestination && router.push(pendingDestination)}
            >
              이대로 계속하기
            </Button>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 -mx-6 -mb-28 border-t border-line bg-page/95 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur">
        {startError && (
          <p role="alert" className="mb-3 flex items-center gap-2 text-lg text-danger">
            <span aria-hidden="true">⚠</span>
            <span>{startError}</span>
          </p>
        )}
        {/* AC-064 — 난이도를 고르지 않으면 진행 버튼 비활성(제출 후 오류 대신 사전 차단, P-5). */}
        <Button
          type="button"
          onClick={() => void handleStart()}
          disabled={!selected || state === "starting" || state === "difficulty-fallback"}
        >
          {state === "starting" ? (
            <span className="flex items-center justify-center gap-2.5">
              <LoadingDots />
              준비하는 중
            </span>
          ) : (
            "이 난이도로 시작"
          )}
        </Button>
        {/* UX D-134 — 세션 생성은 길게는 15초쯤 걸린다. 서버가 실제로 하는 일만 말하고, 경과 시간에 따라 안심 문구를 덧붙인다
            (⛔ 진행률 · 단계 완료 표시 없음). 마운트 = 대기 시작이라 매번 0초부터 잰다. */}
        {state === "starting" && !isSendMode && selected && !resolveScenarioEscalation(scenario, selected) && (
          <LoadingHintLine hints={SESSION_PREP_HINTS} className="mt-2 text-center" />
        )}
      </div>
    </main>
  );
}
