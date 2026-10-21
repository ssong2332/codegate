// 시나리오 "택배 배송 실패 스미싱(문자)" 공개 메타 (2026-07-23, T27 메신저피싱 확장, OQ-19
// 표면 넓게). channel="messenger", surface="sms". 스미싱 링크형 — 실 URL 없이 무해 표기만
// 사용한다(AC-032/045). 초급 · 중급은 에스컬레이션 대상 아님(순수 링크 클릭 유도형 체험).
// T194-a(Architecture.md §84.4.1 · PRD AC-106) — **고급만** 문자 → 모의 앱 설치 → 상담원 전화로 이어진다
// (`advancedEscalation`). 서버 미러(functions/src/scenarios/publicMeta.ts)와 같은 값이다.
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID = "messenger-parcel-smishing-sms";

const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "[국제택배] 고객님 물품이 주소지 오류로 배송이 보류되었습니다. 아래에서 주소를 확인해 주세요." },
];

export const messengerParcelSmishingSmsScenario: ScenarioDoc = {
  title: "택배 배송 실패 스미싱(문자)",
  fraudType: "택배사 사칭 문자(링크 누르기 유도)",
  estimatedDuration: "약 3~5분",
  difficulty: "늘 받는 택배 문자라 의심하기 어렵고, 고급에서는 상담원 전화로 이어집니다",
  deepvoiceLines,
  callerLabel: "070-7731-4408",
  channel: "messenger",
  surface: "sms",
  advancedEscalation: { toChannel: "voice", voiceMode: "generic" },
};
