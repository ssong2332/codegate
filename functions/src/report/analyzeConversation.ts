// 대화 로그 규칙 기반 분석 (Track A, T9, AC-008/AC-009/AC-026). 순수 함수 — Firestore 없이
// 단위 테스트 가능(roleplay/sessionLimits.ts와 동일 패턴).
//
// ⚠️ 투명 고지: "속았는지"를 실제 LLM이 판단하는 게 아니라, 사용자 응답 텍스트의 저항/순응
// 키워드를 정규식으로 매칭하는 규칙 기반 판정이다 — 이 분석 함수 자체가 getLlmClient()를 전혀
// 호출하지 않는 순수 로직으로 설계됐기 때문이다(functions/src/llm/index.ts가 이제 GEMINI_API_KEY
// 존재 시 실 Gemini를 반환하지만, 그건 대화 생성 경로 얘기고 이 리포트 분석은 애초에 그 경로를
// 타지 않는다 — DECISIONS #29 참고). 사기범 발화가 어떤 weakenedTactics를 썼는지도 같은 이유로
// 텍스트 부분 일치로 추정한다(Mock 대사에서는 flavor 문구가 그대로 섞여 들어가 이 방식이
// 성립하지만 — 실 LLM 대사는 표현이 자유로워 이 부분 일치 추정이 덜 정확할 수 있다). 실 LLM
// 응답까지 반영한 분석(예: LLM 자체에 판정을 위임)으로 교체하려면 이 함수를 별도로 확장해야 한다
// (T9/T19와 동일한 "규칙 기반 잔존 위험" 원칙).
//
// ⚠️ 정확도 버그 수정(2026-07-24, "시도된 수법" 검증 중 발견) — flavor 추출 로직이 이 파일에
// 별도로("— 이후 설명부 전체") 구현돼 있었는데, MockLlmClient.craftEscalationLine이 실제로 대사에
// 심는 문구(scenarios/tacticFlavor.ts, "인용구'만' 추출")와 어긋나 findMatchedTactic()이 Mock
// 대사에서조차 한 번도 매치하지 못하고 있었다(라이브 에뮬레이터로 tacticsUsed가 항상 빈 배열로
// 나오는 것을 확인). 이제 대사를 만드는 쪽(mockClient.ts)과 찾는 쪽(여기)이 scenarios/
// tacticFlavor.ts 공용 함수 하나만 참조해 같은 텍스트를 기준으로 삼는다.
import { extractTacticFlavor, extractTacticLabel } from "../scenarios/tacticFlavor";

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
// — 순응 키워드와 동시에 등장해도 저항을 우선한다, 예: "계좌 알려주면 확인하고 다시 전화할게"는
// 여전히 위험 신호지만 최소 판정 기준으로는 저항 우선이 과소판정보다 안전하다: 실제로 속지 않은
// 사용자를 "속았다"고 오판하는 것이 그 반대보다 신뢰를 더 해친다).
//
// ⚠️ 정확도 버그 수정(2026-07-24, 사용자 실측 신고로 발견 — "일부러 사기에 넘어가는 척 응했는데
// 리포트가 '요구에 응하지 않음'으로 표시됨"). 라이브 에뮬레이터로 실제 sendMessage→generateReport
// 경로를 통해 재현·검증한 두 가지 원인:
// (1) `확인하고\s*(다시)?`의 `(다시)?`가 옵셔널이라 "확인하고 바로 송금하겠습니다"처럼 순응
//     발화에 "확인하고"라는 흔한 필러만 있어도 저항으로 오판정되어(우선순위상) 명백한 순응
//     신호("송금")까지 통째로 무시됐다 — "다시"를 필수로 만들어 "확인하고 다시 전화/확인"류
//     진짜 재확인 의도만 저항으로 잡는다.
// (2) COMPLIANCE_PATTERN이 비격식 어미·특정 명사(계좌/송금/이체 등)로만 좁게 구성되어 "네,
//     말씀하신 대로 바로 처리하겠습니다"처럼 격식체·일반 지시-순응 표현은 아무 키워드도 맞지
//     않아 순응 신호 자체가 감지되지 않았다 — "말씀하신 대로" 류 일반 순응 표현을 추가한다.
//
// ⚠️ reviewer 리젝션 후속 수정(2026-07-24, Critical) — 위 (2)의 최초 구현은 "말씀하신 대로는
// 못 하겠습니다" 같은 부정문 오탐을 막으려고 `못\s*하겠|안\s*하겠|하지\s*않겠|거절`를
// RESISTANCE_PATTERN에 "독립" 항목으로 추가했었다. 그런데 이 단어들은 무엇을 부정하는지 범위가
// 전혀 없는 범용 한국어 완곡 표현이라, 메시지 어디에 있든(다른 내용과 무관하게) 통째로 저항
// 판정을 덮어써 버리는 "블랭킷 오버라이드" 버그를 새로 만들었다 — reviewer가 직접 코드 실행으로
// 재현(예: "정말 거절하고 싶은데 무서워서 계좌번호 알려드릴게요"처럼 망설임-후-순응 문구가 전부
// wasDeceived:false로 오판정됨, 실제로는 계좌번호를 알려줬으므로 true여야 한다). **수정**: 독립
// 항목을 제거하고, 부정이 실제로 "말씀하신/시키는/하라는/알려주신 대로" 순응 트리거 문구에 직접
// 붙는 경우만 잡는 단일 결합 패턴으로 범위를 좁힌다 — "거절"/"못 하겠"/"안 하겠"/"하지 않겠"을
// 메시지 아무 데서나 발견되는 독립 저항 신호로 취급하지 않는다(회귀 테스트: 4건 망설임-후-순응
// 케이스 + 기존 "말씀하신 대로는 못 하겠습니다" 저항 케이스 모두 통과).
// ⚠️ export 이유(T70, Architecture.md §15.2.3 · §15.6 G7) — 즉시 되감기(UX-028)의 규칙 폴백
// 판정이 이 패턴을 **복제하지 않고 그대로 재사용**한다. 복제하면 같은 답변이 리포트와 되감기에서
// 다르게 판정되는 드리프트가 생긴다(ADR-0008 "패턴 상수를 복제하지 말고 export"). 이 파일 안에서의
// 쓰임과 판정 우선순위(저항 우선)는 무변경이다.
export const RESISTANCE_PATTERN =
  /직접\s*전화|다시\s*전화|확인해\s*볼게|확인하고\s*다시|경찰|신고|의심|그럴\s*리가|안\s*믿어|못\s*믿|끊을게|끊고|영상통화|본인\s*확인|나중에\s*(다시)?\s*확인|(말씀하신|시키는|하라는|알려주신)\s*대로\s*는?\s*(못|안)\s*하겠/;

// ⚠️ reviewer Major 후속 조치(2026-07-24, non-blocking) — 이 브랜치가 새로 추가한 격식 어미
// "알겠습니다|알겠어요"를 실제 행동 명사(계좌/송금/이체 등) 동반 없이 독립 트리거로 두면, "네,
// 알겠습니다" 뒤에 아무 행동도 안 하고 미루기만 하는 답변까지 순응으로 오판정할 위험이 있다
// (비격식 "알겠어|알았어"도 구조는 같지만 이 브랜치 이전부터 있던 것이라 범위 밖, reviewer 지적).
// 다만 이 alternation은 OR 매칭이라 계좌\s*(번호)?|송금|이체|카드\s*번호|비밀번호 등 행동 명사가
// 이미 독립 항목으로 존재해, "알겠습니다가 행동 명사와 함께 나올 때만 인정"하는 근접 가드를 따로
// 추가해도 행동 명사 항목이 이미 매치해 최종 판정이 완전히 동일해진다 — 근접 가드는 이 구조에서
// 상시 중복(no-op)이다. 그래서 근접 가드를 얹는 대신 격식 어미 단독 항목 자체를 제거해 동일한
// 효과(단독 "알겠습니다"만으로는 더 이상 순응 신호가 아님)를 더 단순하게 얻는다.
// ⚠️ 정확도 버그 수정 2차(2026-07-25, 사용자 실측 신고 — "시나리오대로 따라가서 대출을 한다고
// 했는데 리포트는 잘 대처했다/요구에 응하지 않았다고 나온다", "본인인증을 성함과 주민번호 앞자리를
// 말하는 것이 자동으로 넘어간다"). 코드 추적으로 확인한 두 개의 독립적인 누락:
//
// (A) **마스킹 토큰이 순응 신호에서 빠져 있었다(가장 치명적).** analyzeConversation은 원문이 아니라
//     `textMasked`(maskPII 적용 후)를 본다. 즉 사용자가 주민번호를 불러주면 저장되는 텍스트는
//     "제 [주민번호]입니다"다 — 그런데 이 패턴에 `주민번호`가 없어(있는 건 `카드\s*번호`·`비밀번호`)
//     **개인정보를 넘겨준 가장 전형적인 순응 행위가 통째로 감지되지 않았다.** `[계좌]`는 `계좌` 항목에
//     우연히 걸려 있었지만 `[주민번호]`·`[전화]`·`[이메일]`은 전부 미감지였다. 마스킹은 원문을 지울
//     뿐 "넘겨줬다"는 사실 자체는 그대로이므로, 토큰을 명시적 순응 신호로 넣는다.
//
// (B) **"돈을 보낸다" 계열 동사에만 맞춰져 있어 일반 승낙 표현이 전부 빠졌다.** 대출/설치/방문
//     유도처럼 송금이 아닌 요구에 응하는 경우("네 진행해주세요", "그렇게 할게요", "신청할게요",
//     "설치했어요")가 하나도 매치되지 않았다 — 사용자가 신고한 대출 시나리오가 정확히 이 경우다.
//
// (C) 숫자만으로 이뤄진 답변(키패드로 인증번호를 눌러 보내는 경우 등)은 문맥상 "불러달라는 번호를
//     불러줬다"는 순응이 거의 확실하므로 별도 항목으로 잡는다. 숫자가 섞인 일반 문장("10만원은
//     좀…")까지 잡지 않도록 **답변 전체가 숫자·공백·하이픈뿐일 때만** 매치하는 앵커를 쓴다.
//
// 설계 원칙(T52 reviewer Critical 재발 방지): 저항 우선순위는 그대로 유지한다(`resisted ||
// !complied` 순서 무변경). 아래 추가 항목은 전부 **순응 쪽**이라 저항 신호가 있으면 여전히 저항이
// 이긴다. 또한 "할게"·"네" 같은 범용 어미를 단독으로 넣지 않고 반드시 행동 동사와 결합해
// (`진행/신청/설치/받을게` 등) 오탐 범위를 좁혔다 — 단독 완곡표현을 독립 항목으로 넣었다가
// 블랭킷 오버라이드 버그를 만든 T52의 실패를 반복하지 않기 위해서다.
// ⚠️ export 이유는 RESISTANCE_PATTERN과 동일(T70, §15.6 G7 — 되감기 규칙 폴백이 재사용).
export const COMPLIANCE_PATTERN =
  /알겠어|알았어|보내줄게|보낼게|보내드릴게|보내드리겠|보내겠|계좌\s*(번호)?|얼마(면|야)?|송금|이체|카드\s*번호|비밀번호|어디로\s*(보내|가면)|지금\s*갈게|바로\s*갈게|믿을게|그래[,.]?\s*알았|어떻게\s*하면\s*돼|말씀하신\s*대로|시키는\s*대로|하라는\s*대로|알려주신\s*대로|\[주민번호\]|\[전화\]|\[이메일\]|\[계좌\]|진행\s*(해|할게|하겠|해주|시켜)|신청\s*(할게|하겠|해주|합니다|했)|설치\s*(할게|하겠|해주|했|합니다)|(대출|입금|출금|이체|송금|결제)\s*(받을게|받겠|받을래|할게|하겠|해주|했)|(그렇게|그럼|그러면)\s*\s*(할게|하겠|해주|해 주)|불러\s*드릴게|알려\s*드릴게|알려\s*줄게|말씀\s*드릴게|^\s*[\d\s-]{4,}\s*$/;

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
