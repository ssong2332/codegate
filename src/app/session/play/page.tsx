"use client";

// UX-014 통화 세션 — 실시간 음성 통화 (단일 연속 통화) (AC-003~007/012/013/017/018/019/023/024).
//
// **v3(2026-07-22) — 실시간 speech-to-speech 전환**: 이전 v2는 "브라우저 STT → 텍스트 LLM → TTS
// 합성 → <audio> 재생"을 턴마다 왕복해 지연이 누적됐고, 말을 끊거나 겹쳐 말하는 실제 통화 동작을
// 재현하지 못했다. 이제 ElevenLabs Agents와 **speech-to-speech로 직접 연결**해(useRealtimeCall)
// 사용자가 진짜 통화처럼 말하고 듣는다. 한국어는 agent.language:"ko", 목소리는 clone 시나리오면
// 참가자 본인 클론 voiceId로 지정한다(tts.voice_id 오버라이드 — 이게 가능한 유일한 실시간 API라
// ElevenLabs를 골랐다, functions/src/realtime/types.ts 근거 주석 참고).
//
// **폴백(조용한 실패 금지)**: 키·에이전트 미설정, 마이크 거부, 미지원 브라우저 등으로 실시간
// 대화가 불가능하면 `callMode:"fallback"`으로 내려가 기존 텍스트/STT 경로를 그대로 쓴다. 화면에도
// 실시간 통화가 아님을 알린다.
//
// Phase: incoming(수신) → connecting(연결) → opening(폴백 전용 오프닝 재생) → live(대화) → ended.
// 통화 타이머·서버 시간 한도는 모두 answeredAt("받기") 기점이다(OQ-U8).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  consumeOpeningAudioUrl,
  consumeOpeningMessageText,
  getPendingSessionId,
  isPreCallNoticeSeen,
  isSessionAnswered,
  markPreCallNoticeSeen,
  markSessionAnswered,
  useSpeechRecognition,
} from "@/lib/recording";
import { useRealtimeCall } from "@/lib/realtime";
import {
  deliverInCallSms,
  deliverVerifyOffer,
  deliverVerifyReconnect,
  recordInCallSmsEvent,
  requestReverseEscalation,
  sendMessage,
  submitRealtimeTranscript,
} from "@/lib/api";
import type { InCallSmsEvent, TranscriptTurn } from "@/lib/api";
import {
  countUnread,
  latestSmsId,
  sortByArrival,
  type InCallSmsView,
} from "@/lib/incallsms";
// T190(docs/Architecture.md §74) — 실폰형 통화 셸: 스킨 해석(표 K) · 토큰 · 떠 있는 배너 · 벨·진동 · 음량 모드.
import { detectDeviceSkin } from "@/lib/messenger/detectSkin";
import {
  DEVICE_SKIN_STORAGE_KEY,
  parseSessionSkin,
  parseStoredDeviceSkin,
  readUaModelHint,
  resolveDeviceSkin,
  serializeStoredDeviceSkin,
  type DeviceSkin,
  type ResolvedDeviceSkin,
} from "@/lib/phone/deviceSkin";
import { bannerTokensFor, callTokensFor } from "@/lib/phone/skinTokens";
import {
  BANNER_VISIBLE_MS,
  ackOnOverlayClose,
  shouldRunBannerTimer,
  visibleBannerSmsId,
} from "@/lib/phone/bannerState";
import { formatCallElapsed, spokenCallElapsed } from "@/lib/phone/callClock";
import {
  primeIncomingAlertAudio,
  startIncomingAlert,
  type IncomingAlert,
} from "@/lib/phone/ringtonePlayer";
import { gainFor, isVolumeSettable, type AudioRoute } from "@/lib/realtime/outputGain";
import { GEMINI_OUTPUT_SAMPLE_RATE } from "@/lib/realtime/pcm";
import {
  RESUME_GESTURE_EVENTS,
  closePrimedCallAudio,
  primeCallAudio,
  readAudioFlags,
  resumeSuspendedContexts,
  scheduleDeferredRingClose,
  shouldReleasePrimedCallAudio,
  type PrimedCallAudio,
} from "@/lib/realtime/callAudio";
import {
  noteAudioError,
  noteFallbackPlay,
  noteResumeRetry,
  noteRingClosed,
  readAudioDiag,
  registerCallAudio,
  registerFallbackAudio,
  registerRingContext,
  registeredCallContexts,
} from "@/lib/realtime/audioDiagnostics";
import AudioDebugPanel from "@/components/AudioDebugPanel";
import PhoneIcon from "@/components/PhoneIcon";
import EndTrainingButton from "@/components/EndTrainingButton";
import {
  announceTurnsOnInstructionDispatch,
  deferredAnnouncePendingOnDispatch,
  enqueueInstruction,
  IDLE_LIVE_TURN_PHASE,
  INSTRUCTION_DRAIN_BACKSTOP_SEC,
  INSTRUCTION_DRAIN_MAX_SUPPRESSED_BOUNDARIES,
  isResponseInProgress,
  nextVerifyOfferStage,
  rollbackVerifyOfferPhase,
  shouldAnnounceVerifyOffer,
  shouldDrainInstructionQueue,
  shouldOfferVerify,
  shouldRecordDeferredAnnounce,
  shouldReinjectTransferState,
  shouldRetryVerifyOffer,
  shouldRevealVerifyOffer,
  takeNextInstruction,
  verifySeriesFor,
  type LiveTurnPhase,
  type PendingInstruction,
  type VerifyInterceptView,
  type VerifyOfferPhase,
} from "@/lib/verifyintercept";
import { shouldFireBackstop, shouldRequestSmsBackstop } from "@/lib/realtime/toolWindow";
import {
  countTranscriptFlush,
  deliveryForInstruction,
  INITIAL_TURN_COUNTERS,
  type InstructionDelivery,
} from "@/lib/realtime/contextInjection";
import {
  claimAnnounceSlot,
  releaseAnnounceSlot,
  type AnnounceSlotState,
} from "@/lib/realtime/verifyAnnounceGuard";
import { normalizeDifficultyLevel, type DifficultyLevel } from "@/lib/difficulty";
import { scenarios, type ScenarioDoc } from "@/content/scenarios";
import { foldDegraded, buildFallbackStatusLine } from "@/lib/report/degradedDisclosure";
// ⭐ T190-8b(docs/Architecture.md §74.22 (1) ⓓ · G438 재지정) — 이 파일은 세션 전 문면 모듈을 import하지 **않는다**.
// 벨 직전 고지(`pre-call-notice`)는 세션 전 컴포넌트 `CallStartNotice`가 그리고, 벨 화면(`incoming`)에는 문구가 0이다.
import { decideInitialCallPhase, type CallPhase } from "@/lib/sessionboundary/startNoticeGate";
import CallStartNotice from "@/components/CallStartNotice";
import CallWaveform from "@/components/CallWaveform";
import InCallSmsOverlay from "@/components/InCallSmsOverlay";
import VerifyCallOverlay from "@/components/VerifyCallOverlay";

// ⚠️ 지연 로딩 필수 — @elevenlabs/react가 끌어오는 livekit-client(WebRTC)를 이 화면 로드 시점에
// 함께 불러오면 WebRTC를 못 쓰는 환경에서 렌더러가 통째로 죽는다(실측: 페이지 자체가 로드 실패).
// 서버가 "실시간 통화 가능"이라고 확인해 자격증명을 준 뒤에만 마운트해, 텍스트 폴백 경로는 WebRTC
// 코드를 아예 건드리지 않게 한다.
const RealtimeVoiceSession = dynamic(() => import("@/lib/realtime/RealtimeVoiceSession"), {
  ssr: false,
});
// Gemini Live(무료 경로) 세션도 같은 이유로 지연 로딩한다 — 오디오 컨텍스트/SDK를 실제로 쓸
// 때만 불러온다.
const GeminiVoiceSession = dynamic(() => import("@/lib/realtime/GeminiVoiceSession"), {
  ssr: false,
});

type PageState = "checking" | "ready" | "no-session" | "scenario-not-found" | "load-error";
// T190-8b(§74.22 (4) #1) — 벨 직전 고지 `pre-call-notice`가 맨 앞에 더해졌다(정의는 startNoticeGate.ts 한 곳).
type Phase = CallPhase;
/** realtime = speech-to-speech 실시간 통화, fallback = 기존 STT/텍스트 경로. */
type CallMode = "undecided" | "realtime" | "fallback";

type ChatMessage = {
  id: string;
  role: "scammer" | "user";
  text: string;
  turnIndex: number;
};

// T187(docs/Architecture.md §72.5 D1) — 세션 전 고지 문면은 `src/lib/sessionboundary/preSessionCopy.ts`가 정본이다.
// ⭐ T190-8b(§74.22 (1) ⓓ · D-102 · AC-091) — 그 고지의 자리가 벨 화면(`incoming`)에서 **벨 직전 고지**
// (`pre-call-notice` — 세션 전 컴포넌트 `CallStartNotice`)로 옮겨 갔다. 이 파일에는 그 문면도, 그 모듈 import도 없다
// (G438 — 벨 화면 프리롤 0이 import 0 한 줄로 증명된다). 표식 낱말 리터럴도 남기지 않는다(G437).

// T190-8b(UX-014 v1.33 (11) ① "탭 뒤" · §74.22 (3)) — "준비됐어요" 뒤 벨이 울리기 전 짧은 정적(빈 통화 배경).
// 0.6~1.2초 범위의 **설계 추정값**(실제 착신까지의 짧은 정적 — 확인: 실기 관찰).
const PRE_CALL_GAP_MS = 800;

// T83/UX-031 States — "연결 중…" 연출 길이. **고정값**이다(랜덤 없음 = 테스트 결정론, §16.2).
// ⚠️ 이 구간은 화면 연출일 뿐 실제 발신이 아니다(AC-019). 이 동안에도 통화 축소 표시·"훈련 종료"가
// 계속 보인다.
const VERIFY_DIALING_MS = 2500;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// T190-3(§74.6 (3)) — 경과 시간 표기는 `@/lib/phone/callClock`(`mm:ss` · 1시간 이상 `h:mm:ss`)로 옮겼다.
// 예전 지역 함수는 60분을 넘어도 `m:ss`였다.

export default function SessionCallPage() {
  const router = useRouter();
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  // 사용자 신고(2026-07-24) — 실시간 통화에서 사용자가 먼저 말해야 대화가 시작되던 문제.
  // consumeOpeningMessageText()는 1회성(읽으면 삭제)이라 sessionId와 동일하게 지연 초기값으로
  // 마운트 시 한 번만 읽는다(재렌더마다 다시 읽어 소진되는 것을 방지).
  const [openingMessageText] = useState<string | null>(() => consumeOpeningMessageText());
  const [pageState, setPageState] = useState<PageState>(sessionId ? "checking" : "no-session");
  // T190-8b — 세션 문서를 읽기 전 초기값은 "아무 일도 일어나지 않는" 벨 직전 고지다(벨·구독·연결 0). 실제 값은
  // 아래 세션 로드에서 `decideInitialCallPhase`(G463)가 정한다.
  const [phase, setPhase] = useState<Phase>("pre-call-notice");
  // "준비됐어요"를 누른 뒤 벨까지의 짧은 정적 동안 true(빈 통화 배경만 그린다).
  const [preCallLeaving, setPreCallLeaving] = useState(false);
  const preCallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "준비됐어요" 탭(사용자 제스처) 안에서 만든 벨 오디오 컨텍스트 — 벨 effect가 한 번 넘겨받는다(§74.7).
  const primedAlertContextRef = useRef<AudioContext | null>(null);
  // ⭐ 수정안 A(2026-10-18, 라이브 d13e718 무음 신고) — "받기" 탭 안에서 동기로 만들고 resume한 통화 오디오 컨텍스트.
  // GeminiVoiceSession이 빌려 쓰고, **닫는 것은 이 화면 한 곳**이다(아래 해제 effect · 언마운트 cleanup).
  const [primedCallAudio, setPrimedCallAudio] = useState<PrimedCallAudio | null>(null);
  // reviewer m2 — 받기 재진입 가드(같은 렌더 안의 연속 탭에도 정확하도록 상태가 아니라 ref로 판정한다).
  const primedCallAudioRef = useRef<PrimedCallAudio | null>(null);
  // QA L-4 — handleAnswer 전체 재진입 가드(realtime.start 이중 실행 방지). 한 마운트에 받기는 한 번뿐이다.
  const answerHandledRef = useRef(false);
  // reviewer M3 — 미룬 벨 컨텍스트 close(호출 = 즉시 닫기 · 멱등). 언마운트 cleanup이 반드시 부른다.
  const deferredRingCloseRef = useRef<(() => void) | null>(null);
  const [callMode, setCallMode] = useState<CallMode>("undecided");
  const [scenario, setScenario] = useState<ScenarioDoc | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  // Action Item 1 — `drainInstructionQueue`(deps `[]`)가 `elapsedSec` state를 리렌더 없이
  // 최신값으로 읽기 위한 사본. 갱신 지점은 아래 통화 경과 타이머 effect **한 곳**뿐이다.
  const elapsedSecRef = useRef(0);
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  // 사용자 신고(2026-07-25) — "키패드가 실제로 작동하지 않는다". 실제 통화처럼 숫자 키패드를 띄우고
  // 누른 숫자를 표시한다(ARS 입력을 요구하는 시나리오의 몰입 요소). 실시간 세션에 텍스트 턴으로
  // 보낼 수 있어, 상대가 "인증번호 눌러주세요"라고 하면 실제로 눌러서 응답할 수 있다.
  const [dialpadValue, setDialpadValue] = useState("");
  // 실시간 세션에 넣을 타이핑 입력(카운터 패턴 — seq가 바뀔 때 1회 전송).
  const [textMessage, setTextMessage] = useState<{ text: string; seq: number } | null>(null);
  const [maxSessionMs, setMaxSessionMs] = useState<number | null>(null);
  // T72 — 이 통화의 난이도(세션 문서 기준). 배지 표기는 실시간 경로가 실제로 난이도를 반영할 때만
  // 한다(아래 difficultyApplied 참고, §15.6 G6 "근거 없는 표기 금지").
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel | null>(null);
  // T158(§48.5.1, AC-084, P-31) — 대사 축 강등 관측. sticky OR-fold, false로 되돌리는 대입 0건
  // (G278). 마운트 시 `sessions/{sid}.llmProvider`(아래 세션 read effect) + 매 턴
  // `SendMessageResponse.isMock`(handleSend) + `realtime.isMock`(useRealtimeCall)의 합.
  const [dialogueDegraded, setDialogueDegraded] = useState(false);
  // T40 fast-follow — 역방향 명시 전환 버튼("메시지로 전환") 상태. messenger/page.tsx의
  // escalating/escalationError와 동일한 패턴, 방향만 반대.
  const [switchingToMessenger, setSwitchingToMessenger] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // T68 통화 중 문자(UX-027/UF-008, AC-059/060/061) — 전부 **통화 셸 위에 얹히는 상태**다.
  // ⚠️ 이 값들은 타이머 effect(:phase만 의존)·한도 자동종료 effect·오디오 재생 어디에도 들어가지
  // 않는다(§15.1.1 — 넣으면 통화가 멈춰 이 기능의 존재 이유가 무너진다).
  const [inCallSms, setInCallSms] = useState<InCallSmsView[]>([]);
  const [smsOverlayOpen, setSmsOverlayOpen] = useState(false);
  // T190-3(UX D-91 · §74.6 (6)) — 예전 boolean `smsBannerDismissed`를 **"확인한 마지막 smsId"** 로 바꿨다.
  // 새 문자는 도착 경로(백스톱 · 모델 도구 · 폴백)와 무관하게 id가 새로우므로 되돌리는 쓰기 지점이 필요 없다
  // (판정은 `@/lib/phone/bannerState`). 6초가 지나 접힌 id · 포커스/호버로 멈춘 id도 같은 방식으로 둔다.
  const [bannerAckSmsId, setBannerAckSmsId] = useState<string | null>(null);
  const [bannerExpiredSmsId, setBannerExpiredSmsId] = useState<string | null>(null);
  const [bannerPausedSmsId, setBannerPausedSmsId] = useState<string | null>(null);
  const [smsError, setSmsError] = useState<string | null>(null);
  // T190-3(§74.5 (2) · 표 K · AC-092 (b)) — 이 통화의 화면 모양. 세션 문서 1회 읽기에서 **한 번** 정하고 세션
  // 끝까지 바꾸지 않는다(D-100 (4)). 서버 쓰기 0(같은 기기에서 표 K가 결정론적이라 새로고침에도 같다).
  const [deviceSkin, setDeviceSkin] = useState<ResolvedDeviceSkin>({ skin: "default", source: "fallback" });
  // T190-3(§74.3 표 S · UX D-98 · AC-093 (c)) — 스피커 버튼 = 통화 모드(0.6) ↔ 스피커 모드(1.0) **음량 전환**.
  // 웹은 Android에서 수화부↔스피커 실제 출력 전환을 할 수 없다(§74.2 ①-A) — iOS도 실기 프로브 전까지 같다.
  const [audioRoute, setAudioRoute] = useState<AudioRoute>("call");
  // D-103(표 S S-5) — 텍스트 폴백 `<audio>`에 음량을 대입한 뒤 다시 읽어 반영되지 않으면(대표 사례 iOS Safari —
  // UA로 판별하지 않는다) 그 경로에서 스피커 칸은 비활성 표현이다. 한 번 관측되면 이 세션 동안 유지한다.
  const [fallbackVolumeLocked, setFallbackVolumeLocked] = useState(false);
  // T190-4(§74.7) — 수신 벨·진동. `stop()`은 멱등이며 받기 첫 줄 · effect cleanup · pagehide에서 부른다.
  const incomingAlertRef = useRef<IncomingAlert | null>(null);
  // T103(P-27 (2) ④ · OQ-U27 (a) · §19.6) — 전면 문자함의 통화 필에 이어 붙일 **최신 사기범 자막**.
  // ⚠️ 실시간(Gemini Live) 경로에서는 통화 중 `messages`가 갱신되지 않아(전사는 종료 직전 1회 제출)
  // `latestScammerLine`이 통화 내내 null이다 — 그래서 이미 흐르고 있는 턴 콜백을 화면 지역 state로
  // 한 번 받아 둔다(신규 데이터 경로·서버 변경 0건). ⛔ 갱신 단위는 **턴**이다(G78 — 청크마다
  // setState하면 통화당 수백 번 리렌더가 되고 그것이 OQ-U27 (c)가 우려한 프레임 부담이다).
  const [liveScammerCaption, setLiveScammerCaption] = useState<string | null>(null);
  // 실시간 세션에 넣을 오케스트레이션 지시(카운터 패턴 — textMessage와 동일).
  // ⚠️ T83(§16.6 G31) — 문자 announce와 확인 지시가 **같은 슬롯**을 쓰므로 큐를 거쳐 한 턴에
  // 하나씩만 주입한다(아래 enqueueTurnInstruction 참고). 예전엔 이 상태를 문자 전용으로 직접
  // 세팅했는데, 그러면 같은 턴 경계에 둘이 겹칠 때 나중 것이 앞것을 조용히 덮어쓴다.
  // ⭐ §82.4(T1) — `delivery`가 전송 형태를 정한다(문자 · 확인 권유 = 맥락 주입 · 재연결 = 화자 전환 첫 발화).
  const [instructionTurn, setInstructionTurn] = useState<
    { text: string; seq: number; delivery: InstructionDelivery } | null
  >(null);
  const instructionQueueRef = useRef<PendingInstruction[]>([]);
  // 이번 사기범 턴에 이미 지시를 하나 넣었는가(다음 turnComplete까지 추가 주입을 보류한다).
  const instructionBusyRef = useRef(false);
  // §52.7 (5) 가·나 / §57.5(G369) — `shouldDrainInstructionQueue`의 입력. 아직 지시를 한 번도
  // 보내지 않은 상태를 "열림"(참가자 조건 충족)으로 보는 것이 계약이므로 **`true`로 시작**한다
  // (첫 지시는 항상 나가야 한다 — §52.7 (5) 가의 금지). 실제로 지시를 보낸 순간 `false`(닫힘)로
  // 바뀌고, 참가자가 말하면(`handleTranscriptTurn`, role==="user") 다시 `true`로 열린다.
  const instructionGateOpenRef = useRef(true);
  // 위 게이트가 닫힌 채로 억제된 연속 경계 수 — 상한(나) 판정에만 쓴다. 지시를 실제로 보내거나
  // 참가자가 말하면 0으로 되돌아간다.
  const instructionSuppressedStreakRef = useRef(0);
  // Action Item 1(reviewer REJECTED, e4414c3 후속) — 위 스트릭이 상한에 **처음** 닿은 시점의
  // `elapsedSec` 값. `null` = 상한 미도달(또는 그 뒤 실제로 방출/참가자 발화로 초기화됨). 아래
  // 통화 경과 타이머 effect가 이 값 + `INSTRUCTION_DRAIN_BACKSTOP_SEC`을 넘기면 재판정을
  // 강제한다 — `shouldDrainInstructionQueue`·`drainInstructionQueue`의 판정 자체는 바꾸지 않는다
  // (`verifyIntercept.ts`의 `INSTRUCTION_DRAIN_BACKSTOP_SEC` 주석 참고).
  const instructionCapReachedAtSecRef = useRef<number | null>(null);
  // 사기범 발화 턴 수(실시간 경로) — GeminiVoiceSession의 turnComplete 경계만 센다.
  const [scammerTurns, setScammerTurns] = useState(0);
  // ⭐ T191(문자 도달 조건) — 비어 있지 않은 사용자 전사 flush 수의 state 사본(문자 백스톱 효과의 트리거). 값의 원천은
  // `turnCountersRef.current.userTurns`이고 갱신 지점은 `handleTranscriptTurn` **한 곳**뿐이다.
  const [userTurnCount, setUserTurnCount] = useState(0);
  // ⭐ **§45.7 V2** — 같은 값의 ref 사본. `drainInstructionQueue`는 턴 완료 콜백 **안에서** 불리는데
  // 그 시점의 `scammerTurns` state는 아직 리렌더 전이라 **한 턴 낡은 값**이다. 큐를 떠난 시점을
  // 재려면 그 순간의 값이 필요하므로 ref로 함께 센다(⛔ 갱신 지점은 아래 handleScammerTurnComplete
  // **한 곳**뿐이다 — 두 곳이 되면 state와 조용히 어긋난다).
  const scammerTurnsRef = useRef(0);
  // ⭐ §82.3.4(G539) — 실시간 경로 카운터(순수 함수 `countTranscriptFlush`). `scammerTurnsRef`/`scammerTurns`는
  // 이제 **비어 있지 않은 사기범 전사 flush 수**(`scammerTranscriptTurns`)다 — 지시 턴 · 빈 `turnComplete`(N1)를
  // 세지 않는다. ⛔ 갱신 지점은 `handleTranscriptTurn` **한 곳**뿐이다(전에는 `handleScammerTurnComplete`).
  const turnCountersRef = useRef(INITIAL_TURN_COUNTERS);
  // ⭐ §82.4(T1) — 맥락 주입된 확인 권유의 예고 기록 대기(큐 이탈 시점의 사용자 발화 수). `null` = 대기 없음.
  // 다음 사용자 발화 flush에서 `verifyAnnounceTurnsRef`를 기록한다(`deferredAnnouncePendingOnDispatch` 주석).
  const pendingVerifyAnnounceUserTurnsRef = useRef<number | null>(null);
  // ⭐ 리뷰 M2 — `GeminiVoiceSession`이 갱신하는 현재 턴 위상(모델 응답 중 · 사용자 버퍼). 드레인이 읽는다.
  const liveTurnPhaseRef = useRef<LiveTurnPhase>(IDLE_LIVE_TURN_PHASE);
  // ⭐ T191(문자 도달 조건 · AC-099 (e)) — 문자 백스톱 질의 상태. 예전 `requestedSmsRef`(요청한 smsId 집합) ·
  // `smsToolCallFailedIdRef`(모델 도구 실패 smsId)는 화면이 고정 턴으로 smsId를 고를 때만 필요했다 — 폐기.
  // 지금은 사용자 발화 flush마다 서버에 한 번 묻고(`shouldRequestSmsBackstop`), 무엇을 할지는 서버가 정한다.
  const smsBackstopRef = useRef({ lastRequestedUserTurns: -1, nonePending: false, inFlight: false });
  // §59.10 커밋 D(G390) — 확인 오퍼(offer_verification_desk) 도구 경로 실패 신호. 세션당 오퍼가
  // 하나뿐이라(카탈로그 보유 && advanced 세션에만 도구가 선언된다, §61) id 없이 boolean 하나로
  // 충분하다.
  const verifyToolCallFailedRef = useRef(false);
  // §59.8 — "마지막 사기범 턴 경계(없으면 하한 도달) 이후 경과 초"의 분모 시계. 매 사기범 턴 경계
  // (`handleScammerTurnComplete`)마다 그 순간의 통화 경과초로 갱신된다 — 새 타이머를 만들지 않고
  // 이미 떠 있는 통화 경과 타이머(`elapsedSec`)에 올라탄다(§52.7 (5) 나가 확립한 관례와 동일).
  const lastScammerBoundaryAtSecRef = useRef(0);
  // 오버레이를 연 트리거(배너/"문자함") — 닫을 때 포커스를 되돌린다(UX-027 Focus Order).
  const smsTriggerRef = useRef<HTMLButtonElement | null>(null);
  // T83 확인 시도 무력화(UX-031/UF-011, AC-071) — 문자 오버레이와 **같은 계층·같은 규칙**이다
  // (§16.2 무개정 재사용). 이 값들도 타이머·한도·오디오 effect 어디에도 들어가지 않는다(§15.1.1).
  const [verifyOffer, setVerifyOffer] = useState<VerifyInterceptView | null>(null);
  const [verifyOverlayOpen, setVerifyOverlayOpen] = useState(false);
  const [verifyDialing, setVerifyDialing] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  // ⛔ §49(V5, 2026-08-02) — 참가자가 탭하던 상시 컨트롤이 삭제되면서 이 값을 `true`로 바꾸는
  // 호출부가 사라졌다. ⛔ **일부러 지우지 않는다**(G285 신설 취지) — `shouldAnnounceVerifyOffer`의
  // AND 게이트(§47.3 C1)에서 계열 B 쪽 operand로 계속 넘어가며, 항상 `false`이므로 **계열 B는
  // 영구히 오퍼가 열리지 않는다**는 설계된 결과를 유지한다(§49.9 row 5 — AC-071 계열 B 5종 커버리지
  // 손실은 정직 고지 대상이지 버그가 아니다). 계열 A는 이 값과 무관하다(C2/G264).
  const [verifyIntentExpressed] = useState(false);
  // 세션 문서에서 읽은 scenarioId(§47.6 P-5 — 계열 판별 입력). 카탈로그 객체 자체에는 id 필드가
  // 없어(src/content/scenarios) 로드 시점에 별도로 보관한다.
  const [scenarioId, setScenarioId] = useState<string | undefined>(undefined);
  // ⭐ **§38.4 E / G187** — 오퍼 요청의 **단계 상태**(종전에는 boolean ref 하나였다).
  // ⛔ boolean으로 되돌리지 말 것: 2단계가 생기면서 *"1단계 성공 · 2단계 실패"* 상태가 처음
  // 존재하게 됐는데, boolean으로는 그것을 "이미 요청함"으로밖에 못 적어 **오퍼가 영영 안 뜬다.**
  // 렌더와 무관해 ref에 둔다(가시성 판정은 문서 구독이 한다 — G184).
  const verifyOfferPhaseRef = useRef<VerifyOfferPhase>("idle");
  // 1단계(예고 지시 주입)를 보낸 시점의 완료 사기범 턴 수. `null` = 아직 안 보냈다.
  const verifyAnnounceTurnsRef = useRef<number | null>(null);
  // ⭐ §59 Critical 수정(reviewer REJECTED) — announce 요청 상호배제 슬롯. 백스톱 경로(아래 오퍼
  // 이펙트)와 모델 도구 경로(`GeminiVoiceSession.dispatchToolCall`의 `offer_verification_desk`
  // 분기)가 이 **같은 객체**를 공유한다 — 서버가 announce를 멱등하게 구분하지 못하므로
  // (`verifyAnnounceGuard.ts` 근거 주석 참고) 요청을 보내기 **전에** 클라가 직접 막아야 한다.
  const verifyAnnounceSlotRef = useRef<AnnounceSlotState>({ inFlight: false });
  const claimVerifyAnnounceSlot = useCallback(
    () => claimAnnounceSlot(verifyAnnounceSlotRef.current),
    [],
  );
  const releaseVerifyAnnounceSlot = useCallback(
    () => releaseAnnounceSlot(verifyAnnounceSlotRef.current),
    [],
  );
  // T118 / 층 A5-α(§25.3) — 전환 상태 재확인 1줄. `instructionTurn` 큐를 타지 않는 **별도 슬롯**이며
  // 턴 슬롯을 소비하지 않는다(P-1 실측: turnComplete:false는 발화를 유발하지 않았다).
  const [personaStateTurn, setPersonaStateTurn] = useState<{ text: string; seq: number } | null>(
    null,
  );
  // 서버가 준 전환 상태 단언(전환 성공 이후에만 채워진다 = `placed`의 단일 소스). 문자열을 클라가
  // 만들지 않는다(**G101** — 카탈로그가 소유해야 G86 전 필드 순회 검사망에 들어온다).
  const transferStateLineRef = useRef<string | null>(null);
  // 직전 주입 이후 참가자가 말한 턴 수 — ⛔ 이 값 없이 매 턴 주입하면 자기 구동 루프가 된다(**G99**).
  const userTurnsSinceInjectionRef = useRef(0);
  // ⭐ §47.3 C3/D-69 + §49 정정(2026-08-02) — 오퍼별 자동 전환 시도를 1회로 latch한다(offerId 키,
  // 계열 A·B 공통). 실패해도 재시도를 자동으로 걸지 않는다(재시도는 §47.3 C3가 금지한 "두 번째
  // 컨트롤" 없이는 불가능하다 — 애초에 컨트롤이 없다).
  const autoReconnectOfferIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speech = useSpeechRecognition();
  const realtime = useRealtimeCall();
  // 실시간 음성 통화의 전사 턴을 모아 종료 직전에 제출한다(finding #1). 리렌더와 무관하게 누적
  // 되어야 하므로 ref에 쌓는다.
  const transcriptRef = useRef<TranscriptTurn[]>([]);
  // §57.2 (6) 처방 D1 — 참가자가 "받기"를 누른 시각(클라 타임스탬프, `handleAnswer`에서 1회
  // 설정). 리포트 타임라인 라벨이 실제 발화 시각과 어긋나던 문제(T-1, `docs/Architecture.md`
  // §57.2)의 처방 — 각 전사 턴의 `atMs`(아래 `handleTranscriptTurn`)는 이 시각 기준 상대 ms다.
  // `null` = 아직 받기 전이거나(있을 수 없음 — 이 화면은 받은 뒤에만 전사를 쌓는다) 폴백 복원
  // 경로처럼 이 화면에서 "받기"를 누르지 않은 세션 — 그때는 서버가 현행 합성 로직으로 대체한다.
  const answeredAtMsRef = useRef<number | null>(null);

  // ⭐⭐ §55 D3(G351) — "오프닝(`turnIndex:0`)이 참가자에게 낭독되지 않았는가"의 **유일한 판별자**.
  // `createSession`은 경로와 무관하게 그 행을 쓰지만, Gemini Live에는 그 텍스트를 넘길 방법이 없어
  // (`GeminiVoiceSession` — firstMessage 오버라이드 부재) **실시간 경로에서만** 낭독되지 않는다.
  // 서버는 이 사실을 사후에 유추할 수 없다(세션 문서에 실시간 프로바이더 기록 0건).
  //
  // ⛔ **state가 아니라 ref인 이유**: 아래 `flushTranscript`의 deps는 `[sessionId]`이고 호출부가
  // 3곳이라, 그 클로저에서 `callMode`·`realtime`을 읽으면 **스테일 값을 읽는다**(§55.12 4).
  // ⛔ **폴백으로 강등되면 반드시 false로 되돌린다** — 그 경로에서는 오프닝이 실제로 재생·표시되고
  // (`consumeOpeningAudioUrl()` + 메시지 구독), 마크를 남기면 **참가자가 본 대사를 지운다**.
  const openingNotSpokenRef = useRef(false);

  // T158(§48.5.1) — OR-fold 세 번째 항. `realtime.isMock`은 훅 안에서 이미 sticky이므로(never
  // 되돌아가지 않음) effect로 로컬 state에 미러링하지 않고 렌더 시점에 바로 OR한다
  // (react-hooks/set-state-in-effect 회피 — effect 안 동기 setState는 이 저장소 다른 화면에서도
  // 쓰지 않는 패턴이다). `dialogueDegraded`(state, mount+turn 관측분)와 `realtime.isMock`의 합이
  // 실제 "대사가 강등됐다"는 참값이다 — 아래 JSX는 이 값을 쓴다.
  const dialogueIsDegraded = foldDegraded(dialogueDegraded, realtime.isMock);

  const handleTranscriptTurn = useCallback((role: "user" | "scammer", text: string) => {
    // §57.2 (6) 처방 D1 — 이 콜백은 §57.4 D3 이후 항상 **턴 완료(flush) 시각**에만 불린다(G369
    // 주석 참고) — "이 턴이 실제로 일어난 시각"과 "기록된 시각"이 같아, 여기서 잰 상대 ms를 그
    // 턴의 발생 시각으로 실어 보내도 안전하다. `answeredAtMsRef`가 없으면(이 화면에서 "받기"를
    // 누르지 않은 극히 드문 경로) `atMs` 없이 보내 서버가 현행 합성 로직으로 대체하게 둔다.
    const atMs =
      answeredAtMsRef.current !== null ? Date.now() - answeredAtMsRef.current : undefined;
    transcriptRef.current.push({ role, text, atMs });
    // ⭐ §82.3.4(G539) — 계수는 비어 있지 않은 전사 flush 기준(빈 `turnComplete`는 여기까지 오지 않는다).
    turnCountersRef.current = countTranscriptFlush(turnCountersRef.current, role, text);
    if (role === "scammer") {
      scammerTurnsRef.current = turnCountersRef.current.scammerTranscriptTurns;
      setScammerTurns(scammerTurnsRef.current);
    }
    // T118(§25.3 (3)) — A5 재주입 조건의 관측 지점. 참가자가 한 번이라도 말한 뒤에만 다시 넣는다.
    if (role === "user") {
      setUserTurnCount(turnCountersRef.current.userTurns);
      // ⭐ §82.4(T1) — 맥락 주입된 확인 권유는 이 사용자 발화에 대한 응답에 실린다. 그 응답(사기범 전사)이
      // 세어지기 **직전**인 지금 예고 시점을 기록한다 — 기록 함수는 §45.7 V2 그대로다.
      if (
        shouldRecordDeferredAnnounce({
          pendingAtUserTurns: pendingVerifyAnnounceUserTurnsRef.current,
          userTurns: turnCountersRef.current.userTurns,
        })
      ) {
        verifyAnnounceTurnsRef.current = announceTurnsOnInstructionDispatch({
          priority: "verify",
          phase: verifyOfferPhaseRef.current,
          completedScammerTurns: scammerTurnsRef.current,
          current: verifyAnnounceTurnsRef.current,
        });
        pendingVerifyAnnounceUserTurnsRef.current = null;
      }
      userTurnsSinceInjectionRef.current += 1;
      // §52.7 (5) 가·나 — 참가자가 말했으니 G31 큐 드레인 게이트를 다시 연다(억제 스트릭도
      // 초기화). ⭐ §57.4 D3 이후로는 이 콜백이 타이핑·음성 모두 **턴 완료(flush) 시각**에만
      // 불린다(G369) — "참가자가 말했는가"의 뜻이 ①과 ③에서 하나로 맞는다.
      instructionGateOpenRef.current = true;
      instructionSuppressedStreakRef.current = 0;
      instructionCapReachedAtSecRef.current = null;
    }
    // T103 — 제출 경로(위 한 줄)는 손대지 않고, 통화 필 자막만 여기서 갈라 받는다.
    // ⛔ **사기범 턴만 그린다**(G79/G93). 참가자 턴을 그리면 참가자가 말한 계좌·생년월일이
    // 마스킹 없이 화면에 남는다 — 접근성 취향이 아니라 **안전 조건**이다(§19.6 (4)).
    if (role === "scammer") setLiveScammerCaption(text);
  }, []);

  // 실시간 음성 통화 전사를 서버에 제출한다(finding #1). 종료 직전에 1회 호출. 실패해도 통화
  // 종료를 막지 않는다(리포트가 비는 건 통화를 못 끝내는 것보다 나은 실패) — 조용히 흡수.
  const flushTranscript = useCallback(async () => {
    const turns = transcriptRef.current;
    if (!sessionId || turns.length === 0) return;
    transcriptRef.current = [];
    try {
      // §55 D3 — 3개 호출부 전부 **같은 값**을 싣는다(호출부별 분기 0건). 값은 위 래치 ref에서만
      // 온다(이 클로저에서 `callMode`·`realtime`을 읽으면 스테일이다).
      // §57.2 (6) 처방 D1 — `answeredAtMsRef`가 null이면(위 handleTranscriptTurn과 동일 사유로
      // "받기"를 누르지 않은 경로) 필드 자체를 생략한다 — 부재 = 서버 현행 합성 로직 그대로.
      await submitRealtimeTranscript({
        sessionId,
        turns,
        openingNotSpoken: openingNotSpokenRef.current,
        answeredAtMs: answeredAtMsRef.current ?? undefined,
      });
    } catch {
      // 무시 — 다음 단계(endSession→리포트)는 그대로 진행한다.
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        // T190-3(§74.5 (1) · §74.4) — UA-CH `model` 보강값은 세션 문서 읽기와 **나란히** 받는다(상한 300ms ·
        // 늦게 오면 버린다). 화면 모양은 `ready` 전에 한 번 정해져 세션 중 바뀌지 않는다(D-100 (4)).
        const [snapshot, uaModel] = await Promise.all([
          getDoc(doc(db, "sessions", sessionId)),
          readUaModelHint(typeof navigator === "undefined" ? undefined : navigator),
        ]);
        if (cancelled) return;
        const data = snapshot.data();
        if (!data) {
          setPageState("load-error");
          return;
        }
        // 표 K(§74.3) — 세션 문서(메신저 세션 · 메신저→통화 전이 세션) > 이 기기의 수동 선택 > 자동 감지.
        let storedSkin: DeviceSkin | null = null;
        try {
          storedSkin = parseStoredDeviceSkin(window.localStorage.getItem(DEVICE_SKIN_STORAGE_KEY));
        } catch {
          storedSkin = null; // 저장소 접근 불가 = "선택 없음"(§74.5 (3))
        }
        setDeviceSkin(
          resolveDeviceSkin({
            session: parseSessionSkin(data.messengerSkin, data.skinSource),
            stored: storedSkin,
            detected: detectDeviceSkin({
              userAgent: navigator.userAgent,
              maxTouchPoints: navigator.maxTouchPoints,
              uaModel,
            }),
          }),
        );
        const scenarioId = data.scenarioId as string | undefined;
        const found = scenarioId ? scenarios[scenarioId] : undefined;
        if (!found) {
          setPageState("scenario-not-found");
          return;
        }
        setScenario(found);
        setScenarioId(scenarioId);
        setMaxSessionMs((data.maxSessionMs as number) ?? null);
        // T72(UX-014 v1.11 난이도 배지, P-22) — 세션 문서에 서버가 **실제로 기록한** 값을 읽는다
        // (sessionStorage 힌트가 아니라). 부재(난이도 도입 이전 세션)면 중급으로 정규화된다.
        setDifficultyLevel(normalizeDifficultyLevel(data.difficultyLevel));
        // T158(§48.5.1) — 마운트 시 관측(OR-fold의 첫 항). `foldDegraded`가 sticky를 보장한다.
        setDialogueDegraded((current) => foldDegraded(current, data.llmProvider === "mock"));
        // #4/#5 새로고침 복원: 이미 "받기"를 누른 세션(answered 플래그)이나 대화가 시작된 세션
        // (turnCount≥1)을 다시 열면 "수신 중"으로 되돌아가지 않고 곧바로 대화 상태로 복원한다.
        // 실시간 경로는 sendMessage를 안 타 turnCount가 0에 머무므로, turnCount만으로는 실시간
        // 통화 중 새로고침을 감지할 수 없다 — answered 플래그로 보완한다(finding #4). 실시간
        // 소켓은 새로고침으로 끊기므로 복원은 텍스트 폴백으로 이어진다.
        //
        // T30 수정(검증 중 발견): entryChannel==="messenger"(에스컬레이션 세션)는 메신저 단계에서
        // 이미 turnCount≥1이 쌓인 채로 이 화면에 처음 진입한다 — turnCount만으로 판단하면 P-18
        // "수신(벨) 화면 인계"를 건너뛰고 곧장 통화 중으로 복원돼 수신 연출이 통째로 스킵되는 회귀가
        // 있었다. 에스컬레이션 세션은 isSessionAnswered 플래그(이 화면에서 실제로 "받기"를 눌렀는지)만으로 판단한다.
        // ⭐ T190-8b(OQ-52 (ㄴ) · UX-014 v1.33 (11) ③ · §74.22 (3)) — 에스컬레이션 세션의 벨 화면에는 이제 프리롤이
        // **없다**(예전 "사전 고지 유지" 근거는 뒤집혔다). 그 통화의 사전 고지는 메신저 시작 전 고지가 "메시지와 전화"로
        // 맡는다(T190-8a). 에스컬레이션은 벨 직전 고지(`pre-call-notice`)도 거치지 않고 `incoming`으로 바로 간다.
        const isEscalated = data.entryChannel === "messenger";
        const answered =
          isSessionAnswered(sessionId) || (!isEscalated && (data.turnCount as number) >= 1);
        // G463 — 초기 phase 진리표는 순수 함수 하나가 소유한다(이 자리에서 분기를 다시 짜지 않는다).
        const initialPhase = decideInitialCallPhase({
          status: data.status as string | undefined,
          answered,
          isEscalated,
          preCallNoticeSeen: isPreCallNoticeSeen(sessionId),
        });
        if (initialPhase === "live") {
          const answeredAtMs =
            (data.answeredAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null;
          if (answeredAtMs) {
            setElapsedSec(Math.max(0, Math.floor((Date.now() - answeredAtMs) / 1000)));
          }
          setCallMode("fallback");
        }
        setPhase(initialPhase);
        setPageState("ready");
      } catch {
        if (!cancelled) setPageState("load-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 대화 로그 구독 — 폴백 경로의 자막/이력용. 실시간 경로는 음성이 주채널이라 자막이 없을 수 있다.
  // "받기" 전에는 구독하지 않아 아직 공개되지 않은 오프닝 텍스트가 미리 새지 않는다.
  useEffect(() => {
    if (!sessionId || phase === "pre-call-notice" || phase === "incoming" || phase === "connecting") return;
    const messagesQuery = query(
      collection(db, "sessions", sessionId, "messages"),
      orderBy("turnIndex", "asc"),
    );
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setMessages(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            role: data.role as "scammer" | "user",
            text: data.textMasked as string,
            turnIndex: data.turnIndex as number,
          };
        }),
      );
    });
    return unsubscribe;
  }, [sessionId, phase]);

  // T68 — 통화 중 도착 문자 구독(UX-027). **실시간·폴백 양 경로의 단일 렌더 소스**다(§15.1.2):
  // 실시간은 deliverInCallSms가, 폴백 텍스트는 sendMessage가 같은 컬렉션에 쓰므로 화면 코드가
  // 갈라지지 않는다. 콜러블 응답은 렌더 소스가 아니다.
  useEffect(() => {
    if (!sessionId || phase === "pre-call-notice" || phase === "incoming" || phase === "connecting") return;
    const smsQuery = query(
      collection(db, "sessions", sessionId, "inCallSms"),
      orderBy("arrivedAt", "asc"),
    );
    const unsubscribe = onSnapshot(smsQuery, (snapshot) => {
      setInCallSms(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const arrivedAt = data.arrivedAt as { toMillis?: () => number } | undefined;
          const openedAt = data.openedAt as { toMillis?: () => number } | undefined;
          return {
            smsId: docSnap.id,
            kind: data.kind as InCallSmsView["kind"],
            senderLabel: data.senderLabel as string,
            body: data.body as string,
            otpCode: data.otpCode as string | undefined,
            linkDisplayText: data.linkDisplayText as string | undefined,
            fakeLandingId: data.fakeLandingId as string | undefined,
            // T190-2(§74.9) — 말풍선 링크 줄의 가짜 주소(부재 = 옛 문서 → 화면은 `linkDisplayText`로 읽는다).
            linkAddress: data.linkAddress as string | undefined,
            // T104(§19.4 #5) — 서버가 확정한 목업 종류. 클라는 그대로 나른다(§15.9.1 R3).
            landingKind: data.landingKind as InCallSmsView["landingKind"],
            arrivedAtMs: arrivedAt?.toMillis?.() ?? 0,
            openedAtMs: openedAt?.toMillis?.(),
          };
        }),
      );
    });
    return unsubscribe;
  }, [sessionId, phase]);

  // T83 — 확인 권유(오퍼) 문서 구독(UX-031). **실시간·폴백 양 경로의 단일 렌더 소스**다(§16.1.3):
  // 콜러블 응답에는 모델 지시만 실리고 창구명·번호는 이 구독으로만 화면에 들어온다(사전 유출 방지).
  // 문서를 소스로 삼기 때문에 **새로고침·재마운트 후에도 재연결 상태(발신자 라벨)가 유지**된다.
  useEffect(() => {
    if (!sessionId || phase === "pre-call-notice" || phase === "incoming" || phase === "connecting") return;
    const verifyQuery = query(
      collection(db, "sessions", sessionId, "verifyIntercept"),
      orderBy("offeredAt", "asc"),
    );
    const unsubscribe = onSnapshot(verifyQuery, (snapshot) => {
      const docSnap = snapshot.docs[0];
      if (!docSnap) {
        setVerifyOffer(null);
        return;
      }
      const data = docSnap.data();
      const placedAt = data.placedAt as { toMillis?: () => number } | undefined;
      // ⭐ **§38.4 후보 C** — 폴백 경로의 컨트롤 선행 조건. 서버가 예고 지시를 **이번 턴 프롬프트에
      // 실은 그 자리에서** 마크한다(`roleplay/index.ts`). ⛔ **읽기만 추가한다**(G188) — 뜻을
      // 바꾸지도, 실시간 경로에 같은 이름을 찍지도 않는다(§25.6 유지).
      const announcedAt = data.announcedAt as { toMillis?: () => number } | undefined;
      setVerifyOffer({
        offerId: docSnap.id,
        deskLabel: data.deskLabel as string,
        // T110(§22.3/C4) — 호 전환 모델에는 안내 번호가 없다. 신규 문서에 필드 자체가 없고
        // 화면에도 그릴 자리가 없으므로 **읽지 않는다**(과거 문서에 남아 있어도 무시한다).
        placedAtMs: placedAt?.toMillis?.(),
        announcedAtMs: announcedAt?.toMillis?.(),
        reconnectedCallerLabel: data.reconnectedCallerLabel as string | undefined,
      });
    });
    return unsubscribe;
  }, [sessionId, phase]);

  // ── 실시간 경로 지시 주입 큐(§16.6 G31 실시간 보강) ──────────────────────────────
  // 계약: (1) 한 턴 경계에 due가 2건이면 **문자 announce를 먼저** 주입하고 확인 지시는 다음 사기범
  // 턴 완료까지 보류한다. (2) 보류분은 **버리지 않는다**(큐에 남는다 — 버리면 확인 무력화가 그
  // 세션에서 영영 안 뜬다). (3) `seq`는 단조 증가시킨다(늦게 도착한 앞 순번이 뒤 순번을 덮어쓰지
  // 않게). 순서 규칙 자체는 순수 함수(`@/lib/verifyintercept`)로 분리해 단위 테스트로 고정했다.
  const drainInstructionQueue = useCallback(() => {
    if (instructionBusyRef.current) return;
    if (instructionQueueRef.current.length === 0) return;
    // §52.7 (5) 가·나 / §57.5 — G31 큐에도 G99와 같은 참가자 턴 조건을 곱한다(T-4). ⛔ 큐에서
    // 버리지 않는다(G31 계약 (2)) — 억제되면 항목은 그대로 남고 다음 경계에서 재시도된다.
    if (
      !shouldDrainInstructionQueue({
        userSpokeSinceLastInjection: instructionGateOpenRef.current,
        suppressedBoundaryStreak: instructionSuppressedStreakRef.current,
      })
    ) {
      instructionSuppressedStreakRef.current += 1;
      // Action Item 1 — 스트릭이 이번에 상한에 **처음** 닿았으면(재진입 아님) 재평가 안전장치의
      // 기산 시각을 찍는다. 판정 자체(`shouldDrainInstructionQueue`)는 바꾸지 않는다 — 아래 통화
      // 경과 타이머 effect가 유예 시간 뒤에 이 함수를 다시 불러 정상 경로로 방출시킬 뿐이다.
      if (
        instructionSuppressedStreakRef.current >= INSTRUCTION_DRAIN_MAX_SUPPRESSED_BOUNDARIES &&
        instructionCapReachedAtSecRef.current === null
      ) {
        instructionCapReachedAtSecRef.current = elapsedSecRef.current;
      }
      return;
    }
    const { item, rest } = takeNextInstruction(instructionQueueRef.current);
    if (!item) return;
    instructionQueueRef.current = rest;
    instructionBusyRef.current = true;
    instructionGateOpenRef.current = false;
    instructionSuppressedStreakRef.current = 0;
    instructionCapReachedAtSecRef.current = null;
    // ⭐⭐ **§45.7 V2 — 예고 시점은 *여기서* 잰다.** 요청을 보낸 자리가 아니라 지시가 **실제로 큐를
    // 떠나 `instructionTurn`에 실리는** 이 자리다(§45.6 (3) F2-a c·d). 판정은 순수 함수가 소유한다.
    // ⭐ §82.4(T1) — 맥락 주입된 확인 권유는 큐 이탈 시점이 아니라 **다음 사용자 발화 flush**에서 기록한다
    // (응답을 유발하지 않으므로 지금 진행 중인 턴은 예고가 아니다). 그 외 항목은 종전 그대로다.
    const delivery = deliveryForInstruction(item);
    if (delivery === "verifyAnnounce") {
      pendingVerifyAnnounceUserTurnsRef.current = deferredAnnouncePendingOnDispatch({
        priority: item.priority,
        speakerSwitch: item.speakerSwitch,
        phase: verifyOfferPhaseRef.current,
        userTurns: turnCountersRef.current.userTurns,
        responseInProgress: isResponseInProgress(liveTurnPhaseRef.current),
        current: pendingVerifyAnnounceUserTurnsRef.current,
      });
    } else {
      verifyAnnounceTurnsRef.current = announceTurnsOnInstructionDispatch({
        priority: item.priority,
        phase: verifyOfferPhaseRef.current,
        completedScammerTurns: scammerTurnsRef.current,
        current: verifyAnnounceTurnsRef.current,
      });
    }
    setInstructionTurn((prev) => ({ text: item.text, seq: (prev?.seq ?? 0) + 1, delivery }));
  }, []);

  const enqueueTurnInstruction = useCallback(
    (
      text: string,
      priority: PendingInstruction["priority"],
      options?: { speakerSwitch?: boolean; smsNudge?: boolean },
    ) => {
      instructionQueueRef.current = enqueueInstruction(instructionQueueRef.current, {
        text,
        priority,
        ...(options?.speakerSwitch ? { speakerSwitch: true } : {}),
        ...(options?.smsNudge ? { smsNudge: true } : {}),
      });
      drainInstructionQueue();
    },
    [drainInstructionQueue],
  );

  // T68 → ⭐ T191 문자 도달 조건(PRD AC-099 · 설계 "백스톱 — 필수 목적만 강제 · 선택 목적은 건너뛰기").
  // 예전에는 카탈로그 고정 턴(`afterScammerTurns`)에 도달하면 화면이 smsId를 골라 발송을 요청했다(AC-099 (d)가 폐지한
  // 경로). 이제 화면은 **사용자 발화 flush마다 한 번** 서버에 묻기만 한다(`trigger:"backstop"`, 목적 없음) — 무엇을
  // 넛지/발송할지는 서버 `planSmsBackstop`이 그 세션 흐름 변형의 필수 목적 · 도착 기록 · 사용자 발화 수로 정하고,
  // 발송도 모델 도구 경로와 같은 `resolveSmsGate`를 지난다(X4). 선택 목적은 백스톱이 건드리지 않는다(모델이 부를 때만).
  //   - `delivered` → 서버 announce를 맥락 주입(G31 큐, `sms`) · `nudge` → 넛지 1줄 맥락 주입(침묵 넛지 대상 아님)
  //   - `none_pending` → 남은 필수 문자 없음 → 더 묻지 않는다 · 그 외(`waiting`·거부) → 아무것도 하지 않는다
  // 실패해도 통화는 계속된다(P-4 — 인라인 안내만). 배너는 서버가 문서를 만든 순간 구독으로 뜬다(D-109).
  useEffect(() => {
    if (!sessionId || callMode !== "realtime" || phase !== "live") return;
    const state = smsBackstopRef.current;
    if (
      !shouldRequestSmsBackstop({
        enabled: realtime.credentials?.inCallSmsBackstop === true,
        userTurns: userTurnCount,
        lastRequestedUserTurns: state.lastRequestedUserTurns,
        nonePending: state.nonePending,
        inFlight: state.inFlight,
      })
    ) {
      return;
    }
    state.lastRequestedUserTurns = userTurnCount;
    state.inFlight = true;
    const counters = turnCountersRef.current;
    (async () => {
      try {
        const result = await deliverInCallSms({
          sessionId,
          userTurns: counters.userTurns,
          scammerTranscriptTurns: counters.scammerTranscriptTurns,
          trigger: "backstop",
        });
        setSmsError(null);
        if (result.status === "none_pending") state.nonePending = true;
        // §53.6 (3) — 전환이 끝난 오퍼가 연 문자에는 announce 값이 없다(서버가 생략) — 그때는 주입하지 않는다.
        if (result.status === "delivered" && result.announceInstruction) {
          enqueueTurnInstruction(result.announceInstruction, "sms");
        }
        if (result.status === "nudge" && result.nudgeInstruction) {
          enqueueTurnInstruction(result.nudgeInstruction, "sms", { smsNudge: true });
        }
      } catch {
        // 같은 발화 수로는 다시 묻지 않는다 — 다음 사용자 발화에서 최신 값으로 다시 묻는다(발송 단계는 `>=`라 놓치지 않는다).
        setSmsError("문자를 받지 못했습니다. 통화는 계속됩니다.");
      } finally {
        state.inFlight = false;
      }
    })();
    // enqueueTurnInstruction은 안정 참조(useCallback, 의존성 없음)라 이 목록에 넣어도 effect가 추가로 재실행되지 않는다.
  }, [
    sessionId,
    callMode,
    phase,
    userTurnCount,
    realtime.credentials?.inCallSmsBackstop,
    enqueueTurnInstruction,
  ]);

  // §47.3 C2/§47.6 P-5 — 계열 판별은 이 한 곳에서만 한다(클라·서버 복제 금지, G84). scenarioId가
  // 아직 없으면(로드 전) 계열 B로 취급된다 — 참가자 조건이 걸리는 쪽이 더 안전한 기본값이다.
  const verifySeries = verifySeriesFor(scenarioId);

  // T83 — 사기범 턴이 가용 게이트에 도달하면 **확인 권유**를 도착시킨다(§16.1.3 앱 오케스트레이션).
  // 서버가 오퍼 문서를 쓰고 지시를 돌려주면, 실시간 경로는 그것을 같은 Live 세션에 넣어 캐릭터가
  // "직접 확인해 보시라"고 권하게 한다(폴백 경로는 서버가 다음 턴 프롬프트에 직접 싣는다).
  //
  // ⚠️ **게이트가 없으면 아무 일도 일어나지 않는다** — `verifyOffer` 필드는 카탈로그 보유 && 고급 &&
  // 난이도 반영 경로일 때만 서버가 붙인다(§16.1.5). 즉 컨트롤이 **존재하지 않는** 세션이 기본이다.
  // 실패해도 통화는 계속된다(P-4 — 인라인 안내만, UF-011 Failure (b)).
  //
  // ⭐⭐ **§38.4 후보 E — 실시간 경로는 2단계다**(순서 교정의 본체). 1단계(`announce`)는 지시만
  // 받고 **문서를 만들지 않는다**. 예고 턴이 한 번 끝난 뒤 2단계(`commit`)가 문서를 만든다
  // ⇒ **문서 존재 = 예고 완료**가 되어 컨트롤이 예고보다 먼저 뜨지 않는다.
  // ⛔ **폴백 경로는 종전 그대로 1회 호출이다** — 그쪽은 **문서가 곧 announce 트리거**라
  // (`roleplay/index.ts`) 문서를 미루면 예고가 영영 안 나온다. 폴백의 순서 보장은 **후보 C**
  // (`announcedAt`을 선행 조건으로 읽는다)가 맡는다 — 아래 `shouldRevealVerifyOffer` 재사용 참조.
  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    if (callMode !== "realtime" && callMode !== "fallback") return;
    const trigger = realtime.credentials?.verifyOffer;
    // 완료된 사기범 발화 수: 실시간은 Live 턴 카운터, 폴백은 이미 쌓인 대화 로그(오프닝 포함).
    const completedScammerTurns =
      callMode === "realtime" ? scammerTurns : messages.filter((m) => m.role === "scammer").length;
    // ⭐ 예고 턴이 끝났는가 = **주입 시점보다 사기범 턴이 한 번 더 완료됐는가.** 관측점은 이미
    // 있던 것을 재사용한다(`onScammerTurnComplete` → `scammerTurns`) — 신규 관측점 0건(§38.2 3).
    const announcedAtTurns = verifyAnnounceTurnsRef.current;
    const announceTurnComplete =
      announcedAtTurns !== null && completedScammerTurns > announcedAtTurns;
    // 폴백은 2단계를 쓰지 않는다(위 ⛔) — `stage` 부재 = 종전 동작.
    const stage =
      callMode === "realtime"
        ? nextVerifyOfferStage({ phase: verifyOfferPhaseRef.current, announceTurnComplete })
        : verifyOfferPhaseRef.current === "idle"
          ? "announce"
          : null;
    if (stage === null) return;
    // ⭐⭐ §47.3 C1/C2 — 게이트(`availableAfterScammerTurns`)는 **1단계에만** 건다(2단계는 이미
    // 열린 흐름의 이어짐). `shouldOfferVerify` 자체는 무변경(G263) — 그 결과 위에 참가자 조건을
    // **조합**하는 것은 `shouldAnnounceVerifyOffer` 한 곳이다(계열 A는 예외 없이 통과, C2·G264).
    if (
      stage === "announce" &&
      !shouldAnnounceVerifyOffer({
        series: verifySeries,
        gateReached: shouldOfferVerify({
          ...(trigger ? { trigger } : {}),
          scammerTurns: completedScammerTurns,
          alreadyRequested: verifyOfferPhaseRef.current !== "idle",
        }),
        intentExpressed: verifyIntentExpressed,
      })
    ) {
      return;
    }
    // ⭐⭐ **§59.10 커밋 D — 지연 발동(백스톱), announce 단계 · 실시간 경로 전용.** 폴백 경로는
    // Live 도구 개념이 없으므로(`GeminiVoiceSession` 자체가 마운트되지 않는다) 이 게이트를 타지
    // 않는다 — `toFallbackCredentials`가 `liveTools`를 지우지 않아 값이 남아 있어도 무관하게
    // **callMode==="realtime"일 때만** 적용한다(그러지 않으면 폴백 텍스트 경로의 예고가 불필요하게
    // 늦어지는 회귀가 생긴다). commit 단계는 여전히 게이팅하지 않는다(R8/§38.4 후보 E 무변경).
    if (stage === "announce" && callMode === "realtime") {
      const verifyToolAvailable = Boolean(realtime.credentials?.liveTools?.offerVerificationDesk);
      const fire = shouldFireBackstop({
        toolAvailable: verifyToolAvailable,
        boundariesSinceDue: trigger
          ? Math.max(0, completedScammerTurns - trigger.availableAfterScammerTurns)
          : 0,
        secondsSinceLastBoundary: Math.max(0, elapsedSec - lastScammerBoundaryAtSecRef.current),
        toolCallFailed: verifyToolCallFailedRef.current,
      });
      if (!fire) return;
      // ⭐ §59 Critical 수정(reviewer REJECTED) — 서버가 announce를 멱등하게 구분하지 못하므로
      // (`verifyAnnounceGuard.ts` 근거 주석) 요청을 보내기 **전에** 클라가 직접 막는다. 이미 모델
      // 도구 경로(`GeminiVoiceSession.dispatchToolCall`)가 요청 중이면 여기서는 아무 것도 하지
      // 않고 되돌아간다 — 다음 사기범 턴 경계에서 단계가 이미 전진해 있으면 이 이펙트 자체가
      // 재실행되지 않는다(자연 소멸, 재시도 로직 불필요).
      if (!claimVerifyAnnounceSlot()) return;
    }
    verifyOfferPhaseRef.current = stage === "announce" ? "announced" : "committed";
    // ⛔ **§45.7 V2 — 여기서 `verifyAnnounceTurnsRef`를 찍지 않는다**(종전 1줄 삭제). 요청 발신 시점은
    // *지시가 주입된 시점*이 아니다 — 큐에 밀리면 실제 발화가 한 턴 뒤로 가는데 commit은 그것을
    // 모른 채 앵커를 굳혔다(§45.6 (3) F2-a). 기록은 `drainInstructionQueue`가 한다.
    const requestCallMode = callMode;
    (async () => {
      try {
        const result = await deliverVerifyOffer({
          sessionId,
          callMode: requestCallMode,
          // 앵커 판별자(§16.3.2) — 실시간일 때만 필수다. 폴백은 서버가 messages를 직접 센다.
          ...(requestCallMode === "realtime" ? { scammerTurns } : {}),
          // ⭐ 폴백은 `stage`를 보내지 않는다(종전 동작 유지).
          ...(requestCallMode === "realtime" ? { stage } : {}),
          // ⭐ §61.7 — **이 호출부는 앱 주도(백스톱)다.** 모델 도구 경로가 보내는
          // `trigger:"model_tool"`(GeminiVoiceSession)과 서버 로그에서 갈리게 명시한다(§59.11 P-E).
          // ⛔ 폴백에는 보내지 않는다 — 그 경로엔 도구 창 자체가 없어 "백스톱"이 거짓 라벨이 된다
          // (로그에선 `null` = 폴백/앱 주도 텍스트 경로). 조건은 바로 위 `stage`와 **같은 조건**이다.
          ...(requestCallMode === "realtime" ? { trigger: "backstop" as const } : {}),
        });
        setVerifyError(null);
        // 폴백 경로는 서버가 다음 sendMessage 턴에 직접 주입하므로 클라가 넣지 않는다(중복 방지).
        // T118/R-1 — 전환이 이미 끝난 오퍼면 서버가 지시를 **생략**한다(§25.5 (4)). 값이 없으면
        // 주입하지 않는다: 전환 이후의 확인 권유는 참가자가 겪은 사실과 모순이다.
        // ⭐ 2단계(`commit`)에는 서버가 지시를 싣지 않는다 — 실으면 같은 권유가 두 번 나간다.
        if (requestCallMode === "realtime" && result.announceInstruction) {
          enqueueTurnInstruction(result.announceInstruction, "verify");
        }
      } catch (error) {
        // 다음 턴 경계에서 다시 시도할 수 있게 요청 기록을 되돌린다(조용한 실패 금지).
        // T118/R-2 — 단, **재시도해도 같은 결과인 오류**에서는 되돌리지 않는다(§25.5 (4)).
        // 그 재시도가 곧 중복 주입 경로다. 판정은 순수 함수에 있다(`shouldRetryVerifyOffer`).
        // ⭐ **G187** — 2단계 실패는 `idle`이 아니라 `announced`로 되돌린다(예고는 이미 나갔다).
        verifyOfferPhaseRef.current = rollbackVerifyOfferPhase({
          currentPhase: verifyOfferPhaseRef.current,
          stage,
          retryable: shouldRetryVerifyOffer(error),
        });
        // 되돌린 단계가 1단계면 주입 시점 기록도 함께 지운다(다음 시도에서 다시 잰다).
        if (verifyOfferPhaseRef.current === "idle") {
          verifyAnnounceTurnsRef.current = null;
          pendingVerifyAnnounceUserTurnsRef.current = null;
        }
      } finally {
        // ⭐ §59 Critical 수정 — 위에서 클레임한 슬롯을 성공·실패 무관하게 되돌린다(다음 재시도가
        // 영영 막히지 않게). 클레임은 `stage === "announce" && callMode === "realtime"`일 때만
        // 있었으므로 release도 그 조건에서만 한다(그 외 경로는 애초에 슬롯을 건드리지 않았다).
        if (stage === "announce" && requestCallMode === "realtime") {
          releaseVerifyAnnounceSlot();
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessionId,
    callMode,
    phase,
    scammerTurns,
    messages,
    elapsedSec,
    realtime.credentials?.verifyOffer,
    realtime.credentials?.liveTools?.offerVerificationDesk,
    verifySeries,
    verifyIntentExpressed,
  ]);

  const handleScammerTurnComplete = useCallback(() => {
    // ⭐ §82.3.4(G539) — 사기범 턴 수는 여기서 올리지 않는다. 같은 `turnComplete`의 전사 flush(`handleTranscriptTurn`,
    // 이 콜백보다 **먼저** 불린다 — `GeminiVoiceSession`)가 이미 올렸다 ⇒ 아래 드레인이 읽는 ref는 최신이다(§45.7 V2 유지).
    // 빈 `turnComplete`(N1)에서는 이 콜백 자체가 불리지 않는다.
    // §59.8 — 이 경계가 곧 "마지막 사기범 턴 경계"다. 백스톱의 정지(stall) 시계를 여기서 리셋한다.
    lastScammerBoundaryAtSecRef.current = elapsedSecRef.current;
    // 턴이 끝났으니 보류분을 하나 더 내보낸다(위 계약 (2)).
    instructionBusyRef.current = false;
    drainInstructionQueue();
    // T118 / A5-α — 전환 이후에는 같은 턴 경계에서 전환 상태 단언을 **다시** 넣는다(§25.3).
    // 큐를 타지 않으므로 위 드레인과 경합하지 않는다(턴 슬롯 소비 0 ⇒ G31/G58 무변경).
    const line = transferStateLineRef.current;
    if (
      line &&
      shouldReinjectTransferState({
        placed: true,
        userTurnsSinceLastInjection: userTurnsSinceInjectionRef.current,
        atScammerTurnBoundary: true,
      })
    ) {
      userTurnsSinceInjectionRef.current = 0;
      setPersonaStateTurn((prev) => ({ text: line, seq: (prev?.seq ?? 0) + 1 }));
    }
  }, [drainInstructionQueue]);

  // §59.10 커밋 D — 모델이 확인 오퍼 예고를 도구로 직접 성공시켰다. 앱의 `verifyOfferPhaseRef`를
  // 전진시켜야 (1) 백스톱이 같은 예고를 중복으로 다시 보내지 않고 (2) commit 단계(문서 실제 생성)가
  // 다음 사기범 턴 경계에서 이어질 수 있다 — `nextVerifyOfferStage`는 `phase !== "idle"`이어야
  // commit으로 넘어간다(§38.4 후보 E). 앵커는 이 시점의 `scammerTurnsRef`(§45.7 V2와 같은 근거로
  // ref를 쓴다 — state는 리렌더 전이라 낡을 수 있다). ⚠️ **정확한 턴 경계 정합은 라이브 미검증**
  // 이다(§59.13류 한계와 동일 — 도구 호출은 `turnComplete`보다 먼저 도착할 수 있어 최대 한 턴
  // 어긋날 수 있다, 구현 보고서에 인계).
  const handleModelToolVerifyAnnounced = useCallback(() => {
    if (verifyOfferPhaseRef.current === "idle") {
      verifyOfferPhaseRef.current = "announced";
      verifyAnnounceTurnsRef.current = scammerTurnsRef.current;
    }
  }, []);

  // §59.10 커밋 D(G390) — 확인 오퍼 도구 경로 실패(SMS와 동형).
  const handleModelToolVerifyFailed = useCallback(() => {
    verifyToolCallFailedRef.current = true;
  }, []);

  // 통화 경과 타이머 — "받기"(answeredAt) 기점, ended면 정지.
  useEffect(() => {
    // T190-8b(§74.22 (4) #4) — 벨 직전 고지에서도 돌지 않는다(타이머 = 받기 기점 · OQ-U8).
    if (phase === "pre-call-notice" || phase === "incoming" || phase === "ended") return;
    const interval = setInterval(() => {
      elapsedSecRef.current += 1;
      setElapsedSec(elapsedSecRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Action Item 1(reviewer REJECTED, e4414c3 후속) — G31 큐 드레인이 상한(나)에 닿았는데
  // `handleScammerTurnComplete`/`enqueueTurnInstruction` 어느 쪽도 다시 부르지 않으면(참가자가
  // 계속 침묵하고 새 지시도 없으면) 영영 재판정되지 않는다(`verifyIntercept.ts`의
  // `INSTRUCTION_DRAIN_BACKSTOP_SEC` 주석 참고). 이미 떠 있는 통화 경과 타이머(위 effect)의 매
  // 틱마다 유예 시간 경과를 확인해, 지났으면 `drainInstructionQueue`를 다시 불러 정상 경로로
  // 재판정시킨다 — 판정 함수(`shouldDrainInstructionQueue`) 자체는 손대지 않는다.
  useEffect(() => {
    if (phase !== "live") return;
    if (instructionQueueRef.current.length === 0) return;
    const capReachedAtSec = instructionCapReachedAtSecRef.current;
    if (capReachedAtSec === null) return;
    if (elapsedSec - capReachedAtSec < INSTRUCTION_DRAIN_BACKSTOP_SEC) return;
    drainInstructionQueue();
  }, [elapsedSec, phase, drainInstructionQueue]);

  // finding #2: 실시간 음성 통화의 시간 한도 자동 종료. 폴백 경로는 sendMessage가 서버에서
  // 한도를 판정해 자동 종료하지만(AC-007), 실시간 경로는 sendMessage를 안 타 한도가 강제되지
  // 않았다. 클라 타이머(answeredAt 기점, elapsedSec)가 서버 maxSessionMs를 넘으면 통화를 끝낸다.
  const autoEndedRef = useRef(false);
  useEffect(() => {
    if (callMode !== "realtime" || phase !== "live" || maxSessionMs === null) return;
    if (autoEndedRef.current) return;
    if (elapsedSec * 1000 < maxSessionMs) return;
    autoEndedRef.current = true;
    // T68/UX-027 Failure (d) — 한도 도달 시 오버레이를 **먼저 내린다**. 종료 고지(AC-015/023)가
    // 문자 화면에 가려지면 안 된다(AC-059). 이 effect의 조건·의존성에는 오버레이 상태를 넣지
    // 않는다(넣으면 오버레이가 열린 동안 한도 종료가 멈춘다 — §15.1.1).
    audioRef.current?.pause();
    realtime.stop();
    // 인라인 async IIFE로 감싼다(react-hooks/set-state-in-effect 회피 — 이 화면의 다른 effect들과
    // 동일한 관례). setSmsOverlayOpen도 그 안에서 호출한다.
    (async () => {
      setSmsOverlayOpen(false);
      // T83/UX-031 Exit — 확인 오버레이도 같은 규칙으로 먼저 내린다(종료 고지가 가려지지 않게).
      setVerifyOverlayOpen(false);
      await flushTranscript();
      router.push("/session/end");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callMode, phase, elapsedSec, maxSessionMs]);

  // 실시간 통화가 연결/폴백 판정을 끝내면 화면 phase를 맞춘다. 인라인 async IIFE로 감싼다
  // (react-hooks/set-state-in-effect 회피 — effect 본문에서 직접 setState를 호출하면 "동기
  // setState"로 오탐한다, clone/wait·session/end 등 다른 화면과 동일한 관례).
  useEffect(() => {
    if (callMode !== "realtime") return;
    (async () => {
      if (realtime.status === "active") {
        setPhase("live");
      } else if (
        realtime.status === "fallback" ||
        realtime.status === "unsupported" ||
        realtime.status === "permission-denied" ||
        realtime.status === "error"
      ) {
        // ⛔ §55 D3(G351) — **이 분기의 첫 줄**에서 래치를 되돌린다. 아래에서 오프닝 오디오를
        // 재생하고 메시지 구독이 그 행을 말풍선으로 그리므로, 여기서부터 그 대사는 **실제로
        // 참가자에게 도달한다**. Gemini로 연결됐다가 뒤늦게 강등된 세션이 정확히 이 경로다.
        openingNotSpokenRef.current = false;
        // 실시간 불가 — 기존 텍스트/STT 경로로 강등한다. 오프닝 오디오가 있으면 그것부터 재생.
        setCallMode("fallback");
        const audio = consumeOpeningAudioUrl();
        if (audio) {
          setPlaybackUrl(audio);
          setPhase("opening");
        } else {
          setPhase("live");
        }
      } else if (realtime.status === "ended") {
        setPhase("ended");
      }
    })();
  }, [callMode, realtime.status]);

  // ⭐ §55 D3(G351) — 래치 세팅 지점. **Gemini Live 세션이 실제로 연결된 것을 관측했을 때만** 켠다.
  //
  // 두 조건을 모두 요구하는 이유(`useRealtimeCall.ts` 직접 판독):
  //  ① `status === "active"`는 **세션 컴포넌트가 `handleActive`를 올려야만** 세팅된다 — 자격증명을
  //     받았지만 연결이 매달리거나 조용히 닫힌 경우는 `connecting`→`error`로 가고 여기 오지 않는다.
  //  ② `provider === "gemini"`가 필요한 것은 ElevenLabs 경로가 오프닝을 **실제로 낭독하기**
  //     때문이다(`firstMessage={openingMessageText}`). 그리고 폴백으로 내려간 자격증명은
  //     `toFallbackCredentials`가 `provider:"none"`으로 낮추므로 이 조건에 걸리지 않는다.
  // ⛔ `provider`만 보고 세팅하면 강등 세션에서 오탐한다 — 되돌리는 쪽은 위 폴백 분기가 맡는다.
  useEffect(() => {
    if (realtime.status === "active" && realtime.credentials?.provider === "gemini") {
      openingNotSpokenRef.current = true;
    }
  }, [realtime.status, realtime.credentials]);

  // T190-3(§74.6 (4) · G455 · D-103) — 폴백 `<audio>`에도 같은 음량 모드를 대입한다(⚠️ 아래 자동재생 effect보다
  // **먼저** 선언한다 — effect는 선언 순서로 돌므로 재생 전에 음량이 먼저 들어간다). 대입 뒤 **다시 읽어**
  // 반영되지 않으면(iOS Safari는 volume을 설정할 수 없고 늘 1을 돌려준다 — §74.2 ②) 이 경로의 스피커 칸을
  // 비활성으로 돌린다(눌리는데 아무것도 안 바뀌는 활성 버튼 0 — AC-093 (c)). UA로 판별하지 않는다.
  // 인라인 async IIFE로 감싼다(react-hooks/set-state-in-effect 회피 — 이 화면의 다른 effect들과 같은 관례).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playbackUrl) return;
    // reviewer Minor(D-103 거짓 양성) — 판정은 **1이 아닌 값**으로 따로 프로브한다(스피커 1.0을 먼저 켜 두면 iOS에서
    // 1.0을 쓰고 읽어도 1이라 "반영됨"으로 잘못 판정됐다). 잠기면 모드를 통화로 되돌려 `aria-pressed`와 상태를 맞춘다.
    const settable = isVolumeSettable(audio);
    const requested = gainFor(audioRoute);
    audio.volume = requested;
    (async () => {
      if (!settable) {
        setFallbackVolumeLocked(true);
        setAudioRoute("call");
      }
    })();
  }, [playbackUrl, audioRoute]);

  // 폴백 경로 오디오 자동재생 — 브라우저 정책으로 막히면 "탭하여 듣기" 버튼만 최소로 노출(P-4).
  useEffect(() => {
    if (!playbackUrl) return;
    (async () => {
      setPlaybackBlocked(false);
      registerFallbackAudio(audioRef.current); // 진단 패널 관찰 전용
      try {
        await audioRef.current?.play();
        noteFallbackPlay("ok");
      } catch (err) {
        noteFallbackPlay(err instanceof Error ? err.name : "unknown");
        setPlaybackBlocked(true);
      }
    })();
  }, [playbackUrl]);

  const handleManualPlay = () => {
    audioRef.current
      ?.play()
      .then(() => {
        noteFallbackPlay("ok");
        setPlaybackBlocked(false);
      })
      .catch((err: unknown) => noteFallbackPlay(err instanceof Error ? err.name : "unknown"));
  };

  const maybeStartListening = useCallback(() => {
    if (speech.status === "unsupported" || speech.status === "listening") return;
    speech.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.status]);

  // #7 연속 자동 청취(폴백 경로 전용) — 브라우저 SpeechRecognition은 침묵이 이어지면 스스로 종료해
  // status가 idle로 떨어진다. live 구간에서 재생 중/전송 중이 아니면 idle이 될 때마다 다시 연다.
  // start()가 status를 listening으로 바꿔 이 effect가 곧 멈추므로 타이트 루프가 아니다.
  //
  // ⭐ T190-3(UX D-99 · AC-093 (d) · docs/Architecture.md §74.6 ⑥ · G452) — **문자함이 열려 있어도 마이크를
  // 멈추지 않는다**(실시간·폴백 두 경로 모두). 예전(T68 §15.1.3)에는 문자 오버레이가 열린 동안 이 effect가
  // 청취 재개를 막았다 — 그 조건을 지웠다. 마이크는 참가자 자신의 음소거 버튼(`muted`)만 따른다.
  // ⚠️ 남는 위험 R-1(폴백 STT가 문자를 읽는 중 혼잣말·주변 소리를 발화로 보낼 수 있음) = User 수용(D-99 Reason).
  // ⚠️ 재생·타이머는 원래도 게이팅 대상이 아니다 — 통화가 살아 있다는 것이 이 기능의 전부다.
  // T83(§16.2) — 확인 오버레이(UX-031)의 마이크 게이팅은 **D-99 대상이 아니라 유지**한다(User 원문은 문자함만
  // 말한다). 음소거 버튼의 aria-pressed는 여전히 사용자 의도 `muted`에만 바인딩한다.
  useEffect(() => {
    if (callMode !== "fallback" || phase !== "live" || verifyOverlayOpen) return;
    if (speech.status !== "idle") return;
    if (sending || playbackUrl) return;
    const timer = setTimeout(() => speech.start(), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callMode, phase, speech.status, sending, playbackUrl, verifyOverlayOpen]);

  // P-11 이음새 없는 전환 — 오프닝 재생이 끝나면 확인 버튼 없이 곧바로 실시간 청취로 넘어간다.
  const handlePlaybackEnded = () => {
    setPlaybackUrl(null);
    setPhase((p) => (p === "opening" ? "live" : p));
    maybeStartListening();
  };

  // 사용자 신고(2026-07-25) — "전화가 연결되면 바로 말하는 걸로". 전화가 울리는 동안(아직 "받기"
  // 전) 자격증명만 미리 받아 둔다 — 마이크 접근·"받기" 소비는 그대로 handleAnswer에서만 일어나므로
  // "받기 전엔 아무 것도 새지 않는다"는 관례는 무변경이다(realtime.prefetch 자체가 상태를 안 바꿈).
  // ⭐ 2026-10-18(라이브 d13e718 회귀) — 벨 직전 고지(`pre-call-notice`)가 보이는 동안부터 시작한다. T190에서 고지와
  // "준비됐어요" 뒤 정적이 생겨 `incoming`이 늦게 시작되자, 받기를 빨리 누르면 미리 받기가 끝나기 전에 받기가 와서
  // 같은 자격증명이 두 번 발급됐다. `incoming` 조건도 남긴다(새로고침으로 벨에 바로 들어오는 경로 · 에스컬레이션 경로).
  // 고지→벨 전이로 다시 불려도 진행 중·신선한 결과가 있으면 훅이 다시 걸지 않는다(`shouldStartPrefetch`).
  useEffect(() => {
    if (pageState !== "ready" || !sessionId) return;
    if (phase !== "pre-call-notice" && phase !== "incoming") return;
    realtime.prefetch(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageState, sessionId, phase, realtime.prefetch]);

  // ⭐ T190-4(UX D-97 · AC-093 (a)(b) · docs/Architecture.md §74.7 · G454) — 수신(`incoming`) 동안만 벨·진동.
  // effect **하나**에 시작·정지를 모은다: 받기(`connecting`으로 전이) · 거절(라우팅 언마운트) · 종료 · 페이지
  // 이탈이 전부 아래 cleanup 하나로 정지된다. 추가로 `pagehide`에서도 멈춘다(bfcache 이탈).
  // ⚠️ 자동재생이 막히면 **무음으로 진행**하고 오류 문구 0(D-97). iOS형은 진동 없음(D-97). ⏳ iOS 벨은 D-102
  // (`pre-call-notice` 탭 — T190-8b)까지 무음일 수 있다(User 결정 OQ-A95 ⓐ — 그대로 둔다).
  useEffect(() => {
    if (pageState !== "ready" || phase !== "incoming") return;
    // T190-8b — "준비됐어요" 탭에서 미리 깨운 컨텍스트가 있으면 넘긴다(소유권 이전 — 알림이 stop에서 닫는다).
    const primedContext = primedAlertContextRef.current ?? undefined;
    primedAlertContextRef.current = null;
    const alert = startIncomingAlert(deviceSkin.skin, { primedContext });
    incomingAlertRef.current = alert;
    const handlePageHide = () => alert.stop();
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      alert.stop();
      if (incomingAlertRef.current === alert) incomingAlertRef.current = null;
    };
  }, [pageState, phase, deviceSkin.skin]);

  // T190-3(UX D-91 · §74.6 (6)) — 떠 있는 배너의 6초 타이머. 포커스·호버 중에는 멈춘다(WCAG 2.2.1 — 재개 시
  // 처음부터 6초). ⛔ 새 setInterval을 만들지 않는다(`toolWindowWiring.test.ts` — 화면의 setInterval은 통화 경과
  // 타이머 1개뿐이다). 시각적으로 사라질 뿐 정보는 "메시지" 버튼 배지와 문자함에 남는다.
  const bannerSmsId = visibleBannerSmsId({
    latestSmsId: latestSmsId(inCallSms),
    ackSmsId: bannerAckSmsId,
    expiredSmsId: bannerExpiredSmsId,
    overlayOpen: smsOverlayOpen,
    ended: phase === "ended",
  });
  useEffect(() => {
    if (!shouldRunBannerTimer(bannerSmsId, bannerPausedSmsId === bannerSmsId)) return;
    const timer = setTimeout(() => setBannerExpiredSmsId(bannerSmsId), BANNER_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [bannerSmsId, bannerPausedSmsId]);

  // ⭐ 수정안 A — 받기 시점 컨텍스트 해제. Gemini 세션이 그것을 쓸 일이 없어지면(ElevenLabs · 폴백 · 마운트 전 오류 ·
  // 통화 종료) 닫는다. 판단은 `shouldReleasePrimedCallAudio` 하나가 소유한다. 닫기는 멱등이다.
  useEffect(() => {
    if (
      shouldReleasePrimedCallAudio({
        status: realtime.status,
        provider: realtime.credentials?.provider,
        ended: phase === "ended",
        callMode,
      })
    ) {
      closePrimedCallAudio(primedCallAudio);
      // reviewer 2차 Minor — 재진입 가드 ref도 비운다(닫힌 컨텍스트를 다음 받기가 "이미 준비됨"으로 보지 않게).
      if (primedCallAudioRef.current === primedCallAudio) primedCallAudioRef.current = null;
    }
  }, [primedCallAudio, realtime.status, realtime.credentials?.provider, phase, callMode]);

  // 언마운트(또는 다른 값으로 교체) 시 반드시 닫는다 — 누수 0.
  useEffect(() => {
    if (!primedCallAudio) return;
    return () => closePrimedCallAudio(primedCallAudio);
  }, [primedCallAudio]);

  // ⭐ 수정안 A 안전망 — 통화 중 컨텍스트가 suspended로 남아 있으면 **다음 사용자 탭**(어느 컨트롤이든)에서 resume을 한 번
  // 더 요청한다. 리스너는 capture · passive로만 듣고 기본 동작·전파를 막지 않는다(기존 컨트롤 동작 무변경 · 문구 0).
  // running·closed인 컨텍스트는 건드리지 않는다(멱등).
  useEffect(() => {
    if (phase !== "connecting" && phase !== "opening" && phase !== "live") return;
    const handleGesture = () => {
      const targets = new Set([primedCallAudio?.output, primedCallAudio?.input, ...registeredCallContexts()]);
      noteResumeRetry(resumeSuspendedContexts([...targets], noteAudioError));
    };
    for (const type of RESUME_GESTURE_EVENTS) {
      window.addEventListener(type, handleGesture, { capture: true, passive: true });
    }
    return () => {
      for (const type of RESUME_GESTURE_EVENTS) {
        window.removeEventListener(type, handleGesture, { capture: true });
      }
    };
  }, [phase, primedCallAudio]);

  // T190-8b(UX-014 v1.33 (11) ① · §74.22 (3) · AC-087 (c)) — "준비됐어요". ① 이 세션의 고지 확인 기록(새로고침 생략)
  // ② **이 제스처 안에서** 벨 오디오를 준비(iOS 자동재생 — OQ-A95 ⓐ의 해제 지점) ③ 짧은 정적 뒤 벨(`incoming`).
  const handleConfirmPreCallNotice = () => {
    if (preCallLeaving) return;
    if (sessionId) markPreCallNoticeSeen(sessionId);
    primedAlertContextRef.current = primeIncomingAlertAudio();
    registerRingContext(primedAlertContextRef.current); // 진단 패널(`?audiodebug=1`) 관찰 전용
    setPreCallLeaving(true);
    preCallTimerRef.current = setTimeout(() => {
      preCallTimerRef.current = null;
      setPhase("incoming");
      setPreCallLeaving(false);
    }, PRE_CALL_GAP_MS);
  };

  // 정적 중에 화면을 떠나면 타이머와 준비한 컨텍스트를 정리한다(벨이 울리지 않은 채 컨텍스트가 남지 않게).
  useEffect(() => {
    return () => {
      if (preCallTimerRef.current) clearTimeout(preCallTimerRef.current);
      void primedAlertContextRef.current?.close().catch(() => {});
    };
  }, []);

  // reviewer M3 — 미룬 벨 close가 남아 있으면 화면을 떠날 때 반드시 닫는다(누수 0 · 멱등).
  useEffect(() => {
    return () => {
      deferredRingCloseRef.current?.();
      deferredRingCloseRef.current = null;
    };
  }, []);

  // T190-8b(§74.12 (3) ⑥ · D-100 (2)) — 통화 경로의 세션 전 화면 모양 선택. 서버 쓰기 0(§74.5 (2) — 같은 기기에서
  // 표 K가 결정론적이다) · 기기 저장(`fv.deviceSkin.v1` — 새로고침·다음 세션의 K-2). ⛔ 세션 중(벨 이후)에는 부르는 곳 0.
  const handleChooseCallSkin = (next: "ios" | "samsung") => {
    setDeviceSkin({ skin: next, source: "manual" });
    try {
      window.localStorage.setItem(DEVICE_SKIN_STORAGE_KEY, serializeStoredDeviceSkin(next, Date.now()));
    } catch {
      // 저장소를 쓸 수 없으면 이번 세션 값만 남는다(비차단).
    }
  };

  const handleAnswer = () => {
    // reviewer M2/M3 — 실기 A/B 플래그(동작 선택 전용 · 문구 0). 쿼리가 없으면 기본 = 수정안.
    const audioFlags = readAudioFlags(window.location.search);
    // ⭐ reviewer M3 — 기본은 벨 **소리·진동만 즉시 0**(holdOpen)으로 하고 벨 컨텍스트 close는 통화 출력이 running이 된 뒤로
    // 미룬다("벨 컨텍스트를 닫은 직후 통화 컨텍스트를 만드는 순서"가 Android 무음 원인 후보 — 그 순서를 가른다).
    // `?ringclose=immediate`면 holdOpen을 건너뛰어 바로 아래 stop()이 종전대로 즉시 close한다.
    const ringAlert = incomingAlertRef.current;
    const releaseRing = audioFlags.ringCloseImmediate ? null : (ringAlert?.holdOpen() ?? null);
    if (releaseRing) deferredRingCloseRef.current = releaseRing; // 아래 return 경로에서도 언마운트 cleanup이 닫는다
    const ringStoppedAt = performance.now();
    // T190-4(§74.7) — 전이 렌더 전에 **즉시** 벨을 멈춘다(실시간 오디오와 겹침 0). cleanup도 다시 부르지만 멱등이다.
    incomingAlertRef.current?.stop();
    if (!sessionId) return;
    // QA L-4 — 받기 연타(같은 렌더 안 두 번째 호출)로 realtime.start·markSessionAnswered가 두 번 도는 것을 막는다.
    if (answerHandledRef.current) return;
    answerHandledRef.current = true;
    // finding #4: "받기"를 누른 세션을 기록해, 통화 중 새로고침 시 벨 화면이 아니라 통화로 복원.
    markSessionAnswered(sessionId);
    // §57.2 (6) 처방 D1 — 통화 타이머(`elapsedSec`)가 0이 되는 바로 이 지점의 시각을 참가자 시계
    // 기준으로 래치한다. 이후 모든 전사 턴의 `atMs`는 이 값 기준 상대 ms다(T-1 처방).
    answeredAtMsRef.current = Date.now();
    // ⭐ 수정안 A — **이 탭 핸들러 안에서 동기로** 통화 오디오 컨텍스트를 만들고 resume한다(벨 primed 컨텍스트와 같은
    // 패턴). 예전엔 받기 뒤 비동기 effect에서 만들어, 탭과의 간격이 길면 일부 Android 브라우저에서 suspended로 남았다
    // (가설 — 실기 확인 대상). ⛔ 이 줄 앞에 await를 두지 않는다.
    // reviewer m2 — 이미 만들었으면 다시 만들지 않는다. `?audioprime=0`이면 만들지 않는다(종전 경로 — 세션이 직접 만든다).
    let primedAudio = primedCallAudioRef.current;
    if (!primedAudio && audioFlags.audioPrime) {
      primedAudio = primeCallAudio(GEMINI_OUTPUT_SAMPLE_RATE, performance.now());
      primedCallAudioRef.current = primedAudio;
      setPrimedCallAudio(primedAudio);
    }
    setPhase("connecting");
    setCallMode("realtime");
    // 실시간 연결을 먼저 시도한다(위 prefetch로 미리 받아 둔 자격증명이 신선하면 재사용). 불가하면
    // 위 effect가 폴백으로 강등한다.
    void realtime.start(sessionId);
    // 진단 패널(`?audiodebug=1`) 관찰 전용 — start()가 받기 시점 값을 비운 직후에 적는다.
    if (primedAudio) {
      registerCallAudio({
        output: primedAudio.output,
        input: primedAudio.input,
        origin: "primed",
        createdAtMs: primedAudio.createdAtMs,
      });
    }
    if (!ringAlert) return;
    if (!releaseRing) {
      noteRingClosed(ringStoppedAt); // 즉시 close 경로(진단 관찰 전용)
      return;
    }
    // 미룬 close — 통화 출력(빌린 것이든 세션이 만든 것이든 등록된 출력)이 running이 되거나 상한이 지나면 닫는다.
    deferredRingCloseRef.current = scheduleDeferredRingClose(
      () => {
        releaseRing();
        noteRingClosed(performance.now());
      },
      () => readAudioDiag().output?.state,
      {
        now: () => performance.now(),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (handle) => window.clearTimeout(handle as number),
      },
    );
  };

  const handleDecline = () => {
    router.push("/session/end");
  };

  // T68 — 오버레이 열기/닫기. **라우팅을 하지 않는다**(D-35 하드 요구): 상태만 바꾸므로
  // GeminiVoiceSession/RealtimeVoiceSession은 언마운트되지 않고 통화가 그대로 유지된다.
  const handleOpenSmsOverlay = (trigger: HTMLButtonElement | null) => {
    smsTriggerRef.current = trigger;
    // ⭐ T190-3(UX D-99 · G452) — 폴백 경로에서도 문자함을 열 때 마이크를 닫지 **않는다**(예전 T68은 여기서 STT를
    // 멈췄다). 참가자는 문자를 보면서 인증번호를 그대로 불러 줄 수 있다(AC-061 "불러준 사실").
    // T190-3(D-91 ③) — 문자함을 열면 그때까지 온 건의 배너는 다시 뜨지 않는다.
    setBannerAckSmsId((current) => ackOnOverlayClose(latestSmsId(inCallSms), current));
    // ⚠️ 동시 열림 금지(§16.2 신규 규칙 / §16.6 G26) — 두 오버레이 모두 `aria-modal="true"`라
    // 겹치면 **포커스 트랩이 중첩돼 "훈련 종료" 도달성이 깨진다**(AC-006). 상태를 하나로 합치는
    // 리팩터는 하지 않는다(요청되지 않은 변경 금지) — 여는 쪽에서 상대를 닫는 것으로 충분하다.
    setVerifyOverlayOpen(false);
    setSmsOverlayOpen(true);
  };

  const handleCloseSmsOverlay = () => {
    setSmsOverlayOpen(false);
    // T190-3(§74.6 (6)) — 닫는 순간의 최신 id까지 확인 처리(열려 있는 동안 도착한 건 포함 — 현행 의미 유지).
    setBannerAckSmsId((current) => ackOnOverlayClose(latestSmsId(inCallSms), current));
    // 직전 트리거(배너 또는 "문자함" 버튼)로 포커스 복귀(UX-027 Focus Order).
    smsTriggerRef.current?.focus();
  };

  // T123 — enum을 여기서 다시 적지 않고 **계약 타입을 그대로 쓴다**. 값을 복제해 두면 서버가
  // 값을 늘릴 때마다 이 자리가 조용히 뒤처진다(§18.1 드리프트 원천).
  const handleRecordSmsEvent = (smsId: string, event: InCallSmsEvent) => {
    if (!sessionId) return;
    // 기록 실패는 조용히 흡수한다 — 기록 때문에 훈련을 막지 않는다(API.md Errors).
    void recordInCallSmsEvent({ sessionId, smsId, event }).catch(() => {});
  };

  // T83 — 확인 오버레이 열기/닫기. **라우팅을 하지 않는다**(D-35 하드 요구, §16.2): 상태만 바꾸므로
  // 통화 세션 컴포넌트가 언마운트되지 않고 통화·타이머·오디오가 그대로 유지된다.
  // ⭐⭐ §47.4 W4/D-68 + §49(V5, 2026-08-02) — 이 오버레이는 참가자가 여는 화면이 아니라 **게이트
  // 도달로 앱이 자동으로 띄우는** 비모달 전환 시트다(Primary Action 없음). ⛔ 참가자가 탭하던 상시
  // 트리거 컨트롤이 삭제되며 그 `ref`(`verifyTriggerRef`)도 함께 없앤다 — 포커스를 되돌릴 트리거
  // 자체가 더 이상 화면에 없다.
  const handleOpenVerifyOverlay = () => {
    if (callMode === "fallback") speech.stop();
    // 동시 열림 금지(§16.6 G26) — 반대 방향도 동일하게 상대를 닫는다.
    setSmsOverlayOpen(false);
    setVerifyError(null);
    setVerifyOverlayOpen(true);
  };

  const handleCloseVerifyOverlay = () => {
    setVerifyOverlayOpen(false);
    // ⛔ **전환을 취소하지 않는다**(D-68) — 이미 시작된 `handlePlaceVerifyCall`이 있다면 배경에서
    // 그대로 이어진다. 이 핸들러는 시트를 치울 뿐이다. ⛔ §49(V5) — 되돌아갈 트리거 컨트롤이 없어
    // 포커스 복귀 호출은 지운다(죽은 참조 금지).
  };

  /**
   * 확인 부서로의 호 전환(넘겨주기) 실행 — ⚠️ **실제 발신이 아니다**(AC-019). 참가자가 요청하는
   * 것은 **호 전환**이지 신규 발신이 아니다. 하는 일은 콜러블 1회 호출(서버는 Firestore write
   * 1건 + 지시 문자열 반환)과 화면 연출뿐이며, 이 함수는 `tel:`·다이얼 인텐트·외부 네비게이션을
   * **어디에서도** 쓰지 않는다.
   *
   * ⭐ §49(V5, 2026-08-02 정정) — 호출부는 하나뿐이다: 아래 자동 전환 effect(계열 A·B 공통).
   * 참가자가 탭하던 상시 컨트롤은 삭제됐다(`handleVerifyControlTap` 폐기) — 게이트 도달만으로
   * 앱이 대신 진행한다. ⛔ **두 번째 확인 컨트롤이 없으므로**(C3) 이 함수가 스스로 오버레이를
   * 열지는 않는다 — 호출부가 `handleOpenVerifyOverlay()`를 먼저 부른다.
   *
   * 흐름(UX-031 States): Dialing("연결 중…" 2.5초 고정) → 성공 시 오버레이 자동 닫힘 → 통화 셸의
   * `verify-reconnected`(발신자 라벨이 문서의 `reconnectedCallerLabel`로 바뀐다). 실패 시 Error
   * 상태를 시트 안에 보여주고 **원래 통화 유지**(세션·리포트는 정상 진행 — UF-011 Failure (c),
   * 침묵 실패 금지). 재시도 컨트롤은 없다(계열 무관) — 참가자가 재탭할 컨트롤 자체가 없으므로
   * 자동 재시도도 만들지 않는다(C3가 두 번째 컨트롤을 금지, §47.3 (2) R1과 같은 급의 알려진 한계).
   */
  const handlePlaceVerifyCall = async () => {
    if (!sessionId || !verifyOffer || verifyDialing) return;
    setVerifyError(null);
    setVerifyDialing(true);
    const requestCallMode = callMode === "realtime" ? "realtime" : "fallback";
    try {
      // 연출 시간과 서버 호출을 **동시에** 흘려보낸다 — 실패는 곧바로 드러나고(즉시 reject),
      // 성공은 항상 같은 길이의 "연결 중…"을 거친다(결정론).
      const [result] = await Promise.all([
        deliverVerifyReconnect({
          sessionId,
          offerId: verifyOffer.offerId,
          callMode: requestCallMode,
          ...(requestCallMode === "realtime" ? { scammerTurns } : {}),
        }),
        delay(VERIFY_DIALING_MS),
      ]);
      // 실시간 경로만 클라가 주입한다(폴백은 서버가 다음 턴 프롬프트에 싣는다 — §16.2).
      if (requestCallMode === "realtime") {
        // §82.4.2 — 재연결 지시는 화자 전환 첫 발화다(맥락 주입이 아니라 `relayGreeting` 텍스트 턴).
        enqueueTurnInstruction(result.reconnectInstruction, "verify", { speakerSwitch: true });
        // T118 / A5 — 이 시점부터 전환 상태 단언이 참이 된다(`placed`). 카운터를 0으로 두어
        // **참가자가 한 번 말한 뒤**부터 재주입되게 한다(G99 — 여기서 0으로 두지 않으면 다음
        // 사기범 턴 경계에서 곧바로 한 번 더 들어간다).
        transferStateLineRef.current = result.transferStateLine;
        userTurnsSinceInjectionRef.current = 0;
      }
      setVerifyOverlayOpen(false);
    } catch {
      setVerifyError("확인 부서로 연결하지 못했습니다. 통화는 그대로 이어집니다.");
    } finally {
      setVerifyDialing(false);
    }
  };

  // ⛔ §49(V5, 2026-08-02 정정) — 이전에는 여기에 상시 컨트롤의 탭 핸들러(`handleVerifyControlTap`,
  // 계열 A "탭=수락"·계열 B "의사 표명 접수")가 있었다. 컨트롤 UI가 완전히 삭제되며 참가자가 탭할
  // 대상 자체가 없어져 이 함수도 폐기한다 — 아래 자동 전환 effect가 계열 A·B 공통으로 대신한다.

  // ⭐⭐ §47.3 C3/D-69 + §49 정정(2026-08-02) — 예고 턴이 끝나 오퍼가 드러나는 순간 전환이
  // **계열 A·B 공통으로 자동** 이어진다(두 번째 확인 컨트롤을 두지 않는다 — 애초에 컨트롤이 없다).
  // ⛔ 참가자 조건은 이 effect에 걸지 않는다 — 계열 A는 원래도 참가자 의사와 무관하게 게이트
  // 도달만으로 오퍼가 열리던 시나리오였고(G264), 계열 B는 컨트롤 삭제로 `verifyIntentExpressed`가
  // 영구히 `false`라 `shouldAnnounceVerifyOffer`의 AND 게이트에서 애초에 오퍼 자체가 생성되지
  // 않는다(§49.9 row 5 — 이 effect가 손대는 지점이 아니다). ⚠️ **정직 고지**: 참가자가 컨트롤을
  // "선택"하는 행위 자체가 사라졌다 — 이 전환은 더 이상 참가자 행동이 아니라 앱이 게이트 도달만
  // 보고 대신 진행하는 것이다.
  // ⚠️ `autoReconnectOfferIdRef`로 오퍼당 1회만 자동 시도한다 — 실패해도 자동 재시도는 없다
  // (재시도 컨트롤 자체가 C3에 의해 없다, §47.3 (2) R1과 같은 급의 알려진 한계).
  useEffect(() => {
    if (phase !== "live" || verifyOverlayOpen) return;
    if (!verifyOffer || autoReconnectOfferIdRef.current === verifyOffer.offerId) return;
    const revealed = shouldRevealVerifyOffer({
      callMode: callMode === "realtime" ? "realtime" : "fallback",
      offer: verifyOffer,
    });
    if (!revealed) return;
    autoReconnectOfferIdRef.current = verifyOffer.offerId;
    // 인라인 async IIFE로 감싼다(react-hooks/set-state-in-effect 회피 — 이 화면의 다른 effect들과
    // 동일한 관례, 예: :615 · :628 · :949).
    (async () => {
      handleOpenVerifyOverlay();
      await handlePlaceVerifyCall();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, verifyOverlayOpen, callMode, verifyOffer]);

  const handleEndTraining = async () => {
    // 오버레이가 열려 있어도 종료는 항상 도달 가능해야 한다(AC-006). 종료 고지 화면이 문자·확인
    // 화면에 가려지지 않도록 **둘 다** 먼저 내린다(T83/UX-031 Exit도 같은 규칙).
    setSmsOverlayOpen(false);
    setVerifyOverlayOpen(false);
    audioRef.current?.pause();
    realtime.stop();
    // 실시간 전사를 먼저 제출해 리포트가 실제 대화를 분석할 수 있게 한 뒤 종료 화면으로 이동한다
    // (/session/end가 endSession→리포트 생성을 트리거하므로 그 전에 messages가 채워져야 한다).
    await flushTranscript();
    router.push("/session/end");
  };

  // T40 fast-follow — 역방향 명시 전환 버튼("메시지로 전환", §13.1/AC-039). 명시 버튼만 지원(구조화
  // 신호·max-turn 폴백은 이 태스크 범위 밖 — docs/Tasks.md T40 행 참고). 서버가 시나리오 자격을
  // 다시 검증하므로(requestReverseEscalation) 실패 시 화면에 그대로 안내만 남긴다.
  const handleRequestReverseEscalation = async () => {
    if (!sessionId || switchingToMessenger) return;
    setSwitchError(null);
    setSwitchingToMessenger(true);
    try {
      const result = await requestReverseEscalation({ sessionId });
      if (result.escalation?.toChannel === "messenger") {
        audioRef.current?.pause();
        realtime.stop();
        // 전사를 먼저 제출해 메신저 단계로 돌아간 뒤에도 리포트가 지금까지의 통화 내용을 분석할
        // 수 있게 한다(handleEndTraining과 동일한 이유).
        await flushTranscript();
        router.push("/session/messenger");
      }
    } catch {
      setSwitchError("메시지 화면으로 전환하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSwitchingToMessenger(false);
    }
  };

  const handleToggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      // 폴백 경로에서는 음소거가 곧 "듣기 중지"다. 실시간 경로는 SDK가 마이크를 직접 다룬다.
      if (next) speech.stop();
      return next;
    });
  };

  const handleSend = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    // finding #3(2026-07-25 갱신): 실시간 통화 중에는 여전히 sendMessage(별도 텍스트 LLM+TTS)를
    // 호출하지 않는다 — 그러면 실시간 음성 위에 다른 AI 목소리가 겹쳐 흐른다. 대신 **같은 Live
    // 세션 안으로** 텍스트 턴을 넣는다(GeminiVoiceSession.textMessage). 응답은 평소처럼 이 통화의
    // 목소리로 돌아오므로 겹침 문제가 원천적으로 없고, 마이크 없이도 훈련을 진행·검증할 수 있다.
    if (callMode === "realtime") {
      if (!text || phase !== "live") return;
      setTextMessage((prev) => ({ text, seq: (prev?.seq ?? 0) + 1 }));
      setInput("");
      return;
    }
    if (!sessionId || !text || sending || phase !== "live") return;
    setSending(true);
    setSendError(null);
    try {
      const result = await sendMessage({ sessionId, userText: text });
      // T158(§48.5.1) — OR-fold 두 번째 항.
      setDialogueDegraded((current) => foldDegraded(current, result.isMock));
      setInput("");
      speech.reset();
      // T68 폴백 경로 — 서버가 이번 턴에 문자를 도착시키면 inCallSms 구독이 렌더한다. T190-3(§74.6 (6)) —
      // 새 문자는 id가 새로워 배너가 자동으로 다시 뜨므로 되돌리는 쓰기가 없다.
      if (result.audioUrl) {
        setPlaybackUrl(result.audioUrl);
      } else if (!result.ended) {
        maybeStartListening();
      }
      if (result.ended) {
        setPhase("ended");
      }
    } catch {
      setSendError("메시지를 보내지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  };

  // STT가 발화를 인식하면 곧바로 전송한다(폴백 경로) — 인라인 async IIFE로 감싼다
  // (react-hooks/set-state-in-effect 회피, 다른 화면과 동일 패턴).
  useEffect(() => {
    if (callMode !== "fallback") return;
    if (speech.status === "processing" && speech.transcript) {
      (async () => {
        await handleSend(speech.transcript);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callMode, speech.status, speech.transcript]);

  if (pageState === "no-session" || pageState === "scenario-not-found" || pageState === "load-error") {
    const message =
      pageState === "no-session"
        ? "진행 중인 세션 정보를 찾을 수 없습니다. 시나리오 선택부터 다시 진행해 주세요."
        : pageState === "scenario-not-found"
          ? "선택된 시나리오 정보를 찾을 수 없습니다. 시나리오를 다시 선택해 주세요."
          : "통화 정보를 불러오지 못했습니다. 다시 시도해 주세요.";
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>{message}</span>
        </p>
        <button
          type="button"
          onClick={() => router.push("/scenarios")}
          className="min-h-[48px] rounded-[14px] border border-[#C9C2B6] px-6 py-3 text-lg font-bold text-[#22303A] hover:bg-white"
        >
          시나리오 선택으로
        </button>
      </main>
    );
  }

  if (pageState !== "ready" || !scenario) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p className="flex items-center gap-2 text-lg text-[#22303A]" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
          />
          통화 정보를 불러오는 중입니다...
        </p>
      </main>
    );
  }

  // ⭐ T190-8b(docs/Architecture.md §74.22 (1) ⓓ · G438 · D-102 · AC-091) — 벨 직전 고지. 세션 전 컴포넌트를 이
  // early return 하나에서만 그린다(메신저 `if (startNotice === "show")`와 같은 형태). 이 시점엔 실시간 세션 컴포넌트가
  // 아직 마운트되지 않았다(마운트 조건 = 받기 뒤 자격증명) — early return이 통화를 끊지 않는다.
  if (phase === "pre-call-notice") {
    // "준비됐어요" 뒤 짧은 정적 — 빈 통화 배경(UX-014 v1.33 (11) ① "탭 뒤"). 안내 문구 0.
    // reviewer Minor(AC-006 — 모든 상태에서 종료 1탭) — 이 짧은 구간에도 "훈련 종료"를 오른쪽 위 같은 자리에 둔다
    // (고지 화면 상단 바와 같은 자리 · 같은 컨트롤 — 새 문구가 아니라 상시 종료 컨트롤이다).
    if (preCallLeaving) {
      return (
        <main
          aria-busy="true"
          className="flex min-h-screen flex-col"
          style={{ backgroundColor: callTokensFor(deviceSkin.skin).bg }}
        >
          <div className="flex justify-end px-4 py-2.5">
            <EndTrainingButton onClick={() => void handleEndTraining()} />
          </div>
        </main>
      );
    }
    return (
      <CallStartNotice
        onConfirm={handleConfirmPreCallNotice}
        onEndTraining={() => void handleEndTraining()}
        skinPicker={{ value: deviceSkin.skin, source: deviceSkin.source, onChange: handleChooseCallSkin }}
      />
    );
  }

  // T75(2026-07-25, 사용자 요청) — 발신자 표기에서 "(사칭)"을 제거하고 **번호만** 보여준다.
  // 실제 보이스피싱은 모르는 번호로 걸려오며, 화면에 "사칭"이라고 적혀 있으면 판단 훈련이
  // 성립하지 않는다(정답을 미리 알려주는 셈). 시뮬레이션 고지는 벨 직전 고지(`pre-call-notice` —
  // T190-8b) · 에스컬레이션은 메신저 시작 전 고지가 담당한다(AC-012 무변경 · AC-086 · AC-091).
  // T83(§16.2 발신자 라벨 전환) — 모의 재연결 후에는 구독 중인 **문서의** `reconnectedCallerLabel`을
  // 우선 표시한다(UX-014 `verify-reconnected` state). 클라 상태가 아니라 문서를 소스로 삼는 이유:
  // 새로고침·재마운트 후에도 재연결 상태가 유지되고, 실시간·폴백 두 경로의 렌더 코드가 갈라지지
  // 않는다(§15.1.2 단일 렌더 소스 원칙).
  // ⚠️ 라벨만 바뀐다 — "같은 사기범입니다"·"어디에 걸어도 같은 곳입니다"류 문구는 이 화면 어디에도
  // 두지 않는다(OQ-38 확정 = 세션 중엔 상황만, D-6 유지).
  const callerLabel =
    verifyOffer?.reconnectedCallerLabel ?? scenario.callerLabel ?? "발신번호 표시제한";
  // T72(§15.6 G6) — 자격증명을 아직 못 받았으면(수신 대기 중) 기본은 true다. 실제로 난이도를
  // 반영하지 못하는 경로(ElevenLabs)만 서버가 false로 명시해 내려준다.
  const difficultyApplied = realtime.credentials?.difficultyApplied !== false;
  const latestScammerLine =
    [...messages].reverse().find((m) => m.role === "scammer")?.text ?? null;
  // T103 — 통화 필 자막의 단일 소스: 실시간 턴 자막 우선, 없으면 폴백 경로의 마지막 사기범 대사.
  const pillCaption = liveScammerCaption ?? latestScammerLine;
  const isRinging = phase === "incoming";
  // T68 — 문자 도착 배너·"문자함"(N) 컨트롤(UX-014 v1.11 추가 state). 통화 phase 전이가 아니라
  // 셸 위에 얹히는 알림 레이어라 live/opening 어느 phase에서도 뜬다.
  const sortedSms = sortByArrival(inCallSms);
  const latestSms = sortedSms.length > 0 ? sortedSms[sortedSms.length - 1] : null;
  const smsUnreadCount = countUnread(inCallSms);
  // T190-3(UX D-91) — 표시 판정은 위 `bannerSmsId`(최신 1건 · 확인 id · 6초 만료 · 문자함/종료 중 0) 하나다.
  const showSmsBanner = bannerSmsId !== null && latestSms !== null && latestSms.smsId === bannerSmsId;
  // T190-3(§74.6 (2)(5)) — 스킨 토큰(UX v1.33 근사 — 실기 측정 전). 값은 인라인 style로만 쓴다(Tailwind는
  // 런타임에 조립한 클래스 이름을 생성하지 못한다).
  const callTokens = callTokensFor(deviceSkin.skin);
  const bannerTokens = bannerTokensFor(deviceSkin.skin);
  // D-103 — 음량을 바꿀 수 없는 경로(폴백 `<audio>` + 대입 미반영)에서만 스피커 칸이 비활성이다.
  const speakerDisabled = callMode === "fallback" && fallbackVolumeLocked;
  // ⛔ §49(V5, 2026-08-02 정정) — 상시 확인 컨트롤(과거 `showVerifyTrigger`가 표시 조건, 과거
  // `hasVerifyCredential`이 등장 시점을 판별했다)이 완전히 삭제되며 두 값 모두 소비하는 곳이
  // 없어져 폐기한다. ⛔ `shouldRevealVerifyOffer`는 삭제하지 않는다(G268) — 위 자동 전환 effect가
  // 계속 쓴다(§38 — 순서 판정은 순수 함수가 소유한다, 이 자리에서 재판정하지 않는다).
  // 재연결 완료 상태의 1줄 고지(§16.2 "폴백 경로의 인사말" 공백을 UI가 메운다). 구조 설명이
  // 아니라 **연결 사실**만 알린다(OQ-38).
  const verifyConnectedLabel =
    verifyOffer?.placedAtMs !== undefined ? `연결되었습니다 · ${verifyOffer.deskLabel}` : null;
  // 실시간 경로는 SDK의 발화 상태를, 폴백 경로는 오디오 재생 여부를 "상대가 말하는 중"으로 본다.
  const agentSpeaking =
    callMode === "realtime" ? realtime.isAgentSpeaking : Boolean(playbackUrl);
  const waveLabel = agentSpeaking
    ? "상대방이 말하는 중"
    : callMode === "realtime"
      ? "말씀하세요"
      : speech.status === "listening"
        ? "듣고 있어요"
        : sending
          ? "보내는 중"
          : "말씀하세요";

  return (
    // T190-3(UX-014 v1.33 (8) Responsive · W-D) — 최대폭 430px 가운데 정렬, 바깥은 `call.bg`보다 한 단계 어두운 단색.
    <main className="flex min-h-screen flex-col text-white" style={{ backgroundColor: callTokens.outerBg }}>
      {/* 실시간 speech-to-speech 세션 — 서버가 자격증명을 준 경우에만 마운트된다(지연 로딩).
          화면 요소는 없고 SDK 세션 생명주기만 관리한다. */}
      {/* `?audiodebug=1`일 때만 그린다(없으면 DOM 0 — 컴포넌트 첫 분기). 관찰 전용 · 탭을 가로채지 않는다. */}
      <AudioDebugPanel
        callMode={callMode}
        status={realtime.status}
        provider={realtime.isMock ? "mock" : (realtime.credentials?.provider ?? "-")}
        audioRoute={audioRoute}
      />
      {realtime.credentials?.provider === "elevenlabs" && (
        <RealtimeVoiceSession
          credentials={realtime.credentials}
          firstMessage={openingMessageText ?? undefined}
          stopSignal={realtime.stopSignal}
          // ⭐ T190-3(UX D-99 · G452) — 문자함이 열려도 마이크를 멈추지 않는다(`smsOverlayOpen` 제외). 확인
          // 오버레이(UX-031) 게이팅만 남는다. 아래 음소거 버튼의 aria-pressed는 사용자 의도(muted)에만 바인딩한다.
          muted={muted || verifyOverlayOpen}
          // T190-3(§74.3 표 S · G455) — 스피커 버튼의 음량 모드(통화 0.6 / 스피커 1.0).
          outputVolume={gainFor(audioRoute)}
          onActive={realtime.handleActive}
          onEnded={realtime.handleEnded}
          onError={realtime.handleError}
          onSpeakingChange={realtime.handleSpeakingChange}
          onUserSpeakingChange={realtime.handleUserSpeakingChange}
        />
      )}
      {realtime.credentials?.provider === "gemini" && (
        // ⭐ §59.6 ③(reviewer Critical #1) — GeminiVoiceSession의 `sessionId` prop은 Live 도구
        // 라우팅(deliverInCallSms/deliverVerifyOffer)이 소유권 재검증에 쓴다(G12/G24). 실제로는
        // 이 분기에 도달하는 시점에 `sessionId`가 이미 non-null이다(`handleAnswer`가 `!sessionId`면
        // `realtime.start`조차 부르지 않는다, 위 참고) — 여기 null 검사는 그 불변식을 TS 타입으로
        // 표현할 뿐, 런타임에서 이 분기가 실제로 스킵되는 경우는 없다.
        sessionId && (
          <GeminiVoiceSession
            credentials={realtime.credentials}
            sessionId={sessionId}
            stopSignal={realtime.stopSignal}
            muted={muted || verifyOverlayOpen}
            outputVolume={gainFor(audioRoute)}
            onActive={realtime.handleActive}
            onEnded={realtime.handleEnded}
            onError={realtime.handleError}
            onSpeakingChange={realtime.handleSpeakingChange}
            onUserSpeakingChange={realtime.handleUserSpeakingChange}
            onTranscriptTurn={handleTranscriptTurn}
            textMessage={textMessage}
            onScammerTurnComplete={handleScammerTurnComplete}
            onModelToolVerifyAnnounced={handleModelToolVerifyAnnounced}
            onModelToolVerifyFailed={handleModelToolVerifyFailed}
            claimVerifyAnnounceSlot={claimVerifyAnnounceSlot}
            releaseVerifyAnnounceSlot={releaseVerifyAnnounceSlot}
            instructionTurn={instructionTurn}
            personaStateTurn={personaStateTurn}
            turnPhaseRef={liveTurnPhaseRef}
            primedAudio={primedCallAudio}
          />
        )
      )}

      {/* ⭐ T190-3(UX-014 v1.33 · D-86~D-88 · P-37 · docs/Architecture.md §74.6) — 실폰형 통화 셸.
          ⛔ 가짜 OS 상태바(시계·통신사 자리)를 그리지 않는다(P-37 R-1 — 기기의 진짜 상태바가 이미 위에 있다).
          그 자리는 `env(safe-area-inset-top)` + 24px 여백이다. 경과 시간은 번호 바로 아래 한 줄 하나뿐이다(D-86).
          색·크기는 스킨 토큰(UX v1.33 근사 — 실기 측정 전, `@/lib/phone/skinTokens`)이며 대비 하한은 G456이 막는다.
          ⚠️ 이 래퍼는 표현 계층일 뿐이다 — 세션 컴포넌트(위)·오버레이(아래)는 여전히 `<main>`의 형제 노드다(G10). */}
      <div
        className="mx-auto flex min-h-screen w-full max-w-[430px] flex-1 flex-col"
        style={{
          backgroundColor: callTokens.bg,
          paddingTop: "calc(env(safe-area-inset-top) + 24px)",
        }}
      >
      {/* T68 문자 도착 배너(UX-014 `sms-arrived` state / UF-008 Step 2) — 통화는 그대로 진행 중이다.
          시각 배너와 **aria-live 알림을 동시에** 제공한다(P-20 (6) — 시각에만 의존하지 않는다).
          탭하면 오버레이가 열릴 뿐 **라우팅이 일어나지 않는다**(D-35).
          ⭐ T190-3(UX D-91 · UX-014 v1.33 (6)) — **떠 있는 알림**이다(흐름 밖 `position: fixed` — 레이아웃을 밀지
          않는다). 3줄 = 메시지 앱 아이콘 + "메시지" + "지금" / 발신 라벨 / 본문 첫 줄(최대 2줄). 고정 문구
          "문자 1건이 도착했습니다"는 지웠다(건수는 "메시지" 버튼 배지가 맡는다). 6초 뒤 사라지고 포커스·호버 중엔
          멈춘다. z = 통화 셸 위 · 오버레이(z-40) 아래.
          T103/P-27 (5) ① — 한 프레임에 튀어나오지 않도록 배너도 같은 규칙으로 부드럽게 내려온다
          (`prefers-reduced-motion`이면 즉시 교체 — globals.css의 폴백 블록).
          ⚠️ **도착은 배너만 띄운다**(D-56) — 여기서 `setSmsOverlayOpen(true)`를 부르지 않는다.
          문자함으로 넘어갈지는 훈련 대상인 참가자의 결정이고, 자동 전환은 한도 도달·종료 고지
          순간을 덮을 수 있다(AC-059). */}
      {showSmsBanner && latestSms && (
        <div
          className="sms-banner-enter fixed inset-x-0 z-30 flex justify-center px-2"
          style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
        >
          <button
            type="button"
            onClick={(event) => {
              setBannerPausedSmsId(null);
              handleOpenSmsOverlay(event.currentTarget);
            }}
            onFocus={() => setBannerPausedSmsId(latestSms.smsId)}
            onBlur={() => setBannerPausedSmsId(null)}
            onMouseEnter={() => setBannerPausedSmsId(latestSms.smsId)}
            onMouseLeave={() => setBannerPausedSmsId(null)}
            className="flex w-full max-w-[414px] flex-col gap-1 px-3.5 py-3 text-left shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
            style={{
              backgroundColor: bannerTokens.bg,
              borderRadius: bannerTokens.radiusPx,
              color: bannerTokens.text,
            }}
          >
            <span className="flex items-center gap-2 text-[13px]" style={{ color: bannerTokens.textSecondary }}>
              <span
                aria-hidden="true"
                className="flex h-5 w-5 items-center justify-center rounded-md"
                style={{ backgroundColor: bannerTokens.appIconBg, color: bannerTokens.appIconFg }}
              >
                <PhoneIcon name="message" size={14} />
              </span>
              <span>메시지</span>
              <span className="ml-auto">지금</span>
            </span>
            <span className="block truncate text-[15px] font-semibold">{latestSms.senderLabel}</span>
            <span className="line-clamp-2 text-[15px] leading-snug">{latestSms.body.split("\n")[0]}</span>
            {/* T187(§72 · PRD v1.18 AC-086 · UX D-82) — 세션 중 표식 칩 삭제. 빈 자리를 채우지 않는다. */}
          </button>
        </div>
      )}
      {/* 스크린리더 알림 — 배너를 닫았거나 보지 못해도 도착 사실이 전달된다(P-4/P-20).
          ⚠️ 버그 수정(사용자 브라우저 실측, 2026-07-25): 조건이 `latestSms`(도착한 문자가 있는가)라
          미확인 건수가 0이 된 뒤에도 **"문자 0건이 도착했습니다."** 를 계속 알렸다. 시각적으로는
          sr-only라 보이지 않지만 스크린리더 사용자에게는 매 렌더마다 들리는 **사실과 다른 안내**다.
          알릴 사실이 실제로 있을 때(미확인 ≥ 1)만 문구를 채운다.
          T190-3(UX-014 v1.33 (6)) — 문구 = "{senderLabel}에서 문자가 왔습니다."(건수 문장 대체 · 조건 유지). */}
      <p aria-live="polite" className="sr-only">
        {smsUnreadCount > 0 ? `${latestSms?.senderLabel ?? ""}에서 문자가 왔습니다.` : ""}
      </p>
      {smsError && (
        <p role="alert" className="px-4 pt-2 text-center text-xs text-[#F0A79E]">
          {smsError}
        </p>
      )}

      {/* ① (One UI형만) 아바타 · ② 발신 번호 · ③ 번호 바로 아래 phase 줄 · ④ 전환 뒤 줄 · G288 줄(UX-014 v1.33 (2)).
          상단 여백(근사): iOS형 safe-area+72px · One UI형 화면 높이 18% 지점. */}
      <div
        className="flex flex-1 flex-col items-center gap-5 px-6"
        style={{ paddingTop: callTokens.hasAvatar ? "max(0px, calc(18vh - 24px))" : "48px" }}
      >
        <div className="flex w-full flex-col items-center text-center">
          {callTokens.hasAvatar && (
            <div
              aria-hidden="true"
              className="relative mb-5 flex h-[88px] w-[88px] items-center justify-center rounded-full"
              style={{ backgroundColor: callTokens.avatarBg, color: callTokens.avatarFg }}
            >
              {/* One UI형 울림 연출 = 아바타 둘레 파동(현행 `call-ring-pulse` 재사용 · reduced-motion이면 정지).
                  통화 중 상대 발화 시의 파동(현행)도 유지한다. */}
              {(isRinging || agentSpeaking) && (
                <>
                  <span className="call-ring-pulse absolute h-[88px] w-[88px] rounded-full bg-[#C9D4DB]/25" />
                  <span
                    className="call-ring-pulse absolute h-[88px] w-[88px] rounded-full bg-[#C9D4DB]/15"
                    style={{ animationDelay: "0.7s" }}
                  />
                </>
              )}
              <PhoneIcon name="person" size={44} className="relative" />
            </div>
          )}
          {/* T75 — 발신자는 번호만 보여 준다(사칭 표기 없음 · 정답을 미리 알려 주지 않는다). */}
          <p
            className="max-w-full truncate font-semibold leading-tight"
            style={{ fontSize: callTokens.numberSizePx, color: callTokens.textPrimary }}
          >
            {callerLabel}
          </p>
          {/* ③ UX-014 v1.33 (3) 정본 — ⛔ 이 표 밖의 문구를 두지 않는다. incoming = 비움(숨김 글) · connecting =
              "연결 중…" · opening/live = 경과 시간(`aria-live` 없음 — 숫자를 매초 읽지 않는다, 접근 이름으로 대신) ·
              ended = "통화 종료". 옛 문구("휴대전화 수신 중…"·"연결하는 중…"·"통화 중")는 Superseded(D-86). */}
          {phase === "opening" || phase === "live" ? (
            <p
              role="timer"
              aria-label={spokenCallElapsed(elapsedSec)}
              className="mt-1.5 min-h-[24px] text-[17px] tabular-nums"
              style={{ color: callTokens.textSecondary }}
            >
              {formatCallElapsed(elapsedSec)}
            </p>
          ) : (
            <p role="status" className="mt-1.5 min-h-[24px] text-[17px]" style={{ color: callTokens.textSecondary }}>
              {phase === "incoming" ? (
                <span className="sr-only">전화가 오고 있습니다</span>
              ) : phase === "connecting" ? (
                "연결 중…"
              ) : (
                "통화 종료"
              )}
            </p>
          )}
          {/* §49.5(2026-08-02, 사용자 신고 7ⓐ) — D-15 계보 4회째 요청으로 상시 "난이도 X" 배지를
              지운다(참가자가 직전 화면에서 이미 고른 값의 단순 반복, 신규 정보 0). ⛔ 미적용 문구는
              지우지 않는다(G288) — ElevenLabs 실시간 경로는 프롬프트가 에이전트 쪽에 있어 난이도가
              반영되지 않는데(§15.3.3/§15.6 G6), 이 문구가 P-22/G6가 막는 결함(조용한 미적용)의
              유일한 표면이다. 난이도 표기 여부와 무관하게 아래 종료 컨트롤·합성 표식·사전 고지는
              세 난이도에서 완전히 동일하다(AC-065). 고른 난이도의 기록은 리포트 요약(report/page.tsx)이
              대신 담당한다. */}
          {difficultyLevel && !difficultyApplied && (
            <p className="mt-1.5 text-[15px]" style={{ color: callTokens.textSecondary }}>
              이 통화 경로에서는 고른 난이도가 적용되지 않습니다
            </p>
          )}
          {/* T83(§16.2/UX-014 `verify-reconnected`) — 재연결 후 1줄 상태 문구. 폴백 경로에서
              서버가 별도 인사말을 생성하지 않기 때문에 이 자리가 그 공백을 메운다. **연결 사실만**
              알리고 구조 설명은 하지 않는다(OQ-38 확정 = 세션 중엔 상황만).
              ⭐⭐ T187(docs/Architecture.md §72 · PRD v1.18 AC-086 (d) · UX D-83) — G272가 여기 두던
              전화 부정 고지 1줄은 User 결정 "전부 제거"로 세션 중에서 지웠다(G272 반전). §46.3 규범의
              부정은 세션 후 UX-007의 POST_SESSION_FACT_DISCLOSURE가 맡는다. 주장 줄(아래 라벨)은
              유지한다. 빈 자리를 채우지 않는다. */}
          {verifyConnectedLabel && phase !== "ended" && (
            <div className="mt-1.5 flex flex-col items-center gap-0.5">
              <p role="status" className="text-[15px]" style={{ color: callTokens.textSecondary }}>
                {verifyConnectedLabel}
              </p>
            </div>
          )}
        </div>

        {/* ⛔ T190-8b(D-102 · AC-091 (c) · G438 재지정) — 벨 화면(`incoming`)의 세션 전 고지 문장을 지웠다. 같은 고지는
            벨 직전 고지(`CallStartNotice` — 위 early return)로 옮겨 갔고, 에스컬레이션 벨은 메신저 시작 전 고지가 맡는다.
            빈 자리를 채우지 않는다. */}

        {/* 통화 중 발화 인디케이터 — 실제 통화 화면에 있는 유일한 "상태" 표시다.
            자막·안내문·오류는 여기 두지 않는다(2026-07-22 사용자 피드백: 화면이 통화처럼 안 보임)
            — 필요한 것은 키패드 패널 안으로 옮겨, 기본 화면은 발신자와 컨트롤만 남긴다.
            §49.6(2026-08-02, 신고 7ⓑ) — 실시간(realtime) 경로에서는 이 AI 파형을 지운다: 상대
            발화는 오디오로 즉시 들리고 턴 잡기는 모델이 한다(대체 표면 성립). ⛔ 폴백 경로에서는
            지우지 않는다(G289) — "듣고 있어요"·"보내는 중" 자동 청취/전송 상태의 유일한 화면
            표시이고, 대체 표면인 키패드 패널은 기본 닫힘이라 없다(침묵 실패 금지). */}
        {(phase === "live" || phase === "opening") && callMode !== "realtime" && (
          <CallWaveform active={agentSpeaking} label={waveLabel} />
        )}

        {/* §49.6(2026-08-02, 신고 7ⓑ) — 사용자 발화 파형 인디케이터(2026-07-24 신고, T51 ②)는
            철회 요청에 따라 제거한다. AI 파형이 실시간 경로에서 사라지며 "말하는 쪽이 누구든 같은
            방식으로 보인다"는 대칭 근거도 함께 소멸해 잔여 비용이 없다. ⚠️ 정직 고지 — 실시간
            경로에서 마이크가 실제로 잡히는지 화면으로 확인할 수단이 없어진다(대체 신호를 새로
            만들지 않는다 — 실제 통화에도 없다). */}

        {playbackUrl && (
          <audio
            ref={audioRef}
            src={playbackUrl}
            onEnded={handlePlaybackEnded}
            aria-label="상대방 음성 재생"
            className="hidden"
          />
        )}
        {/* 자동재생이 막힌 경우에만 노출 — 이건 누르지 않으면 통화가 진행되지 않아 화면에 남긴다.
            T190-3(P-37 (3)) — 이모지(🔊) 대신 자체 제작 단색 아이콘. */}
        {playbackBlocked && (
          <button
            type="button"
            onClick={handleManualPlay}
            className="flex min-h-[48px] items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white"
          >
            <PhoneIcon name="speaker" size={18} />
            탭하여 듣기
          </button>
        )}
      </div>

      {/* 하단 컨트롤 — 실제 폰 통화 UI 관례(수신 화면은 거절/받기, 통화 중은 2×3 그리드 + 아래 가운데 종료).
          T190-3(UX-014 v1.33 (4)(5) · D-87) — 받기 = `call.accept`(초록 — 앱 청록은 Superseded) · 원 76px · 탭만
          (스와이프 재현 0 — 어르신·접근성 · 키보드 도달). iOS형 울림 = 받기 버튼 맥동(`call-accept-pulse`). */}
      {phase === "incoming" ? (
        <div className="flex justify-between px-14 pb-[calc(env(safe-area-inset-bottom)+56px)]">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleDecline}
              aria-label="전화 거절 — 훈련 종료"
              className="flex h-[76px] w-[76px] items-center justify-center rounded-full shadow-lg transition active:scale-95"
              style={{ backgroundColor: callTokens.end, color: callTokens.roundIcon }}
            >
              <PhoneIcon name="end-call" size={32} />
            </button>
            <span className="text-[15px]" style={{ color: callTokens.textSecondary }}>
              거절
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleAnswer}
              aria-label="전화 받기"
              className={`relative flex h-[76px] w-[76px] items-center justify-center rounded-full shadow-lg transition active:scale-95 ${
                callTokens.ringStyle === "accept-pulse" ? "call-accept-pulse" : ""
              }`}
              style={{ backgroundColor: callTokens.accept, color: callTokens.roundIcon }}
            >
              <PhoneIcon name="accept-call" size={32} />
            </button>
            <span className="text-[15px]" style={{ color: callTokens.textSecondary }}>
              받기
            </span>
          </div>
        </div>
      ) : phase === "ended" ? (
        <div className="flex flex-col gap-3 p-6 text-center">
          <p className="text-lg font-semibold" role="status">
            통화가 종료되었습니다.
          </p>
          <button
            type="button"
            onClick={() => void handleEndTraining()}
            className="min-h-[56px] rounded-[14px] bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white"
          >
            결과 확인하러 가기
          </button>
        </div>
      ) : (
        <div className="flex flex-col pb-[calc(env(safe-area-inset-bottom)+32px)]">
          {/* T190-3(UX-014 v1.33 (7)) — 키패드를 열면 **그리드 자리를 키패드가 대체**한다(실제 통화 앱처럼). 높이가
              모자라면 키패드 영역만 스크롤되고 종료 버튼은 아래 같은 자리에 고정이다(AC-006). 자막·안내·오류·
              텍스트 입력(두 `form` · `scrollIntoView`)은 예전 그대로 이 영역 안에 있다 — 문면 무변경. */}
          {showTextInput ? (
            <div className="max-h-[56vh] overflow-y-auto px-6">
              {/* 실제 통화 키패드(사용자 신고 2026-07-25 — "키패드가 있는데 실제로 작동하지 않는다").
                  상대가 "인증번호 눌러주세요"류를 요구하는 시나리오에서 실제로 눌러 응답할 수 있다.
                  누른 숫자는 화면에 그대로 보이고, 전송하면 음성/텍스트와 동일한 경로로 상대에게
                  전달된다(실시간이면 Live 세션, 폴백이면 sendMessage). */}
              <div className="mb-4">
                <div
                  className="mb-3 flex min-h-[44px] items-center justify-center px-4 text-[28px] tracking-[0.2em] text-white tabular-nums"
                  aria-live="polite"
                  aria-label="입력한 번호"
                >
                  {dialpadValue || <span className="text-base tracking-normal text-[#C9D4DB]">번호를 누르세요</span>}
                </div>
                <div className="grid grid-cols-[repeat(3,64px)] justify-center gap-x-6 gap-y-3">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDialpadValue((v) => (v.length >= 32 ? v : v + key))}
                      aria-label={`${key} 누르기`}
                      className="flex h-16 w-16 items-center justify-center rounded-full text-[28px] text-white transition active:scale-95"
                      style={{ backgroundColor: callTokens.keypadKeyBg }}
                    >
                      {key}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDialpadValue((v) => v.slice(0, -1))}
                    disabled={!dialpadValue}
                    className="min-h-[48px] flex-1 rounded-xl bg-white/10 text-sm font-semibold text-[#C9D4DB] disabled:opacity-40"
                  >
                    ← 지우기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!dialpadValue) return;
                      void handleSend(dialpadValue);
                      setDialpadValue("");
                    }}
                    disabled={!dialpadValue}
                    className="min-h-[48px] flex-1 rounded-xl bg-[#0E6B62] text-sm font-bold text-white disabled:opacity-40"
                  >
                    번호 전송
                  </button>
                </div>
              </div>
              {/* finding #3(2026-07-25 갱신): 실시간 모드에서도 이제 타이핑할 수 있다 — 다만
                  sendMessage가 아니라 **같은 Live 세션**에 텍스트 턴으로 넣으므로(handleSend의
                  realtime 분기) 목소리가 겹치지 않는다. 마이크가 없거나 쓸 수 없는 환경에서도
                  훈련·검증이 가능해진다(사용자 신고 2026-07-25). */}
              {callMode === "realtime" ? (
                <>
                  <p className="mb-3 text-center text-xs leading-relaxed text-[#C9D4DB]">
                    마이크에 대고 말해도 되고, 아래에 입력해도 상대에게 그대로 전달됩니다.
                  </p>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSend();
                    }}
                    className="flex items-center gap-2.5"
                  >
                    <label htmlFor="realtime-text-input" className="sr-only">
                      메시지 입력
                    </label>
                    <input
                      id="realtime-text-input"
                      type="text"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onFocus={(event) =>
                        event.currentTarget.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                      placeholder="하고 싶은 말을 입력하세요..."
                      className="min-h-[50px] flex-1 rounded-full border-[1.5px] border-white/30 bg-white/10 px-[18px] py-3 text-lg text-white placeholder:text-[#C9D4DB]"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      aria-label="전송"
                      className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-[#0E6B62] text-lg font-bold text-white disabled:opacity-50"
                    >
                      ↑
                    </button>
                  </form>
                </>
              ) : (
                <>
                  {latestScammerLine && (
                    <p className="mb-3 text-center text-base leading-relaxed text-white/85" aria-live="polite">
                      &ldquo;{latestScammerLine}&rdquo;
                    </p>
                  )}

                  {(callMode === "fallback" || sendError || speech.errorMessage) && (
                    <p
                      role={sendError ? "alert" : "status"}
                      aria-live={sendError ? "assertive" : "polite"}
                      className={`mb-3 text-center text-xs leading-relaxed ${
                        sendError ? "text-[#F0A79E]" : "text-[#C9D4DB]"
                      }`}
                    >
                      {sendError ??
                        (callMode === "fallback"
                          ? // T158(P-31 ⓔ, §48.5.1, AC-084 M-2) — 기존 상태 1줄에 대사 출처 사실을
                            // 합친다(신규 요소 0건). dialogueIsDegraded가 아니면 기존 문구 그대로다.
                            `${buildFallbackStatusLine(
                              "실시간 음성 통화를 사용할 수 없어 텍스트로 진행합니다.",
                              dialogueIsDegraded,
                            )}${realtime.errorMessage ? ` ${realtime.errorMessage}` : ""}`
                          : speech.errorMessage)}
                    </p>
                  )}

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSend();
                    }}
                    className="flex items-center gap-2.5"
                  >
                    <label htmlFor="chat-input" className="sr-only">
                      메시지 입력
                    </label>
                    <input
                      id="chat-input"
                      type="text"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      // 모바일 UX 개선(2026-07-23) — 입력창이 화면 하단 쪽이라 폰 키보드가 뜨면
                      // 가려질 수 있다. 포커스 시 화면 안으로 스크롤해 가려짐을 막는다.
                      onFocus={(event) =>
                        event.currentTarget.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                      disabled={sending}
                      placeholder="하고 싶은 말을 입력하세요..."
                      className="min-h-[50px] flex-1 rounded-full border-[1.5px] border-white/30 bg-white/10 px-[18px] py-3 text-lg text-white placeholder:text-[#C9D4DB]"
                    />
                    <button
                      type="submit"
                      disabled={sending || !input.trim()}
                      aria-label="전송"
                      className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-[#0E6B62] text-lg font-bold text-white disabled:opacity-50"
                    >
                      {sending ? (
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                        />
                      ) : (
                        "↑"
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : (
            /* T190-3(UX-014 v1.33 (4) · D-87) — 3열×2행 그리드(72px 원 · 단색 아이콘 28px · 라벨 14px · ⛔ 이모지 0).
               1행 = 음소거 · 키패드 · 스피커 / 2행 = 메시지(문자 1건 도착 뒤 — 칸은 처음부터 예약) · 채팅으로(메신저
               채널만) · 빈 칸. 동작 없는 버튼을 채워 넣지 않는다 — 빈 칸은 자리만 차지한다(초점 대상 0).
               스크린리더 순서 = 1행 왼→오 · 2행 왼→오 · 종료. */
            <div className="grid grid-cols-[repeat(3,72px)] justify-center gap-x-6 gap-y-5">
              <div className="flex min-h-[98px] flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-pressed={muted}
                  aria-label={muted ? "음소거 해제" : "음소거"}
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full transition active:scale-95"
                  style={{
                    backgroundColor: muted ? callTokens.gridButtonPressedBg : callTokens.gridButtonBg,
                    color: muted ? callTokens.gridIconPressed : callTokens.gridIcon,
                  }}
                >
                  <PhoneIcon name="mute" />
                </button>
                <span className="text-sm" style={{ color: callTokens.textPrimary }}>
                  {muted ? "음소거 중" : "음소거"}
                </span>
              </div>

              <div className="flex min-h-[98px] flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowTextInput((v) => !v)}
                  aria-pressed={showTextInput}
                  aria-label="키패드 — 텍스트로 입력"
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full transition active:scale-95"
                  style={{ backgroundColor: callTokens.gridButtonBg, color: callTokens.gridIcon }}
                >
                  <PhoneIcon name="keypad" />
                </button>
                <span className="text-sm" style={{ color: callTokens.textPrimary }}>
                  키패드
                </span>
              </div>

              {/* ⭐ T190-3(UX D-98 · D-103 · §74.3 표 S · AC-093 (c)) — 스피커 = **음량 전환**(통화 모드 0.6 ↔ 스피커
                  모드 1.0). 눌림 = 스피커 모드(`aria-pressed`가 실제 모드와 일치). 음량을 바꿀 수 없는 경로(폴백
                  `<audio>` + 대입 미반영)에서는 **비활성 표현**(흐림 · `aria-disabled` · 탭 무반응 · 안내 문구 0). */}
              <div className="flex min-h-[98px] flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (speakerDisabled) return;
                    setAudioRoute((route) => (route === "speaker" ? "call" : "speaker"));
                  }}
                  aria-pressed={!speakerDisabled && audioRoute === "speaker"}
                  aria-disabled={speakerDisabled ? true : undefined}
                  aria-label="스피커"
                  className={`flex h-[72px] w-[72px] items-center justify-center rounded-full transition ${
                    speakerDisabled ? "opacity-40" : "active:scale-95"
                  }`}
                  style={{
                    backgroundColor:
                      !speakerDisabled && audioRoute === "speaker"
                        ? callTokens.gridButtonPressedBg
                        : callTokens.gridButtonBg,
                    color:
                      !speakerDisabled && audioRoute === "speaker" ? callTokens.gridIconPressed : callTokens.gridIcon,
                  }}
                >
                  <PhoneIcon name="speaker" />
                </button>
                <span
                  className={`text-sm ${speakerDisabled ? "opacity-40" : ""}`}
                  style={{ color: callTokens.textPrimary }}
                >
                  스피커
                </span>
              </div>

              {/* T68 — "메시지"(현행 "문자함" 라벨 대체 — UX-014 v1.33 (4)) 컨트롤. 문자가 1건 이상 도착한 뒤부터
                  남아 언제든 UX-027을 다시 연다(미확인 수 배지 — 숫자 텍스트). 라우팅 없음(D-35).
                  ⭐ 칸은 처음부터 예약해 두어 등장 때 레이아웃이 밀리지 않는다. */}
              <div className="flex min-h-[98px] flex-col items-center gap-1.5">
                {inCallSms.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={(event) => handleOpenSmsOverlay(event.currentTarget)}
                      aria-label={`메시지 — 도착 ${inCallSms.length}건, 미확인 ${smsUnreadCount}건`}
                      className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition active:scale-95"
                      style={{ backgroundColor: callTokens.gridButtonBg, color: callTokens.gridIcon }}
                    >
                      <PhoneIcon name="message" />
                      {smsUnreadCount > 0 && (
                        <span
                          aria-hidden="true"
                          className="absolute right-1.5 top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-xs font-bold"
                          style={{ backgroundColor: callTokens.badgeBg, color: callTokens.badgeText }}
                        >
                          {smsUnreadCount}
                        </span>
                      )}
                    </button>
                    <span className="text-sm" style={{ color: callTokens.textPrimary }}>
                      메시지
                    </span>
                  </>
                )}
              </div>

              {/* T40 fast-follow — 역방향 명시 전환 버튼(§13.1/AC-039 · "채팅으로" — 현행 "메시지로" 대체, 2행 1의
                  "메시지"와 혼동 방지 UX-014 v1.33 (4)). 정방향 "전화로 확인"(session/messenger/page.tsx)과 대칭이며
                  scenario.channel==="messenger"(메신저 콘텐츠가 실제로 존재하는 시나리오)일 때만 노출한다 — 서버
                  (requestReverseEscalation)도 동일 조건을 재검증하므로 이중 방어다. */}
              <div className="flex min-h-[98px] flex-col items-center gap-1.5">
                {scenario.channel === "messenger" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleRequestReverseEscalation()}
                      disabled={switchingToMessenger}
                      aria-label="채팅으로 — 메시지 화면으로 전환"
                      className="flex h-[72px] w-[72px] items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50"
                      style={{ backgroundColor: callTokens.gridButtonBg, color: callTokens.gridIcon }}
                    >
                      {switchingToMessenger ? (
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                        />
                      ) : (
                        <PhoneIcon name="chat" />
                      )}
                    </button>
                    <span className="text-sm" style={{ color: callTokens.textPrimary }}>
                      채팅으로
                    </span>
                  </>
                )}
              </div>

              {/* 2행 3 — 빈 칸(동작 없는 버튼을 채워 넣지 않는다 · 초점 대상 0). */}
              <div aria-hidden="true" className="min-h-[98px]" />
            </div>
          )}

          {/* T40 fast-follow — 역방향 전환("채팅으로") 오류만 종료 버튼 위에 상시 노출.
              메신저 채팅으로 이어질 수 있는 시나리오(scenario.channel==="messenger", 즉 메신저→
              보이스로 정방향 에스컬레이션된 세션)에서만 위 버튼 자체가 보이므로, 이 오류 문구도
              같은 조건에서만 의미가 있다. */}
          {scenario.channel === "messenger" && switchError && (
            <p role="alert" className="mt-3 px-6 text-center text-xs leading-relaxed text-[#F0A79E]">
              {switchError}
            </p>
          )}

          {/* ⛔ §49(V5, 2026-08-02 정정) — 여기 있던 상시 확인 의사 표명 컨트롤(UF-011 v1.20
              Step 1 / P-32)은 완전히 삭제됐다. 게이트 도달은 이제 참가자 탭이 아니라 위 자동 전환
              effect가 대신 처리한다(계열 A·B 공통) — 참가자가 "선택"하는 행위 자체가 사라졌다. */}
          {verifyError && !verifyOverlayOpen && (
            <p role="alert" className="mt-3 px-6 text-center text-xs leading-relaxed text-[#F0A79E]">
              {verifyError}
            </p>
          )}

          {/* ⑧ 통화 종료(UX-014 v1.33 (2) ⑧ · AC-006) — 가운데 76px 빨강 · 내려놓은 수화기 아이콘 · 아래 "종료".
              **어느 상태(키패드 열림 포함)에서도 이 자리 그대로**이고 이름 "통화 종료 — 훈련 종료"는 무변경(M-7 ·
              G441 — 이 리터럴은 이 파일에 둔다, §74.4 R-3). 키패드가 열려 있으면 오른쪽 아래 "숨기기"(48px)가
              그리드로 되돌린다. */}
          <div className="relative mt-6 flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleEndTraining()}
              aria-label="통화 종료 — 훈련 종료"
              className="flex h-[76px] w-[76px] items-center justify-center rounded-full shadow-lg transition active:scale-95"
              style={{ backgroundColor: callTokens.end, color: callTokens.roundIcon }}
            >
              <PhoneIcon name="end-call" size={32} />
            </button>
            <span className="text-sm" style={{ color: callTokens.textPrimary }}>
              종료
            </span>
            {showTextInput && (
              <button
                type="button"
                onClick={() => setShowTextInput(false)}
                className="absolute right-6 top-3.5 min-h-[48px] px-3 text-base font-semibold"
                style={{ color: callTokens.textPrimary }}
              >
                숨기기
              </button>
            )}
          </div>
        </div>
      )}
      </div>

      {/* ⚠️ T68/UX-027 — 문자 오버레이는 **세션 컴포넌트(위)의 형제 노드**로 조건부 렌더된다.
          early return·상위 래퍼·`key` 변경·router.push 중 어느 하나라도 하면 GeminiVoiceSession/
          RealtimeVoiceSession이 언마운트되어 실시간 세션·마이크·타이머가 끊긴다(§15.1.1/§15.6 G10,
          D-35 — 이 기능의 존재 이유). 여기서는 형제 하나가 추가로 그려질 뿐이라 통화가 유지된다. */}
      {smsOverlayOpen && (
        <InCallSmsOverlay
          messages={inCallSms}
          // T190-5(§74.5 (2) · AC-092 (b)) — 통화 셸과 같은 스킨(한 세션 = 한 스킨).
          skin={deviceSkin.skin}
          callerLabel={callerLabel}
          elapsedLabel={formatCallElapsed(elapsedSec)}
          scammerCaption={pillCaption}
          onClose={handleCloseSmsOverlay}
          onEndTraining={() => void handleEndTraining()}
          onOpened={(smsId) => handleRecordSmsEvent(smsId, "opened")}
          onLinkTapped={(smsId) => handleRecordSmsEvent(smsId, "link_tapped")}
          // T123/AC-080 — 가짜 랜딩 폼을 **제출한 사실**만 기록한다(기존 핸들러 재사용).
          // ⛔ 참가자가 입력한 값은 이 경로에 실리지 않는다(콜백이 무인자다 — G138/AC-045).
          // ⚠️ 위 `link_tapped`와 달리 이 이벤트만 리포트에서 "속은 순간"으로 승격된다(AC-080 (b)).
          onLandingSubmitted={(smsId) => handleRecordSmsEvent(smsId, "landing_submitted")}
        />
      )}

      {/* ⚠️ T83/UX-031 — 확인 오버레이도 **같은 자리의 형제 노드**다(§16.2 오버레이 계층 무개정
          재사용): 신규 라우트·포털·상위 래퍼·`key` 변경 0건. 위 문자 오버레이와 **동시에 열리지
          않는다**(§16.6 G26 — 중첩 aria-modal은 포커스 트랩이 겹쳐 AC-006 도달성을 깬다). 여는
          핸들러가 상대를 닫으므로 이 두 조건은 구조적으로 상호배타다. */}
      {verifyOverlayOpen && verifyOffer && (
        <VerifyCallOverlay
          offer={verifyOffer}
          callerLabel={callerLabel}
          elapsedLabel={formatCallElapsed(elapsedSec)}
          dialing={verifyDialing}
          errorMessage={verifyError}
          onClose={handleCloseVerifyOverlay}
          onEndTraining={() => void handleEndTraining()}
        />
      )}
    </main>
  );
}
