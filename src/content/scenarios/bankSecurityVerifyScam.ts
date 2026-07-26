// 시나리오 "직접 확인해 보라는 은행 사칭" 공개 메타 (T95, MVP #29 잔여 — OQ-41 확정 "레버 + 전용
// 1종"의 **전용 1종**). AC-071(D3 확인 시도 무력화 재현)·AC-076(D3 공백 해소)·AC-002.
// voiceMode: "generic" — 금융기관 직원 사칭이라 본인 목소리 클론이 필요 없다. ⚠️ **generic이어야만
// 한다**: 확인 무력화는 Gemini Live/텍스트 폴백 경로에서만 성립하고 clone(ElevenLabs) 경로에는
// 지시 주입 지점이 구조적으로 없다(Architecture.md §16.1.5, §16.6 G23).
// 타입은 familyAccidentDeepvoice.ts의 ScenarioDoc와 1:1 미러(별도 TS 빌드 루트라 import 대신 미러링).
//
// ⚠️ **OQ-38 확정 경계(세션 중에는 상황만)**: 이 시나리오의 카드 문구는 참가자가 *"확인 전화도
// 가로채진다"* 는 주제를 **목적의식적으로 고를 수 있을 만큼**만 알린다(OQ-41 확정 근거). "어디에
// 걸어도 같은 곳으로 이어진다"는 **구조 설명은 어느 문구에도 넣지 않는다** — 그 설명은 리포트·
// 리플레이 해설에서만 한다(AC-071 표현 수위 경계, D-6).
import type { DeepvoiceLine, ScenarioDoc } from "./familyAccidentDeepvoice";

export const BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID = "bank-security-verify-scam";

// 대사는 "의심을 인정하고 오히려 확인을 권하는" 상황만 재현한다 — 실존 은행명·계좌번호·확인창구
// 번호·URL 등 운영 가능한 사기 정보는 절대 포함하지 않는다(AC-005).
// ⚠️ line-2는 확인을 권하되 **창구 이름·번호를 부르지 않는다.** 창구·번호는 앱의 안내 지시가 온
// 뒤에만 등장해야 하며(Architecture.md §16.1.4), 콘텐츠가 먼저 부르면 "대사만 나오고 컨트롤이
// 없는 창"이 생긴다(UF-011 Failure (a)).
const deepvoiceLines: DeepvoiceLine[] = [
  { lineId: "line-1", text: "안녕하세요, 고객님. ○○은행 금융사고대응팀입니다. 고객님 계좌에서 비정상 출금 시도가 확인되어 연락드렸습니다." },
  { lineId: "line-2", text: "의심스러우신 게 당연합니다. 직접 확인해 보셔도 됩니다. 저는 끊지 않고 기다리겠습니다." },
  { lineId: "line-3", text: "확인되시는 대로 이어서 진행하시죠. 그 사이에 출금이 나가지 않도록 저희가 붙잡아 두겠습니다." },
];

export const bankSecurityVerifyScamScenario: ScenarioDoc = {
  title: "직접 확인해 보라는 은행 사칭",
  fraudType: "금융기관 사칭(확인 유도형)",
  estimatedDuration: "약 5~8분",
  difficulty: "높음 — 상대가 먼저 확인을 권해서 의심이 풀리기 쉽습니다",
  deepvoiceLines,
  voiceMode: "generic",
  callerLabel: "070-4133-2085",
};
