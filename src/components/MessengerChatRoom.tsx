"use client";
// §121.4 PR-2(2026-10-23 · 메인 결정 "(2)를 PR-2부터") — 이 파일은 `src/app/session/messenger/page.tsx` 본문을 **그대로** 옮긴 것이다
// (동작 변경 0). 통화 화면 안에 대화방을 겹쳐 그리기(PR-3) 위해 라우트 밖 컴포넌트로 뺐다. 라우트는 이 컴포넌트를 그리기만 한다.

// UX-022 메신저 채팅 셸 — 카카오톡형/문자메시지형(iOS·삼성·기본) 통합 (T29) — docs/UX.md UX-022,
// AC-030/031/032/045/047/006/002. 카카오·문자는 **하나의 화면**에서 surface(kakao|sms) 값만 다르게
// 재현한다(D-22, ux-design 판단 — 안전 셸·콘텐츠·링크는 표면과 무관하게 동일, 스킨은 외형뿐).
// 세션 상태 참조 패턴은 src/app/session/play/page.tsx(UX-014)를 그대로 따른다 —
// getPendingSessionId()로 sessionStorage의 사전 세션 id를 읽고, Firestore sessions/{sid} 문서를
// getDoc으로 1회 조회해 scenarioId→scenarios 콘텐츠 카탈로그를 찾는다.
//
// **기존 역할극 엔진 재사용(T29 지시)**: 메시지 전송·수신은 sendMessage(functions/src/roleplay,
// T7)를 표면만 바꿔 그대로 쓴다 — 음성 재생(audioUrl)은 무시한다(메신저는 TTS를 재생하지 않는다).
//
// **T30 후속 수정 — 에스컬레이션 연출 배선**: T29는 이 화면에 에스컬레이션 UI를 만들지 않았다
// (UX-024가 그때는 에스컬레이션 2종을 "준비 중"으로 막아 두어서다). 이제 UX-025(voice-select)가
// 생겨 그 2종도 이 화면까지 들어올 수 있으므로, ①명시 "전화로 확인" 버튼(scenario.escalation
// 있을 때만, 1턴부터 상시)과 ②sendMessage 응답의 escalation 플래그 처리(전이 연출 후 /session/play
// 이동)를 배선한다(§13.2/13.3, P-18, AC-034/036/039).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { chatEndedNotice, endsRun, formatChatTime, isUnreadByPeer, startsPeerRun } from "@/lib/messenger/chatPresentation";
import { db } from "@/lib/firebase";
import {
  getPendingSessionId,
  isSessionAnswered,
  isStartNoticeAcknowledged,
  markStartNoticeAcknowledged,
} from "@/lib/recording";
import {
  recordMockScreenEvent,
  requestScreenActionFollowUp,
  requestEscalation,
  sendMessage,
  updateMessengerSkin,
  type MessengerAttachment,
  type MockScreenEvent,
  type MockScreenKind,
} from "@/lib/api";
import { resolveSessionEscalation, scenarios, type ScenarioDoc } from "@/content/scenarios";
import { detectDeviceSkin, type MessengerSkin } from "@/lib/messenger/detectSkin";
// T190-6(docs/Architecture.md §74.5 · 표 K · UX-022 v1.33) — 통화·문자함과 **같은 해석 함수**(한 세션 = 한 스킨).
import {
  DEVICE_SKIN_STORAGE_KEY,
  parseSessionSkin,
  parseStoredDeviceSkin,
  readUaModelHint,
  resolveDeviceSkin,
  serializeStoredDeviceSkin,
  type DeviceSkin,
} from "@/lib/phone/deviceSkin";
import { MESSENGER_CHAT_TOKENS, messengerSmsTokensFor, smsThreadTokensFor } from "@/lib/phone/skinTokens";
import PhoneIcon from "@/components/PhoneIcon";
import EndTrainingButton from "@/components/EndTrainingButton";
import MessengerFakeLanding from "@/components/MessengerFakeLanding";
import MessengerProfileSheet from "@/components/MessengerProfileSheet";
import VoiceTalkDialScreen from "@/components/VoiceTalkDialScreen";
import MessengerStartNotice from "@/components/MessengerStartNotice";
import { closePrimedCallAudio, primeCallAudio } from "@/lib/realtime/callAudio";
import { GEMINI_OUTPUT_SAMPLE_RATE } from "@/lib/realtime/pcm";
import { clearVoiceTalkDial, refreshVoiceTalkDial, stashVoiceTalkDial } from "@/lib/messenger/voiceTalkDial";
import { attachQueuedPhotos, sessionPhotoStore } from "@/lib/messenger/sessionPhotos";
import { Button, LoadingStatus } from "@/components/ui";
import { foldDegraded, DIALOGUE_DEGRADED_NOTICE } from "@/lib/report/degradedDisclosure";
import { chatInputHeight } from "@/lib/messenger/chatInputHeight";
import { withJosa } from "@/lib/text/josa";
import {
  CALL_SEGMENT_ICON,
  CALL_SEGMENT_LINE,
  VOICE_TALK_RECORD_NOTE,
  VOICE_TALK_RECORD_TITLE,
  foldCallSegments,
} from "@/lib/messenger/threadItems";
import {
  nextChangeAt,
  noteServerDone,
  noteSnapshot,
  viewReply,
  type PendingTurn,
} from "@/lib/messenger/replyChoreography";
import { chatBoxStyle, isNearBottom, TRAINING_INPUT_NO_SUGGEST } from "@/lib/messenger/keyboardViewport";
import { useKeyboardViewport } from "@/lib/messenger/useKeyboardViewport";
import {
  decideMessengerStartNotice,
  type MessengerStartNoticeState,
} from "@/lib/sessionboundary/startNoticeGate";

type PageState = "checking" | "ready" | "no-session" | "scenario-not-found" | "load-error";
// detectSkin.ts의 MessengerSkinSource는 auto|fallback만 다룬다(자동 감지 결과 타입) — 이 화면은
// 수동 전환(manual)까지 다루므로 로컬에서 더 넓은 유니언을 쓴다(P-16, AC-031).
type SkinSourceState = "auto" | "manual" | "fallback";

type ChatMessage = {
  id: string;
  role: "scammer" | "user";
  text: string;
  turnIndex: number;
  attachments?: MessengerAttachment[];
  // 2026-10-20 실기 신고 — 통화 구간(`"voice"`)은 말풍선이 아니라 통화 줄로 접는다(`lib/messenger/threadItems.ts`).
  channel?: string;
  /** §89.5 ⓐ — 말풍선 옆 시각(문서 `createdAt`). 없으면 시각을 그리지 않는다. */
  createdAtMs?: number;
  /** §113.2 — 사진 턴(서버 문서 `photo` · 낙관적 말풍선). 이미지는 `photoUrl`(이 화면 메모리의 objectURL)에만 있다. */
  photo?: boolean;
  photoUrl?: string;
};

// ⛔ T190-6b(UX D-100 · PRD AC-092 (d) · AC-031 읽기 고지) — 세션 중 스킨 전환 칩(`SKIN_CYCLE`/`SKIN_LABEL`)과
// 감지 실패 안내 줄을 없앴다. 수동 선택은 **세션 전** `start-notice`의 화면 모양 줄(DeviceSkinPicker)이 맡는다.

/**
 * §89.5 ⓐ(UX D-132 (5) ⓐ) — 메신저형(카카오 표면) 말풍선: 테두리 없음 · 상대 연속의 첫 말풍선만 왼쪽 위 꼬리 ·
 * 내 연속의 첫 말풍선만 오른쪽 위 꼬리. 색 = `MESSENGER_CHAT_TOKENS`(추정값은 `ESTIMATED_DEVICE_COLORS` 한 곳).
 */
function kakaoBubbleStyle(role: "scammer" | "user", firstOfRun: boolean): React.CSSProperties {
  const t = MESSENGER_CHAT_TOKENS;
  const tail = firstOfRun ? 4 : 14;
  return role === "user"
    ? { backgroundColor: t.outgoingBg, color: t.outgoingText, borderRadius: `14px ${tail}px 14px 14px` }
    : { backgroundColor: t.incomingBg, color: t.incomingText, borderRadius: `${tail}px 14px 14px 14px` };
}

/**
 * T190-6(UX-022 v1.33 (2)) — 문자형 표면 말풍선 모양(스킨 토큰 · UX v1.33 근사). 색만이 아니라 모서리·꼬리까지 스킨이
 * 정한다. 외형뿐 — 어떤 안전 판정도 게이팅하지 않는다(§13.4/13.5).
 */
function smsBubbleStyle(role: "scammer" | "user", skin: MessengerSkin): React.CSSProperties {
  const t = messengerSmsTokensFor(skin);
  const r = t.radiusPx;
  const tail = t.tailRadiusPx;
  if (role === "user") {
    return { backgroundColor: t.outgoingBg, color: t.outgoingText, borderRadius: `${r}px ${r}px ${tail}px ${r}px` };
  }
  return {
    backgroundColor: t.incomingBg,
    color: t.incomingText,
    borderRadius: `${r}px ${r}px ${r}px ${tail}px`,
    border: t.incomingBorder ? `1px solid ${t.incomingBorder}` : undefined,
  };
}

/**
 * 전송 처리기 안의 현재 시각. ⚠️ react-hooks/purity가 `handleSend`(실패 말풍선의 "다시 보내기" 등 여러 곳에서 부르는 처리기)를
 * 렌더 경로로 오인해 `Date.now()`를 막는다 — 렌더 중에는 부르지 않는다(처리기 · 타이머 · 구독 콜백 전용).
 */
const wallClockMs = () => Date.now();

/** §113.2 — 사진 말풍선 대체 글(낙관적 턴의 `text` · 스크린리더). 서버 표기는 `PHOTO_TURN_TEXT`(functions). */
const PHOTO_BUBBLE_LABEL = "사진";

/**
 * §113.2(UX D-151 (2)) — 사진 말풍선. 이미지는 이 화면 메모리(objectURL)에만 있다 — 새로고침 · 다시 들어오면 URL이 없어 빈 사진 칸을 그린다.
 * ⛔ 안내 문구 0(사용자 결정).
 */
function PhotoBubble({ url }: { url: string | undefined }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- 기기 메모리 objectURL(정적 export · 최적화 대상 아님)
    <img src={url} alt="보낸 사진" className="max-h-[260px] max-w-[220px] rounded-[12px] object-cover" />
  ) : (
    <span
      role="img"
      aria-label="보낸 사진"
      className="flex h-[140px] w-[140px] items-center justify-center rounded-[12px] bg-black/10 text-[15px] text-black/50"
    >
      {PHOTO_BUBBLE_LABEL}
    </span>
  );
}
// 실기 신고 4 — 보이스톡 응답 없음 연출 길이(훈련용으로 줄였다 — 실제 앱은 수십 초 울린다).
const VOICE_TALK_RING_MS = 6000;
const VOICE_TALK_UNANSWERED_MS = 2000;
// §128(3)(UX D-159) — 통화 중 대화방에서 사기범이 포기하고 나갔을 때 "나갔습니다"를 보여 주고 통화를 끝내기까지의 시간.
const SCAMMER_LEFT_CALL_END_MS = 2500;

/**
 * §121.7 PR-3(메인 결정 ⓑ "채팅으로 = 통화 유지") — 통화 화면이 이 대화방을 통화 위에 겹쳐 그릴 때 넘기는 연결. 없으면 종전 라우트 화면.
 * | 있음 | 동작 |
 * |---|---|
 * | 시작 고지 | 건너뜀(이미 대화 중) |
 * | 맨 위 | "통화 중 00:42" 배너 — 누르면 통화 화면 |
 * | 보내기 | 직전에 `beforeSend`(통화 전사 제출 — 새로 쓴 문서 수) → `sendMessage({ duringCall: true })` → `onChatTurn` |
 * | 보이스톡 · "전화로 확인" | 숨김(이미 통화 중) |
 * | 훈련 종료 | `onEndTraining`(통화 화면의 종료 순서 — 전사 제출 포함) |
 * | 사기범이 포기하고 나감(§128(3) — 서버 `scammer_ended`) | "나갔습니다"를 보인 뒤 `SCAMMER_LEFT_CALL_END_MS`에 `onScammerLeft`(통화도 끊기고 결과로) |
 */
export type ChatRoomCallLink = {
  elapsedLabel: string;
  onBackToCall: () => void;
  beforeSend: () => Promise<number>;
  onChatTurn: (userText: string, replyText: string) => void;
  onEndTraining: () => void;
  /** §128(3) — 사기범이 통화 중 카톡에서 포기하고 나갔다(서버가 세션을 이미 끝냈다) — 통화를 끝내고 결과로 간다. */
  onScammerLeft: () => void;
};

export default function MessengerChatRoom({ duringCall }: { duringCall?: ChatRoomCallLink } = {}) {
  const inCall = duringCall !== undefined;
  const router = useRouter();
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [pageState, setPageState] = useState<PageState>(sessionId ? "checking" : "no-session");
  const [scenario, setScenario] = useState<ScenarioDoc | null>(null);
  // T194-a(Architecture.md §84.4.1 C-2 · C-3 · UX D-124 ② · PRD AC-106 (i)) — 이 세션이 통화로 이어질 수 있는가. 세션 문서의
  // `difficultyLevel` · `challengeId`로 (시나리오 × 난이도) 술어를 푼 값이다 — 시작 고지 열("메시지와 전화")과 "전화로 확인" 버튼이
  // **이 값 하나**를 쓴다(서버 requestEscalation · sendMessage 자동 전이와 같은 술어 — G462 ⑤). 택배 문자는 고급 세션만 참.
  const [sessionEscalates, setSessionEscalates] = useState(false);
  // T187(docs/Architecture.md §72.5 D2 · UX-022 `start-notice` N-1~N-4 · AC-088) — 시작 전 고지
  // 상태. 세션 로드 effect가 순수 함수 `decideMessengerStartNotice`로 정한다. "skip"이 되기 전에는
  // 대화 목록을 구독하지 않는다(아래 구독 effect의 가드 — 첫 메시지 렌더 0이 구조로 성립).
  const [startNotice, setStartNotice] = useState<MessengerStartNoticeState>("pending");
  // T158(§48.5.1, AC-084, P-31) — 대사 축 강등 관측. sticky OR-fold, false로 되돌리는 대입 0건
  // (G278). 마운트 시 `sessions/{sid}.llmProvider` + 매 턴 `SendMessageResponse.isMock`의 합.
  const [dialogueDegraded, setDialogueDegraded] = useState(false);
  const [ended, setEnded] = useState(false);
  // §112 — 이미 끝난 세션을 열었을 때 사기범이 끝낸 것인가(세션 `endReason === "scammer_ended"` — 예: 목표를 이루고 통화를 끊고 돌아옴).
  const [endedByScammer, setEndedByScammer] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  // 실기 신고(2026-10-21 · UX D-137 · §94) — 보낸 한 턴의 연출 상태(낙관적 말풍선 · "1" · 입력 중 · 답장 공개 시각).
  // 화면은 `viewReply(pending, messages, clock)` 결과만 그린다. `clock`은 단계가 바뀌는 시각에만 타이머가 올린다.
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [clock, setClock] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [messengerSkin, setMessengerSkin] = useState<MessengerSkin>("default");
  const [skinSource, setSkinSource] = useState<SkinSourceState>("fallback");
  // T84 — 열린 목업의 종류(landingKind)는 **서버가 attachment에 실어 준 값**을 그대로 들고 온다
  // (클라가 fakeLandingId 문자열을 분류하지 않는다 — §15.9.1 R3, AC-024 원칙 계승).
  const [fakeLanding, setFakeLanding] = useState<{
    fakeLandingId: string;
    displayText: string;
    landingKind?: MockScreenKind;
  } | null>(null);
  // T30 — 에스컬레이션 전이 연출(P-18) 표시 중. true가 되면 잠시 후 /session/play로 이동한다.
  const [escalating, setEscalating] = useState(false);
  const [escalationError, setEscalationError] = useState<string | null>(null);
  // §95(UX D-138) — 카톡형 상대 프로필 시트(이름 · 프로필 사진 탭). "보이스톡"(= 전화로 확인) · "훈련 종료"를 담는다.
  const [profileOpen, setProfileOpen] = useState(false);
  // 실기 신고 4(2026-10-21) — 통화로 이어지지 않는 카톡형 세션의 "보이스톡": 신호음 → 응답 없음(사기범이 받지 않는다).
  const [voiceTalkCall, setVoiceTalkCall] = useState<"ringing" | "unanswered" | null>(null);
  // 응답 없음 메시지의 turnIndex — 다음 전송의 답장 기준점 하한(구독이 늦어도 이 메시지를 답장으로 오인하지 않는다).
  const voiceTalkFloorRef = useRef(-1);
  // §121(1) — 사용자가 보이스톡을 거는 중(통화로 이어지는 세션 · 전환 요청 → 통화 화면 발신 연출로 이동하기 전까지).
  const [dialingVoiceTalk, setDialingVoiceTalk] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // §130(UX D-161 (14)) — 입력칸은 한 줄(48px)로 시작해 내용만큼 늘고 4줄에서 멈춘다(chatInputHeight.ts 표). 높이를 `auto`로 되돌려 잰 뒤 정한다.
  useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${chatInputHeight(box.scrollHeight)}px`;
  }, [input]);
  // §113.2(실기 신고 9 · UX D-151 (2)) — 사진 보내기. ⛔ 이미지는 기기 메모리(objectURL)에만 둔다 — 서버 업로드 · Storage · Firestore ·
  // 로그 0. 서버에는 "사진을 보냈다"는 사실만 간다(`sendMessage({photo: true})`).
  // §128(6) — URL은 이 컴포넌트가 아니라 세션 단위 화면 메모리(`sessionPhotos.ts`)에 둔다: 통화 전환 · 통화 겹침으로 대화방이 다시 그려져도
  // 보낸 사진이 그대로 보인다. 정리(revoke)는 다른 세션을 열 때 · 훈련 종료 화면에서 한다(언마운트마다 하지 않는다).
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>(() =>
    sessionId ? { ...sessionPhotoStore(sessionId).byTurn } : {},
  );
  // T187(UX-022 v1.29 노트 (5)) — "메시지 보기" 뒤 포커스는 대화 목록으로(입력창 자동 포커스 ⛔).
  const messageListRef = useRef<HTMLUListElement | null>(null);
  const focusListAfterNoticeRef = useRef(false);
  // §95(UX D-138 · 실기 신고 9) — 대화방은 "보이는 영역"(키보드 위)을 꽉 채우는 고정 상자이고 대화 목록만 안에서 스크롤한다.
  // 머리줄은 상자 맨 위에 남고, 키보드가 열리면 목록만 줄어든다(판정표 `lib/messenger/keyboardViewport.ts`).
  const keyboardBox = useKeyboardViewport(pageState === "ready" && startNotice === "skip");
  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  // 사용자가 위로 올려 지난 대화를 읽는 중이면 끌어내리지 않는다(맨 아래 근처일 때만 따라 내려간다).
  const stickToBottomRef = useRef(true);

  // 세션·시나리오 로드 + (문자형이면) 스킨 결정. session/play/page.tsx와 동일하게 인라인 async
  // IIFE로 감싼다(react-hooks/set-state-in-effect 회피 관례).
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
        if (!found || found.channel !== "messenger") {
          setPageState("scenario-not-found");
          return;
        }
        setScenario(found);
        setSessionEscalates(
          resolveSessionEscalation(
            { scenarioId: scenarioId as string, difficultyLevel: data.difficultyLevel, challengeId: data.challengeId },
            scenarios,
          ) !== undefined,
        );
        // T187(§72 · M-13) — 세션 중 난이도 배지를 지워 난이도 읽기도 함께 걷었다(표기 전용이었다 —
        // 난이도 반영은 서버 sendMessage 조립이 하므로 동작 변화 0).
        // T187(§72.5 D2) — 시작 전 고지 판정. 확인 기록은 이 탭 sessionStorage(다른 키 — G450),
        // 통화 "받기" 기록은 **읽기만**(역방향 도착 N-2).
        setStartNotice(
          // §121.7 — 통화 위에 겹친 대화방은 이미 대화 중이다(고지 생략).
          inCall ? "skip" : decideMessengerStartNotice({
            acknowledged: isStartNoticeAcknowledged(sessionId),
            answeredInThisTab: isSessionAnswered(sessionId),
            sessionEnded: data.status === "ended",
          }),
        );
        // T158(§48.5.1) — 마운트 시 관측(OR-fold 첫 항). `foldDegraded`가 sticky를 보장한다.
        setDialogueDegraded((current) => foldDegraded(current, data.llmProvider === "mock"));
        if (data.status === "ended") {
          setEnded(true);
          setEndedByScammer(data.endReason === "scammer_ended");
        }

        if (found.surface === "sms") {
          // T190-6(§74.3 표 K · §74.5) — 세션 문서(새로고침 복원·이전 선택) > 이 기기의 수동 선택 > 감지 규칙표 v2.
          const sessionSkin = parseSessionSkin(data.messengerSkin, data.skinSource);
          if (sessionSkin) {
            // 이미 결정된 스킨이 있다(새로고침 복원 또는 이전 선택, P-16) — 재감지하지 않는다.
            setMessengerSkin(sessionSkin.skin);
            setSkinSource(sessionSkin.source);
          } else {
            let storedSkin: DeviceSkin | null = null;
            try {
              storedSkin = parseStoredDeviceSkin(window.localStorage.getItem(DEVICE_SKIN_STORAGE_KEY));
            } catch {
              storedSkin = null; // 저장소 접근 불가 = "선택 없음"(§74.5 (3))
            }
            const uaModel = await readUaModelHint(typeof navigator === "undefined" ? undefined : navigator);
            if (cancelled) return;
            const resolved = resolveDeviceSkin({
              session: null,
              stored: storedSkin,
              detected: detectDeviceSkin({
                userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
                maxTouchPoints: typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0,
                uaModel,
              }),
            });
            setMessengerSkin(resolved.skin);
            setSkinSource(resolved.source);
            // 세션 문서에 지속(P-16 · 이어지는 통화가 같은 값을 쓴다 — AC-092 (b)) — 실패해도 화면 표시는 이미
            // 로컬 state로 끝났다(비차단). 기존 콜러블 계약 그대로(§74.5 (2)).
            updateMessengerSkin({
              sessionId,
              messengerSkin: resolved.skin,
              skinSource: resolved.source,
            }).catch(() => {});
          }
        }
        setPageState("ready");
      } catch {
        if (!cancelled) setPageState("load-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, inCall]);

  // 대화 로그 구독 — T187(§72.5 D2 · AC-088 (b)) 시작 전 고지를 확인("skip")하기 전에는 구독하지
  // 않는다. 통화 화면의 "받기 전에는 구독하지 않는다"와 같은 규칙이다(오프닝 메시지는 createSession
  // 시점에 이미 문서에 있으므로 — §72.4 ② — 구독을 미루는 것만으로 첫 메시지 렌더 0이 성립한다).
  useEffect(() => {
    if (!sessionId || pageState !== "ready" || startNotice !== "skip") return;
    const messagesQuery = query(
      collection(db, "sessions", sessionId, "messages"),
      orderBy("turnIndex", "asc"),
    );
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const next: ChatMessage[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            role: data.role as "scammer" | "user",
            text: data.textMasked as string,
            turnIndex: data.turnIndex as number,
            attachments: data.attachments as MessengerAttachment[] | undefined,
            channel: data.channel as string | undefined,
            createdAtMs: (data.createdAt as Timestamp | undefined)?.toMillis?.(),
            photo: data.photo === true,
          };
        });
      setMessages(next);
      // §113.2 — 이 화면에서 보낸 사진(objectURL)을 서버의 사진 턴 문서에 붙인다(보낸 순서 · 보낸 시점 이후 문서만 — 새로고침 전 사진 턴은 빈 칸).
      const store = sessionPhotoStore(sessionId);
      const photoTurns = next.filter((m) => m.photo && m.role === "user").map((m) => m.turnIndex);
      if (attachQueuedPhotos(store, photoTurns)) setPhotoUrls({ ...store.byTurn });
      // §94 — 답장 문서가 서버 응답보다 먼저 올 수 있다. 처음 보인 시각을 "답을 안 시각"으로 적는다(공개는 연출 뒤).
      setPending((current) => (current ? noteSnapshot(current, next, Date.now()) : current));
    });
    return unsubscribe;
  }, [sessionId, pageState, startNotice]);

  // T187(UX-022 v1.29 노트 (5)) — "메시지 보기"를 누른 직후 1회만 대화 목록에 포커스를 둔다.
  useEffect(() => {
    if (startNotice !== "skip" || !focusListAfterNoticeRef.current) return;
    focusListAfterNoticeRef.current = false;
    messageListRef.current?.focus();
  }, [startNotice]);

  // §94 — 연출 단계가 바뀌는 시각(읽음 · 입력 중 · 공개 · 문서 여유)에만 시계를 올린다(상시 폴링 0).
  useEffect(() => {
    if (!pending) return;
    const at = nextChangeAt(pending, clock);
    if (at === null) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.max(0, at - Date.now()));
    return () => clearTimeout(timer);
  }, [pending, clock]);

  const replyView = viewReply(pending, messages, clock);
  // §94 — 종료 · 통화 전환은 답장이 보인 **뒤에** 적용한다(답장 없이 화면이 바뀌지 않게).
  // ⚠️ 불변식(리뷰 M3): 결과(outcome)가 있는 pending은 교체 · 삭제되지 않는다 — 새 전송은 `turnLocked`가 막고, "삭제"는 실패 말풍선
  // (서버 실패 = outcome 없음)에만 있다. 이 둘을 바꾸면 종료 · 통화 전환이 사라질 수 있다.
  const chatEnded = ended || (replyView.settled && pending?.outcome?.ended === true);
  // §128(3) — 통화 위 대화방에서 사기범이 나갔다(답장 공개 뒤). 잠시 "나갔습니다"를 보인 뒤 통화 화면의 종료 순서로 넘긴다.
  const scammerLeftDuringCall = inCall && chatEnded && pending?.outcome?.scammerEnded === true;
  const duringCallRef = useRef(duringCall);
  useEffect(() => {
    duringCallRef.current = duringCall;
  });
  useEffect(() => {
    if (!scammerLeftDuringCall) return;
    const timer = setTimeout(() => duringCallRef.current?.onScammerLeft(), SCAMMER_LEFT_CALL_END_MS);
    return () => clearTimeout(timer);
  }, [scammerLeftDuringCall]);
  const escalatingNow = escalating || (replyView.settled && pending?.outcome?.escalate === true);
  const turnLocked = replyView.inFlight || pending?.outcome?.ended === true || pending?.outcome?.escalate === true;

  // 사용자 신고(2026-07-24) — 새 메시지가 오거나(상대 응답) 내가 보내서 "입력 중" 표시가 뜰 때마다
  // 맨 아래로 스크롤한다. §95 — 스크롤 주체는 문서가 아니라 대화 목록 상자다(scrollIntoView는 문서까지 끌어올릴 수 있어 쓰지 않는다).
  // 내가 보낸 직후(낙관적 말풍선)는 위로 올려 둔 상태여도 맨 아래로 간다(실제 메신저와 같다).
  useEffect(() => {
    if (replyView.showOptimistic) stickToBottomRef.current = true;
    const box = scrollBoxRef.current;
    if (box && stickToBottomRef.current) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [messages, replyView.showOptimistic, replyView.showTyping, replyView.hideReply]);

  // §95 — 키보드가 열리고 닫혀 목록 높이가 바뀌면, 맨 아래에 붙어 있던 경우 마지막 메시지를 입력줄 바로 위에 다시 둔다(애니메이션 없이).
  useEffect(() => {
    const box = scrollBoxRef.current;
    if (box && stickToBottomRef.current) box.scrollTop = box.scrollHeight;
  }, [keyboardBox?.heightPx]);

  // §94(UX D-137) — 전송 즉시 내 말풍선을 올린다(낙관적 표시 · "1"). 서버 응답을 기다리지 않는다.
  // ⚠️ 서버는 한 번에 한 턴만 처리한다(턴 확보 트랜잭션 — functions/src/roleplay/index.ts) ⇒ 서버 호출 중에는 전송 버튼만
  // 잠그고 입력칸은 열어 둔다(키보드가 닫히지 않게). 서버가 끝난 뒤 연출 중에 보내면 앞 답장은 바로 보인다.
  const handleSend = async (retryText?: string, photoUrl?: string) => {
    const text = photoUrl ? PHOTO_BUBBLE_LABEL : (retryText ?? input).trim();
    if (!sessionId || !text || turnLocked || chatEnded || escalatingNow) return;
    const now = wallClockMs();
    const turn: PendingTurn = {
      localId: `local-${now}`,
      text,
      sentAtMs: now,
      // 리뷰 M2 — 앞 턴 답장 문서가 아직 구독에 안 왔어도 그 답장을 이번 턴 답으로 오인하지 않게, 앞 턴이 서버에서 끝났으면
      // 그 턴이 쓴 문서(내 1 + 답 0~1)까지를 기준으로 삼는다.
      baseTurnIndex: Math.max(
        messages.reduce((max, m) => Math.max(max, m.turnIndex), -1),
        pending?.serverDone ? pending.baseTurnIndex + ((pending.replyLength ?? 0) > 0 ? 2 : 1) : -1,
        voiceTalkFloorRef.current,
      ),
    };
    setPending(photoUrl ? { ...turn, photoUrl } : turn);
    setClock(now);
    setSendError(null);
    if (retryText === undefined && !photoUrl) setInput("");
    try {
      // §121.7 — 통화 중이면 보내기 직전에 그때까지의 통화 전사를 먼저 제출한다(사기범이 통화 내용을 안다). 전사 문서는 이 턴의 내
      // 글 앞에 붙으므로 기준점을 그만큼 올린다(전사를 답장으로 오인하지 않게).
      const transcriptWritten = duringCall ? await duringCall.beforeSend().catch(() => 0) : 0;
      const baseTurnIndex = turn.baseTurnIndex + transcriptWritten;
      if (transcriptWritten > 0) {
        setPending((current) => (current?.localId === turn.localId ? { ...current, baseTurnIndex } : current));
      }
      if (photoUrl) sessionPhotoStore(sessionId).queue.push({ url: photoUrl, minTurnIndex: baseTurnIndex + 1 });
      const result = await sendMessage({
        sessionId,
        userText: photoUrl ? "" : text,
        ...(photoUrl ? { photo: true } : {}),
        ...(inCall ? { duringCall: true } : {}),
      });
      if (duringCall && result.reply?.text) duringCall.onChatTurn(text, result.reply.text);
      // T158(§48.5.1) — OR-fold 두 번째 항.
      setDialogueDegraded((current) => foldDegraded(current, result.isMock));
      // T30(§13.2) — 자동 신호든 max-turn 폴백이든, 서버가 이미 transitionChannel을 마쳤다는
      // 뜻이다. 클라는 이 플래그만 보고 전이 연출로 넘어간다(자유텍스트 직접 분류 안 함).
      // §94 — 적용 시점만 답장 공개 뒤로 미룬다(`escalatingNow` · `chatEnded`).
      setPending((current) =>
        current?.localId === turn.localId
          ? noteServerDone(
              current,
              result.reply?.text,
              {
                ended: result.ended,
                escalate: result.escalation?.toChannel === "voice",
                // §104.9 — 사기범이 메신저 단계를 끝냈다(종료 문구 E-1/E-2).
                scammerEnded: result.ended === true && result.endReason === "scammer_ended",
              },
              Date.now(),
            )
          : current,
      );
      setClock(wallClockMs());
    } catch {
      // §113.2 — 실패한 사진은 대기열에서 뺀다(다시 보내기가 같은 URL로 다시 넣는다).
      if (photoUrl) {
        const queue = sessionPhotoStore(sessionId).queue;
        const at = queue.findIndex((entry) => entry.url === photoUrl);
        if (at >= 0) queue.splice(at, 1);
      }
      setPending((current) => (current?.localId === turn.localId ? { ...current, failed: true } : current));
      setSendError("메시지를 보내지 못했습니다. 다시 시도해 주세요.");
    }
    // 실기 신고 5(2026-10-21) — 응답이 온 뒤 입력칸에 포커스를 되돌리지 않는다(키보드는 사용자가 입력칸을 눌렀을 때만 올라온다).
    // 입력 중에 보낸 경우 키보드가 닫히지 않는 것은 전송 버튼의 `onPointerDown`(포커스를 옮기지 않음)이 맡는다.
  };

  // 명시 전환 버튼("전화로 확인", §13.3 — 1턴부터 상시). 서버가 즉시 transitionChannel(manual_button)
  // 을 수행하고 확인 플래그를 돌려주면 handleSend와 동일한 전이 연출로 넘어간다.
  const handleRequestEscalation = async () => {
    if (!sessionId || escalatingNow || chatEnded) return;
    setEscalationError(null);
    try {
      const result = await requestEscalation({ sessionId });
      if ("escalation" in result && result.escalation.toChannel === "voice") {
        setEscalating(true);
      }
    } catch {
      setEscalationError("통화 연결을 요청하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  // 실기 신고 4(2026-10-21) — 통화로 이어지지 않는 카톡형 세션의 "보이스톡". 실제 지인 사칭범처럼 받지 않는다:
  // 신호음(VOICE_TALK_RING_MS) → "상대방이 응답하지 않습니다"(VOICE_TALK_UNANSWERED_MS) → 대화방. 응답 없음이 뜨는 순간 서버가
  // 사기범 메시지 1건("지금 통화 못 받아, 톡으로 하자" 류)을 남긴다. 신호음 중 취소하면 아무것도 남기지 않는다.
  const handleVoiceTalkUnanswered = () => {
    if (!sessionId || chatEnded || voiceTalkCall !== null) return;
    setEscalationError(null);
    setVoiceTalkCall("ringing");
  };
  useEffect(() => {
    if (voiceTalkCall === null || !sessionId) return;
    if (voiceTalkCall === "ringing") {
      const timer = setTimeout(() => {
        setVoiceTalkCall("unanswered");
        requestEscalation({ sessionId, via: "voice_talk" })
          .then((result) => {
            if ("voiceTalk" in result) voiceTalkFloorRef.current = Math.max(voiceTalkFloorRef.current, result.turnIndex);
          })
          .catch(() => setEscalationError("보이스톡을 걸지 못했습니다. 다시 시도해 주세요."));
      }, VOICE_TALK_RING_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setVoiceTalkCall(null), VOICE_TALK_UNANSWERED_MS);
    return () => clearTimeout(timer);
  }, [voiceTalkCall, sessionId]);

  // §121(1)(UX D-154) — 사용자가 보이스톡을 거는 경우(통화로 이어지는 세션 · `voiceTalkDial.ts` 표 2행). ⭐ 통화 오디오를 **이 탭 안에서
  // 동기로** 준비해 맡긴다(첫 await 앞 — 받기 탭과 같은 이유 · §57 수정안 A). 전환이 되면 곧바로 통화 화면으로 가고, 통화 화면이 발신 연출
  // (연결음 · 취소) 뒤 "상대가 받음"으로 통화를 시작한다. "전화가 옵니다" 연출은 사기범이 거는 경우에만 남는다.
  const handleVoiceTalkDial = async () => {
    if (!sessionId || escalatingNow || chatEnded || dialingVoiceTalk) return;
    setEscalationError(null);
    const audio = primeCallAudio(GEMINI_OUTPUT_SAMPLE_RATE, performance.now());
    stashVoiceTalkDial({ sessionId, audio, atMs: Date.now() });
    setDialingVoiceTalk(true);
    try {
      // §123 — 참가자가 건 통화로 기록한다(통화 첫마디 · Live 맥락이 "네가 전화했다"고 말하지 않게).
      const result = await requestEscalation({ sessionId, via: "voice_talk_dial" });
      if ("escalation" in result && result.escalation.toChannel === "voice") {
        // §130.6(N1) — 유효 시간은 통화 화면으로 넘어가는 지금부터(전환 요청이 30초를 넘겨도 발신 화면이 이어진다).
        refreshVoiceTalkDial(sessionId, Date.now());
        router.push("/session/play");
        return;
      }
      throw new Error("전환 응답 없음");
    } catch {
      clearVoiceTalkDial();
      closePrimedCallAudio(audio);
      setDialingVoiceTalk(false);
      setEscalationError("보이스톡을 걸지 못했습니다. 다시 시도해 주세요.");
    }
  };

  // 전이 연출(P-18) — "사기범이 전화를 거는" 화면을 잠시 보여준 뒤 UX-014 수신 phase로 이음새
  // 없이 인계한다(/session/play는 이미 phase 기본값이 incoming이라 그대로 진입한다).
  useEffect(() => {
    if (!escalatingNow) return;
    const timer = setTimeout(() => router.push("/session/play"), 1500);
    return () => clearTimeout(timer);
  }, [escalatingNow, router]);

  // T190-6(§74.10 (2) · D-100) — 세션 전 화면 모양 줄에서 고른 값. ① 화면 상태 ② 기존 `updateMessengerSkin(manual)`
  // ③ 기기 저장(`fv.deviceSkin.v1` — 다음 세션·통화의 표 K K-2). 쓰는 곳은 이 1곳뿐이다(§74.5 (3)).
  const handleChooseSkin = (next: "ios" | "samsung") => {
    setMessengerSkin(next);
    setSkinSource("manual");
    if (sessionId) {
      updateMessengerSkin({ sessionId, messengerSkin: next, skinSource: "manual" }).catch(() => {});
    }
    try {
      window.localStorage.setItem(DEVICE_SKIN_STORAGE_KEY, serializeStoredDeviceSkin(next, Date.now()));
    } catch {
      // 저장소를 쓸 수 없으면 이번 세션 값만 남는다(비차단).
    }
  };

  const handleEndTraining = () => {
    // §121.7 — 통화 위 대화방이면 통화 화면의 종료 순서(전사 제출 → 종료)를 탄다.
    if (duringCall) {
      duringCall.onEndTraining();
      return;
    }
    router.push("/session/end");
  };

  // T187(§72.5 D2) — 시작 전 고지 확인. 기록은 새 키(`markStartNoticeAcknowledged`)에만 쓴다 —
  // ⛔ `markSessionAnswered`를 쓰면 메신저→통화 에스컬레이션이 벨 화면 프리롤을 건너뛴다(G450).
  const handleConfirmStartNotice = () => {
    if (sessionId) markStartNoticeAcknowledged(sessionId);
    focusListAfterNoticeRef.current = true;
    setStartNotice("skip");
  };

  // T84(§15.9.6/§15.9.7 G56) — 모의 화면 상호작용 기록. **핵심 루프를 막지 않는다**(오버레이는
  // 정상 열리고 닫히며 대화도 계속된다). 다만 **조용히 삼키지 않는다**: 이 write가 유실되면 그
  // 순간이 리포트에서 통째로 사라져 "참가자는 속았는데 리포트는 속지 않았다고 말하는" 상태가
  // 되므로(AC-008/009 오판정), 1회 재시도하고 실패는 콘솔 경고로 남긴다.
  // ⚠️ 이 호출은 **페이지**가 한다 — `MessengerFakeLanding`은 콜백만 올린다(그 파일의 "네트워크
  // 경로 부재" 불변식 유지, AC-045/AC-072).
  // §128(7) — 설치 응낙 · 입력 제출이 기록되면 사기범이 먼저 메시지 1건을 보낸다(서버 `screenActionFollowUp.ts` 판정표 — 메시지는 구독이
  // 그린다). 통화 겹침 중에는 부르지 않는다(통화 쪽이 진행을 쥔다 — 서버도 메신저 단계가 아니면 저장 0). 실패는 조용히 넘긴다(다음 참가자
  // 턴이 종전대로 응낙 지시를 싣는다). 대사가 전화를 예고해 서버가 전환했으면 "전화가 옵니다" 연출로 간다.
  const requestFollowUpAfterScreen = (landingId: string) => {
    if (!sessionId || inCall) return;
    void requestScreenActionFollowUp({ sessionId, landingId })
      .then((result) => {
        if (result.turnIndex !== undefined) voiceTalkFloorRef.current = Math.max(voiceTalkFloorRef.current, result.turnIndex);
        if (result.escalation?.toChannel === "voice") setEscalating(true);
      })
      .catch(() => {});
  };
  const recordMockScreen = (landingId: string, event: MockScreenEvent) => {
    if (!sessionId) return;
    const followUp = event === "consented" || event === "submitted";
    void (async () => {
      try {
        await recordMockScreenEvent({ sessionId, landingId, event });
        if (followUp) requestFollowUpAfterScreen(landingId);
      } catch {
        try {
          await recordMockScreenEvent({ sessionId, landingId, event });
          if (followUp) requestFollowUpAfterScreen(landingId);
        } catch (err) {
          // T187(G437) — 개발자 콘솔 문자열이지만 렌더 가능 리터럴 축은 호출 맥락을 가리지 않으므로
          // 표식 낱말을 쓰지 않는다("모의" → "목업"). 동작 변화 0.
          console.warn("[T84] 목업 화면 이벤트 기록 실패(비차단 — 훈련은 계속됩니다)", {
            landingId,
            event,
            err,
          });
        }
      }
    })();
  };

  if (pageState === "no-session" || pageState === "scenario-not-found" || pageState === "load-error") {
    const message =
      pageState === "no-session"
        ? "진행 중인 세션 정보를 찾을 수 없습니다. 시나리오 선택부터 다시 진행해 주세요."
        : pageState === "scenario-not-found"
          ? "선택된 메신저 시나리오 정보를 찾을 수 없습니다. 시나리오를 다시 선택해 주세요."
          : "채팅 정보를 불러오지 못했습니다. 다시 시도해 주세요.";
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-danger">
          <span aria-hidden="true">⚠</span>
          <span>{message}</span>
        </p>
        <div className="w-full max-w-xs">
          <Button variant="secondary" type="button" onClick={() => router.push("/scenarios/messenger")}>
            시나리오 선택으로
          </Button>
        </div>
      </main>
    );
  }

  if (pageState !== "ready" || !scenario || startNotice === "pending") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page p-8 text-center">
        <LoadingStatus label="채팅을 불러오는 중입니다" />
      </main>
    );
  }

  const surface = scenario.surface ?? "sms";
  // T190-6(UX-022 v1.33) — 문자형 표면의 화면 문법 토큰(UX v1.33 근사 — 실기 측정 전 · 대비 하한 G456).
  const isSms = surface === "sms";
  const smsTokens = messengerSmsTokensFor(messengerSkin);
  const threadTokens = smsThreadTokensFor(messengerSkin);
  // §89.5 ⓐ — 메신저형(카카오 표면) 색 · 표시 항목(통화 구간은 줄 1개로 접힌다).
  const chatTokens = MESSENGER_CHAT_TOKENS;
  // §95(UX D-138 · 실기 신고 11) — 카톡형은 번호 대신 상대 이름(시나리오 `chatDisplayName` · 부재 = 번호). 문자형 · 통화는 번호 그대로.
  const peerName = isSms ? scenario.callerLabel : (scenario.chatDisplayName ?? scenario.callerLabel);
  // §121.7 — 통화 위 대화방에서는 이미 통화 중이라 보이스톡 · "전화로 확인"을 숨긴다.
  const canVoiceTalk = sessionEscalates && !chatEnded && !inCall;
  // §94 — 표시 목록 = 구독 문서(이번 턴 답장은 공개 전까지 숨김) + 아직 서버 문서가 없는 내 말풍선(낙관적).
  const visibleMessages =
    pending && replyView.hideReply
      ? messages.filter((m) => !(m.role === "scammer" && m.turnIndex > pending.baseTurnIndex))
      : messages;
  const optimistic: ChatMessage | null =
    pending && replyView.showOptimistic
      ? {
          id: pending.localId,
          role: "user",
          text: pending.text,
          turnIndex: pending.baseTurnIndex + 1,
          createdAtMs: pending.sentAtMs,
          ...(pending.photoUrl ? { photo: true, photoUrl: pending.photoUrl } : {}),
        }
      : null;
  const failedId = optimistic && pending?.failed ? optimistic.id : null;
  // §131(3) — 링크 카드 한 벌(말풍선 아래 · 접힌 통화 줄 아래 — `threadItems.ts` 판정표 F2)이 같은 모양 · 같은 기록을 쓰게 한 곳에 둔다.
  const renderLinkCard = (attachment: MessengerAttachment, key: number, indent: boolean) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        setFakeLanding({
          fakeLandingId: attachment.fakeLandingId,
          displayText: attachment.displayText,
          ...(attachment.landingKind ? { landingKind: attachment.landingKind } : {}),
        });
        // 목업이 열린 사실만 남긴다 — **이것은 속은 순간이 아니다**(D-51 ③,
        // AC-062 보호). 승격되는 것은 아래 onInstallConsent뿐이다.
        recordMockScreen(attachment.fakeLandingId, "shown");
      }}
      // T187(UX P-36 (4) A4) — 낱말만 뺐다. 기능 설명("링크")은 유지(AC-086 (c)).
      aria-label={`링크: ${attachment.displayText}`}
      className={
        isSms
          ? "mt-1 flex min-h-[44px] items-center gap-2 rounded-[8px] border-2 border-brand bg-brand-tint px-4 py-2 text-sm font-bold text-brand underline decoration-2 underline-offset-2"
          : `mt-1 flex w-[220px] flex-col overflow-hidden rounded-[12px] text-left ${indent ? "ml-[42px]" : ""}`
      }
      style={isSms ? undefined : { backgroundColor: chatTokens.linkCardBg }}
    >
      {isSms ? (
        <>
          <span aria-hidden="true">🔗</span>
          {attachment.displayText}
        </>
      ) : (
        // §89.5 ⓐ — 메신저형 링크 = 미리보기 카드(그림 자리는 무늬 없는 단색 · 실제 사이트 그림 · 로고 없음).
        <>
          <span aria-hidden="true" className="h-[72px] w-full" style={{ backgroundColor: chatTokens.linkCardThumb }} />
          <span className="px-3 py-2 text-[15px] font-semibold leading-snug" style={{ color: chatTokens.linkCardTitle }}>
            {attachment.displayText}
          </span>
        </>
      )}
    </button>
  );
  const threadItems = foldCallSegments(optimistic ? [...visibleMessages, optimistic] : visibleMessages);
  const isSameRole = (i: number, role: "scammer" | "user") => {
    const it = threadItems[i];
    return it !== undefined && it.kind === "message" && it.message.role === role;
  };

  // T187(§72.5 D2 · UX-022 `start-notice` N-1/N-3) — 세션 전 고지. 대화 목록·헤더를 그리지 않는다
  // (구독도 아직 0). ⛔ 아래 채팅 return 안에 고지·축약판을 두지 않는다(AC-088 (e) · G444 ③).
  if (startNotice === "show") {
    return (
      <MessengerStartNotice
        surface={surface}
        // T190-8a(§74.22 (2) · OQ-52 (ㄴ)) — "전화로 확인" 버튼과 같은 술어. T194-a(§84.4.1 C-2 · D-124 ②) — 세션 단위 값.
        includesCall={sessionEscalates}
        onConfirm={handleConfirmStartNotice}
        onEndTraining={handleEndTraining}
        skinPicker={{ value: messengerSkin, source: skinSource, onChange: handleChooseSkin }}
      />
    );
  }

  // T187(N-4) — 이미 종료된 세션인데 확인 기록이 없다(극히 드묾). 고지 대신 종료 푸터만 —
  // ⛔ 대화 목록을 그리지 않는다(AC-088 (b)).
  if (startNotice === "ended-footer") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page p-8 text-center">
        <p className="text-base font-semibold text-ink" role="status">
          대화가 종료되었습니다.
        </p>
        <div className="w-full max-w-xs">
          <Button type="button" onClick={() => router.push("/session/end")}>
            결과 확인하러 가기
          </Button>
        </div>
      </main>
    );
  }

  return (
    // T190-6(UX-022 v1.33 (2)(5)) — 문자형 표면은 스킨이 **화면 문법**(바탕·헤더·말풍선 모양·입력 바)을 정하고 최대폭
    // 430px 가운데 정렬이다(바깥 #E5E7EA). 카카오형은 범위 밖이라 무변경.
    // §95(UX D-138 · 실기 신고 9) — 고정 상자 = 키보드 위 "보이는 영역". 문서는 스크롤하지 않고(`useKeyboardViewport`가 잠근다)
    // 대화 목록 상자만 스크롤한다 ⇒ 키보드가 열려도 머리줄은 맨 위, 입력줄은 키보드 바로 위.
    <div
      className="fixed inset-x-0 flex flex-col overflow-hidden"
      style={{
        backgroundColor: isSms ? smsTokens.outerBg : chatTokens.outerBg,
        ...chatBoxStyle(keyboardBox),
        // §121.7 — 통화 위에 겹칠 때는 통화 화면보다 위(발신 덮개 z-50보다는 아래).
        ...(inCall ? { zIndex: 40 } : {}),
      }}
    >
    <main
      className="font-phone relative mx-auto flex h-full min-h-0 w-full max-w-[430px] flex-col"
      style={
        isSms
          ? { backgroundColor: smsTokens.screenBg, fontFamily: "system-ui, sans-serif" }
          : { backgroundColor: chatTokens.screenBg }
      }
    >
      {/* 상단 상시 고정 영역(스크롤 무관) — (문자형) 대화 헤더 · "전화로 확인" · "훈련 종료"(AC-006).
          T187(docs/Architecture.md §72 · PRD v1.18 AC-086 · UX D-81·D-82·M-13) — 이 화면은 세션
          중이라 카카오 면책 배너·합성 표식·난이도 배지를 지웠다(면책은 시작 전 고지 ②로 옮겼다).
          ⛔ 빈 자리를 채우지 않는다.
          ⛔ T190-6b(D-100 · AC-092 (d)) — 세션 중 스킨 전환 칩·감지 실패 안내 줄을 지웠다(세션 전 선택 줄이 대신한다). */}
      {/* §121.7(UX D-157) — 통화 중 배너(실제 폰의 "통화 중" 띠). 누르면 통화 화면으로 돌아간다(통화는 계속 이어지고 있다). */}
      {duringCall && (
        <button
          type="button"
          onClick={duringCall.onBackToCall}
          className="z-30 flex min-h-11 shrink-0 items-center justify-center gap-2 bg-[#2E9E5B] px-4 text-sm font-semibold text-white"
          aria-label={`통화 중 ${duringCall.elapsedLabel} — 통화 화면으로 돌아가기`}
        >
          <PhoneIcon name="accept-call" size={16} />
          <span>통화 중 {duringCall.elapsedLabel}</span>
        </button>
      )}
      <div
        className={`z-20 flex shrink-0 flex-col ${isSms ? "border-b" : ""}`}
        style={
          isSms
            ? { backgroundColor: threadTokens.headerBg, borderColor: threadTokens.headerBorder }
            : { backgroundColor: chatTokens.screenBg }
        }
      >
        <div className="flex min-h-[56px] items-center justify-between gap-2 py-2 pl-4 pr-2">
          {/* ⭐ G449 — 왼쪽 래퍼는 비어도(카카오 표면) 남긴다. justify-between의 첫 자식으로 남아야
              오른쪽 그룹(전환 버튼·종료)이 오른쪽 끝에 그대로 있다.
              T190-6(UX-022 v1.33 (3) · D-89) — 문자형은 여기에 일반형 아바타 + 발신자(`callerLabel`)를 둔다.
              ⛔ 뒤로 셰브런은 그리지 않는다(돌아갈 대화 목록이 없다 — 동작 없는 버튼 금지). */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {/* §89.5 ⓐ — 메신저형 머리줄 = 방 이름(발신자). 뒤로 셰브런 · 검색 · 메뉴는 그리지 않는다(동작 없는 버튼 금지). */}
            {/* §95(UX D-138) — 이름을 누르면 상대 프로필 시트("보이스톡" · "훈련 종료"). */}
            {!isSms && (
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                aria-haspopup="dialog"
                className="min-h-[44px] min-w-0 truncate text-left text-[18px] font-bold"
                style={{ color: chatTokens.headerText }}
              >
                {peerName}
              </button>
            )}
            {isSms && (
              <>
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: threadTokens.avatarBg }}
                >
                  <PhoneIcon name="person" size={22} />
                </span>
                <span className="min-w-0 truncate text-[17px] font-semibold" style={{ color: threadTokens.headerText }}>
                  {scenario.callerLabel}
                </span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* 명시 전환 버튼(§13.3 — 1턴부터 상시, AC-034) — 에스컬레이션 가능 시나리오에서만.
                T190-6(UX-022 v1.33 (3)) — 문자형은 수화기 단색 아이콘 + "전화로 확인"(📞 이모지 대체 · 48px).
                카카오형은 무변경. */}
            {/* §95(UX D-138) — 카톡형은 머리줄에서 빼고 프로필 시트의 "보이스톡"으로 옮겼다(같은 처리기 · 같은 술어). */}
            {isSms && canVoiceTalk && (
              <button
                type="button"
                onClick={() => void handleRequestEscalation()}
                disabled={escalatingNow}
                className="flex min-h-[48px] items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                // §89.5 ⓐ — 메신저형도 수화기 단색 아이콘 + 글자(청록 알약 · 📞 이모지 대체). 글자는 어르신 이해를 위해 남긴다.
                style={{ color: isSms ? threadTokens.link : chatTokens.headerIcon }}
              >
                <PhoneIcon name="accept-call" size={20} />
                전화로 확인
              </button>
            )}
            {/* AC-006 R-4 — 대화 화면의 종료는 항상 보이고 1탭 즉시다. §95 — 카톡형은 작은 모양(같은 이름 · 같은 처리기). */}
            <EndTrainingButton onClick={handleEndTraining} compact={!isSms} />
          </div>
        </div>
        {escalationError && (
          <p role="alert" className="px-4 pb-2 text-xs leading-relaxed text-danger">
            {escalationError}
          </p>
        )}
      </div>

      {/* §95(UX D-138) — 친구가 아닌 상대 안내 띠(실제 메신저에 있는 요소 · 문면 근사). 대화 목록 위에 고정 — 버튼 없음(동작 없는 버튼 금지). */}
      {!isSms && scenario.chatNonFriend && (
        <p
          className="mx-3 mb-1 shrink-0 rounded-[10px] px-3 py-2 text-center text-[13px] leading-snug"
          style={{ backgroundColor: chatTokens.nonFriendBg, color: chatTokens.nonFriendText }}
        >
          친구로 등록되지 않은 사용자입니다.
          <br />
          금전 요구나 개인정보 요청에 주의하세요.
        </p>
      )}

      {/* §95 — 대화 목록 상자(이 화면의 유일한 스크롤). 키보드가 열리면 이 상자만 줄어든다. */}
      <div
        ref={scrollBoxRef}
        onScroll={(event) => {
          stickToBottomRef.current = isNearBottom(event.currentTarget);
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
      >
      {/* 대화 상단 맥락 — 발신자(사칭 대상)와 표면.
          ⚠️ T190-6 — UX-022 v1.33 (3)은 이 시스템 문구를 지우지 않는다(dubinsky OQ-U57 ② — User 결정 대상). 무변경. */}
      {/* §89.5 ⓐ · 사용자 결정 ② — 메신저형은 첫 줄의 앱 이름 표기(종전 "…카카오톡 메시지가 도착했습니다")를 지우고 날짜 구분줄로 바꾼다.
          문자형 문구는 그대로다. */}
      {isSms ? (
        <p className="px-4 pt-3 text-sm" style={{ color: threadTokens.time }}>
          {/* §130.6(N5) — 조사는 받침에 맞춰(`josa.ts` 표). */}
          {withJosa(scenario.callerLabel, "으로/로")}부터 문자 메시지가 도착했습니다.
        </p>
      ) : (
        <p className="flex justify-center pt-2">
          <span
            className="rounded-full px-3 py-0.5 text-[13px]"
            style={{ backgroundColor: chatTokens.dateChipBg, color: chatTokens.time }}
          >
            오늘
          </span>
        </p>
      )}

      {/* P-31 ⓔ(§48.5.1, AC-084 M-3/M-4) — 대화 영역 안의 비차단 고지 1줄. 말풍선으로 그리지
          않는다(P-31 (1) 금지). sticky — 한 번 뜨면 세션 동안 유지되고 재시도 버튼을 만들지 않는다. */}
      {dialogueDegraded && (
        <p role="status" className="px-4 pt-2 text-sm leading-relaxed" style={{ color: isSms ? threadTokens.time : chatTokens.time }}>
          {DIALOGUE_DEGRADED_NOTICE}
        </p>
      )}

      {/* 대화 목록 — 발신자 구분은 색이 아니라 라벨로. 카카오형 = 위에 "나"/callerLabel 텍스트(무변경).
          T190-6(UX-022 v1.33 (3)) — 문자형은 헤더가 발신자를 말하므로 말풍선 위 이름을 없애고, 구분은 **좌우 정렬 +
          말풍선 모양 + 스크린리더 숨김 글("{callerLabel}:" / "나:")** 세 겹으로 유지한다(색 단독 금지). */}
      <ul
        ref={messageListRef}
        tabIndex={-1}
        className={`flex flex-1 flex-col px-4 py-4 outline-none ${isSms ? "gap-3" : "gap-1.5"}`}
        aria-live="polite"
      >
        {/* 2026-10-20 실기 신고 — 통화 전사(channel "voice")는 말풍선이 아니라 시스템 줄 1개로 접는다(누가 보낸 메시지가 아니다). */}
        {threadItems.map((item, index) => {
          if (item.kind === "call" && !isSms) {
            // §130(UX D-161 (11)) — 카톡형: 통화 기록 말풍선(가운데 · 상대 말풍선 모양). 통화 시간은 적지 않는다(threadItems.ts).
            return (
              <li key={item.id} className="my-1.5 flex flex-col items-center">
                <span className="flex items-center gap-2.5 px-3.5 py-2.5" style={kakaoBubbleStyle("scammer", true)}>
                  <span aria-hidden="true" className="text-[18px]">
                    {CALL_SEGMENT_ICON}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[16px] font-semibold leading-[1.3]">{VOICE_TALK_RECORD_TITLE}</span>
                    <span className="text-[13px] leading-[1.35]" style={{ color: chatTokens.time }}>
                      {VOICE_TALK_RECORD_NOTE}
                    </span>
                  </span>
                </span>
                {/* §131(3) F2 — 카톡형 통화 기록 말풍선에도 그 턴의 링크만 남긴다(통합 병합 #404 × #405). */}
                {item.attachments.map((attachment, i) => (attachment.kind === "link" ? renderLinkCard(attachment, i, false) : null))}
              </li>
            );
          }
          if (item.kind === "call") {
            return (
              <li key={item.id} className="my-1.5 flex flex-col items-center">
                <span
                  className="rounded-full px-3 py-1 text-center text-sm"
                  style={
                    isSms
                      ? { backgroundColor: smsTokens.fieldBg, color: threadTokens.time }
                      : { backgroundColor: chatTokens.systemLineBg, color: chatTokens.time }
                  }
                >
                  <span aria-hidden="true">{CALL_SEGMENT_ICON} </span>
                  {CALL_SEGMENT_LINE}
                </span>
                {/* §131(3) F2 — 통화 대사는 접고, 그 턴의 링크만 남긴다(뒤 메시지에 같은 링크가 있으면 빠져 있다 — F3). */}
                {item.attachments.map((attachment, i) => (attachment.kind === "link" ? renderLinkCard(attachment, i, false) : null))}
              </li>
            );
          }
          const message = item.message;
          // §89.5 ⓐ — 메신저형 표시 규칙(`chatPresentation.ts` · G633): 이름 · 프로필은 상대 연속의 첫 말풍선만 ·
          // 시각은 연속의 마지막만 · "1"은 상대가 아직 답하지 않은 내 메시지만.
          const firstOfPeerRun = startsPeerRun(threadItems, index);
          const firstOfRun = firstOfPeerRun || (message.role === "user" && !isSameRole(index - 1, "user"));
          const timeLabel = !isSms && endsRun(threadItems, index) ? formatChatTime(message.createdAtMs) : "";
          // §94 — "1"은 상대가 읽기 전(연출 unread 단계)까지만. 실패 말풍선에는 "1" 대신 실패 표시.
          const failed = message.id === failedId;
          const unread = !isSms && !failed && !replyView.peerHasRead && isUnreadByPeer(threadItems, index);
          return (
          <li
            key={message.id}
            className={`flex flex-col gap-1 ${message.role === "user" ? "items-end" : "items-start"} ${
              !isSms && (firstOfPeerRun || firstOfRun) && index > 0 ? "mt-2" : ""
            } ${!isSms && message.role === "scammer" && !firstOfPeerRun ? "pl-[42px]" : ""}`}
          >
            {isSms ? (
              <span className="sr-only">{message.role === "user" ? "나:" : `${scenario.callerLabel}:`}</span>
            ) : message.role === "user" ? (
              <span className="sr-only">나:</span>
            ) : firstOfPeerRun ? (
              <span className="flex items-center gap-2">
                {/* §95 — 프로필 사진을 누르면 상대 프로필 시트(실제 메신저와 같다). 이름은 옆 글자가 말한다. */}
                {/* 리뷰 M1 — 그림은 34px, 터치 영역은 44px(음수 여백으로 줄 배치 무변화). */}
                <button
                  type="button"
                  onClick={() => setProfileOpen(true)}
                  aria-haspopup="dialog"
                  aria-label={`${peerName} 프로필 보기`}
                  className="-m-[5px] flex h-[44px] w-[44px] shrink-0 items-center justify-center"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-[34px] w-[34px] items-end justify-center overflow-hidden rounded-[13px]"
                    style={{ backgroundColor: chatTokens.profileBg, color: chatTokens.profileFg }}
                  >
                    <PhoneIcon name="person" size={28} />
                  </span>
                </button>
                <span className="text-[14px]" style={{ color: chatTokens.senderName }}>
                  {peerName}
                </span>
              </span>
            ) : (
              <span className="sr-only">{`${peerName}:`}</span>
            )}
            {isSms ? (
              message.photo ? (
                <PhotoBubble url={message.photoUrl ?? photoUrls[message.turnIndex]} />
              ) : (
                <span
                  className="max-w-[80%] whitespace-pre-line break-words px-[13px] py-[9px] text-[17px] leading-[1.45]"
                  style={smsBubbleStyle(message.role, messengerSkin)}
                >
                  {message.text}
                </span>
              )
            ) : (
              <span
                className={`flex max-w-[86%] items-end gap-1 ${message.role === "user" ? "flex-row-reverse" : ""} ${
                  firstOfPeerRun ? "pl-[42px]" : ""
                }`}
              >
                {message.photo ? (
                  <PhotoBubble url={message.photoUrl ?? photoUrls[message.turnIndex]} />
                ) : (
                  <span
                    className="whitespace-pre-line break-words px-3 py-2 text-[17px] leading-[1.45]"
                    style={kakaoBubbleStyle(message.role, firstOfRun)}
                  >
                    {message.text}
                  </span>
                )}
                {(timeLabel || unread) && (
                  <span
                    className={`flex shrink-0 flex-col text-[11px] leading-[1.25] ${message.role === "user" ? "items-end" : "items-start"}`}
                  >
                    {unread && (
                      <span className="font-bold" style={{ color: chatTokens.unread }}>
                        1<span className="sr-only">(읽지 않음)</span>
                      </span>
                    )}
                    {timeLabel && <span style={{ color: chatTokens.time }}>{timeLabel}</span>}
                  </span>
                )}
              </span>
            )}
            {failed && (
              // §94 — 전송 실패(서버에 저장 안 됨) — 실제 메신저처럼 말풍선에 실패 표시 + 다시 보내기 · 삭제.
              <span className="flex items-center gap-1 text-[13px]">
                <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[12px] font-bold text-white">
                  !
                </span>
                <span className="sr-only">전송 실패</span>
                <button
                  type="button"
                  onClick={() => void handleSend(message.text, message.photoUrl)}
                  className="min-h-[44px] px-2 font-semibold underline underline-offset-2"
                  style={{ color: isSms ? threadTokens.link : chatTokens.headerIcon }}
                >
                  다시 보내기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPending(null);
                    setSendError(null);
                  }}
                  className="min-h-[44px] px-2 underline underline-offset-2"
                  style={{ color: isSms ? threadTokens.time : chatTokens.time }}
                >
                  삭제
                </button>
              </span>
            )}
            {message.attachments?.map((attachment, i) =>
              attachment.kind === "link" ? renderLinkCard(attachment, i, message.role === "scammer") : null,
            )}
          </li>
          );
        })}
        {/* 사용자 신고(2026-07-24) 반영 — 전송 후 응답을 기다리는 동안(실 LLM 연동 후 체감 지연이
            늘었다) 그냥 버튼 스피너만으로는 "보냈는데도 멈춘 것 같다"는 인상을 줬다. docs/UX.md
            P-4("AI 응답 대기 중... 타이핑 인디케이터 표시")가 이미 요구하던 패턴을 실제로
            구현한다 — 상대가 실제로 답장을 쓰고 있는 것처럼 보이는 점 3개 애니메이션. */}
        {/* §94(UX D-137) — 입력 중 점은 상대가 읽은 **뒤**(내 "1"이 사라진 뒤)에만 뜬다. 전송 순간에는 뜨지 않는다. */}
        {replyView.showTyping && (
          <li className="flex flex-col items-start gap-1" aria-hidden="true">
            <span
              className={`flex items-center gap-1 px-4 py-3 ${isSms ? "" : "ml-[42px]"}`}
              style={isSms ? smsBubbleStyle("scammer", messengerSkin) : kakaoBubbleStyle("scammer", false)}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          </li>
        )}
      </ul>
      </div>
      {replyView.showTyping && (
        <p role="status" className="sr-only">
          {withJosa(peerName, "이/가")} 입력 중입니다.
        </p>
      )}

      {/* 입력·전송 또는 종료 상태 — 빈 메시지 전송 방지, 전송 중 중복 전송 방지.
          T190-6(UX-022 v1.33 (2)) — 문자형 입력 바: 높이 64px(필드 48px) · 스킨별 필드·전송 원 · placeholder "메시지".
          ⛔ 실제 앱의 ＋·카메라·이모지·음성 버튼은 그리지 않는다(동작 없는 버튼 금지 — P-37 R-6). */}
      <div
        className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
        style={{ backgroundColor: isSms ? smsTokens.inputBarBg : chatTokens.inputBarBg }}
      >
        {chatEnded ? (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-base font-semibold text-ink" role="status">
              {/* §104.9 · UX D-145 (2) — 사기범이 끝냈으면 실제 앱 같은 시스템 줄(E-1 카톡형 · E-2 문자형), 그 밖은 종전 문구. */}
              {chatEndedNotice(pending?.outcome?.scammerEnded === true || endedByScammer, isSms ? "sms" : "kakao")}
            </p>
            <Button
              type="button"
              onClick={() =>
                // §128(3) — 통화 위 대화방이면 통화 화면의 종료 순서(통화를 끊고 결과로)를 탄다.
                duringCall
                  ? scammerLeftDuringCall
                    ? duringCall.onScammerLeft()
                    : duringCall.onEndTraining()
                  : router.push("/session/end")
              }
            >
              결과 확인하러 가기
            </Button>
          </div>
        ) : (
          <>
            {sendError && (
              <p role="alert" className="mb-2 flex items-center gap-2 text-sm text-danger">
                <span aria-hidden="true">⚠</span>
                <span>{sendError}</span>
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
              // §130(UX D-161 (14)) — 입력칸이 여러 줄로 늘면 '+' · 전송은 아래 줄에 맞춘다(카톡과 같다).
              className="flex items-end gap-2.5"
            >
              {/* §113.2(UX D-151 (2)) — '+' = 기기 사진 고르기(사진첩 · 카메라는 기기가 고른다). 안내 문구 0(사용자 결정). */}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file || !file.type.startsWith("image/")) return;
                  if (!sessionId) return;
                  const url = URL.createObjectURL(file);
                  sessionPhotoStore(sessionId).all.push(url);
                  void handleSend(undefined, url);
                }}
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={turnLocked}
                aria-label="사진 보내기"
                className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                style={{ color: isSms ? threadTokens.link : chatTokens.headerIcon }}
              >
                <PhoneIcon name="plus" size={26} />
              </button>
              <label htmlFor="messenger-chat-input" className="sr-only">
                메시지 입력
              </label>
              {/* 실기 신고(2026-10-21) — `min-w-0`: 입력칸의 기본 폭(size 20 × 글꼴 평균 글자폭)이 flex 최소폭이 되면 기기 글꼴에
                  따라 줄이 화면보다 넓어져 페이지 전체가 축소되고 오른쪽에 바깥 바탕 띠가 생긴다(웨일 캡처 · 로컬 size 32 모의 445px). */}
              {/* §110.1(실기 신고 9 · UX D-150 (1)) — 입력칸이 `<input type="text">`면 안드로이드 Chromium(웨일 포함)이 키보드 위에 자동
                  채우기 액세서리 줄(열쇠 = 저장 비밀번호 · 핀 = 저장 주소)을 띄운다. 이 줄은 autocomplete 값 · name · form 속성으로 끌 수 없고
                  (칸 종류 판정이 그 속성을 보지 않는다), **textarea에서는 기본 설정에서 뜨지 않는다**(Chromium `manual_filling_controller_impl.cc`
                  "don't show on textareas" — 조사 노트 keyboard-accessory-bar-research-2026-10-22.md). 한 줄 textarea + Enter = 전송(한글 조합 중 제외). */}
              <textarea
                id="messenger-chat-input"
                ref={inputRef}
                rows={1}
                onKeyDown={(event) => {
                  // 한글 조합 중 Enter(keyCode 229)는 조합 확정이다 — 전송하지 않는다. Shift+Enter는 줄바꿈.
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
                  event.preventDefault();
                  void handleSend();
                }}
                // UX D-144(§103 · 실기 신고 2026-10-22 — 삼성 키보드가 대화를 읽고 "그래 3만원 정도" 같은 답장 알약을 띄웠다) —
                // 키보드 추천 · 자동 완성 · 자동 수정을 끈다. Chromium 안드로이드는 autocomplete="off"를 TYPE_TEXT_FLAG_NO_SUGGESTIONS로
                // 넘긴다(ImeUtils.computeEditorInfo). 키보드가 이 신호를 지키는지는 키보드 몫이다(§103.5).
                {...TRAINING_INPUT_NO_SUGGEST}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={isSms ? "메시지" : "메시지 입력"}
                className={
                  isSms
                    ? "min-h-[48px] min-w-0 flex-1 resize-none overflow-y-auto px-4 py-[11px] text-[17px] leading-[1.5] placeholder:text-[var(--sms-placeholder)]"
                    : "min-h-[48px] min-w-0 flex-1 rounded-[24px] resize-none overflow-y-auto px-4 py-[11px] text-[17px] leading-[1.5] placeholder:text-[var(--sms-placeholder)]"
                }
                style={
                  !isSms
                    ? ({
                        backgroundColor: chatTokens.fieldBg,
                        color: chatTokens.fieldText,
                        border: `1px solid ${chatTokens.fieldBorder}`,
                        "--sms-placeholder": chatTokens.placeholder,
                      } as React.CSSProperties)
                    : isSms
                    ? ({
                        backgroundColor: smsTokens.fieldBg,
                        color: smsTokens.fieldText,
                        borderRadius: smsTokens.fieldRadiusPx,
                        border: smsTokens.fieldBorder ? `1px solid ${smsTokens.fieldBorder}` : "none",
                        "--sms-placeholder": smsTokens.placeholder,
                      } as React.CSSProperties)
                    : undefined
                }
              />
              <button
                type="submit"
                disabled={turnLocked || !input.trim()}
                // 실기 신고 5 — 누를 때 포커스를 버튼으로 옮기지 않는다: 입력칸이 열려 있었으면 키보드가 그대로 남고, 닫혀 있었으면
                // 열지 않는다(자동 포커스 0). 키보드 Enter · 스크린리더 활성화는 click으로 그대로 동작한다.
                onPointerDown={(event) => event.preventDefault()}
                aria-label="전송"
                className={
                  isSms
                    ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                    : "flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                }
                style={
                  isSms
                    ? { backgroundColor: smsTokens.sendBg, color: smsTokens.sendIcon }
                    : { backgroundColor: chatTokens.sendBg, color: chatTokens.sendIcon }
                }
              >
                {/* §94 — 회전 스피너 대신 말풍선이 바로 올라간다(실제 앱에 전송 스피너 없음). */}
                <PhoneIcon name="send-up" size={22} />
              </button>
            </form>
          </>
        )}
      </div>

      {!isSms && profileOpen && (
        <MessengerProfileSheet
          name={peerName}
          // 실기 신고 4 — 실제 메신저처럼 모든 카톡형 대화방에 보인다. 통화로 이어지는 세션 = 종전 전이(canVoiceTalk) ·
          // 그 밖 = 응답 없음 연출. 대화가 끝났으면 그리지 않는다.
          voiceTalk={
            chatEnded || inCall
              ? undefined
              : canVoiceTalk
              ? {
                  // §121(1) — 사용자가 거는 보이스톡 = 발신(상대가 받는다). ⛔ 프라이밍이 탭 안에서 일어나야 해 같은 틱에 부른다.
                  onClick: () => {
                    setProfileOpen(false);
                    void handleVoiceTalkDial();
                  },
                  disabled: escalatingNow || dialingVoiceTalk,
                }
              : {
                  onClick: () => {
                    setProfileOpen(false);
                    handleVoiceTalkUnanswered();
                  },
                  // 답장 생성 중에는 막는다(서버가 같은 turnIndex를 쓰지 않게 거부한다 — voiceTalkUnanswered.ts 4행).
                  disabled: turnLocked || voiceTalkCall !== null,
                }
          }
          onEndTraining={handleEndTraining}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {fakeLanding && (
        <MessengerFakeLanding
          title={fakeLanding.displayText}
          // T104 — 상황별 콘텐츠 조회 키(§19.4 R8: 정확 일치 조회 전용).
          landingId={fakeLanding.fakeLandingId}
          landingKind={fakeLanding.landingKind}
          // T190-6(AC-092 (b)) — 브라우저 바도 같은 스킨(카카오형은 스킨이 없어 기본).
          skin={isSms ? messengerSkin : "default"}
          onClose={() => setFakeLanding(null)}
          // 사용자 결정(2026-10-18) — 가짜 페이지 브라우저 바의 종료 버튼을 없애 `onEndTraining`을 넘기지 않는다.
          // 끝내는 경로 = 닫기 → 이 대화 화면 헤더의 종료 버튼(그대로 남는다).
          // T187(UX D-84) — 난이도 라벨은 넘기지 않는다(세션 중 배지 없음).
          // T84(D-51 ④) — 가짜 "권한 허용"에 **응한** 순간만 기록되고, 리포트 생성 시 속은 순간
          // 1건으로 승격된다(§15.9.5 e-1). ⚠️ 응낙이 채널 전이를 유발하지 않는다(G54) — 전이는
          // 기존 구조화 신호·max-turn 폴백·명시 버튼으로만 일어난다.
          onInstallConsent={() => recordMockScreen(fakeLanding.fakeLandingId, "consented")}
          // T123/AC-080 — 가짜 랜딩 폼을 **제출한 사실**만 기록한다(기존 recordMockScreen 재사용 —
          // 1회 재시도·비차단 정책까지 그대로 상속). 리포트 생성 시 속은 순간 1건으로 승격된다.
          // ⛔ 참가자가 입력한 계좌번호·예금주명은 이 경로에 실리지 않는다(콜백이 무인자다 — G138).
          // ⚠️ 위 링크 칩 탭의 "shown"과 달리 이것만 승격된다(AC-080 (b) — 열어보고 닫은 참가자를
          // 실패로 낙인찍지 않는다).
          onCredentialSubmit={() => recordMockScreen(fakeLanding.fakeLandingId, "submitted")}
        />
      )}

      {/* 전이 연출(P-18, T30) — "사기범이 전화를 거는" 화면으로 잠시 전환한 뒤 통화 셸(UX-014)
          수신 phase로 이음새 없이 인계한다(위 effect가 1.5초 후 라우팅, 타이밍 로직은 무변경).
          새 의존성 없이 기존 call-ring-pulse(globals.css, UX-014와 동일 모션 톤)만 재사용한다.
          배경색은 디자인 시스템의 공식 "통화 셸 배경" 토큰(#22303A, 반투명)으로 맞춰 UX-014
          수신 화면과 이음새 없이 이어지게 했다(전이 플로우.dc.html의 반투명 오버레이와 동일 취지 —
          아래 채팅 화면이 은은히 비쳐 보인다). */}
      {escalatingNow && (
        <div
          role="status"
          className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-ink/95 text-white"
        >
          {/* T187(§72 · AC-086 (a) — 전이 연출도 세션 중) — 표식 칩 삭제. 벨 + 사건 문구만 남는다. */}
          <div className="relative flex items-center justify-center">
            <span
              aria-hidden="true"
              className="call-ring-pulse absolute h-24 w-24 rounded-full bg-white/25"
            />
            <span
              aria-hidden="true"
              className="call-ring-pulse absolute h-24 w-24 rounded-full bg-white/15"
              style={{ animationDelay: "0.7s" }}
            />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-avatar-bg text-white" aria-hidden="true">
              <PhoneIcon name="accept-call" size={40} />
            </div>
          </div>
          <p className="text-xl font-bold">{withJosa(scenario.callerLabel, "으로/로")}부터 전화가 옵니다</p>
        </div>
      )}

      {/* 실기 신고 4 — 보이스톡 응답 없음 연출(통화로 이어지지 않는 카톡형 세션). 신호음 중에는 취소(빨간 버튼)로 대화방에 돌아간다 —
          취소하면 서버에 아무것도 남기지 않는다. 응답 없음 뒤 2초면 저절로 닫힌다(대화 화면 상시 종료로 바로 돌아간다 — AC-006). */}
      {(voiceTalkCall !== null || dialingVoiceTalk) && (
        // §123(UX D-156) — 카톡형 보이스톡 발신 화면(공용 컴포넌트). 신호음 중에만 취소(빨간 버튼)가 대화방으로 돌린다 — 서버 기록 0.
        // 전환 요청 중(발신 · 이어지는 세션)과 응답 없음 안내는 종료가 무반응이다(곧 통화 화면 · 대화방으로 넘어간다).
        <VoiceTalkDialScreen
          name={peerName}
          status={voiceTalkCall === "unanswered" ? "상대방이 응답하지 않습니다" : "보이스톡 연결 중…"}
          {...(voiceTalkCall === "ringing" ? { onEnd: () => setVoiceTalkCall(null) } : {})}
        />
      )}
    </main>
    </div>
  );
}
