// scenarios(공개 메타) 시딩용 미러 — 진짜 소스는 `src/content/scenarios/familyAccidentDeepvoice.ts`
// (T6, Architecture.md §2·§4가 지정한 T6 소유 폴더)다.
//
// 왜 미러가 필요한가: seed.ts는 functions/ 패키지 안에서 firebase-admin으로 실행되고,
// functions/tsconfig.json의 `include`가 `functions/src/**/*.ts`로 한정돼 있어 `src/`(Next.js
// 루트) 파일을 직접 import할 수 없다(TS6059, rootDir 밖). 새 워크스페이스/경로 별칭 설정은
// T6 범위를 넘는 결정(architect 소관)이라 이번에는 값을 그대로 미러링하는 실용적 절충을 택했다.
// **주의:** src/content/scenarios/familyAccidentDeepvoice.ts를 고치면 이 파일도 함께 고칠 것
// (functions/src/scenarios/__tests__/scenarios.test.ts가 두 파일의 텍스트를 비교해 드리프트를
// 탐지한다).
export type DeepvoiceLine = { lineId: string; text: string };
export type ScenarioMeta = {
  title: string;
  fraudType: string;
  estimatedDuration: string;
  difficulty: string;
  deepvoiceLines: DeepvoiceLine[];
};

export const FAMILY_ACCIDENT_SCENARIO_ID = "family-accident-deepvoice";

export const familyAccidentDeepvoiceScenario: ScenarioMeta = {
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

export const PUBLIC_SCENARIOS: Record<string, ScenarioMeta> = {
  [FAMILY_ACCIDENT_SCENARIO_ID]: familyAccidentDeepvoiceScenario,
};
