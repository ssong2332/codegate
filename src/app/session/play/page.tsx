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
  isSessionAnswered,
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
  pickDueInCallSms,
  sortByArrival,
  type InCallSmsView,
} from "@/lib/incallsms";
import {
  enqueueInstruction,
  shouldOfferVerify,
  shouldReinjectTransferState,
  shouldRetryVerifyOffer,
  takeNextInstruction,
  type PendingInstruction,
  type VerifyInterceptView,
} from "@/lib/verifyintercept";
import {
  DIFFICULTY_LABEL,
  normalizeDifficultyLevel,
  type DifficultyLevel,
} from "@/lib/difficulty";
import { scenarios, type ScenarioDoc } from "@/content/scenarios";
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
type Phase = "incoming" | "connecting" | "opening" | "live" | "ended";
/** realtime = speech-to-speech 실시간 통화, fallback = 기존 STT/텍스트 경로. */
type CallMode = "undecided" | "realtime" | "fallback";

type ChatMessage = {
  id: string;
  role: "scammer" | "user";
  text: string;
  turnIndex: number;
};

const PREROLL_NOTICE =
  "지금부터 재생되는 음성은 실제 전화가 아니라 AI로 합성된 훈련용 음성입니다.";

// T83/UX-031 States — "연결 중…" 연출 길이. **고정값**이다(랜덤 없음 = 테스트 결정론, §16.2).
// ⚠️ 이 구간은 화면 연출일 뿐 실제 발신이 아니다(AC-019). 이 동안에도 통화 축소 표시·"훈련 종료"가
// 계속 보인다.
const VERIFY_DIALING_MS = 2500;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SessionCallPage() {
  const router = useRouter();
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  // 사용자 신고(2026-07-24) — 실시간 통화에서 사용자가 먼저 말해야 대화가 시작되던 문제.
  // consumeOpeningMessageText()는 1회성(읽으면 삭제)이라 sessionId와 동일하게 지연 초기값으로
  // 마운트 시 한 번만 읽는다(재렌더마다 다시 읽어 소진되는 것을 방지).
  const [openingMessageText] = useState<string | null>(() => consumeOpeningMessageText());
  const [pageState, setPageState] = useState<PageState>(sessionId ? "checking" : "no-session");
  const [phase, setPhase] = useState<Phase>("incoming");
  const [callMode, setCallMode] = useState<CallMode>("undecided");
  const [scenario, setScenario] = useState<ScenarioDoc | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
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
  // T40 fast-follow — 역방향 명시 전환 버튼("메시지로 전환") 상태. messenger/page.tsx의
  // escalating/escalationError와 동일한 패턴, 방향만 반대.
  const [switchingToMessenger, setSwitchingToMessenger] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // T68 통화 중 문자(UX-027/UF-008, AC-059/060/061) — 전부 **통화 셸 위에 얹히는 상태**다.
  // ⚠️ 이 값들은 타이머 effect(:phase만 의존)·한도 자동종료 effect·오디오 재생 어디에도 들어가지
  // 않는다(§15.1.1 — 넣으면 통화가 멈춰 이 기능의 존재 이유가 무너진다).
  const [inCallSms, setInCallSms] = useState<InCallSmsView[]>([]);
  const [smsOverlayOpen, setSmsOverlayOpen] = useState(false);
  const [smsBannerDismissed, setSmsBannerDismissed] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
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
  const [instructionTurn, setInstructionTurn] = useState<{ text: string; seq: number } | null>(null);
  const instructionQueueRef = useRef<PendingInstruction[]>([]);
  // 이번 사기범 턴에 이미 지시를 하나 넣었는가(다음 turnComplete까지 추가 주입을 보류한다).
  const instructionBusyRef = useRef(false);
  // 사기범 발화 턴 수(실시간 경로) — GeminiVoiceSession의 turnComplete 경계만 센다.
  const [scammerTurns, setScammerTurns] = useState(0);
  // 이미 서버에 전달을 요청한 smsId(중복 호출 방지). 렌더와 무관해 ref에 둔다.
  const requestedSmsRef = useRef<Set<string>>(new Set());
  // 오버레이를 연 트리거(배너/"문자함") — 닫을 때 포커스를 되돌린다(UX-027 Focus Order).
  const smsTriggerRef = useRef<HTMLButtonElement | null>(null);
  // T83 확인 시도 무력화(UX-031/UF-011, AC-071) — 문자 오버레이와 **같은 계층·같은 규칙**이다
  // (§16.2 무개정 재사용). 이 값들도 타이머·한도·오디오 effect 어디에도 들어가지 않는다(§15.1.1).
  const [verifyOffer, setVerifyOffer] = useState<VerifyInterceptView | null>(null);
  const [verifyOverlayOpen, setVerifyOverlayOpen] = useState(false);
  const [verifyDialing, setVerifyDialing] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  // 이미 서버에 오퍼 전달을 요청했는가(중복 호출 방지). 렌더와 무관해 ref에 둔다.
  const requestedVerifyRef = useRef(false);
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
  const verifyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speech = useSpeechRecognition();
  const realtime = useRealtimeCall();
  // 실시간 음성 통화의 전사 턴을 모아 종료 직전에 제출한다(finding #1). 리렌더와 무관하게 누적
  // 되어야 하므로 ref에 쌓는다.
  const transcriptRef = useRef<TranscriptTurn[]>([]);

  const handleTranscriptTurn = useCallback((role: "user" | "scammer", text: string) => {
    transcriptRef.current.push({ role, text });
    // T118(§25.3 (3)) — A5 재주입 조건의 관측 지점. 참가자가 한 번이라도 말한 뒤에만 다시 넣는다.
    if (role === "user") userTurnsSinceInjectionRef.current += 1;
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
      await submitRealtimeTranscript({ sessionId, turns });
    } catch {
      // 무시 — 다음 단계(endSession→리포트)는 그대로 진행한다.
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await getDoc(doc(db, "sessions", sessionId));
        if (cancelled) return;
        const data = snapshot.data();
        if (!data) {
          setPageState("load-error");
          return;
        }
        const scenarioId = data.scenarioId as string | undefined;
        const found = scenarioId ? scenarios[scenarioId] : undefined;
        if (!found) {
          setPageState("scenario-not-found");
          return;
        }
        setScenario(found);
        setMaxSessionMs((data.maxSessionMs as number) ?? null);
        // T72(UX-014 v1.11 난이도 배지, P-22) — 세션 문서에 서버가 **실제로 기록한** 값을 읽는다
        // (sessionStorage 힌트가 아니라). 부재(난이도 도입 이전 세션)면 중급으로 정규화된다.
        setDifficultyLevel(normalizeDifficultyLevel(data.difficultyLevel));
        // #4/#5 새로고침 복원: 이미 "받기"를 누른 세션(answered 플래그)이나 대화가 시작된 세션
        // (turnCount≥1)을 다시 열면 "수신 중"으로 되돌아가지 않고 곧바로 대화 상태로 복원한다.
        // 실시간 경로는 sendMessage를 안 타 turnCount가 0에 머무므로, turnCount만으로는 실시간
        // 통화 중 새로고침을 감지할 수 없다 — answered 플래그로 보완한다(finding #4). 실시간
        // 소켓은 새로고침으로 끊기므로 복원은 텍스트 폴백으로 이어진다.
        //
        // T30 수정(검증 중 발견): entryChannel==="messenger"(에스컬레이션 세션)는 메신저 단계에서
        // 이미 turnCount≥1이 쌓인 채로 이 화면에 처음 진입한다 — turnCount만으로 판단하면 P-18
        // "수신(벨) 화면 인계"를 건너뛰고 곧장 통화 중으로 복원돼 사전 고지(PREROLL_NOTICE)·수신
        // 연출이 통째로 스킵되는 회귀가 있었다(AC-036 "사전 고지 유지" 위반). 에스컬레이션 세션은
        // isSessionAnswered 플래그(이 화면에서 실제로 "받기"를 눌렀는지)만으로 판단한다.
        const isEscalated = data.entryChannel === "messenger";
        const answered =
          isSessionAnswered(sessionId) || (!isEscalated && (data.turnCount as number) >= 1);
        if (data.status === "ended") {
          setPhase("ended");
        } else if (data.status === "active" && answered) {
          const answeredAtMs =
            (data.answeredAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null;
          if (answeredAtMs) {
            setElapsedSec(Math.max(0, Math.floor((Date.now() - answeredAtMs) / 1000)));
          }
          setCallMode("fallback");
          setPhase("live");
        }
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
    if (!sessionId || phase === "incoming" || phase === "connecting") return;
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
    if (!sessionId || phase === "incoming" || phase === "connecting") return;
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
    if (!sessionId || phase === "incoming" || phase === "connecting") return;
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
      setVerifyOffer({
        offerId: docSnap.id,
        deskLabel: data.deskLabel as string,
        // T110(§22.3/C4) — 호 전환 모델에는 안내 번호가 없다. 신규 문서에 필드 자체가 없고
        // 화면에도 그릴 자리가 없으므로 **읽지 않는다**(과거 문서에 남아 있어도 무시한다).
        placedAtMs: placedAt?.toMillis?.(),
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
    const { item, rest } = takeNextInstruction(instructionQueueRef.current);
    if (!item) return;
    instructionQueueRef.current = rest;
    instructionBusyRef.current = true;
    setInstructionTurn((prev) => ({ text: item.text, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const enqueueTurnInstruction = useCallback(
    (text: string, priority: PendingInstruction["priority"]) => {
      instructionQueueRef.current = enqueueInstruction(instructionQueueRef.current, {
        text,
        priority,
      });
      drainInstructionQueue();
    },
    [drainInstructionQueue],
  );

  // T68 — 사기범 턴 경계에 도달하면 문자를 도착시킨다(실시간 경로, §15.1.2 앱 오케스트레이션).
  // 서버가 문서를 쓰고 announce 지시를 돌려주면 그것을 **같은 Live 세션에 텍스트 턴으로** 넣어
  // 캐릭터가 "문자 보냈어요"라고 말하게 한다. 실패해도 통화는 계속된다(P-4 — 인라인 안내만).
  useEffect(() => {
    if (!sessionId || callMode !== "realtime" || phase !== "live") return;
    const triggers = realtime.credentials?.inCallSmsTriggers ?? [];
    if (triggers.length === 0) return;
    const dueSmsId = pickDueInCallSms({
      triggers,
      scammerTurns,
      deliveredSmsIds: [...requestedSmsRef.current],
    });
    if (!dueSmsId) return;
    requestedSmsRef.current.add(dueSmsId);
    (async () => {
      try {
        const result = await deliverInCallSms({ sessionId, smsId: dueSmsId });
        setSmsError(null);
        setSmsBannerDismissed(false);
        // T83 — 직접 세팅하지 않고 큐를 통한다(같은 턴에 확인 지시와 겹쳐도 유실되지 않게, G31).
        enqueueTurnInstruction(result.announceInstruction, "sms");
      } catch {
        // 다음 턴 경계에서 다시 시도할 수 있게 요청 기록을 되돌린다.
        requestedSmsRef.current.delete(dueSmsId);
        setSmsError("문자를 받지 못했습니다. 통화는 계속됩니다.");
      }
    })();
    // enqueueTurnInstruction은 안정 참조(useCallback, 의존성 없음)라 이 목록에 넣어도 effect가
    // 추가로 재실행되지 않는다 — 기존 트리거 조건은 그대로다.
  }, [
    sessionId,
    callMode,
    phase,
    scammerTurns,
    realtime.credentials?.inCallSmsTriggers,
    enqueueTurnInstruction,
  ]);

  // T83 — 사기범 턴이 가용 게이트에 도달하면 **확인 권유**를 도착시킨다(§16.1.3 앱 오케스트레이션).
  // 서버가 오퍼 문서를 쓰고 지시를 돌려주면, 실시간 경로는 그것을 같은 Live 세션에 넣어 캐릭터가
  // "직접 확인해 보시라"고 권하게 한다(폴백 경로는 서버가 다음 턴 프롬프트에 직접 싣는다).
  //
  // ⚠️ **게이트가 없으면 아무 일도 일어나지 않는다** — `verifyOffer` 필드는 카탈로그 보유 && 고급 &&
  // 난이도 반영 경로일 때만 서버가 붙인다(§16.1.5). 즉 컨트롤이 **존재하지 않는** 세션이 기본이다.
  // 실패해도 통화는 계속된다(P-4 — 인라인 안내만, UF-011 Failure (b)).
  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    if (callMode !== "realtime" && callMode !== "fallback") return;
    const trigger = realtime.credentials?.verifyOffer;
    // 완료된 사기범 발화 수: 실시간은 Live 턴 카운터, 폴백은 이미 쌓인 대화 로그(오프닝 포함).
    const completedScammerTurns =
      callMode === "realtime" ? scammerTurns : messages.filter((m) => m.role === "scammer").length;
    if (
      !shouldOfferVerify({
        ...(trigger ? { trigger } : {}),
        scammerTurns: completedScammerTurns,
        alreadyRequested: requestedVerifyRef.current,
      })
    ) {
      return;
    }
    requestedVerifyRef.current = true;
    const requestCallMode = callMode;
    (async () => {
      try {
        const result = await deliverVerifyOffer({
          sessionId,
          callMode: requestCallMode,
          // 앵커 판별자(§16.3.2) — 실시간일 때만 필수다. 폴백은 서버가 messages를 직접 센다.
          ...(requestCallMode === "realtime" ? { scammerTurns } : {}),
        });
        setVerifyError(null);
        // 폴백 경로는 서버가 다음 sendMessage 턴에 직접 주입하므로 클라가 넣지 않는다(중복 방지).
        // T118/R-1 — 전환이 이미 끝난 오퍼면 서버가 지시를 **생략**한다(§25.5 (4)). 값이 없으면
        // 주입하지 않는다: 전환 이후의 확인 권유는 참가자가 겪은 사실과 모순이다.
        if (requestCallMode === "realtime" && result.announceInstruction) {
          enqueueTurnInstruction(result.announceInstruction, "verify");
        }
      } catch (error) {
        // 다음 턴 경계에서 다시 시도할 수 있게 요청 기록을 되돌린다(조용한 실패 금지).
        // T118/R-2 — 단, **재시도해도 같은 결과인 오류**에서는 되돌리지 않는다(§25.5 (4)).
        // 그 재시도가 곧 중복 주입 경로다. 판정은 순수 함수에 있다(`shouldRetryVerifyOffer`).
        if (shouldRetryVerifyOffer(error)) requestedVerifyRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, callMode, phase, scammerTurns, messages, realtime.credentials?.verifyOffer]);

  const handleScammerTurnComplete = useCallback(() => {
    setScammerTurns((n) => n + 1);
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

  // 통화 경과 타이머 — "받기"(answeredAt) 기점, ended면 정지.
  useEffect(() => {
    if (phase === "incoming" || phase === "ended") return;
    const interval = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

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

  // 폴백 경로 오디오 자동재생 — 브라우저 정책으로 막히면 "탭하여 듣기" 버튼만 최소로 노출(P-4).
  useEffect(() => {
    if (!playbackUrl) return;
    (async () => {
      setPlaybackBlocked(false);
      try {
        await audioRef.current?.play();
      } catch {
        setPlaybackBlocked(true);
      }
    })();
  }, [playbackUrl]);

  const handleManualPlay = () => {
    audioRef.current
      ?.play()
      .then(() => setPlaybackBlocked(false))
      .catch(() => {});
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
  // T68(§15.1.3) — 문자 오버레이가 열려 있는 동안에는 **마이크 입력만** 멈춘다(읽는 중 혼잣말·
  // 주변 소음이 발화로 오인되면 사기범이 엉뚱하게 반응해 몰입이 깨진다). 오버레이를 닫으면 이
  // 조건이 다시 참이 되어 기존 재개 로직이 자동으로 청취를 연다(추가 코드 불요).
  // ⚠️ 재생·타이머는 이 게이팅 대상이 아니다 — 통화가 살아 있다는 것이 이 기능의 전부다.
  // T83(§16.2) — 확인 오버레이도 **같은 규칙**으로 마이크만 게이팅한다(오디오 재생·타이머·한도·
  // 소켓은 손대지 않는다). 음소거 버튼의 aria-pressed는 여전히 사용자 의도 `muted`에만 바인딩한다.
  useEffect(() => {
    if (callMode !== "fallback" || phase !== "live" || smsOverlayOpen || verifyOverlayOpen) return;
    if (speech.status !== "idle") return;
    if (sending || playbackUrl) return;
    const timer = setTimeout(() => speech.start(), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callMode, phase, speech.status, sending, playbackUrl, smsOverlayOpen, verifyOverlayOpen]);

  // P-11 이음새 없는 전환 — 오프닝 재생이 끝나면 확인 버튼 없이 곧바로 실시간 청취로 넘어간다.
  const handlePlaybackEnded = () => {
    setPlaybackUrl(null);
    setPhase((p) => (p === "opening" ? "live" : p));
    maybeStartListening();
  };

  // 사용자 신고(2026-07-25) — "전화가 연결되면 바로 말하는 걸로". 전화가 울리는 동안(아직 "받기"
  // 전) 자격증명만 미리 받아 둔다 — 마이크 접근·"받기" 소비는 그대로 handleAnswer에서만 일어나므로
  // "받기 전엔 아무 것도 새지 않는다"는 관례는 무변경이다(realtime.prefetch 자체가 상태를 안 바꿈).
  useEffect(() => {
    if (pageState !== "ready" || !sessionId || phase !== "incoming") return;
    realtime.prefetch(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageState, sessionId, phase, realtime.prefetch]);

  const handleAnswer = () => {
    if (!sessionId) return;
    // finding #4: "받기"를 누른 세션을 기록해, 통화 중 새로고침 시 벨 화면이 아니라 통화로 복원.
    markSessionAnswered(sessionId);
    setPhase("connecting");
    setCallMode("realtime");
    // 실시간 연결을 먼저 시도한다(위 prefetch로 미리 받아 둔 자격증명이 신선하면 재사용). 불가하면
    // 위 effect가 폴백으로 강등한다.
    void realtime.start(sessionId);
  };

  const handleDecline = () => {
    router.push("/session/end");
  };

  // T68 — 오버레이 열기/닫기. **라우팅을 하지 않는다**(D-35 하드 요구): 상태만 바꾸므로
  // GeminiVoiceSession/RealtimeVoiceSession은 언마운트되지 않고 통화가 그대로 유지된다.
  const handleOpenSmsOverlay = (trigger: HTMLButtonElement | null) => {
    smsTriggerRef.current = trigger;
    // 폴백 경로에서는 오버레이를 여는 즉시 마이크를 닫는다(위 자동 청취 effect의 재개 조건과 짝).
    if (callMode === "fallback") speech.stop();
    // ⚠️ 동시 열림 금지(§16.2 신규 규칙 / §16.6 G26) — 두 오버레이 모두 `aria-modal="true"`라
    // 겹치면 **포커스 트랩이 중첩돼 "훈련 종료" 도달성이 깨진다**(AC-006). 상태를 하나로 합치는
    // 리팩터는 하지 않는다(요청되지 않은 변경 금지) — 여는 쪽에서 상대를 닫는 것으로 충분하다.
    setVerifyOverlayOpen(false);
    setSmsOverlayOpen(true);
  };

  const handleCloseSmsOverlay = () => {
    setSmsOverlayOpen(false);
    setSmsBannerDismissed(true);
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
  const handleOpenVerifyOverlay = (trigger: HTMLButtonElement | null) => {
    verifyTriggerRef.current = trigger;
    if (callMode === "fallback") speech.stop();
    // 동시 열림 금지(§16.6 G26) — 반대 방향도 동일하게 상대를 닫는다.
    setSmsOverlayOpen(false);
    setVerifyError(null);
    setVerifyOverlayOpen(true);
  };

  const handleCloseVerifyOverlay = () => {
    setVerifyOverlayOpen(false);
    // 직전 트리거로 포커스 복귀(UX-031 Accessibility). 재연결 뒤에는 트리거가 사라지므로
    // 포커스는 그대로 두고 상태 문구(aria-live)가 상황을 알린다.
    verifyTriggerRef.current?.focus();
  };

  /**
   * "연결해 달라고 하기"(UX-031 Primary Action ①, T110 C5) — ⚠️ **실제 발신이 아니다**(AC-019).
   * 참가자가 요청하는 것은 **호 전환(넘겨주기)** 이지 신규 발신이 아니다. 하는 일은
   * 콜러블 1회 호출(서버는 Firestore write 1건 + 지시 문자열 반환)과 화면 연출뿐이며, 이 함수는
   * `tel:`·다이얼 인텐트·외부 네비게이션을 **어디에서도** 쓰지 않는다.
   *
   * 흐름(UX-031 States): Dialing("연결 중…" 2.5초 고정) → 오버레이 자동 닫힘 → 통화 셸의
   * `verify-reconnected`(발신자 라벨이 문서의 `reconnectedCallerLabel`로 바뀐다). 실패 시 Error
   * 상태 후 **원래 통화 유지**(세션·리포트는 정상 진행 — UF-011 Failure (c), 침묵 실패 금지).
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
        enqueueTurnInstruction(result.reconnectInstruction, "verify");
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
      setInput("");
      speech.reset();
      // T68 폴백 경로 — 서버가 이번 턴에 문자를 도착시켰으면 배너를 다시 띄운다(렌더 자체는
      // inCallSms 구독이 담당하므로 여기서는 배너 노출 여부만 되돌린다).
      if (result.sms) setSmsBannerDismissed(false);
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

  // T75(2026-07-25, 사용자 요청) — 발신자 표기에서 "(사칭)"을 제거하고 **번호만** 보여준다.
  // 실제 보이스피싱은 모르는 번호로 걸려오며, 화면에 "사칭"이라고 적혀 있으면 판단 훈련이
  // 성립하지 않는다(정답을 미리 알려주는 셈). 시뮬레이션 고지는 수신 화면의 사전 고지
  // (PREROLL_NOTICE)와 상시 합성 표식이 계속 담당한다(AC-012/AC-022 무변경).
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
  const showSmsBanner =
    latestSms !== null && !smsBannerDismissed && !smsOverlayOpen && phase !== "ended";
  // T83(UX-014 `verify-offered` state) — 확인 권유가 도착했고 아직 걸지 않았을 때만 보조 컨트롤이
  // 뜬다. 재연결 이후(placedAt 존재)에는 사라진다 — 이 흐름은 세션당 한 번이다(§16.1.3).
  const showVerifyTrigger =
    verifyOffer !== null &&
    verifyOffer.placedAtMs === undefined &&
    !verifyOverlayOpen &&
    phase !== "ended";
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
    <main className="flex min-h-screen flex-col bg-[#22303A] text-white">
      {/* 실시간 speech-to-speech 세션 — 서버가 자격증명을 준 경우에만 마운트된다(지연 로딩).
          화면 요소는 없고 SDK 세션 생명주기만 관리한다. */}
      {realtime.credentials?.provider === "elevenlabs" && (
        <RealtimeVoiceSession
          credentials={realtime.credentials}
          firstMessage={openingMessageText ?? undefined}
          stopSignal={realtime.stopSignal}
          // T68(§15.1.3) — 오버레이가 열린 동안 **마이크 입력만** 멈춘다. 아래 음소거 버튼의
          // aria-pressed는 사용자 의도(muted)에만 바인딩한다(근거 없는 표기 금지).
          muted={muted || smsOverlayOpen || verifyOverlayOpen}
          onActive={realtime.handleActive}
          onEnded={realtime.handleEnded}
          onError={realtime.handleError}
          onSpeakingChange={realtime.handleSpeakingChange}
          onUserSpeakingChange={realtime.handleUserSpeakingChange}
        />
      )}
      {realtime.credentials?.provider === "gemini" && (
        <GeminiVoiceSession
          credentials={realtime.credentials}
          stopSignal={realtime.stopSignal}
          muted={muted || smsOverlayOpen || verifyOverlayOpen}
          onActive={realtime.handleActive}
          onEnded={realtime.handleEnded}
          onError={realtime.handleError}
          onSpeakingChange={realtime.handleSpeakingChange}
          onUserSpeakingChange={realtime.handleUserSpeakingChange}
          onTranscriptTurn={handleTranscriptTurn}
          textMessage={textMessage}
          onScammerTurnComplete={handleScammerTurnComplete}
          instructionTurn={instructionTurn}
          personaStateTurn={personaStateTurn}
        />
      )}

      {/* 상단 상태 바 — 통신사/신호 자리에 통화 상태와 경과 시간(실제 통화 화면 관례). */}
      <div className="flex items-center justify-between px-6 pt-5 text-sm text-[#C9D4DB]">
        <span>휴대전화</span>
        {phase !== "incoming" && phase !== "connecting" && (
          <span
            role="status"
            className="font-mono tabular-nums font-semibold tracking-wider text-[#C9D4DB]"
          >
            {formatElapsed(elapsedSec)}
          </span>
        )}
      </div>

      {/* T68 문자 도착 배너(UX-014 `sms-arrived` state / UF-008 Step 2) — 통화는 그대로 진행 중이다.
          시각 배너와 **aria-live 알림을 동시에** 제공한다(P-20 (6) — 시각에만 의존하지 않는다).
          탭하면 오버레이가 열릴 뿐 **라우팅이 일어나지 않는다**(D-35).
          T103/P-27 (5) ① — 한 프레임에 튀어나오지 않도록 배너도 같은 규칙으로 부드럽게 내려온다
          (`prefers-reduced-motion`이면 즉시 교체 — globals.css의 폴백 블록).
          ⚠️ **도착은 배너만 띄운다**(D-56) — 여기서 `setSmsOverlayOpen(true)`를 부르지 않는다.
          문자함으로 넘어갈지는 훈련 대상인 참가자의 결정이고, 자동 전환은 한도 도달·종료 고지
          순간을 덮을 수 있다(AC-059). */}
      {showSmsBanner && latestSms && (
        <div className="sms-banner-enter px-4 pt-3">
          <button
            type="button"
            onClick={(event) => handleOpenSmsOverlay(event.currentTarget)}
            className="flex w-full items-start gap-3 rounded-[14px] border-[1.5px] border-[#C9C2B6] bg-white/95 px-4 py-3 text-left"
          >
            <span aria-hidden="true" className="mt-0.5 text-lg">
              ✉
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[#22303A]">
                문자 1건이 도착했습니다 · {latestSms.senderLabel}
              </span>
              <span className="block truncate text-sm text-[#6B655C]">
                {latestSms.body.split("\n")[0]}
              </span>
              <span className="mt-1 inline-block rounded-full bg-[#EFEBF7] px-2 py-0.5 text-xs font-semibold text-[#463880]">
                AI 훈련용 모의 문자
              </span>
            </span>
          </button>
        </div>
      )}
      {/* 스크린리더 알림 — 배너를 닫았거나 보지 못해도 도착 사실이 전달된다(P-4/P-20).
          ⚠️ 버그 수정(사용자 브라우저 실측, 2026-07-25): 조건이 `latestSms`(도착한 문자가 있는가)라
          미확인 건수가 0이 된 뒤에도 **"문자 0건이 도착했습니다."** 를 계속 알렸다. 시각적으로는
          sr-only라 보이지 않지만 스크린리더 사용자에게는 매 렌더마다 들리는 **사실과 다른 안내**다.
          알릴 사실이 실제로 있을 때(미확인 ≥ 1)만 문구를 채운다. */}
      <p aria-live="polite" className="sr-only">
        {smsUnreadCount > 0 ? `문자 ${smsUnreadCount}건이 도착했습니다.` : ""}
      </p>
      {smsError && (
        <p role="alert" className="px-4 pt-2 text-center text-xs text-[#F0A79E]">
          {smsError}
        </p>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8">
        {/* 발신자 아바타 — 수신 중에는 파동, 통화 중 상대 발화 시에도 파동으로 존재감을 준다. */}
        <div className="relative flex items-center justify-center">
          {(isRinging || agentSpeaking) && (
            <>
              <span
                aria-hidden="true"
                className="call-ring-pulse absolute h-28 w-28 rounded-full bg-[#7CD9C2]/30"
              />
              <span
                aria-hidden="true"
                className="call-ring-pulse absolute h-28 w-28 rounded-full bg-[#7CD9C2]/20"
                style={{ animationDelay: "0.7s" }}
              />
            </>
          )}
          {/* T75 — 발신자가 이제 번호이므로 첫 글자를 따면 "0"·"+" 같은 무의미한 문자가 뜬다.
              실제 전화 앱이 저장되지 않은 번호에 쓰는 일반 아이콘으로 대체한다. */}
          <div
            aria-hidden="true"
            className="relative flex h-28 w-28 items-center justify-center rounded-full bg-[#41525E] text-5xl text-[#C9D4DB]"
          >
            ☎
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <p className="text-3xl font-bold">{callerLabel}</p>
          <p className="text-base text-[#C9D4DB]">
            {phase === "incoming"
              ? "휴대전화 수신 중…"
              : phase === "connecting"
                ? "연결하는 중…"
                : phase === "ended"
                  ? "통화 종료"
                  : "통화 중"}
          </p>
          {/* T72 난이도 배지(UX-014 v1.11, P-22) — 색 단독 금지, 항상 텍스트 라벨.
              ⚠️ ElevenLabs 실시간 경로는 프롬프트가 에이전트 쪽에 있어 난이도가 반영되지 않는다
              (§15.3.3/§15.6 G6). 그 경우 배지를 띄우지 않고(근거 없는 표기 금지) 미적용 사실을
              대신 알린다(조용한 미적용도 금지). 난이도 표기 여부와 무관하게 아래 종료 컨트롤·
              합성 표식·사전 고지는 세 난이도에서 완전히 동일하다(AC-065). */}
          {difficultyLevel &&
            (difficultyApplied ? (
              <p className="rounded-full bg-[#41525E] px-3 py-1 text-sm font-semibold text-[#C9D4DB]">
                난이도 {DIFFICULTY_LABEL[difficultyLevel]}
              </p>
            ) : (
              <p className="text-sm text-[#C9D4DB]">
                이 통화 경로에서는 고른 난이도가 적용되지 않습니다
              </p>
            ))}
          {/* T83(§16.2/UX-014 `verify-reconnected`) — 재연결 후 1줄 상태 문구. 폴백 경로에서
              서버가 별도 인사말을 생성하지 않기 때문에 이 자리가 그 공백을 메운다. **연결 사실만**
              알리고 구조 설명은 하지 않는다(OQ-38 확정 = 세션 중엔 상황만). */}
          {verifyConnectedLabel && phase !== "ended" && (
            <p role="status" className="text-sm text-[#C9D4DB]">
              {verifyConnectedLabel}
            </p>
          )}
        </div>

        {phase === "incoming" && (
          <p role="status" className="max-w-xs text-center text-sm leading-relaxed text-[#C9D4DB]">
            {PREROLL_NOTICE}
          </p>
        )}

        {phase === "connecting" && (
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9D4DB] border-t-transparent"
          />
        )}

        {/* 통화 중 발화 인디케이터 — 실제 통화 화면에 있는 유일한 "상태" 표시다.
            자막·안내문·오류는 여기 두지 않는다(2026-07-22 사용자 피드백: 화면이 통화처럼 안 보임)
            — 필요한 것은 키패드 패널 안으로 옮겨, 기본 화면은 발신자와 컨트롤만 남긴다. */}
        {(phase === "live" || phase === "opening") && (
          <CallWaveform active={agentSpeaking} label={waveLabel} />
        )}

        {/* 사용자 발화 파형 인디케이터(2026-07-24, 사용자 신고 — "일단 잘 파악하는지 보고
            싶다") — 실시간 통화(callMode==="realtime")에서만 신호가 존재한다(폴백 경로는
            브라우저 STT 기반이라 "말하고 있다"는 연속 신호가 없음, 이번 범위 밖). AI 파형과
            동일한 CallWaveform 컴포넌트를 재사용해 "말하는 쪽이 누구든 같은 방식으로 보인다"는
            일관성을 유지한다. */}
        {(phase === "live" || phase === "opening") && callMode === "realtime" && (
          <CallWaveform
            active={realtime.isUserSpeaking}
            label={realtime.isUserSpeaking ? "내 목소리가 들리고 있어요" : "제 차례에 말씀하세요"}
          />
        )}

        {playbackUrl && (
          <audio
            ref={audioRef}
            src={playbackUrl}
            onEnded={handlePlaybackEnded}
            aria-label="상대방 음성 재생"
            className="hidden"
          />
        )}
        {/* 자동재생이 막힌 경우에만 노출 — 이건 누르지 않으면 통화가 진행되지 않아 화면에 남긴다. */}
        {playbackBlocked && (
          <button
            type="button"
            onClick={handleManualPlay}
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white"
          >
            🔊 탭하여 듣기
          </button>
        )}
      </div>

      {/* 하단 컨트롤 — 실제 폰 통화 UI 관례(수신 화면은 거절/받기, 통화 중은 음소거·키패드·종료). */}
      {phase === "incoming" ? (
        <div className="flex justify-around px-10 pb-12">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleDecline}
              aria-label="전화 거절 — 훈련 종료"
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#C6392F] text-3xl shadow-lg transition active:scale-95"
            >
              <span aria-hidden="true">✕</span>
            </button>
            <span className="text-sm text-[#C9D4DB]">거절</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleAnswer}
              aria-label="전화 받기"
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#0E6B62] text-3xl shadow-lg transition active:scale-95"
            >
              <span aria-hidden="true">✆</span>
            </button>
            <span className="text-sm text-[#C9D4DB]">받기</span>
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
        <div className="px-6 pb-10">
          {/* 키패드 패널 — 기본 화면을 통화답게 유지하려고, 자막·안내·오류·텍스트 입력을 전부
              여기로 모았다. 닫혀 있으면 통화 화면에는 발신자와 컨트롤만 남는다. */}
          {showTextInput && (
            <div className="mb-5 rounded-2xl bg-black/25 p-4">
              {/* 실제 통화 키패드(사용자 신고 2026-07-25 — "키패드가 있는데 실제로 작동하지 않는다").
                  상대가 "인증번호 눌러주세요"류를 요구하는 시나리오에서 실제로 눌러 응답할 수 있다.
                  누른 숫자는 화면에 그대로 보이고, 전송하면 음성/텍스트와 동일한 경로로 상대에게
                  전달된다(실시간이면 Live 세션, 폴백이면 sendMessage). */}
              <div className="mb-4">
                <div
                  className="mb-3 flex min-h-[44px] items-center justify-center rounded-xl bg-black/30 px-4 font-mono text-2xl tracking-[0.2em] text-white"
                  aria-live="polite"
                  aria-label="입력한 번호"
                >
                  {dialpadValue || <span className="text-base tracking-normal text-[#8FA0AC]">번호를 누르세요</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDialpadValue((v) => (v.length >= 32 ? v : v + key))}
                      aria-label={`${key} 누르기`}
                      className="min-h-[52px] rounded-xl bg-white/10 text-xl font-semibold text-white transition active:scale-95 hover:bg-white/20"
                    >
                      {key}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDialpadValue((v) => v.slice(0, -1))}
                    disabled={!dialpadValue}
                    className="min-h-[44px] flex-1 rounded-xl bg-white/10 text-sm font-semibold text-[#C9D4DB] disabled:opacity-40"
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
                    className="min-h-[44px] flex-1 rounded-xl bg-[#0E6B62] text-sm font-bold text-white disabled:opacity-40"
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
                      role={sendError ? "alert" : undefined}
                      className={`mb-3 text-center text-xs leading-relaxed ${
                        sendError ? "text-[#F0A79E]" : "text-[#C9D4DB]"
                      }`}
                    >
                      {sendError ??
                        (callMode === "fallback"
                          ? `실시간 음성 통화를 사용할 수 없어 텍스트로 진행합니다.${
                              realtime.errorMessage ? ` ${realtime.errorMessage}` : ""
                            }`
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
          )}

          {/* T40 fast-follow — 역방향 전환("메시지로 전환") 오류만 컨트롤 행 위에 상시 노출.
              메신저 채팅으로 이어질 수 있는 시나리오(scenario.channel==="messenger", 즉 메신저→
              보이스로 정방향 에스컬레이션된 세션)에서만 아래 버튼 자체가 보이므로, 이 오류 문구도
              같은 조건에서만 의미가 있다. */}
          {scenario.channel === "messenger" && switchError && (
            <p role="alert" className="mb-3 text-center text-xs leading-relaxed text-[#F0A79E]">
              {switchError}
            </p>
          )}

          {/* T83 확인 권유 컨트롤(UX-014 `verify-offered` state / UF-011 Step 3) — 통화는 그대로
              진행 중이다. 탭하면 UX-031 오버레이가 열릴 뿐 **라우팅이 일어나지 않는다**(D-35).
              ⚠️ D-47 — 아래 "종료"(빨강 원형, 가운데)는 **자리·문구·크기 그대로**이고 이 컨트롤은
              **다른 영역·다른 문구·다른 모양**이다(색이 아니라 문구·위치로 구분 — 어르신이 "끊고
              확인하기"와 "훈련 종료"를 혼동하면 AC-006 도달성 문제로 번진다). "훈련은 계속됩니다"
              보조 문구를 병기한다. */}
          {showVerifyTrigger && verifyOffer && (
            <div className="mb-4">
              <button
                type="button"
                ref={verifyTriggerRef}
                onClick={(event) => handleOpenVerifyOverlay(event.currentTarget)}
                className="flex min-h-[56px] w-full flex-col items-center justify-center rounded-[14px] border-[1.5px] border-[#C9C2B6] bg-white/95 px-4 py-2.5 text-center"
              >
                <span className="text-base font-bold text-[#22303A]">
                  확인 부서로 연결해 달라고 하기
                </span>
                <span className="text-xs text-[#6B655C]">훈련은 계속됩니다</span>
              </button>
            </div>
          )}
          {verifyError && !verifyOverlayOpen && (
            <p role="alert" className="mb-3 text-center text-xs leading-relaxed text-[#F0A79E]">
              {verifyError}
            </p>
          )}

          {/* 실제 폰 통화의 컨트롤 행: 음소거 · 통화 종료(빨강, 가운데) · 키패드 · (해당 시) 메시지로
              전환. 가운데 빨강 버튼이 AC-006의 "상시 즉시 종료" 컨트롤을 겸한다 — 별도 "훈련 종료"
              버튼을 두면 통화 화면처럼 보이지 않는다는 피드백을 반영하되, 종료 수단은 모든
              상태에서 한 번의 탭으로 도달 가능하다는 요건은 그대로 지킨다. */}
          <div className="flex items-end justify-center gap-9">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMute}
                aria-pressed={muted}
                aria-label={muted ? "음소거 해제" : "음소거"}
                className={`flex h-14 w-14 items-center justify-center rounded-full text-xl transition active:scale-95 ${
                  muted ? "bg-white text-[#22303A]" : "bg-[#41525E] text-[#C9D4DB]"
                }`}
              >
                <span aria-hidden="true">{muted ? "🔇" : "🎙"}</span>
              </button>
              <span className="text-xs text-[#C9D4DB]">{muted ? "음소거 중" : "음소거"}</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => void handleEndTraining()}
                aria-label="통화 종료 — 훈련 종료"
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#C6392F] text-3xl shadow-lg transition active:scale-95"
              >
                <span aria-hidden="true">✆</span>
              </button>
              <span className="text-xs text-[#C9D4DB]">종료</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTextInput((v) => !v)}
                aria-pressed={showTextInput}
                aria-label="키패드 — 텍스트로 입력"
                className={`flex h-14 w-14 items-center justify-center rounded-full text-xl transition active:scale-95 ${
                  showTextInput ? "bg-white text-[#22303A]" : "bg-[#41525E] text-[#C9D4DB]"
                }`}
              >
                <span aria-hidden="true">⌨</span>
              </button>
              <span className="text-xs text-[#C9D4DB]">키패드</span>
            </div>

            {/* T68 — "문자함"(N) 상시 컨트롤(UX-014 v1.11 추가). 문자가 1건 이상 도착한 뒤부터
                남아 언제든 UX-027을 다시 연다(미확인 수 배지). 라우팅 없음(D-35). */}
            {inCallSms.length > 0 && (
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={(event) => handleOpenSmsOverlay(event.currentTarget)}
                  aria-label={`문자함 열기 — 도착 ${inCallSms.length}건, 미확인 ${smsUnreadCount}건`}
                  className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#41525E] text-xl text-[#C9D4DB] transition active:scale-95"
                >
                  <span aria-hidden="true">✉</span>
                  {smsUnreadCount > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#C6392F] px-1 text-xs font-bold text-white"
                    >
                      {smsUnreadCount}
                    </span>
                  )}
                </button>
                <span className="text-xs text-[#C9D4DB]">문자함</span>
              </div>
            )}

            {/* T40 fast-follow — 역방향 명시 전환 버튼("메시지로 전환", §13.1/AC-039). 정방향
                "전화로 확인"(session/messenger/page.tsx)과 대칭이지만, 이쪽은 UX 설계 문서가 없어
                버튼만(구조화 신호·max-turn 폴백 없음) 최소 배선한다. scenario.channel==="messenger"
                (메신저 콘텐츠가 실제로 존재하는 시나리오 — 현재는 메신저→보이스로 정방향
                에스컬레이션된 세션만 해당)일 때만 노출한다 — 서버(requestReverseEscalation)도
                동일 조건을 재검증하므로 이중 방어다. */}
            {scenario.channel === "messenger" && (
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRequestReverseEscalation()}
                  disabled={switchingToMessenger}
                  aria-label="메시지 화면으로 전환"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-[#41525E] text-xl text-[#C9D4DB] transition active:scale-95 disabled:opacity-50"
                >
                  {switchingToMessenger ? (
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    />
                  ) : (
                    <span aria-hidden="true">💬</span>
                  )}
                </button>
                <span className="text-xs text-[#C9D4DB]">메시지로</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ⚠️ T68/UX-027 — 문자 오버레이는 **세션 컴포넌트(위)의 형제 노드**로 조건부 렌더된다.
          early return·상위 래퍼·`key` 변경·router.push 중 어느 하나라도 하면 GeminiVoiceSession/
          RealtimeVoiceSession이 언마운트되어 실시간 세션·마이크·타이머가 끊긴다(§15.1.1/§15.6 G10,
          D-35 — 이 기능의 존재 이유). 여기서는 형제 하나가 추가로 그려질 뿐이라 통화가 유지된다. */}
      {smsOverlayOpen && (
        <InCallSmsOverlay
          messages={inCallSms}
          callerLabel={callerLabel}
          elapsedLabel={formatElapsed(elapsedSec)}
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
          elapsedLabel={formatElapsed(elapsedSec)}
          dialing={verifyDialing}
          errorMessage={verifyError}
          onPlaceCall={() => void handlePlaceVerifyCall()}
          onClose={handleCloseVerifyOverlay}
          onEndTraining={() => void handleEndTraining()}
        />
      )}
    </main>
  );
}
