// 2026-11-07 Edge 시험(판 1 · 2 · 3 · 17 · 18 · 20 · 22) — "시도된 수법" 목록 누락 보강. 순수 함수.
//
// 왜: 수법 추정은 저작 인용구의 문구 키(`analyzeConversation.findMatchedTactics`)와 요구 3종 어형 표(`resolveDemandFallbackTactic`)뿐이라,
// 실 LLM이 확인 차단 · 인증번호 · 비밀번호 요구를 **바꿔 말하면** 목록에서 빠졌다(판 2 · 17 · 18 · 20 "확인 차단 없음",
// 판 1 "인증번호 요구 없음", 판 3 "비밀번호 요구 없음", 판 22 "명의 도용 협박 없음").
//
// ⛔ 금지
//   - 속은 순간(개수 · turnIndex · 라벨) · `wasDeceived` 변경 0 — 이 표는 **시도된 수법 목록에만** 더한다.
//   - 새 라벨 발명 0 — 그 세션(통화) 목록 안의 저작 라벨만 쓴다. 맞는 라벨이 목록에 없으면 아무것도 더하지 않는다.
//   - 공유 패턴(`RESISTANCE_PATTERN` · `COMPLIANCE_PATTERN` · `REFUSAL_IN_ANSWER`) 무변경.
//
// 판정표(사기범 대사 한 문장 기준 · 위에서부터 모든 행을 본다 — 한 대사가 여러 행에 맞으면 여러 라벨):
// | # | If(같은 문장) | 라벨 후보(세션 목록 안 · 범주 + 우선 어휘) |
// |---|---|---|
// | A1 | 인증번호 · 인증 코드 + 불러/말씀해/알려/입력해/읽어 | 라벨에 `인증번호`가 든 것 |
// | A2 | 비밀번호 · 비번 + 불러/말씀해/알려/입력해/누르 | 라벨에 `비밀번호`가 든 것 |
// | A3 | 확인 차단: 직접 확인 + 어렵/안 됩/못/필요 없 · 번호를 따로/임의로 찾지/걸지 마 · 영상통화 + 안 돼/어려/못 · 확인/연락/신고하시면 + 복잡/불이익/곤란/처벌 · 다른 데/경찰/은행/가족 + 연락/알리 + 마/면 안 · 통화가 안 돼/어려 | `verification_block` 범주 중 `확인 · 무력화 · 차단 · 얼버무` 든 것 우선 |
// | A4 | 끊지 마 · 끊으시면 안 · 끊으면 안 | `verification_block` 범주 중 `끊음` 든 것 우선 |
// | A5 | 명의가 도용 · 명의 도용 · 명의로 개설/발급된 | 라벨에 `명의 도용`이 든 것 |
// | — | 맞는 행이 있어도 위 후보가 목록에 없음 | 더하지 않음 |
// ⚠️ 한계(투명 고지): 어휘 표라 표 밖 표현("이 번호 말고는 연결이 안 됩니다")은 여전히 못 잡는다.
import { extractTacticLabel } from "../scenarios/tacticFlavor";
import { resolveTacticCategory } from "./tacticCategory";

const OTP_REQUEST = /인증\s*(?:번호|코드)[^.?!\n]{0,30}?(?:불러|말씀해|알려|입력해|읽어)/;
const PASSWORD_REQUEST = /(?:비밀\s*번호|비번)[^.?!\n]{0,30}?(?:불러|말씀해|알려|입력해|누르|눌러)/;
const VERIFICATION_BLOCK = new RegExp(
  [
    String.raw`직접\s*확인[^.?!\n]{0,12}?(?:어렵|어려우|어려워|안\s*됩|안\s*돼|못\s*하|하실\s*수\s*없|필요\s*없)`,
    String.raw`(?:따로|임의로|직접)\s*(?:번호|전화)[^.?!\n]{0,12}?(?:찾지|걸지|하지)\s*마`,
    String.raw`영상\s*통화[^.?!\n]{0,15}?(?:안\s*돼|안\s*되|어려|못\s*해|힘들)`,
    String.raw`(?:확인|연락|신고)\s*하시(?:면|는\s*순간)[^.?!\n]{0,20}?(?:복잡|불이익|곤란|처벌|문제)`,
    String.raw`(?:다른\s*(?:곳|데)|경찰|은행|가족)[^.?!\n]{0,12}?(?:연락|알리|말씀|얘기)[^.?!\n]{0,8}?(?:하지\s*마|마세요|마십시오|면\s*안)`,
    String.raw`(?:통화|전화)\s*(?:가|는)?\s*(?:안\s*돼|안\s*되|어려워|힘들어)`,
  ].join("|"),
);
const HANGUP_BLOCK = /끊지\s*마|끊으시면\s*안|끊으면\s*안/;
const IDENTITY_THEFT_THREAT = /명의가\s*도용|명의\s*도용|명의로\s*(?:개설|발급|만들어)된/;

type AttemptRow = { line: RegExp; pick: (labels: readonly string[]) => string | undefined };

const byWord = (word: RegExp) => (labels: readonly string[]) => labels.find((label) => word.test(label));
const verificationBlock = (prefer: RegExp) => (labels: readonly string[]) => {
  const candidates = labels.filter((label) => resolveTacticCategory(label) === "verification_block");
  return candidates.find((label) => prefer.test(label)) ?? candidates[0];
};

const ATTEMPT_ROWS: readonly AttemptRow[] = [
  { line: OTP_REQUEST, pick: byWord(/인증\s*번호/) }, // A1
  { line: PASSWORD_REQUEST, pick: byWord(/비밀\s*번호/) }, // A2
  { line: VERIFICATION_BLOCK, pick: verificationBlock(/확인|무력화|차단|얼버무/) }, // A3
  { line: HANGUP_BLOCK, pick: verificationBlock(/끊음/) }, // A4
  { line: IDENTITY_THEFT_THREAT, pick: byWord(/명의\s*도용/) }, // A5
];

/** 사기범 대사 한 줄에서 위 표가 고른 라벨(세션 목록 안 · 중복 제거 · 표 순서). */
export function resolveAttemptedTacticLabels(scammerText: string, weakenedTactics: readonly string[]): string[] {
  const labels = weakenedTactics.map(extractTacticLabel);
  const sentences = scammerText.split(/[.?!\n]+/).filter((s) => s.trim().length > 0);
  const out: string[] = [];
  for (const row of ATTEMPT_ROWS) {
    if (!sentences.some((sentence) => row.line.test(sentence))) continue;
    const label = row.pick(labels);
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/** 속은 순간 라벨 보정(판 1 · 3) — 인증번호 · 비밀번호를 불러 준 순간은 그 이름이 든 목록 라벨을 먼저 쓴다(없으면 `undefined` = 종전 L3). */
export function resolveSecretCodeLabel(scammerText: string, weakenedTactics: readonly string[]): string | undefined {
  const labels = weakenedTactics.map(extractTacticLabel);
  if (OTP_REQUEST.test(scammerText)) {
    const otp = byWord(/인증\s*번호/)(labels);
    if (otp) return otp;
  }
  if (PASSWORD_REQUEST.test(scammerText)) return byWord(/비밀\s*번호/)(labels);
  return undefined;
}
