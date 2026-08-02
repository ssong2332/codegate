"use client";

// Gemini Live 실시간 speech-to-speech 세션 본체 (UX-014 live phase, 2026-07-22 무료 경로).
//
// ⚠️ RealtimeVoiceSession(ElevenLabs)과 마찬가지로 **지연 로딩 전용**이다 — 서버가 자격증명을
// 준 경우에만 마운트한다. 화면 요소는 없고(렌더링 null) 세션 생명주기만 관리한다.
//
// ElevenLabs SDK는 마이크/스피커를 대신 다뤄줬지만 Live API는 오디오를 직접 흘려보내야 한다:
//   보내기: 마이크 Float32 → 16kHz PCM16 → base64 → sendRealtimeInput
//   받기:   base64 PCM16(24kHz) → Float32 → AudioBuffer 큐로 순차 재생
//
// 보안 메모: 여기서 넘기는 건 서버가 발급한 단기 토큰뿐이다. 모델·시스템 프롬프트·도구는 토큰
// 발급 시점에 서버가 고정했으므로(liveConnectConstraints) 이 파일이 프롬프트를 알 필요도, 알 수도
// 없다(ADR-0004).
//
// ⚠️ 반드시 지킬 것(2026-07-23 "연결하는 중" 고착 디버깅에서 확인):
//   - **단기 토큰은 v1alpha에서만 유효**하다 — GoogleGenAI 생성 시 httpOptions.apiVersion="v1alpha"를
//     빠뜨리면 안 된다(빠뜨리면 SDK가 경고를 내고 접속이 불안정해진다).
//   - **AudioContext는 사용자 제스처 밖(비동기 effect)에서 만들어지면 suspended로 시작**한다 —
//     resume()을 명시적으로 호출하지 않으면 소리가 안 난다.
//   - 개발 중에는 각 단계 로그(console.info "[gemini] ...")를 남겨, 접속이 어디서 멈추는지
//     F12 콘솔로 바로 진단할 수 있게 한다.
import { useEffect, useRef } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import type { CreateRealtimeCallResponse } from "@/lib/api";
import {
  GEMINI_INPUT_SAMPLE_RATE,
  GEMINI_OUTPUT_SAMPLE_RATE,
  base64ToFloat32,
  floatToPcm16,
  pcm16ToBase64,
} from "./pcm";
import {
  INITIAL_USER_SPEECH_DEBOUNCE_STATE,
  computeRmsFromByteTimeDomain,
  nextUserSpeechDebounceState,
} from "./userSpeechLevel";
import { computeGateCloseDelayMs, resolveTurnInProgress } from "./agentSpeechGate";

export type GeminiVoiceSessionProps = {
  credentials: CreateRealtimeCallResponse;
  onActive: () => void;
  onEnded: () => void;
  onError: () => void;
  onSpeakingChange: (speaking: boolean) => void;
  /** 사용자 신고(2026-07-24, "내 말을 잘 듣고 있는지 보고 싶다") — 로컬 마이크 입력이 실제로
   * 잡히고 있는지를 사용자 파형 인디케이터로 보여주기 위한 신호. 서버 VAD 판정을 기다리지 않고
   * 로컬에서 즉시 계산하므로, "서버가 내 말을 인식했다"가 아니라 "마이크가 지금 소리를 잡고
   * 있다"는 진단/피드백 신호다(active/agentSpeaking과 동일한 boolean 계약, CallWaveform 재사용). */
  onUserSpeakingChange: (speaking: boolean) => void;
  /** 완성된 발화 1턴을 부모로 올린다(리포트 기록용, finding #1). role은 user/scammer. */
  onTranscriptTurn: (role: "user" | "scammer", text: string) => void;
  stopSignal: number;
  muted: boolean;
  /** 사용자 신고(2026-07-25) — "키패드가 실제로 작동하지 않는다 + 타이핑으로도 통화할 수 있게 해서
   * 스스로 검증할 수 있게 해봐". 실시간 통화 중 타이핑한 문장을 **같은 Live 세션 안으로** 넣는다
   * (`sendClientContent`). 예전엔 실시간 모드에서 텍스트 입력 자체를 숨겼는데, 그 이유는 텍스트를
   * `sendMessage`(별도 텍스트 LLM+TTS)로 보내면 실시간 음성 위에 다른 목소리가 겹치기 때문이었다
   * — 같은 세션에 넣으면 그 문제가 원천적으로 없고, 응답도 평소처럼 이 통화의 목소리로 나온다.
   * `stopSignal`과 동일한 카운터 패턴을 쓴다(값이 바뀔 때 1회 전송). */
  textMessage: { text: string; seq: number } | null;
  /**
   * T68(UX-027/UF-008, §15.1.2) — 사기범 발화 1턴이 끝날 때마다(=`turnComplete`) 부모에게 알린다.
   * 부모는 이 카운트만으로 "몇 번째 사기범 턴인가"를 세어 통화 중 문자 도착 트리거를 판단한다.
   * ⚠️ 이 카운팅은 §13.5 스킨과 같은 **프레젠테이션 층위**다 — 안전 판정을 게이팅하지 않고, 서버가
   * `smsId`의 시나리오 소속을 재검증한다(G12). 부모가 안 넘기면 아무 일도 일어나지 않는다.
   */
  onScammerTurnComplete?: () => void;
  /**
   * T68 — 문자 도착 순간 서버가 준 `announceInstruction`을 **같은 Live 세션에 텍스트 턴으로** 주입한다.
   * `textMessage`와 전송 경로는 같지만(`sendClientContent`) **전사에 기록하지 않는다** — 이건 사용자
   * 발화가 아니라 오케스트레이션 지시라, 기록하면 리포트가 "사용자가 이런 말을 했다"고 오판한다.
   * 선례: 같은 파일의 `OPENING_TRIGGER_TURN`(연결 직후 발화 시작 신호, 역시 미기록).
   */
  instructionTurn?: { text: string; seq: number } | null;
  /**
   * ⭐ **T118 / 층 A5-α(§25.3)** — 호 전환 이후 사기범 턴 경계마다 다시 넣는 **전환 상태 단언 1줄**.
   *
   * `instructionTurn`과 **다른 슬롯**인 이유(설계 확정, 임의로 합치지 말 것):
   *   - **턴 슬롯을 소비하지 않는다.** `turnComplete: false`로 보내 모델 응답을 유발하지 않으므로
   *     문자 announce·확인 지시의 큐(§16.6 G31)와 경합하지 않는다. 같은 슬롯에 합치면 이 값이 매
   *     사용자 턴마다 큐를 차지해 다른 지시를 밀어낸다.
   *   - **P-1 프로브 실측이 근거다**(§25.3 (4)): 전환 후 `turnComplete:false`로 1회 보내고 30초
   *     무발화를 유지했을 때 소켓 오류 0건·close 0건·신규 사기범 발화 0건이었다 ⇒ A5-α 채택.
   * ⚠️ `instructionTurn`과 마찬가지로 **전사에 기록하지 않는다**(**G105**) — 기록하면 리포트가
   * "사용자가 이런 말을 했다"고 오판해 속았는지 판정이 오염된다.
   */
  personaStateTurn?: { text: string; seq: number } | null;
};

// 마이크 캡처 버퍼 크기 — 작을수록 지연이 낮지만 콜백이 잦다. 사용자 신고(2026-07-25, "내가 말하고
// ai가 말하는 데 걸리는 시간이 길다") 대응으로 4096→2048로 낮춘다. 48kHz 기준 한 콜백이 모으는
// 시간이 약 85ms→43ms로 줄어, 발화 끝부분이 서버에 도달하는 시점이 그만큼 앞당겨진다.
// ⚠️ 이 값이 줄이는 것은 **클라이언트 버퍼링 구간뿐**이다 — 체감 지연의 지배적 요소는 Gemini
// 서버측 모델 추론·음성 생성 시간이라 앱에서 제거할 수 없다(수십 ms 개선, 실측 아님).
const CAPTURE_BUFFER_SIZE = 2048;

// 사용자 신고(2026-07-24) — 연결 직후 사용자가 먼저 말해야 대화가 시작되던 문제. Gemini Live는
// ElevenLabs의 firstMessage 같은 "이 문장을 그대로 말하라" 오버라이드가 없다(sendClientContent로
// 보낸 turns는 모델이 응답을 생성할 입력일 뿐, 그대로 낭독하지 않는다) — 대신 llm/geminiClient.ts의
// OPENING_TRIGGER_TURN과 동일한 발상으로, "지금 막 연결됐으니 캐릭터로서 먼저 말을 걸라"는
// 오케스트레이션 신호만 보낸다. 시스템 프롬프트(페르소나·수법·가드레일)는 이미 토큰 발급 시점에
// liveConnectConstraints로 고정돼 있어(ADR-0004) 이 트리거가 캐릭터를 바꾸거나 새 지시를 주입하지
// 않는다 — 단지 "지금 발화를 시작하라"는 신호일 뿐이다. 텍스트가 아니라 오디오 모달리티로만
// 응답하도록 config에 이미 고정돼 있어(responseModalities:[AUDIO], geminiProvider.ts) 이 트리거
// 자체가 사용자에게 텍스트로 노출될 일도 없다.
// 사용자 신고(2026-07-25) — 오프닝이 다짜고짜 요구·압박부터 들어가 시나리오 배경이 없다는 피드백.
// generateOpeningLine(functions/src/roleplay/openingLine.ts)의 OPENING_TURN_INSTRUCTION과 동일한
// 취지를 트리거 문구에도 반영 — 신분·연락 이유를 먼저 밝히게 한다.
const OPENING_TRIGGER_TURN =
  "(전화가 방금 연결됐다. 지금 막 전화를 받은 상대에게 캐릭터로서 자연스럽게 첫 마디를 건네라. 다짜고짜 요구나 압박부터 하지 말고, 먼저 신분(사칭 기관·관계)과 전화를 건 이유를 1~2문장으로 밝히며 상황을 설명한 뒤에 이어가라.)";

// 이름 있는 타입으로 분리한 이유 — `let session: T | null` 선언부에서 `T`를 인라인으로 쓰면
// `session = (...) as unknown as typeof session`처럼 자기참조 캐스트를 할 때, 같은 표현식 안의
// 콜백 클로저(onclose 등)가 session을 참조하는 것과 얽혀 TS가 타입을 `never`로 좁혀버리는 문제가
// 있었다(실측). 이름 있는 타입으로 자기참조를 없애 해결한다.
type GeminiLiveSession = {
  sendRealtimeInput: (i: unknown) => void;
  sendClientContent: (i: { turns?: unknown; turnComplete?: boolean }) => void;
  close: () => void;
};

const log = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.info("[gemini]", ...args);
};

export default function GeminiVoiceSession({
  credentials,
  onActive,
  onEnded,
  onError,
  onSpeakingChange,
  onUserSpeakingChange,
  onTranscriptTurn,
  stopSignal,
  muted,
  textMessage,
  onScammerTurnComplete,
  instructionTurn,
  personaStateTurn,
}: GeminiVoiceSessionProps) {
  const handlersRef = useRef({
    onActive,
    onEnded,
    onError,
    onSpeakingChange,
    onUserSpeakingChange,
    onTranscriptTurn,
    onScammerTurnComplete,
  });
  const mutedRef = useRef(muted);
  // 정리 대상들 — 언마운트 시 전부 닫지 않으면 마이크가 계속 열려 있다.
  const cleanupRef = useRef<(() => void) | null>(null);
  // 타이핑 입력을 같은 Live 세션에 넣기 위한 참조(아래 textMessage effect가 쓴다). 메인 effect의
  // 지역 변수 `session`은 밖에서 볼 수 없으므로 연결 직후 여기에 같이 담아 둔다.
  const liveSessionRef = useRef<GeminiLiveSession | null>(null);

  useEffect(() => {
    handlersRef.current = {
      onActive,
      onEnded,
      onError,
      onSpeakingChange,
      onUserSpeakingChange,
      onTranscriptTurn,
      onScammerTurnComplete,
    };
  }, [
    onActive,
    onEnded,
    onError,
    onSpeakingChange,
    onUserSpeakingChange,
    onTranscriptTurn,
    onScammerTurnComplete,
  ]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // startedRef로 재실행을 막지 않는다(2026-07-23) — React Strict Mode(dev)는 mount→cleanup→mount를
  // 하는데, startedRef가 있으면 재mount 때 연결을 건너뛰어 "연결하는 중"에 갇힌다. 대신 각 실행이
  // 자기 cancelled 플래그로 정리하므로, 버려지는 첫 실행은 connect 전에 취소되고(토큰 소모 없음)
  // 진짜 실행이 새로 연결한다.
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let inputContext: AudioContext | null = null;
    let outputContext: AudioContext | null = null;
    let processor: ScriptProcessorNode | null = null;
    let session: GeminiLiveSession | null = null;
    // 받은 오디오를 이어붙일 다음 재생 시작 시각(출력 컨텍스트 시간축 기준).
    let nextPlayTime = 0;
    // 현재 예약/재생 중인 오디오 소스들 — interrupted 시 이걸 전부 멈추지 않으면 이전 응답의
    // 남은 소리 위에 새 응답이 겹쳐 나와 "다른 AI가 말하는" 것처럼 들린다(2026-07-23 겹침 버그).
    const scheduledSources = new Set<AudioBufferSourceNode>();
    const stopAllPlayback = () => {
      scheduledSources.forEach((s) => {
        try {
          s.stop();
        } catch {
          // 이미 끝난 소스는 무시.
        }
      });
      scheduledSources.clear();
      nextPlayTime = 0;
    };
    let speakingTimer: ReturnType<typeof setTimeout> | null = null;
    // 반이중(half-duplex): AI가 말하는 동안엔 마이크 프레임을 보내지 않는다. 스피커→마이크 에코가
    // 민감한 VAD에 사용자 발화로 오인돼 AI가 자기 말을 끊는 것을 막는 핵심 장치(에코 제거만으론
    // 노트북 스피커에서 부족). AI 발화가 끝나면(turnComplete/침묵) 다시 열린다.
    let agentSpeaking = false;
    // 사용자 발화 파형 인디케이터(2026-07-24, 사용자 신고 — "일단 잘 파악하는지 보고 싶다") 상태.
    // cleanup()이 async IIFE 밖에서 정의되므로, raf 핸들을 여기 바깥 스코프에 미리 선언해 둔다
    // (session/processor와 동일한 패턴 — 안에서 값만 대입). RMS 계산·문턱값·off-디바운스 자체는
    // 순수 함수(userSpeechLevel.ts, Major #6 — 브라우저 전용 API가 아니라 별도로 단위 테스트됨)로
    // 분리했고, 여기서는 매 프레임 그 함수에 넘길 상태만 들고 있는다.
    let userSpeechDebounceState = INITIAL_USER_SPEECH_DEBOUNCE_STATE;
    let userLevelRafId: number | null = null;
    // 전사(transcript)는 조각으로 스트리밍되므로 턴이 끝날 때(turnComplete)까지 모았다가 flush한다.
    let userBuffer = "";
    let scammerBuffer = "";

    const flushTranscript = () => {
      const u = userBuffer.trim();
      const s = scammerBuffer.trim();
      if (u) handlersRef.current.onTranscriptTurn("user", u);
      if (s) handlersRef.current.onTranscriptTurn("scammer", s);
      userBuffer = "";
      scammerBuffer = "";
    };

    // 끼어들기(interrupted)로 모델이 문장 중간에 멈췄을 때 **사기범 조각만** 내보낸다.
    //
    // 왜 flushTranscript()가 아닌가(2026-07-25 수정): interrupted 처리에 early return이 있어
    // scammerBuffer가 flush도 clear도 되지 않고 남았고, 그 조각이 **다음 사기범 말풍선 앞에 그대로
    // 붙었다.** 리포트 분석은 `scammer(i)` ↔ `user(i+1)` 짝짓기에 의존하므로(analyzeConversation),
    // 턴 경계가 밀리면 "속은 순간"이 엉뚱한 턴을 가리킨다.
    //
    // 그렇다고 flushTranscript()로 둘 다 내보내면 안 된다 — interrupted 시점은 **사용자가 막 말을
    // 시작한 순간**이라 userBuffer는 아직 채워지는 중이다. 둘 다 내보내면 emit 순서상 사용자 턴이
    // 사기범의 잘린 턴보다 **앞에** 기록돼 시간 순서가 뒤집힌다. 사용자 조각은 그대로 두고 다음
    // turnComplete에서 정상적으로 flush되게 한다.
    const flushScammerTurn = () => {
      const s = scammerBuffer.trim();
      if (s) handlersRef.current.onTranscriptTurn("scammer", s);
      scammerBuffer = "";
    };

    // 자기 말 끊김 버그 수정(2026-07-25, 사용자 신고 "대화가 자연스럽지 않다") — 예전엔 이 타이머가
    // **청크 도착** 시점 기준 고정 600ms였다. Gemini는 오디오를 실시간보다 빠르게 스트리밍하므로
    // (4초짜리 발화의 청크가 1초 만에 다 도착할 수 있다) agentSpeaking이 **재생이 끝나기 한참 전에**
    // false로 떨어졌고, 그 순간 반이중 게이트(`if (agentSpeaking) return`)가 풀려 마이크가 다시
    // 열렸다 — 스피커로 나가던 AI 목소리가 마이크로 되돌아가 Gemini VAD가 이를 사용자 발화로 오인해
    // 자기 말을 스스로 끊는(interrupted) 일이 생길 수 있는 구조였다. 이제 **예약된 재생이 실제로
    // 끝나는 시각**(nextPlayTime) 기준으로 타이머를 잡는다.
    // **2차 수정(2026-07-25, 사용자 신고 "말을 하다가 마는 현상")**: 위 1차 수정으로도 부족했다.
    // 기준을 "청크 도착"에서 "재생 종료"로 옮겼지만, 옳은 기준은 한 칸 더 가서 **"턴 종료"**였다.
    // 모델이 문장 중간에 잠깐 생성을 멈추면(한국어 "혹시…", "저희가…" 같은 연결어 뒤) 예약 재생이
    // 비고, 그 순간 게이트가 열려 방 소음이 VAD에 사용자 발화로 잡혀 모델이 **생성 자체를 중단**했다.
    // 이제 대기 시간 계산을 agentSpeechGate.ts(순수 함수·테스트로 고정)에 위임한다 — 턴 진행 중이면
    // 넉넉히, turnComplete 뒤면 꼬리 재생이 끝날 때까지. 판단 근거와 상수 선택 이유는 그쪽 주석 참고.
    // ⚠️ turnInProgress는 **여기서 직접 뒤집지 않는다.** 이번 메시지의 신호 3개(오디오·turnComplete·
    // interrupted)를 함께 보고 resolveTurnInProgress가 정한다 — turnComplete가 마지막 오디오 청크와
    // 같은 메시지로 오기 때문에(reviewer Critical, agentSpeechGate.ts 주석 참고) 어느 한쪽만 보고
    // 뒤집으면 서로를 덮어쓴다.
    let turnInProgress = false;
    const markSpeaking = () => {
      agentSpeaking = true;
      handlersRef.current.onSpeakingChange(true);
    };

    // 게이트를 닫을(=마이크를 다시 열) 시각을 다시 잡는다. 청크가 새로 올 때마다, 그리고
    // turnComplete를 받을 때마다 호출된다.
    // ⭐ 사용자 라이브 신고 ④(Architecture.md §50.8.5) — `overrides`는 stopSpeaking()이 창③
    // (interrupted 직후)에서 쓴다. 재생이 이미 멈춘 시점이라 `nextPlayTime`을 그대로 읽으면
    // stopAllPlayback()이 방금 0으로 되돌린 값이 잡히지만, 명시적으로 넘겨 그 의도를 코드에도
    // 남긴다(§50.8.1 창③ — "예약 재생은 멈췄어도 이미 출력 버퍼로 나간 소리는 stop()으로 취소되지
    // 않는다"의 방어).
    const scheduleGateClose = (overrides?: {
      remainingPlaybackMs: number;
      turnInProgress: boolean;
    }) => {
      if (speakingTimer) clearTimeout(speakingTimer);
      const remainingPlaybackMs =
        overrides?.remainingPlaybackMs ??
        (outputContext ? (nextPlayTime - outputContext.currentTime) * 1000 : 0);
      const turnInProgressForDelay = overrides?.turnInProgress ?? turnInProgress;
      const delay = computeGateCloseDelayMs({
        remainingPlaybackMs,
        turnInProgress: turnInProgressForDelay,
      });
      speakingTimer = setTimeout(() => {
        agentSpeaking = false;
        turnInProgress = false;
        handlersRef.current.onSpeakingChange(false);
      }, delay);
    };

    // ⭐ 사용자 라이브 신고 ④(Architecture.md §50.8.1 창③, §50.8.5) — **즉시 게이트를 열지
    // 않는다.** 예전에는 interrupted 직후 곧바로 마이크를 열었는데, 예약 재생(scheduledSources)은
    // stop()으로 멈춰도 **이미 출력 버퍼로 나가 스피커에서 물리적으로 재생 중인 소리**는 취소되지
    // 않는다 — 그 잔향이 곧바로 열린 마이크로 되돌아가 새 `interrupted`를 연쇄시킬 수 있었다.
    // `scheduleGateClose`(turnComplete 경로와 같은 함수)를 재사용해 TAIL_GRACE_MS(250ms) 뒤에
    // 연다 — `remainingPlaybackMs: 0`이므로 지연은 정확히 tailGraceMs다.
    // ⛔ `stopAllPlayback()`(호출부에서 이 함수보다 먼저 실행됨)은 그대로 즉시 호출된다 — 겹침
    // 방지는 유지한다.
    const stopSpeaking = () => {
      turnInProgress = false;
      scheduleGateClose({ remainingPlaybackMs: 0, turnInProgress: false });
    };

    const cleanup = () => {
      if (speakingTimer) clearTimeout(speakingTimer);
      if (userLevelRafId !== null) cancelAnimationFrame(userLevelRafId);
      processor?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      void inputContext?.close().catch(() => {});
      void outputContext?.close().catch(() => {});
      try {
        session?.close();
      } catch {
        // 이미 닫혔으면 무시 — 종료는 항상 성공해야 한다(AC-006).
      }
      session = null;
      liveSessionRef.current = null;
    };
    cleanupRef.current = cleanup;

    (async () => {
      try {
        log("getUserMedia…");
        // 에코 제거/잡음 억제/자동 게인을 명시적으로 켠다(2026-07-23). 노트북 스피커로 나온 AI
        // 목소리가 마이크로 되돌아가면 Gemini가 그것을 사용자 발화로 오인해 자기 말에 끼어들거나
        // 반응해 "화자가 여러 명"처럼 들린다. 브라우저 기본값이 켜져 있어도 명시해 확실히 한다
        // (근본 해결은 헤드셋 사용).
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        outputContext = new AudioContext({ sampleRate: GEMINI_OUTPUT_SAMPLE_RATE });
        inputContext = new AudioContext();
        // 비동기 effect에서 만든 컨텍스트는 suspended로 시작할 수 있다 — 명시적으로 깨운다.
        await outputContext.resume().catch(() => {});
        await inputContext.resume().catch(() => {});
        log("audio contexts ready; connecting… model=", credentials.geminiModel);

        // 토큰을 API 키 자리에 그대로 넣는다(문서 지침). 단기 토큰은 v1alpha에서만 유효하다.
        const ai = new GoogleGenAI({
          apiKey: credentials.geminiToken,
          httpOptions: { apiVersion: "v1alpha" },
        });
        session = (await ai.live.connect({
          model: credentials.geminiModel,
          // 모델·프롬프트·도구·전사설정은 토큰에 고정돼 있어 여기서 다시 보내지 않는다.
          config: { responseModalities: [Modality.AUDIO] },
          callbacks: {
            onopen: () => {
              log("onopen ✓");
              if (!cancelled) handlersRef.current.onActive();
            },
            onmessage: (message: {
              data?: string;
              serverContent?: {
                interrupted?: boolean;
                turnComplete?: boolean;
                inputTranscription?: { text?: string };
                outputTranscription?: { text?: string };
              };
            }) => {
              if (cancelled || !outputContext) return;
              const sc = message.serverContent;

              // 전사 조각 누적(리포트 기록용). input=사용자 발화, output=사기범(모델) 발화.
              if (sc?.inputTranscription?.text) userBuffer += sc.inputTranscription.text;
              if (sc?.outputTranscription?.text) scammerBuffer += sc.outputTranscription.text;

              // 사용자가 말을 끊으면 예약된 재생을 전부 멈춰 새 응답과 겹치지 않게 한다.
              if (sc?.interrupted) {
                stopAllPlayback();
                stopSpeaking();
                // 잘린 사기범 발화를 여기서 내보낸다 — 안 하면 다음 말풍선 앞에 붙어 턴 경계가
                // 밀리고 리포트의 속은-순간 판정이 어긋난다(flushScammerTurn 주석 참고).
                flushScammerTurn();
                return;
              }
              // **오디오를 먼저 예약한다**(reviewer Critical 수정). 두 가지 이유:
              // (1) nextPlayTime이 갱신된 뒤에 게이트 대기 시간을 계산해야 잔여 재생이 정확히 반영된다.
              // (2) 예전엔 turnComplete를 먼저 처리하고 그 뒤 markSpeaking()이 turnInProgress를
              //     되살려, 마지막 청크와 turnComplete가 같은 메시지로 오는 정상 케이스에서 4초
              //     대기가 걸렸다. 이제 순서와 무관하게 resolveTurnInProgress가 규칙으로 정한다.
              const samples = message.data ? base64ToFloat32(message.data) : null;
              const hasAudio = samples !== null && samples.length > 0;
              if (hasAudio && samples) {
                const buffer = outputContext.createBuffer(
                  1,
                  samples.length,
                  GEMINI_OUTPUT_SAMPLE_RATE,
                );
                buffer.copyToChannel(samples, 0);
                const source = outputContext.createBufferSource();
                source.buffer = buffer;
                source.connect(outputContext.destination);
                // 이전 청크가 끝나는 시점에 이어붙인다(겹침·끊김 방지).
                const startAt = Math.max(outputContext.currentTime, nextPlayTime);
                source.start(startAt);
                nextPlayTime = startAt + buffer.duration;
                scheduledSources.add(source);
                source.onended = () => scheduledSources.delete(source);
                markSpeaking();
              }

              const hasTurnComplete = Boolean(sc?.turnComplete);
              turnInProgress = resolveTurnInProgress({
                current: turnInProgress,
                hasAudio,
                hasTurnComplete,
                hasInterrupted: false, // interrupted는 위에서 이미 return했다.
              });

              // 게이트를 **즉시 닫지 않는다** — turnComplete 시점에도 재생될 오디오가 남아 있을 수
              // 있다. 실제 개방 시각은 항상 잔여 재생 기준으로 다시 잡는다.
              if (hasAudio || hasTurnComplete) scheduleGateClose();
              if (hasTurnComplete) {
                flushTranscript();
                // T68 — 사기범 발화 1턴 완료. 부모가 이 경계만 세어 통화 중 문자 도착을 판단한다
                // (§15.1.2 "앱 오케스트레이션"). 세션 자체에는 아무 영향이 없다.
                // ⚠️ 병합 정합(T90+T68, 2026-07-26): T90이 핸들러를 "오디오 먼저 → 게이트 계산
                // 나중"으로 재정렬하면서 turnComplete 처리 위치가 바뀌었다. 이 콜백은 **전사 flush
                // 직후**라는 원래 순서를 그대로 유지한다 — 문자 도착 판단이 전사보다 앞서면
                // 앵커 턴 계산(§15.1.5 G21)이 한 턴 어긋난다.
                handlersRef.current.onScammerTurnComplete?.();
              }
            },
            onerror: (e: unknown) => {
              log("onerror", e);
              if (!cancelled) handlersRef.current.onError();
            },
            onclose: (e: unknown) => {
              log("onclose", e);
              if (!cancelled) {
                flushTranscript();
                handlersRef.current.onEnded();
              }
            },
          },
        })) as unknown as GeminiLiveSession;

        if (cancelled) {
          cleanup();
          return;
        }
        log("connect() resolved");
        // 타이핑 입력(textMessage effect)이 이 세션에 닿을 수 있도록 노출한다.
        liveSessionRef.current = session;

        // 사용자 신고(2026-07-24) — 연결 직후 캐릭터가 먼저 말을 걸도록 트리거를 보낸다. onopen
        // 콜백(위)이 아니라 connect()가 실제로 resolve된 직후에 보내는 이유: onopen은 소켓 이벤트라
        // connect()의 반환 Promise가 아직 resolve되기 전에 먼저 발화할 수 있어(session 변수가 아직
        // 할당되기 전), 여기서 보내는 것이 session이 확실히 non-null임을 보장하는 가장 이른 지점이다.
        const activeSession = session;
        if (activeSession) {
          try {
            activeSession.sendClientContent({ turns: OPENING_TRIGGER_TURN, turnComplete: true });
          } catch {
            // 트리거 전송 실패는 무시 — 사용자가 먼저 말을 걸면 대화는 정상적으로 이어진다(핵심
            // 루프 비차단, P-4). AI가 먼저 말하지 않는 것으로 조용히 강등될 뿐 통화 자체는 안 막힌다.
          }
        }

        // 마이크 → PCM16 16kHz → 전송. ScriptProcessor는 구식이지만 AudioWorklet과 달리 별도
        // 워커 파일 없이 동작해, 정적 export 구성(next.config.ts)에서 추가 배포 산출물이 없다.
        const micSource = inputContext.createMediaStreamSource(stream);

        // 사용자 발화 파형 인디케이터용 병렬 탭(2026-07-24, 사용자 신고 — "일단 잘 파악하는지
        // 보고 싶다"는 진단 목적 + 실제 UX). micSource를 기존 processor 체인과 완전히 별개로
        // AnalyserNode에도 연결한다 — 아래 무음 게인 노드(스피커 반향 차단용 병렬 연결)와 정확히
        // 동일한 "같은 소스를 추가 노드에 병렬로 붙인다" 기법이라, 서버로 보내는 기존 캡처·전송
        // 경로(PCM16 변환·sendRealtimeInput)는 전혀 건드리지 않는다.
        const userLevelAnalyser = inputContext.createAnalyser();
        userLevelAnalyser.fftSize = 256;
        micSource.connect(userLevelAnalyser);
        const userLevelData = new Uint8Array(userLevelAnalyser.frequencyBinCount);
        // 무음 대비 RMS 편차 문턱값(128 기준) — 조용한 방 배경잡음보다는 크고 정상 발화보다는
        // 작게 잡은 경험적 초기값이다. 실측 튜닝값이 아니다 — 마이크 하드웨어가 없는 환경이라
        // 이 값 자체는 실제 브라우저 사용자 테스트로 재검증이 필요하다(사용자 안내 사항).
        const USER_SPEECH_AMPLITUDE_THRESHOLD = 10;
        // 단어 사이 짧은 순간적 침묵에 파형이 깜빡이지 않도록 AI 발화 인디케이터(markSpeaking)와
        // 동일한 off-디바운스 방식을 쓴다.
        const USER_SPEECH_OFF_DELAY_MS = 400;
        const sampleUserLevel = () => {
          if (cancelled) return;
          userLevelAnalyser.getByteTimeDomainData(userLevelData);
          const rms = computeRmsFromByteTimeDomain(userLevelData);
          // AI가 말하는 동안엔(agentSpeaking) 스피커 반향이 마이크로 섞여 들어올 수 있어(에코
          // 캔슬이 100%는 아님, 위 반이중 주석 참고) 사용자 파형을 억제한다 — onaudioprocess의
          // 반이중 판단과 동일한 근거. 음소거 중에도 억제한다.
          const suppressed = agentSpeaking || mutedRef.current;
          const nextState = nextUserSpeechDebounceState(userSpeechDebounceState, {
            rms,
            threshold: USER_SPEECH_AMPLITUDE_THRESHOLD,
            suppressed,
            nowMs: performance.now(),
            offDelayMs: USER_SPEECH_OFF_DELAY_MS,
          });
          if (nextState.speaking !== userSpeechDebounceState.speaking) {
            handlersRef.current.onUserSpeakingChange(nextState.speaking);
          }
          userSpeechDebounceState = nextState;
          userLevelRafId = requestAnimationFrame(sampleUserLevel);
        };
        userLevelRafId = requestAnimationFrame(sampleUserLevel);

        processor = inputContext.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
        const inputRate = inputContext.sampleRate;
        processor.onaudioprocess = (event) => {
          if (cancelled || !session || mutedRef.current) return;
          // 반이중: AI가 말하는 동안엔 마이크를 보내지 않아 에코가 AI를 끊지 못하게 한다.
          if (agentSpeaking) return;
          const pcm = floatToPcm16(
            event.inputBuffer.getChannelData(0),
            inputRate,
            GEMINI_INPUT_SAMPLE_RATE,
          );
          try {
            session.sendRealtimeInput({
              audio: {
                data: pcm16ToBase64(pcm),
                mimeType: `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`,
              },
            });
          } catch {
            // 전송 실패는 무시하고 다음 프레임을 보낸다 — 한 프레임 때문에 통화를 끊지 않는다.
          }
        };
        micSource.connect(processor);
        // ScriptProcessor는 destination에 연결돼야 콜백이 돈다. 무음 게인으로 스피커 반향을 막는다.
        const silence = inputContext.createGain();
        silence.gain.value = 0;
        processor.connect(silence);
        silence.connect(inputContext.destination);
        log("mic pipeline attached");
      } catch (err) {
        log("connect threw", err);
        if (!cancelled) {
          cleanup();
          handlersRef.current.onError();
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 부모의 종료 요청(통화 종료 버튼) — 세션과 마이크를 즉시 닫는다.
  useEffect(() => {
    if (stopSignal <= 0) return;
    cleanupRef.current?.();
  }, [stopSignal]);

  // 타이핑 입력(사용자 신고 2026-07-25) — 같은 Live 세션에 텍스트 턴으로 넣는다. 음성 응답은
  // 평소 경로(onmessage → 오디오 재생)로 그대로 돌아오므로 목소리가 겹치지 않는다.
  //
  // ⚠️ 전사 기록을 여기서 직접 올린다 — 타이핑한 문장은 마이크를 타지 않아 서버의
  // inputTranscription에 잡히지 않는다. 이걸 빠뜨리면 리포트가 "사용자가 아무 말도 안 했다"고
  // 보게 되어(속았는지 판정 불가) 타이핑으로 한 훈련은 리포트에서 통째로 사라진다.
  useEffect(() => {
    if (!textMessage || !textMessage.text.trim()) return;
    const session = liveSessionRef.current;
    if (!session) return;
    try {
      session.sendClientContent({ turns: textMessage.text, turnComplete: true });
      handlersRef.current.onTranscriptTurn("user", textMessage.text.trim());
    } catch {
      // 전송 실패해도 통화 자체는 계속된다(P-4 비차단) — 음성으로 이어서 말하면 된다.
    }
    // seq가 바뀔 때만 1회 전송한다(stopSignal과 동일한 카운터 패턴).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textMessage?.seq]);

  // T68 — 문자 도착 announce 지시 주입(UX-027/UF-008). textMessage와 같은 경로지만 **전사에
  // 기록하지 않는다**(사용자 발화가 아니라 오케스트레이션 신호 — OPENING_TRIGGER_TURN과 동일 취지).
  // 실패해도 문자는 이미 도착해 있으므로 학습 가치는 보존된다(배너·문자함은 대사와 무관, P-4).
  useEffect(() => {
    if (!instructionTurn || !instructionTurn.text.trim()) return;
    const session = liveSessionRef.current;
    if (!session) return;
    try {
      session.sendClientContent({ turns: instructionTurn.text, turnComplete: true });
    } catch {
      // 무시 — 통화는 계속된다.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructionTurn?.seq]);

  // T118 / A5-α — 전환 상태 단언 재주입(§25.3). **위 instructionTurn effect보다 뒤에 선언한다**:
  // 같은 렌더에서 둘이 함께 바뀌면 지시가 먼저 나가야 한다(§25.4 A5-α 결정론 계약). α는 응답을
  // 유발하지 않아 실질 순서는 무관하지만, 순서가 정해져 있지 않으면 재현 불가능한 관찰이 생긴다.
  //
  // ⚠️ `turnComplete: false`가 핵심이다 — 이 턴은 컨텍스트에 상태를 얹을 뿐 **모델 차례를 넘기지
  // 않는다.** true로 바꾸면 주입이 곧 발화를 유발해 사기범이 한 턴에 두 번 말한다(§25.3 (4)).
  // ⚠️ 전사에 기록하지 않는다(G105) — 사용자 발화가 아니라 오케스트레이션 신호다.
  useEffect(() => {
    if (!personaStateTurn || !personaStateTurn.text.trim()) return;
    const session = liveSessionRef.current;
    if (!session) return;
    try {
      session.sendClientContent({ turns: personaStateTurn.text, turnComplete: false });
      log("personaStateTurn", personaStateTurn.seq, personaStateTurn.text.slice(0, 12));
    } catch {
      // 무시 — 통화는 계속된다(P-4 비차단). 다음 사용자 턴 경계에서 다시 due가 된다.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaStateTurn?.seq]);

  return null;
}
