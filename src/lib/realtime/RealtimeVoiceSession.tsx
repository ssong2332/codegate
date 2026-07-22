"use client";

// 실시간 speech-to-speech 세션 본체 (UX-014 live phase, 2026-07-22).
//
// ⚠️ 이 컴포넌트는 **반드시 지연 로딩(next/dynamic, ssr:false)** 해야 한다. @elevenlabs/react는
// livekit-client(WebRTC)를 끌어오는데, 이걸 통화 화면 로드 시점에 항상 불러오면 WebRTC를 쓸 수
// 없는 환경에서 렌더러가 통째로 죽는다(실측 확인 — 미리보기 브라우저에서 페이지 자체가 로드 실패).
// 실제 실시간 통화가 가능하다고 서버가 확인해 준 경우에만 마운트해, 텍스트 폴백 경로는 WebRTC
// 코드를 아예 건드리지 않게 한다.
//
// 화면 요소는 없다(렌더링 null) — 부모 통화 화면이 UI를 그리고, 이 컴포넌트는 SDK 세션의
// 생명주기만 관리하며 상태를 콜백으로 올려보낸다.
//
// SDK 계약 메모(v1.10.1 타입 확인): `useConversation`은 반드시 `ConversationProvider` 안에서만
// 쓸 수 있고, `startSession`/`endSession`은 Promise가 아니라 **동기 void** 함수다. 따라서 연결
// 성공은 반환값이 아니라 `onConnect` 콜백으로 판정한다.
import { useEffect, useRef } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { CreateRealtimeCallResponse } from "@/lib/api";

export type RealtimeVoiceSessionProps = {
  credentials: CreateRealtimeCallResponse;
  /** 통화가 실제로 연결됐다(onConnect). */
  onActive: () => void;
  /** 상대가 끊었거나 세션이 끝났다. */
  onEnded: () => void;
  /** 연결 실패 — 부모는 텍스트 폴백으로 강등한다. */
  onError: () => void;
  /** 상대(사기범)가 말하는 중인지 — 통화 화면 파형 인디케이터용. */
  onSpeakingChange: (speaking: boolean) => void;
  /** 부모가 종료를 요청하면 값이 증가한다(훈련 종료 버튼). */
  stopSignal: number;
  /** 통화 중 음소거 — 실제 마이크 입력을 끊는다. */
  muted: boolean;
};

function SessionRunner({
  credentials,
  onActive,
  onEnded,
  onError,
  onSpeakingChange,
  stopSignal,
  muted,
}: RealtimeVoiceSessionProps) {
  const conversation = useConversation({
    micMuted: muted,
    onConnect: () => handlersRef.current.onActive(),
    onDisconnect: () => handlersRef.current.onEnded(),
    onError: () => handlersRef.current.onError(),
  });
  const startedRef = useRef(false);
  // 콜백을 ref로 잡아 두면 부모 리렌더마다 세션이 재시작되는 사고를 막을 수 있다.
  // 렌더 중 ref를 쓰기지 않도록 effect에서만 갱신한다(react-hooks/refs).
  const handlersRef = useRef({ onActive, onEnded, onError, onSpeakingChange });

  useEffect(() => {
    handlersRef.current = { onActive, onEnded, onError, onSpeakingChange };
  }, [onActive, onEnded, onError, onSpeakingChange]);

  // 세션 시작 — 마운트 시 1회만. 페르소나 프롬프트는 에이전트 쪽에 저장돼 있어(ADR-0004)
  // 여기서 넘기는 오버라이드는 민감하지 않은 voice_id/language뿐이다.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    try {
      conversation.startSession({
        signedUrl: credentials.signedUrl,
        connectionType: "websocket",
        overrides: {
          agent: { language: credentials.language },
          tts: { voiceId: credentials.voiceId },
        },
      });
    } catch {
      handlersRef.current.onError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 언마운트 시 반드시 끊는다 — 통화가 백그라운드에 남으면 마이크가 계속 열려 있게 된다.
  useEffect(() => {
    return () => {
      try {
        conversation.endSession();
      } catch {
        // 이미 끊겼으면 무시 — 종료는 항상 성공해야 한다(AC-006 상시 종료).
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 부모의 종료 요청(훈련 종료 버튼 등) — stopSignal이 바뀌면 세션을 끊는다.
  useEffect(() => {
    if (stopSignal <= 0) return;
    try {
      conversation.endSession();
    } catch {
      // 위와 동일 — 종료 실패를 사용자에게 전가하지 않는다.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopSignal]);

  // 발화 상태를 부모로 올린다(파형 인디케이터).
  useEffect(() => {
    handlersRef.current.onSpeakingChange(Boolean(conversation.isSpeaking));
  }, [conversation.isSpeaking]);

  return null;
}

export default function RealtimeVoiceSession(props: RealtimeVoiceSessionProps) {
  // useConversation은 Provider 안에서만 동작한다(SDK 요구사항).
  return (
    <ConversationProvider>
      <SessionRunner {...props} />
    </ConversationProvider>
  );
}
