// roleplay 모듈 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1 대응(API.md).
import type { MessengerAttachment } from "../shared/types";

// attachments(T29 추가, 옵셔널·하위호환) — 메신저 채팅(UX-022)의 스미싱 링크(§13.2/13.4).
// extractLinkMarker(../roleplay/linkMarker.ts)가 채워 넣는다. 보이스 세션은 항상 부재.
export type ScammerMessage = {
  role: "scammer";
  text: string;
  attachments?: MessengerAttachment[];
};
export type UserMessage = { role: "user"; text: string };

export type SendMessageRequest = {
  sessionId: string;
  userText: string;
  /**
   * §113.2(사용자 결정 2026-10-23) — 참가자가 기기 사진을 보냈다. ⛔ 이미지 · 파일명 · 크기 등 내용은 실리지 않는다(사실만).
   * 참이면 `userText`는 무시되고 서버가 `PHOTO_TURN_TEXT`로 턴을 남긴다(`MessageDoc.photo`).
   */
  photo?: boolean;
  /**
   * ⭐ D-e(P2 실측 2026-11-01 · 메인 "권고대로") — 사진 턴의 종류. `"transfer-receipt"` = 앱이 만든 **이체 완료 화면 캡처**(참가자가 이 대화방에서
   * 훈련용 이체 화면을 제출한 뒤에만 '+'에 나온다 · 이미지는 기기 메모리에만). 부재 = 기기 사진(종전). `photo`가 참일 때만 읽는다.
   */
  photoKind?: "transfer-receipt";
  /**
   * §121.7 PR-3 — 통화 중(메신저에서 넘어온 통화) 대화방에서 보낸 카톡이다. 참이면 `roleplay/chatDuringCall.ts` 경로 — 저장 채널
   * `messenger` · 문자 · 끊기 · 전환 판정 0 · 음성 합성 0.
   */
  duringCall?: boolean;
  /**
   * §129 에뮬 D2(사용자 결정 2026-10-24 ㉠) — 이 탭에서 "받기"를 누른 뒤 지난 ms(클라 상대값 · 시계 차이 무관). 받은 시각이 아직 없는
   * 통화 세션의 첫 턴에서만 `answeredAt = 이번 발화 시각 − 이 값`(세션 생성 시각 아래로는 내려가지 않음)으로 쓴다(`answeredAtFromClient`).
   */
  answeredElapsedMs?: number;
};
export type SendMessageResponse = {
  reply: ScammerMessage;
  turnCount: number;
  ended: boolean;
  /** T192 C3(§79.5 · §79.19 (6) ⑧) — `scammer_ended` = 폴백 끊기 승인으로 이 턴이 세션을 끝냈다(서버 표식 있음). */
  endReason?: "limit_reached" | "scammer_ended";
  /**
   * §112 — 메신저에서 넘어온 통화에서 사기범이 끊었다(폴백 끊기 승인 · `ended`는 `false` — 세션은 active로 남고 표식만 있다).
   * 화면은 마지막 대사 → 끊김 안내 → 전사 제출 → `requestReverseEscalation({followUp})`로 대화방에 돌아간다.
   */
  scammerHungUp?: true;
  /**
   * T7 추가(옵셔널, T19의 isMock 패턴과 동일) — true면 이번 응답이 MockLlmClient 산출물이라는 뜻
   * (LLM_API_KEY 미확보, PRD Risks급 고지). API.md에는 아직 명시 안 됨 — 클라(src/lib/api/types.ts)
   * 미러링은 이번 태스크 범위 밖이라 별도 후속 필요(구현 보고서 참고).
   */
  isMock?: boolean;
  /**
   * 실시간 음성 통화 전환(2026-07-22 사용자 결정) — 사기범 응답을 VoiceProvider(voice/provider.ts)로
   * 합성한 재생 URL. 합성이 실패해도 텍스트 응답 자체는 막지 않으므로 옵셔널이다(P-4 "핵심 루프
   * 비차단" 원칙). Mock 단계에서는 항상 고정 무음 클립 data URI가 온다(isMock으로 구분 — 소리로는
   * 구분하지 않는다, D1/§54.9 (1)).
   */
  audioUrl?: string;
  /**
   * T30 추가(옵셔널, 하위호환) — sendMessage가 이번 응답에서 구조화 신호([[SIGNAL:ESCALATE_VOICE]])
   * 를 감지했거나 메신저 단계 max-turn 폴백에 도달해 서버가 이미 transitionChannel을 호출했다는
   * 뜻(Architecture.md §13.2). 클라는 이 플래그만 보고 통화 전환 연출(P-18)로 넘어간다 — 자유텍스트를
   * 직접 분류하지 않는다(AC-024 불변).
   */
  escalation?: { toChannel: "voice" };
  /**
   * T68 추가(옵셔널, 하위호환, §15.1.2 폴백 경로) — 이번 턴에 통화 중 문자가 도착했다는 뜻.
   * 서버가 `sessions/{sid}/inCallSms/{smsId}` 문서를 이미 write했고 그 턴의 프롬프트에
   * `turnInstruction`(문자를 보냈다고 알리라는 1줄)을 주입했다.
   * ⚠️ **이 필드는 렌더 소스가 아니다** — 화면은 `inCallSms` 구독(onSnapshot)으로 그린다
   * (실시간 경로와 동일한 단일 소스). 클라가 즉시 반응할 수 있게 하는 힌트일 뿐이다.
   */
  sms?: { smsId: string };
};
