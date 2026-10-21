// 리포트 내용 검수(2026-10-22, `docs/research/report-content-audit-2026-10.md`) — 리포트 · 되짚어보기의 **표시 문면**만 고친다.
// ⛔ 판정 · 서버 저장값(deceivedMoments · tacticsUsed · preventionAdvice · timeLabel)은 한 글자도 바꾸지 않는다 — 화면에 그릴 때만 거른다.
//
// | # | If | Then | 근거(검수 표) |
// |---|---|---|---|
// | A1 | 수법 라벨 = 서버 폴백 "약화된 사기 수법"(문구 키 · 요구 어형 모두 못 찾음) | 라벨을 그리지 않는다(`displayTactic` → null) | 샘플 41건 중 속음 17건이 이 라벨 — 내부 용어 |
// | A2 | 속은 순간 라벨이 있다 | 요약 제목 = `개선 영역 · '{라벨}'에 응함`(상대 수법을 내 약점처럼 읽히지 않게) | 메인 정책 질문 P-b |
// | A3 | 속은 순간 라벨이 없다(A1) | 요약 제목 = `개선 영역 · 상대의 요구에 응함` | — |
// | A4 | "다음에 해볼 것" 후보 = 조언 목록 중 **마무리 문장이 아니고** 첫 속은 순간 대처와 **다른** 첫 문장 | 그 문장 | 샘플: 속음 41건 중 다수가 요약 첫 줄과 같은 문장 반복 |
// | A5 | A4 후보가 없다(조언이 마무리 문장뿐 · 전부 중복) | `NEXT_ACTION_FALLBACK` | 샘플: 수법 0건이면 마무리 문장("응하지 않았습니다" 반복 · 행동 아님)이 나왔다 |
// | A6 | 시각 표기 "N초 시점"이고 N ≥ 60 | "M분 S초 시점"(S=0이면 "M분 시점") | 긴 통화 "754초 시점"은 어르신이 읽기 어렵다. 큰 시계(#366)는 원문을 읽으므로 원문은 그대로 둔다 |
// | A7 | 그 밖의 시각 표기 | 원문 그대로 | 지어내지 않음 |

/** 서버 `analyzeConversation`의 라벨 폴백(문구 키 · 요구 어형 표가 모두 비었을 때). 화면에는 그리지 않는다. */
export const FALLBACK_TACTIC_LABEL = "약화된 사기 수법";

/** A1 — 화면에 그릴 수법 라벨. 폴백 · 빈 값은 null. */
export function displayTactic(tactic: string | null | undefined): string | null {
  const trimmed = tactic?.trim();
  if (!trimmed || trimmed === FALLBACK_TACTIC_LABEL) return null;
  return trimmed;
}

/** A2 · A3 — 리포트 요약 카드 첫 줄 제목. */
export function deceivedSummaryTitle(tactic: string | null | undefined): string {
  const label = displayTactic(tactic);
  return label ? `개선 영역 · '${label}'에 응함` : "개선 영역 · 상대의 요구에 응함";
}

/** A5 — 조언에서 고를 문장이 없을 때 쓰는 행동 문장. */
export const NEXT_ACTION_FALLBACK =
  "모르는 전화나 메시지가 돈이나 개인정보를 요구하면, 대답하지 말고 끊은 뒤 내가 알고 있는 번호로 직접 확인하세요.";

/** 서버 `buildPreventionAdvice`가 맨 끝에 붙이는 마무리 문장(행동이 아니라 회고) — 시작 어구로 가린다. */
const CLOSING_ADVICE = /^(오늘 놓쳤던 순간을 기억해 두면|이번엔 상대의 요구에 응하지 않았습니다)/;

/** A4 · A5 — 요약 카드 "다음에 해볼 것". */
export function pickNextAction(
  preventionAdvice: readonly string[],
  firstMomentAction: string | null | undefined,
): string {
  const candidate = preventionAdvice.find(
    (advice) => !CLOSING_ADVICE.test(advice) && advice !== firstMomentAction,
  );
  return candidate ?? NEXT_ACTION_FALLBACK;
}

/** A6 · A7 — "754초 시점" → "12분 34초 시점". */
export function formatMomentLabel(timeLabel: string): string {
  const match = /^(\d+)초 시점$/.exec(timeLabel.trim());
  if (!match) return timeLabel;
  const total = Number(match[1]);
  if (total < 60) return timeLabel;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds === 0 ? `${minutes}분 시점` : `${minutes}분 ${seconds}초 시점`;
}

/**
 * 누락 블록 보강 — "실제로 피해가 났다면" 공식 대처(2026-10-22 웹 확인 · 출처는 검수 보고서 §3).
 * | 단계 | 근거 |
 * |---|---|
 * | 112 = 신고 + 지급정지 한 번에 | 보이스피싱 통합대응단(2025-10) · 금감원 "112 원스톱" 안내 |
 * | 돈을 보낸 은행 고객센터 지급정지 | 금감원 · 은행 대처 안내(입금 · 송금 금융회사 콜센터) |
 * | 1332 상담 | 금융감독원 콜센터 |
 * | 개인정보노출자 사고예방시스템 · 명의도용 방지서비스 | 금감원 pd.fss.or.kr · KAIT msafer.or.kr |
 * ⛔ 링크 · 전화 걸기 컨트롤로 만들지 않는다(사후 화면 신규 상호작용 0 — 텍스트만).
 */
export const REAL_DAMAGE_TITLE = "실제로 돈이나 정보를 넘겼다면";
export const REAL_DAMAGE_STEPS: readonly string[] = [
  "바로 112에 전화하세요. 신고와 함께 돈을 보낸 계좌의 지급정지를 요청할 수 있습니다.",
  "돈을 보낸 은행의 고객센터에도 지급정지를 요청하세요.",
  "금융감독원 1332에서 피해 상담을 받을 수 있습니다.",
  "주민등록번호나 신분증을 알려 줬다면 금융감독원 '개인정보노출자 사고예방시스템'(pd.fss.or.kr)에 등록하고, '명의도용 방지서비스'(msafer.or.kr)에서 내 이름으로 개통된 휴대폰이 있는지 확인하세요.",
];

/**
 * 되짚어보기 속은 순간 주석 문장. 주석은 `deceivedMoments.turnIndex`(= 대개 **참가자의 답**) 말풍선에 달리므로, 종전
 * "이 말이 '권위 암시' 신호였습니다"는 내 말을 사기 수법으로 부르는 꼴이었다(검수 표 R-2). 응한 순간으로 부른다.
 */
export function replayMomentNote(timeLabel: string, tactic: string | null | undefined): string {
  const label = displayTactic(tactic);
  const time = formatMomentLabel(timeLabel);
  return label
    ? `${time}: 여기서 상대의 '${label}' 수법에 응했습니다.`
    : `${time}: 여기서 상대의 요구에 응했습니다.`;
}
