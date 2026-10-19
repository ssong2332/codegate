"use client";

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
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getPendingSessionId,
  isSessionAnswered,
  isStartNoticeAcknowledged,
  markStartNoticeAcknowledged,
} from "@/lib/recording";
import {
  recordMockScreenEvent,
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
import { messengerSmsTokensFor, smsThreadTokensFor } from "@/lib/phone/skinTokens";
import PhoneIcon from "@/components/PhoneIcon";
import EndTrainingButton from "@/components/EndTrainingButton";
import MessengerFakeLanding from "@/components/MessengerFakeLanding";
import MessengerStartNotice from "@/components/MessengerStartNotice";
import { Button } from "@/components/ui";
import { foldDegraded, DIALOGUE_DEGRADED_NOTICE } from "@/lib/report/degradedDisclosure";
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
};

// ⛔ T190-6b(UX D-100 · PRD AC-092 (d) · AC-031 읽기 고지) — 세션 중 스킨 전환 칩(`SKIN_CYCLE`/`SKIN_LABEL`)과
// 감지 실패 안내 줄을 없앴다. 수동 선택은 **세션 전** `start-notice`의 화면 모양 줄(DeviceSkinPicker)이 맡는다.

/** 카카오 표면 말풍선 색(정확 모사 — OQ-18 accepted risk · UX-022 v1.33 범위 밖이라 무변경). */
function kakaoBubbleClass(role: "scammer" | "user") {
  return role === "user"
    ? "bg-[#FEE500] text-[#22303A]"
    : "bg-white text-[#22303A] border border-[#E2DDD3]";
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

export default function MessengerSessionPage() {
  const router = useRouter();
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [pageState, setPageState] = useState<PageState>(sessionId ? "checking" : "no-session");
  const [scenario, setScenario] = useState<ScenarioDoc | null>(null);
  // T194-a(Architecture.md §83.4.1 C-2 · C-3 · UX D-124 ② · PRD AC-106 (i)) — 이 세션이 통화로 이어질 수 있는가. 세션 문서의
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  // 사용자 신고(2026-07-24) — 대화가 길어지면 자동으로 맨 아래로 스크롤되지 않던 문제. 목록 끝에
  // 빈 sentinel을 두고 메시지 도착·전송 중(타이핑 인디케이터 노출) 시마다 그 지점으로 스크롤한다.
  const scrollAnchorRef = useRef<HTMLLIElement | null>(null);
  // T187(UX-022 v1.29 노트 (5)) — "메시지 보기" 뒤 포커스는 대화 목록으로(입력창 자동 포커스 ⛔).
  const messageListRef = useRef<HTMLUListElement | null>(null);
  const focusListAfterNoticeRef = useRef(false);

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
          decideMessengerStartNotice({
            acknowledged: isStartNoticeAcknowledged(sessionId),
            answeredInThisTab: isSessionAnswered(sessionId),
            sessionEnded: data.status === "ended",
          }),
        );
        // T158(§48.5.1) — 마운트 시 관측(OR-fold 첫 항). `foldDegraded`가 sticky를 보장한다.
        setDialogueDegraded((current) => foldDegraded(current, data.llmProvider === "mock"));
        if (data.status === "ended") {
          setEnded(true);
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
  }, [sessionId]);

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
      setMessages(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            role: data.role as "scammer" | "user",
            text: data.textMasked as string,
            turnIndex: data.turnIndex as number,
            attachments: data.attachments as MessengerAttachment[] | undefined,
          };
        }),
      );
    });
    return unsubscribe;
  }, [sessionId, pageState, startNotice]);

  // T187(UX-022 v1.29 노트 (5)) — "메시지 보기"를 누른 직후 1회만 대화 목록에 포커스를 둔다.
  useEffect(() => {
    if (startNotice !== "skip" || !focusListAfterNoticeRef.current) return;
    focusListAfterNoticeRef.current = false;
    messageListRef.current?.focus();
  }, [startNotice]);

  // 사용자 신고(2026-07-24) — 새 메시지가 오거나(상대 응답) 내가 보내서 "입력 중" 표시가 뜰 때마다
  // 맨 아래로 스크롤한다. scrollIntoView는 조상 스크롤 컨테이너가 없어도 안전(main 자체가 뷰포트
  // 스크롤을 담당 — 이 화면은 별도 overflow 컨테이너를 쓰지 않는다).
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!sessionId || !text || sending || ended || escalating) return;
    setSending(true);
    setSendError(null);
    try {
      const result = await sendMessage({ sessionId, userText: text });
      // T158(§48.5.1) — OR-fold 두 번째 항.
      setDialogueDegraded((current) => foldDegraded(current, result.isMock));
      setInput("");
      // T30(§13.2) — 자동 신호든 max-turn 폴백이든, 서버가 이미 transitionChannel을 마쳤다는
      // 뜻이다. 클라는 이 플래그만 보고 전이 연출로 넘어간다(자유텍스트 직접 분류 안 함).
      if (result.escalation?.toChannel === "voice") {
        setEscalating(true);
        return;
      }
      if (result.ended) {
        setEnded(true);
      }
    } catch {
      setSendError("메시지를 보내지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // 명시 전환 버튼("전화로 확인", §13.3 — 1턴부터 상시). 서버가 즉시 transitionChannel(manual_button)
  // 을 수행하고 확인 플래그를 돌려주면 handleSend와 동일한 전이 연출로 넘어간다.
  const handleRequestEscalation = async () => {
    if (!sessionId || escalating || ended) return;
    setEscalationError(null);
    try {
      const result = await requestEscalation({ sessionId });
      if (result.escalation?.toChannel === "voice") {
        setEscalating(true);
      }
    } catch {
      setEscalationError("통화 연결을 요청하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  // 전이 연출(P-18) — "사기범이 전화를 거는" 화면을 잠시 보여준 뒤 UX-014 수신 phase로 이음새
  // 없이 인계한다(/session/play는 이미 phase 기본값이 incoming이라 그대로 진입한다).
  useEffect(() => {
    if (!escalating) return;
    const timer = setTimeout(() => router.push("/session/play"), 1500);
    return () => clearTimeout(timer);
  }, [escalating, router]);

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
  const recordMockScreen = (landingId: string, event: MockScreenEvent) => {
    if (!sessionId) return;
    void (async () => {
      try {
        await recordMockScreenEvent({ sessionId, landingId, event });
      } catch {
        try {
          await recordMockScreenEvent({ sessionId, landingId, event });
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p className="flex items-center gap-2 text-lg text-[#22303A]" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
          />
          채팅을 불러오는 중입니다...
        </p>
      </main>
    );
  }

  const surface = scenario.surface ?? "sms";
  // T190-6(UX-022 v1.33) — 문자형 표면의 화면 문법 토큰(UX v1.33 근사 — 실기 측정 전 · 대비 하한 G456).
  const isSms = surface === "sms";
  const smsTokens = messengerSmsTokensFor(messengerSkin);
  const threadTokens = smsThreadTokensFor(messengerSkin);

  // T187(§72.5 D2 · UX-022 `start-notice` N-1/N-3) — 세션 전 고지. 대화 목록·헤더를 그리지 않는다
  // (구독도 아직 0). ⛔ 아래 채팅 return 안에 고지·축약판을 두지 않는다(AC-088 (e) · G444 ③).
  if (startNotice === "show") {
    return (
      <MessengerStartNotice
        surface={surface}
        // T190-8a(§74.22 (2) · OQ-52 (ㄴ)) — "전화로 확인" 버튼과 같은 술어. T194-a(§83.4.1 C-2 · D-124 ②) — 세션 단위 값.
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p className="text-base font-semibold text-[#22303A]" role="status">
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
    <div
      className={isSms ? "flex min-h-screen flex-col" : "contents"}
      style={isSms ? { backgroundColor: smsTokens.outerBg } : undefined}
    >
    <main
      className={`flex min-h-screen flex-col ${isSms ? "mx-auto w-full max-w-[430px]" : "bg-[#FAF8F5]"}`}
      style={isSms ? { backgroundColor: smsTokens.screenBg, fontFamily: "system-ui, sans-serif" } : undefined}
    >
      {/* 상단 상시 고정 영역(스크롤 무관) — (문자형) 대화 헤더 · "전화로 확인" · "훈련 종료"(AC-006).
          T187(docs/Architecture.md §72 · PRD v1.18 AC-086 · UX D-81·D-82·M-13) — 이 화면은 세션
          중이라 카카오 면책 배너·합성 표식·난이도 배지를 지웠다(면책은 시작 전 고지 ②로 옮겼다).
          ⛔ 빈 자리를 채우지 않는다.
          ⛔ T190-6b(D-100 · AC-092 (d)) — 세션 중 스킨 전환 칩·감지 실패 안내 줄을 지웠다(세션 전 선택 줄이 대신한다). */}
      <div
        className={`sticky top-0 z-20 flex flex-col border-b ${isSms ? "" : "border-[#E2DDD3] bg-white"}`}
        style={isSms ? { backgroundColor: threadTokens.headerBg, borderColor: threadTokens.headerBorder } : undefined}
      >
        <div className="flex min-h-[56px] flex-wrap items-center justify-between gap-2 px-4 py-2">
          {/* ⭐ G449 — 왼쪽 래퍼는 비어도(카카오 표면) 남긴다. justify-between의 첫 자식으로 남아야
              오른쪽 그룹(전환 버튼·종료)이 오른쪽 끝에 그대로 있다.
              T190-6(UX-022 v1.33 (3) · D-89) — 문자형은 여기에 일반형 아바타 + 발신자(`callerLabel`)를 둔다.
              ⛔ 뒤로 셰브런은 그리지 않는다(돌아갈 대화 목록이 없다 — 동작 없는 버튼 금지). */}
          <div className="flex min-w-0 items-center gap-2.5">
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
          <div className="flex items-center gap-2">
            {/* 명시 전환 버튼(§13.3 — 1턴부터 상시, AC-034) — 에스컬레이션 가능 시나리오에서만.
                T190-6(UX-022 v1.33 (3)) — 문자형은 수화기 단색 아이콘 + "전화로 확인"(📞 이모지 대체 · 48px).
                카카오형은 무변경. */}
            {sessionEscalates && !ended && (
              <button
                type="button"
                onClick={() => void handleRequestEscalation()}
                disabled={escalating}
                className={
                  isSms
                    ? "flex min-h-[48px] items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    : "min-h-[40px] rounded-full bg-[#0E6B62] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#0B564F] disabled:cursor-not-allowed disabled:bg-[#F2EFE9] disabled:text-[#C9C2B6]"
                }
                style={isSms ? { color: threadTokens.link } : undefined}
              >
                {isSms ? (
                  <>
                    <PhoneIcon name="accept-call" size={20} />
                    전화로 확인
                  </>
                ) : (
                  "📞 전화로 확인"
                )}
              </button>
            )}
            <EndTrainingButton onClick={handleEndTraining} />
          </div>
        </div>
        {escalationError && (
          <p role="alert" className="px-4 pb-2 text-xs leading-relaxed text-[#C6392F]">
            {escalationError}
          </p>
        )}
      </div>

      {/* 대화 상단 맥락 — 발신자(사칭 대상)와 표면.
          ⚠️ T190-6 — UX-022 v1.33 (3)은 이 시스템 문구를 지우지 않는다(dubinsky OQ-U57 ② — User 결정 대상). 무변경. */}
      <p className="px-4 pt-3 text-sm" style={{ color: isSms ? threadTokens.time : "#6B655C" }}>
        {scenario.callerLabel}(으)로부터 {surface === "kakao" ? "카카오톡" : "문자"} 메시지가
        도착했습니다.
      </p>

      {/* P-31 ⓔ(§48.5.1, AC-084 M-3/M-4) — 대화 영역 안의 비차단 고지 1줄. 말풍선으로 그리지
          않는다(P-31 (1) 금지). sticky — 한 번 뜨면 세션 동안 유지되고 재시도 버튼을 만들지 않는다. */}
      {dialogueDegraded && (
        <p role="status" className="px-4 pt-2 text-sm leading-relaxed text-[#6B655C]">
          {DIALOGUE_DEGRADED_NOTICE}
        </p>
      )}

      {/* 대화 목록 — 발신자 구분은 색이 아니라 라벨로. 카카오형 = 위에 "나"/callerLabel 텍스트(무변경).
          T190-6(UX-022 v1.33 (3)) — 문자형은 헤더가 발신자를 말하므로 말풍선 위 이름을 없애고, 구분은 **좌우 정렬 +
          말풍선 모양 + 스크린리더 숨김 글("{callerLabel}:" / "나:")** 세 겹으로 유지한다(색 단독 금지). */}
      <ul
        ref={messageListRef}
        tabIndex={-1}
        className="flex flex-1 flex-col gap-3 px-4 py-4 outline-none"
        aria-live="polite"
      >
        {messages.map((message) => (
          <li
            key={message.id}
            className={`flex flex-col gap-1 ${message.role === "user" ? "items-end" : "items-start"}`}
          >
            {isSms ? (
              <span className="sr-only">{message.role === "user" ? "나:" : `${scenario.callerLabel}:`}</span>
            ) : (
              <span className="text-xs font-semibold text-[#6B655C]">
                {message.role === "user" ? "나" : scenario.callerLabel}
              </span>
            )}
            {isSms ? (
              <span
                className="max-w-[80%] whitespace-pre-line break-words px-[13px] py-[9px] text-[17px] leading-[1.45]"
                style={smsBubbleStyle(message.role, messengerSkin)}
              >
                {message.text}
              </span>
            ) : (
              <span
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-base leading-relaxed ${kakaoBubbleClass(message.role)}`}
              >
                {message.text}
              </span>
            )}
            {message.attachments?.map((attachment, i) =>
              attachment.kind === "link" ? (
                <button
                  key={i}
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
                  className="mt-1 flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-[#0E6B62] bg-[#E4F0EC] px-4 py-2 text-sm font-bold text-[#0E6B62] underline decoration-2 underline-offset-2"
                >
                  <span aria-hidden="true">🔗</span>
                  {attachment.displayText}
                </button>
              ) : null,
            )}
          </li>
        ))}
        {/* 사용자 신고(2026-07-24) 반영 — 전송 후 응답을 기다리는 동안(실 LLM 연동 후 체감 지연이
            늘었다) 그냥 버튼 스피너만으로는 "보냈는데도 멈춘 것 같다"는 인상을 줬다. docs/UX.md
            P-4("AI 응답 대기 중... 타이핑 인디케이터 표시")가 이미 요구하던 패턴을 실제로
            구현한다 — 상대가 실제로 답장을 쓰고 있는 것처럼 보이는 점 3개 애니메이션. */}
        {sending && (
          <li className="flex flex-col items-start gap-1" aria-hidden="true">
            {!isSms && <span className="text-xs font-semibold text-[#6B655C]">{scenario.callerLabel}</span>}
            <span
              className={`flex items-center gap-1 px-4 py-3 ${isSms ? "" : `rounded-2xl ${kakaoBubbleClass("scammer")}`}`}
              style={isSms ? smsBubbleStyle("scammer", messengerSkin) : undefined}
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
        <li ref={scrollAnchorRef} aria-hidden="true" className="h-px w-full shrink-0" />
      </ul>
      {sending && (
        <p role="status" className="sr-only">
          {scenario.callerLabel}이(가) 입력 중입니다.
        </p>
      )}

      {/* 입력·전송 또는 종료 상태 — 빈 메시지 전송 방지, 전송 중 중복 전송 방지.
          T190-6(UX-022 v1.33 (2)) — 문자형 입력 바: 높이 64px(필드 48px) · 스킨별 필드·전송 원 · placeholder "메시지".
          ⛔ 실제 앱의 ＋·카메라·이모지·음성 버튼은 그리지 않는다(동작 없는 버튼 금지 — P-37 R-6). */}
      <div
        className={`sticky bottom-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 ${
          isSms ? "" : "border-t border-[#E2DDD3] bg-white"
        }`}
        style={isSms ? { backgroundColor: smsTokens.inputBarBg } : undefined}
      >
        {ended ? (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-base font-semibold text-[#22303A]" role="status">
              대화가 종료되었습니다.
            </p>
            <Button type="button" onClick={() => router.push("/session/end")}>
              결과 확인하러 가기
            </Button>
          </div>
        ) : (
          <>
            {sendError && (
              <p role="alert" className="mb-2 flex items-center gap-2 text-sm text-[#C6392F]">
                <span aria-hidden="true">⚠</span>
                <span>{sendError}</span>
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
              className="flex items-center gap-2.5"
            >
              <label htmlFor="messenger-chat-input" className="sr-only">
                메시지 입력
              </label>
              <input
                id="messenger-chat-input"
                ref={inputRef}
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onFocus={(event) =>
                  event.currentTarget.scrollIntoView({ behavior: "smooth", block: "center" })
                }
                disabled={sending}
                placeholder={isSms ? "메시지" : "메시지를 입력하세요..."}
                className={
                  isSms
                    ? "min-h-[48px] flex-1 px-4 py-2.5 text-[17px] placeholder:text-[var(--sms-placeholder)]"
                    : "min-h-[50px] flex-1 rounded-full border-[1.5px] border-[#C9C2B6] px-[18px] py-3 text-lg text-[#22303A] placeholder:text-[#6B655C]"
                }
                style={
                  isSms
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
                disabled={sending || !input.trim()}
                aria-label="전송"
                className={
                  isSms
                    ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                    : "flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-[#0E6B62] text-lg font-bold text-white disabled:opacity-50"
                }
                style={isSms ? { backgroundColor: smsTokens.sendBg, color: smsTokens.sendIcon } : undefined}
              >
                {sending ? (
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  />
                ) : isSms ? (
                  <PhoneIcon name="send-up" size={22} />
                ) : (
                  "↑"
                )}
              </button>
            </form>
          </>
        )}
      </div>

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
      {escalating && (
        <div
          role="status"
          className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#22303A]/95 text-white"
        >
          {/* T187(§72 · AC-086 (a) — 전이 연출도 세션 중) — 표식 칩 삭제. 벨 + 사건 문구만 남는다. */}
          <div className="relative flex items-center justify-center">
            <span
              aria-hidden="true"
              className="call-ring-pulse absolute h-24 w-24 rounded-full bg-[#7CD9C2]/30"
            />
            <span
              aria-hidden="true"
              className="call-ring-pulse absolute h-24 w-24 rounded-full bg-[#7CD9C2]/20"
              style={{ animationDelay: "0.7s" }}
            />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[#41525E] text-4xl">
              🔔
            </div>
          </div>
          <p className="text-xl font-bold">{scenario.callerLabel}(으)로부터 전화가 옵니다</p>
        </div>
      )}
    </main>
    </div>
  );
}
