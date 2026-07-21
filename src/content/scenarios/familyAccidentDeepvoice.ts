// 시나리오 "가족 납치/사고(딥보이스)" 공개 메타 (T6, AC-001/AC-002).
// Firestore `scenarios/{scenarioId}` 문서로 그대로 seed된다 — 클라 read 허용(공개 메타, Database.md).
//
// 타입은 `functions/src/shared/types.ts`의 ScenarioDoc/DeepvoiceLine과 1:1로 맞춘다. src/(Next.js)와
// functions/(Cloud Functions)는 별도 TS 빌드 루트라 타입을 직접 import하지 않고 필드를 미러링한다
// (Architecture.md §2 "계약 원천 2곳"은 유지하되, 워크스페이스/경로 별칭 도입은 T6 범위 밖 — 필드가
// 바뀌면 두 파일을 함께 갱신해야 한다).
export type DeepvoiceLine = { lineId: string; text: string };
export type ScenarioDoc = {
  title: string;
  fraudType: string;
  estimatedDuration: string;
  difficulty: string;
  deepvoiceLines: DeepvoiceLine[];
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
};
