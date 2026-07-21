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
// voiceMode/callerLabel — src/content/scenarios/familyAccidentDeepvoice.ts와 동일 필드(Phase B,
// 2026-07-22). 서버 쪽은 이 값을 직접 쓰지 않지만(voiceId 해석은 클라가 마무리해서 넘김) 드리프트
// 탐지 테스트(scenarios.test.ts)가 두 파일을 나란히 검증하므로 필드는 계속 미러링한다.
export type VoiceMode = "clone" | "generic";
export type ScenarioMeta = {
  title: string;
  fraudType: string;
  estimatedDuration: string;
  difficulty: string;
  deepvoiceLines: DeepvoiceLine[];
  voiceMode: VoiceMode;
  callerLabel: string;
};

export const FAMILY_ACCIDENT_SCENARIO_ID = "family-accident-deepvoice";
export const INSTITUTIONAL_IMPERSONATION_SCENARIO_ID = "institutional-impersonation";

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
  voiceMode: "clone",
  callerLabel: "가족 (사칭)",
};

export const institutionalImpersonationScenario: ScenarioMeta = {
  title: "기관 사칭(검찰·금융감독원)",
  fraudType: "수사기관/금융기관 사칭",
  estimatedDuration: "약 5~8분",
  difficulty: "중간 — 권위·공포 소구가 강한 편입니다",
  deepvoiceLines: [
    { lineId: "line-1", text: "안녕하십니까, 수사관입니다. 본인 명의 계좌가 범죄에 연루되어 확인이 필요합니다." },
    { lineId: "line-2", text: "지금 이 사안은 수사 기밀이라 유선으로만 안내됩니다. 침착하게 절차에 협조해 주십시오." },
    { lineId: "line-3", text: "협조하지 않으시면 불이익이 있을 수 있습니다. 지금 통화를 끊지 말고 계속 진행해 주십시오." },
  ],
  voiceMode: "generic",
  callerLabel: "수사관 (기관 사칭)",
};

export const PUBLIC_SCENARIOS: Record<string, ScenarioMeta> = {
  [FAMILY_ACCIDENT_SCENARIO_ID]: familyAccidentDeepvoiceScenario,
  [INSTITUTIONAL_IMPERSONATION_SCENARIO_ID]: institutionalImpersonationScenario,
};
