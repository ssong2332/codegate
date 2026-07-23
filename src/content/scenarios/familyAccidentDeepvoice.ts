// 시나리오 "가족 납치/사고(딥보이스)" 공개 메타 (T6, AC-001/AC-002).
// Firestore `scenarios/{scenarioId}` 문서로 그대로 seed된다 — 클라 read 허용(공개 메타, Database.md).
//
// 타입은 `functions/src/shared/types.ts`의 ScenarioDoc/DeepvoiceLine과 1:1로 맞춘다. src/(Next.js)와
// functions/(Cloud Functions)는 별도 TS 빌드 루트라 타입을 직접 import하지 않고 필드를 미러링한다
// (Architecture.md §2 "계약 원천 2곳"은 유지하되, 워크스페이스/경로 별칭 도입은 T6 범위 밖 — 필드가
// 바뀌면 두 파일을 함께 갱신해야 한다).
export type DeepvoiceLine = { lineId: string; text: string };
// voiceMode(Phase B, 2026-07-22 사용자 결정): "clone" = 본인 목소리 클론 필요(기존 온보딩 녹음
// 플로우), "generic" = 클론 불필요 — 온보딩 녹음 자체를 생략하고 기본(비복제) TTS로 진행한다.
// callerLabel: play/chat 화면에 표시할 발신자 라벨(시나리오마다 다른 캐릭터를 지어내지 않고
// 여기 한 곳에서만 정의 — 화면 쪽은 이 값을 그대로 쓴다).
export type VoiceMode = "clone" | "generic";
// 메신저피싱 확장(2026-07-23, T27, Architecture.md §13.4와 1:1) — channel/surface/escalation은
// 전부 옵셔널 증분 필드다(Migration Policy 준수, 기존 9종 보이스 시나리오는 필드 부재만으로
// channel="voice"로 간주). channel="messenger" 시나리오는 voiceMode가 의미 없어(AC-028이
// "보이스피싱 분류 하위"로 voiceMode를 한정) voiceMode를 아예 비워 둔다 — 대신 에스컬레이션이
// 가능한 메신저 시나리오는 escalation.voiceMode로 "통화로 넘어갈 때 쓸 목소리"를 별도로 갖는다
// (같은 캐릭터가 채널만 바꿔 이어가는 것이지, 다른 보이스 시나리오로 갈아타는 게 아니므로
// escalation에 voiceScenarioId 같은 별도 시나리오 참조는 두지 않는다 — 명시적 판단).
export type Channel = "voice" | "messenger";
export type MessengerSurface = "kakao" | "sms";
export type EscalationConfig = { toChannel: "voice"; voiceMode: VoiceMode };
export type ScenarioDoc = {
  title: string;
  fraudType: string;
  estimatedDuration: string;
  difficulty: string;
  /**
   * @deprecated 2026-07-22 — 현재 어떤 화면도 이 값을 재생하지 않는다. UX-014 통합 이후 오프닝
   * 음성은 createSession이 LLM으로 생성한 대사를, 통화 중 음성은 실시간 speech-to-speech를
   * 쓴다. 스키마와 데이터는 "고정 대본 오프닝"을 되살릴 여지를 남겨 두려고 보존하지만, 새 코드가
   * 이 필드에 의존하면 안 된다.
   */
  deepvoiceLines: DeepvoiceLine[];
  voiceMode?: VoiceMode; // 보이스피싱 하위 전용(AC-028) — channel="messenger"면 부재
  callerLabel: string;
  channel?: Channel; // 부재="voice"(하위호환)
  surface?: MessengerSurface; // channel="messenger"일 때만
  escalation?: EscalationConfig; // 메신저→보이스 전이 가능한 시나리오만(AC-046)
};

export const FAMILY_ACCIDENT_SCENARIO_ID = "family-accident-deepvoice";

// 대사는 감정적 압박(다급함·가족애·공포)만 재현한다 — 실제 은행명·계좌번호·URL 등 운영 가능한
// 사기 정보는 절대 포함하지 않는다(AC-005, PRD Constraints "법적/윤리").
export const familyAccidentDeepvoiceScenario: ScenarioDoc = {
  title: "가족 납치·사고 딥보이스",
  fraudType: "가족 납치/사고 사칭(딥보이스)",
  estimatedDuration: "약 5~8분",
  difficulty: "중간 — 감정적 압박이 강한 편입니다",
  deepvoiceLines: [
    {
      lineId: "line-1",
      text: "엄마, 나야... 나 사고 났어. 목소리가 이상하지? 지금 많이 다쳤어.",
    },
    {
      lineId: "line-2",
      text: "지금 병원인데... 합의금 때문에 급하게 전화했어. 지금 좀 도와줘.",
    },
    {
      lineId: "line-3",
      text: "아빠한테는 아직 말하지 말고, 지금 나랑 통화하면서 처리하자. 시간이 없어.",
    },
  ],
  voiceMode: "clone",
  callerLabel: "가족 (사칭)",
};
