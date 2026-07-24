// 대화 로그 규칙 기반 분석 (Track A, T9, AC-008/AC-009/AC-026). 순수 함수 — Firestore 없이
// 단위 테스트 가능(roleplay/sessionLimits.ts와 동일 패턴).
//
// ⚠️ 투명 고지: "속았는지"를 실제 LLM이 판단하는 게 아니라, 사용자 응답 텍스트의 저항/순응
// 키워드를 정규식으로 매칭하는 규칙 기반 판정이다 — 이 분석 함수 자체가 getLlmClient()를 전혀
// 호출하지 않는 순수 로직으로 설계됐기 때문이다(functions/src/llm/index.ts가 이제 GEMINI_API_KEY
// 존재 시 실 Gemini를 반환하지만, 그건 대화 생성 경로 얘기고 이 리포트 분석은 애초에 그 경로를
// 타지 않는다 — DECISIONS #29 참고). 사기범 발화가 어떤 weakenedTactics를 썼는지도 같은 이유로
// 텍스트 부분 일치로 추정한다(Mock 대사에서는 flavor 문구가 그대로 섞여 들어가 이 방식이
// 성립하지만 — MockLlmClient.craftEscalationLine 참고 — 실 LLM 대사는 표현이 자유로워 이 부분
// 일치 추정이 덜 정확할 수 있다). 실 LLM 응답까지 반영한 분석(예: LLM 자체에 판정을 위임)으로
// 교체하려면 이 함수를 별도로 확장해야 한다(T9/T19와 동일한 "규칙 기반 잔존 위험" 원칙).
export type AnalysisMessage = {
  role: "scammer" | "user";
  textMasked: string;
  turnIndex: number;
  createdAtMs: number;
};

export type DeceivedMomentResult = {
  turnIndex: number;
  timeLabel: string;
  tactic: string;
  correctAction: string;
};

export type ConversationAnalysis = {
  wasDeceived: boolean;
  deceivedMoments: DeceivedMomentResult[];
  tacticsUsed: string[];
};

// 사용자가 확인·의심·거절 신호를 보이면 그 순간은 "속지 않음"으로 판정한다(저항이 우선순위 높음
// — 순응 키워드와 동시에 등장해도 저항을 우선한다, 예: "계좌 알려주면 확인하고 보낼게"는 여전히
// 위험 신호지만 최소 판정 기준으로는 저항 우선이 과소판정보다 안전하다: 실제로 속지 않은 사용자를
// "속았다"고 오판하는 것이 그 반대보다 신뢰를 더 해친다).
const RESISTANCE_PATTERN =
  /직접\s*전화|다시\s*전화|확인해\s*볼게|확인하고\s*(다시)?|경찰|신고|의심|그럴\s*리가|안\s*믿어|못\s*믿|끊을게|끊고|영상통화|본인\s*확인|나중에\s*(다시)?\s*확인/;

const COMPLIANCE_PATTERN =
  /알겠어|알았어|보내줄게|보낼게|계좌\s*(번호)?|얼마(면|야)?|송금|이체|카드\s*번호|비밀번호|어디로\s*(보내|가면)|지금\s*갈게|바로\s*갈게|믿을게|그래[,.]?\s*알았|어떻게\s*하면\s*돼/;

/** weakenedTactics 항목은 "라벨 — 설명" 형식이다(scenarioPrompts, ADR-0004). 라벨만 취한다. */
function extractTacticLabel(tacticText: string): string {
  const dashIndex = tacticText.indexOf("—");
  return (dashIndex === -1 ? tacticText : tacticText.slice(0, dashIndex)).trim();
}

/** 시나리오 예방 조언(pickCorrectAction)에서도 재사용 — tacticAdvice.ts 참고. */
function extractTacticFlavor(tacticText: string): string {
  const dashIndex = tacticText.indexOf("—");
  const flavor = dashIndex === -1 ? tacticText : tacticText.slice(dashIndex + 1).trim();
  return flavor.replace(/\.$/, "");
}

/** 사기범 발화 텍스트에 어떤 weakenedTactics의 flavor 문구가 섞여 있는지 부분 일치로 추정한다.
 * flavor는 설명문이라 문장 전체 일치를 기대하기 어려우므로 앞부분(최대 8자)만 비교한다 — 과도한
 * 정밀 매칭은 Mock 대사 표현 편차(어미 변형 등)에 약하다. */
function findMatchedTactic(scammerText: string, weakenedTactics: string[]): string | undefined {
  return weakenedTactics.find((tactic) => {
    const flavor = extractTacticFlavor(tactic);
    return flavor.length > 0 && scammerText.includes(flavor.slice(0, Math.min(8, flavor.length)));
  });
}

export function analyzeConversation(
  messages: AnalysisMessage[],
  sessionCreatedAtMs: number,
  weakenedTactics: string[],
): ConversationAnalysis {
  const sorted = [...messages].sort((a, b) => a.turnIndex - b.turnIndex);
  const deceivedMoments: DeceivedMomentResult[] = [];
  const tacticLabelsUsed = new Set<string>();

  for (let i = 0; i < sorted.length; i += 1) {
    const msg = sorted[i];
    if (msg.role !== "scammer") continue;

    const matchedTactic = findMatchedTactic(msg.textMasked, weakenedTactics);
    if (matchedTactic) {
      tacticLabelsUsed.add(extractTacticLabel(matchedTactic));
    }

    const userReply = sorted[i + 1];
    if (!userReply || userReply.role !== "user") continue;

    const resisted = RESISTANCE_PATTERN.test(userReply.textMasked);
    const complied = COMPLIANCE_PATTERN.test(userReply.textMasked);
    if (resisted || !complied) continue;

    const tactic = matchedTactic ? extractTacticLabel(matchedTactic) : "약화된 사기 수법";
    // AC-026 예시("15초 시점에 속았습니다")를 그대로 따르기 위해 turnIndex가 아니라 실제 경과
    // 시간(초)을 라벨로 쓴다 — MessageDoc.createdAt이 이미 존재하므로 정확한 초 단위 계산이
    // 가능하다(구현 판단, Mock 단계라 정밀 음성 타이밍 데이터는 없지만 메시지 write 시각은 실측값).
    const elapsedSec = Math.max(0, Math.round((userReply.createdAtMs - sessionCreatedAtMs) / 1000));
    deceivedMoments.push({
      turnIndex: userReply.turnIndex,
      timeLabel: `${elapsedSec}초 시점`,
      tactic,
      correctAction: pickCorrectAction(tactic),
    });
  }

  return {
    wasDeceived: deceivedMoments.length > 0,
    deceivedMoments,
    tacticsUsed: Array.from(tacticLabelsUsed),
  };
}

/** 수법 라벨 키워드로 올바른 대처법을 고른다(AC-026 "그 순간 취했어야 할 올바른 대처"). 특정
 * 시나리오의 정확한 라벨 문자열에 하드코딩하지 않고 키워드 부분 일치로 판정해, 향후 다른 시나리오
 * (T6 "기관사칭" 등)가 추가돼도 이 모듈을 고치지 않고 재사용 가능하게 한다. */
export function pickCorrectAction(tacticLabel: string): string {
  if (/확인|전화/.test(tacticLabel)) {
    return "상대가 확인 전화를 막으려 해도 반드시 알고 있는 번호로 직접 전화해 사실을 확인하세요.";
  }
  if (/송금|계좌/.test(tacticLabel)) {
    return "계좌번호나 송금을 요구받으면 절대 응하지 말고, 전화를 끊은 뒤 112(경찰)나 가족에게 직접 확인하세요.";
  }
  if (/다급|긴급|시간/.test(tacticLabel)) {
    return "아무리 다급해 보여도 그 자리에서 결정하지 말고, 일단 전화를 끊고 잠시 시간을 두어 사실관계를 확인하세요.";
  }
  if (/가족|죄책감|애정/.test(tacticLabel)) {
    return "감정이 흔들리더라도 실제 그 사람이 맞는지부터 다른 방법(직접 전화·영상통화)으로 확인하세요.";
  }
  if (/권위|기관|경찰|공공/.test(tacticLabel)) {
    return "전화로 신원(경찰·기관 등)을 주장해도 그 자리에서 믿지 말고, 공식 대표번호로 직접 걸어 확인하세요.";
  }
  return "전화를 끊고 알고 있는 번호로 직접 다시 연락해 사실을 확인하세요.";
}

/** 예방 조언(AC-008 "예방 조언 1개 이상"). 감지된 수법별 대처법 + 마무리 조언 1개를 합친다.
 * "면역됨"류 과신 표현은 쓰지 않는다(PRD Risks, UX.md Accessibility) — 속았든 안 속았든 "개선
 * 영역/계속 유지해야 할 습관" 프레임을 쓴다. */
export function buildPreventionAdvice(tacticsUsed: string[], wasDeceived: boolean): string[] {
  const perTacticAdvice = tacticsUsed.map((tactic) => pickCorrectAction(tactic));
  const advice = Array.from(new Set(perTacticAdvice));

  advice.push(
    wasDeceived
      ? "오늘 놓쳤던 순간을 기억해 두면 다음엔 더 빨리 알아챌 수 있습니다. 이건 한 번에 사라지는 게 아니라 계속 연습해야 하는 개선 영역입니다."
      : "이번엔 상대의 요구에 응하지 않았습니다. 다만 사기 수법은 계속 진화하므로, 오늘처럼 전화를 끊고 직접 확인하는 습관을 계속 유지하는 것이 중요합니다.",
  );

  return advice;
}
