// §121(1)(사용자 실기 신고 2026-10-23 · 메인 결정 ⓐ "(1-B)로 먼저 단독") — 사용자가 프로필 → 보이스톡을 누를 때의 발신 화면.
// 원문: *"사용자가 보이스톡을 하고자 하는 경우는 통화를 걸고, 상대방이 받는 형태로 진행해야 할 거 같아"*.
//
// 판정표(누가 거는가 × 세션이 통화로 이어지는가):
// | 누가 거는가 | 통화로 이어짐(`canVoiceTalk`) | 화면 |
// |---|---|---|
// | 사기범(서버 신호 · 최대 턴 폴백) | 예 | 종전 수신 — "전화가 옵니다" → 벨 → 받기 |
// | 사용자(보이스톡) | 예 | **발신**(`answer`) — 대화방 탭 안에서 통화 오디오 준비 → 통화 화면 발신 연출(신호음 · 취소) → 상대가 받음 → 통화 |
// | 사용자(보이스톡) | 아니요 | **응답 없음**(`unanswered`, #368 종전) — 신호음 → "상대방이 응답하지 않습니다" |
// | 사용자 · 신호음 중 취소 | 예 | 대화방 복귀(역전환 — 사기범 복귀 메시지 없음) |
//
// 오디오 인계(1-B): 통화 오디오 컨텍스트는 **사용자 탭 안에서** 만들어야 Android · iOS에서 소리가 난다(§57 수정안 A). 발신은 받기 탭이
// 없으므로 대화방의 보이스톡 탭에서 만든 컨텍스트를 이 모듈 메모리에 맡기고, 통화 화면이 받는 순간 넘겨받는다(Next 클라 이동은 JS 상태가
// 이어진다). 새로고침하면 맡긴 값이 사라져 종전 수신 화면으로 간다(맡김 0 = 종전 동작).
// ⚠️ 잎 모듈(상대 · 별칭 import 0) — 루트 테스트 러너가 직접 단위 테스트한다.

export type VoiceTalkOutcome = "answer" | "unanswered";

/** 사용자가 보이스톡을 걸었을 때 상대가 받는가(위 표 2 · 3행). */
export function decideVoiceTalkOutcome(input: { canVoiceTalk: boolean }): VoiceTalkOutcome {
  return input.canVoiceTalk ? "answer" : "unanswered";
}

/** 발신 신호음이 울린 뒤 상대가 받기까지(판단값 — 실시간 자격증명 미리 받기가 대개 이 안에 끝난다). */
export const VOICE_TALK_CONNECT_MS = 3500;

/** 연결음 패턴(국내 연결음 — 440 + 480Hz, 1초 울림 · 2초 쉼). */
export const RINGBACK_TONE = { freqsHz: [440, 480], onMs: 1000, offMs: 2000, peak: 0.12 } as const;

/** 맡겨 두는 값 — 오디오 컨텍스트 쌍은 형태만 본다(잎 모듈이라 타입을 import하지 않는다). */
export type VoiceTalkDialHandoff<Audio> = { sessionId: string; audio: Audio; atMs: number };

/** 맡긴 값의 유효 시간(판단값) — 이보다 오래된 값은 다른 진입으로 보고 버린다. */
export const VOICE_TALK_HANDOFF_TTL_MS = 30_000;

let pending: VoiceTalkDialHandoff<unknown> | null = null;

/** 대화방 보이스톡 탭에서 만든 통화 오디오를 맡긴다(이전 값은 덮어쓴다 — 닫기는 호출부 몫). */
export function stashVoiceTalkDial<Audio>(handoff: VoiceTalkDialHandoff<Audio>): void {
  pending = handoff;
}

/**
 * 통화 화면이 이 세션의 발신인지 본다(지우지 않는다 — React 개발 모드의 초기화 2회 호출에도 같은 값).
 * 다른 세션 · 오래된 값이면 `null`.
 */
export function peekVoiceTalkDial<Audio>(sessionId: string, nowMs: number): VoiceTalkDialHandoff<Audio> | null {
  if (!pending || pending.sessionId !== sessionId) return null;
  if (nowMs - pending.atMs > VOICE_TALK_HANDOFF_TTL_MS) return null;
  return pending as VoiceTalkDialHandoff<Audio>;
}

/** 넘겨받았거나(받음 · 취소) 버릴 때 비운다(멱등). */
export function clearVoiceTalkDial(): void {
  pending = null;
}
