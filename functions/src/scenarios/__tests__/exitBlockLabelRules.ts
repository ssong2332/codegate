// 축 D(이탈 차단) 라벨 판정 규칙 — **테스트 헬퍼**(러너 글롭 `*.test.js`에 잡히지 않고 런타임은 import하지 않는다).
// T191 S5에서 `exitBlockEvidence.test.ts`에 있던 규칙표를 **그대로 옮겨** 공유한다 — 흐름 변형 게이트
// (`flowVariants.test.ts` — PRD AC-096 (b) 축 D 범위)가 같은 자로 판정해야 하기 때문이다(사본 0 · 문면 무변경).
// 설계 원칙 유지: 축 D 값 검사는 **테스트에서만** 축 열거형을 쓴다(Architecture T191 절 · l3Depth.ts 경계).
import type { AxisExitBlock } from "../axes";

// ── 판정 규칙표 (임의 판단 금지 — 이 표대로만 적용) ─────────────────────────
//
// 대조 단위는 `weakenedTactics` 문자열의 **라벨부**(첫 "—" 앞)다. 설명부까지 보면 오탐이 난다:
// 예컨대 "다급함 조성 — ... **시간 압박**만 준다"는 라벨이 아니라 설명에 D1 어휘가 들어 있다.
// §17.1.1의 대조는 라벨을 인용했고, 이 표는 그 판정을 기계화한 것이다(재판정 아님).
export const LABEL_RULES: readonly { readonly pattern: RegExp; readonly value: AxisExitBlock }[] = [
  // ⚠️ D3가 먼저다 — "확인 시도 무력화"는 확인을 *막는* 수법(D2)이 아니라 *가로채는* 수법이다.
  { pattern: /확인\s*시도\s*무력화|확인\s*무력화/, value: "D3_verification_hijack" },
  // 확인 차단 / 확인 절차 차단 / 확인 전화 차단 / 주변·원격 확인 차단 + 비밀 유지 + 고립 유도
  { pattern: /확인\s*(절차|전화)?\s*차단/, value: "D2_secrecy" },
  { pattern: /비밀\s*유지/, value: "D2_secrecy" },
  { pattern: /고립\s*유도/, value: "D2_secrecy" },
  { pattern: /(마감|시간)\s*압박/, value: "D1_time_pressure" },
  { pattern: /절차·서류\s*정당화/, value: "D4_procedural_legitimacy" },
  { pattern: /신고\s*차단/, value: "D6_report_blocking" },
  { pattern: /전화\s*끊음\s*저지/, value: "D5_call_retention" },
];

/** 이탈 차단처럼 **보이는 어휘**를 담았지만 D 계열이 **아니라고 판정된** 라벨(§17.1.1이 D로 계수하지
 *  않은 것들). 아래 백스톱이 "미분류 라벨"을 잡으므로, 새 라벨은 규칙표에 넣든 여기 넣든 **판정을
 *  적어야** 통과한다 — 조용히 지나가는 경로를 남기지 않는 것이 이 목록의 목적이다. */
export const REVIEWED_NON_EXIT_BLOCK_LABELS: readonly string[] = [
  // 막연한 시간 제한("3분 드릴게요")이라 §17.1.1이 D1로 계수하지 않았다(kidnapping-threat).
  "촉박한 결정 압박",
  // T92 부인 대응 계열 — 전제("환급 대상")를 정당화하는 것이지 이탈을 막는 절차·서류가 아니다.
  // Architecture.md §18이 *"G60 정정과 절대 섞지 않는다"* 고 명시했다(tax-refund-scam).
  "부인 시 절차 정당화",
  // B·C축(권위로 신뢰를 얻는다)이지 이탈 차단이 아니다(loan-refinance-scam).
  "권위·정당성 포장",
  // 대화 태도(말을 자른다)이지 통화 유지 수법이 아니다(kidnapping-threat).
  "말 끊기",
  // 정보 요구를 재촉하는 E축 행위다(다수 시나리오).
  "확인질문 재촉",
  // 본인확인을 빙자한 개인정보 수집 = E2다(bank-security-verify-scam / tax-refund-scam).
  "본인확인 정보 직접 요구",
  "본인확인 빙자 정보 수집",
];

/** 라벨이 D 계열일 **가능성**을 알리는 어휘. 여기 걸렸는데 규칙표에도 예외 목록에도 없으면 실패한다
 *  — 새 수법 라벨이 태깅 없이 들어오는 것을 막는 백스톱이다.
 *  ⚠️ **한계(정직 고지)**: 이 어휘를 하나도 쓰지 않는 새 이탈 차단 라벨은 못 잡는다. 이 게이트가
 *  보장하는 것은 *"알려진 어휘의 드리프트가 조용히 지나가지 않는다"* 까지다. */
export const SUSPICIOUS_TOKENS = /확인|차단|저지|무력화|비밀|압박|고립|정당|끊|유지|신고/;

export function labelOf(tactic: string): string {
  return tactic.split("—")[0].trim();
}

export function derivedExitBlock(tactics: readonly string[]): AxisExitBlock[] {
  const found = new Set<AxisExitBlock>();
  for (const tactic of tactics) {
    const label = labelOf(tactic);
    for (const rule of LABEL_RULES) {
      if (rule.pattern.test(label)) found.add(rule.value);
    }
  }
  return [...found].sort();
}

