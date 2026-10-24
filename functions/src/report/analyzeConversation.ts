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
//
// ⚠️ 정확도 버그 수정(2026-10-17, 라이브 실측 — 인증번호를 불러 준 세션이 "속지 않았습니다 · 시도된
// 수법 0가지"로 나왔다). 판정 쪽은 아래 `COMPLIANCE_PATTERN` (D), 수법 추정 쪽은 `buildTacticMatchers`
// 주석에 근거를 적었다. 판정은 여전히 규칙 기반이다(DECISIONS #29 무변경 — LLM 판정 도입 아님).
import {
  extractTacticFlavor,
  extractTacticLabel,
  STRUCTURED_MARKER_PATTERN,
} from "../scenarios/tacticFlavor";
import type { MessengerChannel, RiskSignal, RiskSignalKind } from "../shared/types";
import { resolveTacticCategory, type TacticCategory } from "./tacticCategory";
import { CODE_DIGITS_WITH_ENDING, CODE_HANGUL_DIGITS, extractSpokenCodes } from "../shared/spokenDigits";
import { PHOTO_DEMAND } from "../roleplay/photoTurn";

/** 대처법·예방 조언 문구를 고르는 채널. 부재는 "voice"다(`MessageDoc.channel` 하위호환 규칙과 같다). */
export type AdviceChannel = MessengerChannel;

export type AnalysisMessage = {
  role: "scammer" | "user";
  textMasked: string;
  turnIndex: number;
  createdAtMs: number;
  /** §55 D3 — 참가자에게 도달하지 않은 문서(부재 = 도달함). 분석 입력에서 제외한다. */
  notSpoken?: true;
  /**
   * T30 채널 표기(부재 = "voice"). ⚠️ **판정에는 쓰지 않는다** — 속은 순간의 `correctAction` 문구를
   * 그 답변이 오간 채널에 맞추는 데만 쓴다(2026-10-17 — 메신저 세션에도 "전화를 끊고"가 나왔다).
   */
  channel?: AdviceChannel;
  /** §113.2 — 참가자가 기기 사진을 보낸 턴(서버 `MessageDoc.photo`). 판정 H3 입력. */
  photo?: true;
};

export type DeceivedMomentResult = {
  turnIndex: number;
  timeLabel: string;
  tactic: string;
  correctAction: string;
  // T74(§15.4.2/AC-068) — 실패 아카이브의 "수법별 묶기" 그룹 키. 판정 로직에는 전혀 관여하지
  // 않는다(wasDeceived·deceivedMoments 산출은 무변경) — 집계용 라벨 정규화일 뿐이다.
  tacticCategory: TacticCategory;
  /** T129 (b)(§35.6 · §98) — 모의 화면 승격 순간에만(`buildLandingSubmitMoment`). 대화 추정 순간에는 없다. */
  landingId?: string;
};

export type ConversationAnalysis = {
  wasDeceived: boolean;
  deceivedMoments: DeceivedMomentResult[];
  tacticsUsed: string[];
  /** 사용자 결정 2026-10-21 ② — 속음은 아니지만 위험했던 참가자 줄(아래 `RISK_SIGNAL_ROWS`). 속은 순간과 겹치지 않는다. */
  riskSignals: RiskSignal[];
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
const BASE_COMPLIANCE_PATTERN =
  /알겠어|알았어|보내줄게|보낼게|보내드릴게|보내드리겠|보내겠|계좌\s*(번호)?|얼마(면|야)?|송금|이체|카드\s*번호|비밀번호|어디로\s*(보내|가면)|지금\s*갈게|바로\s*갈게|믿을게|그래[,.]?\s*알았|어떻게\s*하면\s*돼|말씀하신\s*대로|시키는\s*대로|하라는\s*대로|알려주신\s*대로|\[주민번호\]|\[전화\]|\[이메일\]|\[계좌\]|진행\s*(해|할게|하겠|해주|시켜)|신청\s*(할게|하겠|해주|합니다|했)|설치\s*(할게|하겠|해주|했|합니다)|(대출|입금|출금|이체|송금|결제)\s*(받을게|받겠|받을래|할게|하겠|해주|했)|(그렇게|그럼|그러면)\s*\s*(할게|하겠|해주|해 주)|불러\s*드릴게|알려\s*드릴게|알려\s*줄게|말씀\s*드릴게|^\s*[\d\s-]{4,}\s*$/;

// ⚠️ 정확도 버그 수정 3차(2026-10-17, 라이브 실측 — 기관 사칭 · 중급 · 통화 텍스트 폴백 경로).
// 참가자가 "048231 이요"(화면의 모의 인증번호를 불러 줌), "300만원 정도 있어요. 어떻게 옮기면
// 돼요?"까지 답했는데 리포트가 "속지 않았습니다"였다. 위 패턴을 그대로 실행해 확인한 누락을 아래
// (D1)~(D5)로 보강한다(회귀 테스트 `__tests__/verdictRegression.test.ts` — 수정 전 패턴의 동결 사본과
// **같은 실행에서 나란히** 비교한다):
//   (D1) 지시 방법 문의의 어미 변형 — `어떻게\s*하면\s*돼`는 "되죠/되나요/될까요/해야 하나요"를
//        놓쳤다. ⛔ "그걸 어떻게 해요?"(반어 거절)·"어떻게 확인하면 돼요?"(확인 질문)·"어떻게 해야
//        할지/하면 될지/하면 되는지 모르겠어요"(묻지 않는 내포절)는 잡지 않는다 — `하면/해야`가
//        `어떻게`에 **바로** 붙고 **묻는 어미**가 올 때만이다(`-는지`·`-ㄹ지`는 T112에서 확인된 오탐 어형).
//   (D2) "행동 + 면 되나요" — "어떻게 옮기면 돼요", "링크 누르면 되나요". 앞에 `안/못`이 붙으면
//        ("안 보내면 돼요?") 제외한다. "확인하면"은 행동 목록에 없다(확인은 저항 쪽 행동이다).
//   (D3) 숫자열 + 짧은 어미 — (C)는 **답변 전체가 숫자**일 때만 맞아 "048231 이요"를 놓쳤다. 4자리
//        이상 숫자열 **뒤가 끝·문장부호·허용 어미일 때만** 연다. 단위(원·만·년·호·시)나 조사(로·에)가
//        오면 코드가 아니다 — "1332로 전화해 볼게요"(대표번호로 확인하겠다는 답)를 순응으로 몰지 않는다.
//        8자리 이상은 maskPII가 이미 `[계좌]`로 바꾸므로 (A)가 잡는다. ⚠️ 알려진 한계: 숫자 뒤 `요/맞`을
//        허용해 "1234요?"·"1588 맞아요?" 같은 되묻기도 잡는다(번호를 불러 준 경우가 대부분이라 유지).
//   (D4) 한글 숫자(음성 전사) — "공사팔이삼일". 읽는 형태 세 가지만 연다: 붙여 읽기(4음절 이상)·한 자씩
//        띄어 읽기("공 사 팔 …")·세 자 이상 묶음("공사팔 이삼일"). 공·영·육·칠·팔·구 중 하나 이상을
//        요구하고 단어 앞이 비어 있을 때만 잡아 "사이사이"·"이삼일"·"구사일생"·"공사 일이 이삼일 걸려요"
//        같은 일반 문장을 피한다.
//   (D5) 정보 제공 — 생년월일("80년 1월 1일생", "80년생", "생년월일은 800101")과 잔액 고지("300만원
//        정도 있어요"). maskPII는 두 형태를 토큰으로 바꾸지 않아 (A)로는 잡히지 않는다. 잔액은 `있`의
//        **서술형**이 올 때만이다("300만원밖에 없어요"·"있었는데"·"있어도 안 보내요"·"남아 있지 않아요" 제외).
//        생년월일은 `생`이 붙은 형태("80년생", "N년 N월 N일생")와 "생년월일은+숫자"만 잡는다. `생` 뒤가
//        어미일 때만이라 "20년 생활했어요"·"15년 생각해 봤어요"는 제외되고, 연도 붙은 날짜만의 답
//        ("2024년 3월 5일이요")은 생년월일인지 알 수 없어 잡지 않는다(reviewer M1).
//   (D6) 같은 답변 안의 거절·의심·되묻기 — (D1)~(D5)는 문맥 없이 맞으므로, 답변에 `못/안 드려`·
//        `안/못 보내`·`싫`·`사기`·`보이스피싱`·`수상`·`믿기지`·`이상하`·`물어볼게`·`왜 … 물어/알려/불러`가
//        있으면 **새 갈래만** 꺼진다("300만원 있어요. 근데 못 드려요", "048231 이요? 그걸 왜 불러줘야
//        하는데요", "보내면 되나요? 일단 가족에게 물어볼게요" — reviewer M2 · QA 문제 2). ⛔ RESISTANCE_PATTERN과
//        (A)~(C)는 건드리지 않는다 — 되감기와 공유하는 저항 어휘를 넓히면 판정이 이 수정 범위 밖까지 바뀐다.
// 설계 원칙은 (A)~(C)와 같다 — 전부 **순응 쪽**이고 저항 우선(`resisted || !complied`)은 무변경이며,
// 범용 어미 단독 항목은 넣지 않았다(T52 블랭킷 오버라이드 재발 방지). 문맥 없이는 모호한 답("문자로
// 보내주실 수 있나요?")은 잡지 않는다 — 과소판정이 오판보다 낫다는 위 원칙 그대로다.
// ⛔ 통화 중 문자 이벤트(인증번호 표시·링크 탭)는 여전히 **판정 입력이 아니다**(§15.6 G22). "인증번호를
// 불러 줬다"는 **참가자 발화**로만 판정한다 — 같은 번호인지 문자 문서와 대조하지 않는다.
const ASKS_HOW_TO_COMPLY =
  /(어떻게|뭘|뭐|무엇을)\s*(해야|하면)\s*(돼|되(?!는지)|될까|됩|하나|합니|할까)/;
const ACTION_THEN_OK =
  /(?<!(안|못)\s?)(보내|옮기|이체하|송금하|입금하|인출하|넣으|뽑으|맡기|불러\s*드리|알려\s*드리|말씀\s*드리|누르|설치하|입력하)면\s*(돼|되(?!는지)|될까|됩)/;
// (D3)·(D4) 정규식은 `shared/spokenDigits.ts`로 옮겼다(2026-10-18, §78 — 인증번호 대조와 같은 규칙을 공유). 원문 무변경.
const BIRTH_DATE =
  /\d{2,4}\s*년\s*(?:\d{1,2}\s*월\s*\d{1,2}\s*일\s*)?생(?=$|[\s.!?~,…]|이|인|입|예요|요)|생년월일[은는이]?\s*\d/;
const BALANCE_DISCLOSURE =
  /(?:\d[\d,]*\s*(?:억|천만|백만|만|천)\s*원?|\d[\d,]*\s*원|[일이삼사오육칠팔구십백천]+\s*(?:억|만)\s*원?)\s*(?:정도|쯤|가량|조금|좀)?\s*(?:은|는|이|가)?\s*(?:들어\s*|남아\s*)?(?:있어(?!도|야)|있습니다|있는데|있고|있죠|있네)/;

// ⚠️ export 이유는 RESISTANCE_PATTERN과 동일(T70, §15.6 G7 — 되감기 규칙 폴백이 재사용).
// ⛔ `g` 플래그를 붙이지 말 것 — `.test()`가 lastIndex를 이어 써서 같은 답변이 번갈아 다르게 판정된다.
// (D6) 답변 어디에든 거절·의심·되묻기 어휘가 있으면 (D1)~(D5)만 끈다 — 답변 맨 앞에서 끝까지 내다본다.
const REFUSAL_IN_ANSWER =
  /못\s*드려|안\s*드려|안\s*드릴|(안|못)\s*보내|안\s*보낼|싫|사기|보이스\s*피싱|수상|믿기지|이상하|이상해|이상한|물어\s*볼게|왜[^.?!]{0,12}(물어|알려|불러)/;
const CONTEXT_FREE_COMPLIANCE = [
  ASKS_HOW_TO_COMPLY,
  ACTION_THEN_OK,
  CODE_DIGITS_WITH_ENDING,
  CODE_HANGUL_DIGITS,
  BIRTH_DATE,
  BALANCE_DISCLOSURE,
]
  .map((pattern) => pattern.source)
  .join("|");
export const COMPLIANCE_PATTERN = new RegExp(
  `${BASE_COMPLIANCE_PATTERN.source}|^(?![\\s\\S]*(?:${REFUSAL_IN_ANSWER.source}))[\\s\\S]*?(?:${CONTEXT_FREE_COMPLIANCE})`,
);

// ⭐ T191 J-2(2026-10-19 · DECISIONS #161 · PRD AC-097 갱신 고지 ③) — 대면 편취(E4)의 속은 시점 =
// **"인출 · 전달 약속에 동의한 순간"**. 위 `COMPLIANCE_PATTERN`은 "인출하면 돼요"형과 범용 "알겠어"류만
// 잡아 "수표로 찾아 둘게요" · "인출해서 맡길게요" · "직원분께 드릴게요"를 놓쳤다(실측 before: 동의 22개 중
// 3개). 셀프 감금(E5)의 "코인으로 바꿔 둘게요" · "옮길게요"도 같다(6개 중 1개).
//
// | 규칙 | 내용 |
// |---|---|
// | 문맥 조건 | **바로 앞 사기범 발화**(analyzeConversation의 scammer(i) ↔ user(i+1) 짝)가 인출 · 전달 · 보관 ·
// |  | 코인 **요구 어형**(`HANDOFF_DEMAND` — 아래 주석)을 담을 때만 연다. 그 밖의 대화에서는 판정이 base와 한 글자도 같다 |
// | 약속 어형 | 인출 · 출금 · 구매 · 전달 + 의지 어미 / 찾아 · 뽑아 · 바꿔 · 옮겨 + 두다 · 놓다 · 오다 의지 어미 /
// |  | 드릴게 · 드리겠(문의 · 회신 · 상담 · 부탁 · 감사 · 인사 · 신청 · 보고 · 여쭤 · 말씀 · 연락 · 전화 · 답 · 문자 뒤 제외) /
// |  | 맡길게 · 옮길게 / 드리면 · 넘기면 되나요 / 다녀올게 |
// | 거절 · 유보 우선 | 답변 어디에든 부정(안 · 못 · 않 · 없) · 싫 · 상의 · 고민 · 생각해 보 · 나중에 · 물어 · 확인 · 왜 ·
// |  | 상담 · 여쭤 · 문의 · 회신 · 부탁 · 감사 · 이상 · 사기 · 수상 · 신고 · 경찰 · 모르 · 말게가 있으면 이 갈래만 끈다
// |  | (`REFUSAL_IN_ANSWER`도 그대로 적용) |
// | 저항 우선 | 무변경 — `RESISTANCE_PATTERN`이 맞으면 이 갈래와 관계없이 속지 않음이다 |
//
// ⛔ 주소 · 장소 발화는 판정 조건이 아니다(DECISIONS #161 — PII · AC-024). 어휘 목록에 장소 명사를 넣지 않는다.
// ⛔ `COMPLIANCE_PATTERN`·`RESISTANCE_PATTERN`·`REFUSAL_IN_ANSWER`는 **무변경**이다 — 되감기 규칙 폴백
// (`rewind/judge.ts`)이 문맥 없이 답변만으로 같은 패턴을 쓰므로, 이 갈래를 패턴에 섞으면 사기범 요구가 없는
// 되감기 질문에서도 "드릴게요"가 위험으로 잡힌다. ⚠️ 한계(투명 고지): 그래서 되감기 규칙 폴백은 이 갈래를
// 쓰지 않는다 — 같은 "수표로 찾아 둘게요"가 리포트에서는 속은 순간, 되감기 규칙 폴백에서는 중립일 수 있다.
// ⚠️ 시나리오 · 흐름 변형(`flowVariantId` · `decisionMoment`)을 입력으로 받지 않는다 — 시그니처 무변경(T72)이고,
// 변형이 없는 과거 세션 · ElevenLabs 경로에서도 사기범이 실제로 인출 · 전달을 요구한 턴이면 똑같이 잡힌다.
// 문맥 어휘는 **요구 어형**만 연다(reviewer M1, 2026-10-19 — 단독 명사로 열면 "출금하려는 시도가 있어" ·
// "보관 중입니다" · "담당자에게 전달해 드리겠습니다" 같은 **상황 설명**이 열려 "문의드릴게요" · "잘
// 부탁드리겠습니다"가 속은 순간이 됐다 — 실측 308쌍 중 160쌍). 인출 · 출금은 "해 주세요/두세요/하셔야"처럼
// 시키는 어형, 현금 · 수표는 "~로 찾/인출/준비", 보관은 "해야/하셔야/해 두/조치 하셔 · 해 주 · 받으셔"(QA — "보관 조치가 안 되면"은 상황 설명이라 닫힘), 전달은 "해 주세요/하셔야", 코인은
// "~으로 바꿔/사서/옮겨" 뒤만 연다. "현금인출기" · "현금지급기" · "인출기"는 지우고 본다(ATM은 요구 대상이 아님).
// ⚠️ 한계(투명 고지): 열리는 범위의 증거는 ① 저작 대사 전수 대조(열리는 대사 = 기관 사칭 고급 변형 · 대면 편취 ·
// 셀프 감금의 인출 · 보관 · 코인 대사뿐) ② 5개 시나리오 계열의 **수동 작성** 상황 설명형 · 요구형 대사 표본
// (`__tests__/handoffPromise.test.ts` M2)이다. **실제 LLM 변형 발화는 포함하지 않았다** — 표본 밖 어형은 열릴 수 있다.
const ATM_WORDS = /(?:현금\s*)?(?:인출|지급)\s*기/g;
// ⭐ §98(2026-10-21 · 검찰 고급 fv-c8wq — 코인 전환을 단계로 펼쳤다) — 새 단계의 요구 · 약속을 같은 J-2 갈래(리포트 전용 · 문맥형)에 더한다.
// | # | If(바로 앞 사기범 대사 = 요구 어형) | And(참가자 답 — HOLD · REFUSAL 없음) | Then |
// |---|---|---|---|
// | X1 | 거래소 · 지갑 뒤 20자 안에 옮기/보내/전송/가입/바꾸 + 시키는 어미(주세요 · 하세요 · 하셔야 · 하십시오 · 해 주 등) | — | 요구 |
// | X2 | 적금 · 예금 · 보험 뒤 6자 안에 해지 + 시키는 어미 / 대출 뒤 6자 안에 받으셔 · 받으세요 · 받아서 · 받아 주 | — | 요구 |
// | X3 | — | 전송 · 해지 · 가입 + 할게/하겠 · 대출 받을게/받겠/받아 볼게 | 속음(약속) |
// | X4 | — | 보냈 · 전송했 · 옮겼 · 송금했 · 이체했 · 바꿨 · 해지했 + 어/습(마쳤다는 말) | 속음(이행 보고) |
// | X5 | — | 바꾸 · 보내 · 옮기 · 전송하 · 가입하 + 고 있(진행 중) | 속음(이행 중) |
// ⛔ 공유 패턴(COMPLIANCE · RESISTANCE · REFUSAL)은 무변경. ⛔ 표 밖 어형은 열지 않는다(행 추가는 표에 먼저).
const HANDOFF_DEMAND_CRYPTO_STEPS =
  /(?:거래소|지갑)[^.?!]{0,20}?(?:(?:옮겨|보내|전송해|가입해|바꿔)\s*(?:주|두)|(?:옮기|보내|전송하|가입하|바꾸)(?:세요|셔야|십시오|시면))|(?:적금|예금|보험)[^.?!]{0,6}?해지\s*(?:해\s*주|하셔|하세요|하십시오|하시면)|대출[^.?!]{0,6}?(?:받으셔|받으세요|받으십시오|받아\s*(?:서|주))/;
const HANDOFF_DEMAND =
  /(?:인출|출금)\s*(?:해\s*(?:주|두|놓|오|다|서)|하셔|하세요|하십시오)|찾아\s*(?:두|놓|오)(?:세요|십시오|시|셔)|(?:현금|수표)(?:으로|로)?\s*(?:찾|인출|출금|뽑|준비|마련)|맡(?:기세요|기십시오|기셔|기시면|겨\s*(?:주|두))|보관\s*(?:해야|하셔야|해\s*두|조치\s*(?:하셔|해\s*주|를\s*받으셔|받으셔))|(?:전달|건네)\s*(?:해\s*주|주|하셔|하세요|하십시오)|받으러\s*(?:가|갈|갑|오|올|옵)|(?:코인|가상\s*(?:자산|화폐))(?:으로|로|을|를)?\s*(?:바꿔|바꾸|사서|사세요|사셔|사시|구매|구입|옮|보내|송금|전환)/;
// ⭐ 약속 어형은 **허용 목록**이다(QA FAIL 2026-10-19 — 1 · 2차는 범용 "드릴게 · 드리겠"을 받고 앞말 제외 목록으로
// 막는 구조라 "설명드리겠습니다" · "안내드릴게요" · "도와드릴게요" · "3분 드릴게요"가 계속 샜다). 이제 답변이 인출 · 보관 ·
// 전달 · 코인 **동사**나 돈 **목적어** · 받는 **사람**을 함께 가질 때만 연다. 범용 "드릴게요 · 드리겠습니다 · 할게요"는
// 이 갈래로는 **절대 열리지 않는다** — 그런 범용 순응은 공유 `COMPLIANCE_PATTERN` 몫이다.
// | 갈래 | 인정하는 형태(E = 게 · 께 · 겠) |
// |---|---|
// | 행위 동사 | 인출 · 출금 · 구매 · 전달 · 송금 + 할E/하겠 |
// | 두다 · 놓다 · 오다 | 찾아 · 뽑아 · 바꿔 · 사 · 옮겨 · 인출해 · 출금해 + 둘E · 두겠 · 놓을E · 놓겠 · 올E · 오겠 |
// | 넘기는 동사 단독 | 맡길E · 맡기겠 · 옮길E · 건넬E · 넘겨/건네 드릴E · 드리겠 |
// | 돈 목적어 | 돈 · 현금 · 수표 · 코인 · 가상자산 · 그 돈 · 전액 · 예금 + 조사(을 · 를 · 은 · 는 · (으)로 · 도)? + 부사(바로 · 지금 · 먼저 · 오늘 · 다 · 전부)? **바로 뒤** 드릴 · 보낼 · 살 · 바꿀 · 옮길 + E, 또는 준비해 · 챙겨 + 둘 · 놓을 + E |
// | 행위 뒤 넘김 | 바꿔서 · 사서 · 찾아서 · 인출해서 · 출금해서 · 뽑아서 + 부사? + 받는 사람(께 · 한테 · 에게 생략 가능)? **바로 뒤** 보내 드릴 · 보낼 · 드릴 · 맡길 · 옮길 · 준비해 둘 · 챙겨 둘 + E |
// | (창 축소 이유) | 재QA 2026-10-19 — 12자 창에 다른 명사가 끼어 "코인 사진은 찍어서 보내 드릴게요" · "그거 말고 다른 걸로 설명드릴게요"가 열렸다. 사이에 다른 명사(사진 · 번호 · 영수증 · 얘기 등)가 끼면 열리지 않는다. 지시어 그거 · 그걸은 대상이 불명확해 돈 목적어에서 뺐다 |
// | 받는 사람 | 직원 · 담당자 · 그분 · 기사 + 께 · 에게 · 한테 바로 뒤 드릴 · 드리겠 · 넘겨 · 건네 / 그 사람이 오시면 · 만나면 뒤 드릴 · 드리겠 · 맡기 · 넘겨 |
// | 되나요 | (돈 목적어+조사 · 행위 뒤 · 받는 사람) + 부사? + 받는 사람? **바로 뒤** 드리면 · 넘기면 · 넘겨 드리면 · 건네 드리면 + 돼 · 되 · 될까 · 됩 |
// | 은행 다녀옴 | 은행 뒤 6자 안에 다녀올E · 다녀오겠 |
// ⚠️ "챙겨 둘게"는 QA 독립 표본("네 수표로 바꿔서 챙겨 둘게요")을 본 뒤 **돈 목적어 · 행위 뒤 갈래 안에서만** 넣었다(단독 불가 — 과적합 고지).
const PROMISE_END = "(?:게|께|겠)";
const MONEY_OBJECT = "(?:돈|현금|수표|코인|가상\\s*자산|그\\s*돈|전액|예금)(?:을|를|은|는|으로|로|도)?";
const AFTER_ACTION = "(?:바꿔서|사서|찾아서|인출해서|출금해서|뽑아서)";
const ADVERB = "(?:(?:바로|지금|먼저|오늘|다|전부)\\s*)?";
const PERSON = "(?:(?:직원|담당자|그분|기사)[가-힣]{0,2}\\s*(?:께|에게|한테)?\\s*)?";
const RECIPIENT = "(?:직원|담당자|그분|기사)[가-힣]{0,2}\\s*(?:께|에게|한테)";
const HANDOFF_PROMISE = new RegExp(
  [
    `(?:인출|출금|구매|전달|송금)\\s*(?:할${PROMISE_END}|하겠)`,
    `(?:찾아|뽑아|바꿔|(?<![가-힣])사|옮겨|인출해|출금해)\\s*(?:둘${PROMISE_END}|두겠|놓을${PROMISE_END}|놓겠|올${PROMISE_END}|오겠)`,
    `(?:맡길|옮길|건넬)${PROMISE_END}|맡기겠|(?:넘겨|건네)\\s*(?:드릴${PROMISE_END}|드리겠)`,
    `${MONEY_OBJECT}\\s*${ADVERB}(?:(?:드릴|보낼|살|바꿀|옮길)${PROMISE_END}|(?:준비해|챙겨)\\s*(?:둘|놓을)${PROMISE_END})`,
    `${AFTER_ACTION}\\s*${ADVERB}${PERSON}(?:(?:보내\\s*드릴|보낼|드릴|맡길|옮길)${PROMISE_END}|드리겠|맡기겠|(?:준비해|챙겨)\\s*(?:둘|놓을)${PROMISE_END})`,
    `${RECIPIENT}\\s*(?:드릴${PROMISE_END}|드리겠|넘겨|건네)`,
    `(?:직원|담당자|그분|기사)[^.?!]{0,8}?(?:오시면|만나면)\\s*(?:바로\\s*)?(?:드릴${PROMISE_END}|드리겠|맡기|넘겨)`,
    `(?:${MONEY_OBJECT}|${AFTER_ACTION}|${RECIPIENT})\\s*${ADVERB}${PERSON}(?:드리|넘기|넘겨\\s*드리|건네\\s*드리)면\\s*(?:돼|되(?!는지)|될까|됩)`,
    `은행[^.?!]{0,6}?다녀\\s*(?:올${PROMISE_END}|오겠)`,
  ].join("|"),
);
/** §98 X3 · X4 · X5(위 표) — 코인 전환 단계의 약속 · 이행 보고 · 진행 중. */
const HANDOFF_PROMISE_CRYPTO_STEPS = new RegExp(
  [
    `(?:전송|해지|가입)\\s*(?:할${PROMISE_END}|하겠)`,
    `대출\\s*(?:받을${PROMISE_END}|받겠|받아\\s*볼${PROMISE_END})`,
    `(?:보냈|전송했|옮겼|송금했|이체했|바꿨|해지했)(?:어|습)`,
    `(?:바꾸|보내|옮기|전송하|가입하)고\\s*있`,
  ].join("|"),
);
const HANDOFF_HOLD =
  /(?:안|못)\s|(?:안|못)(?:맡|찾|드리|드릴|인출|출금|사|살|바꾸|바꿀|보내|보낼|옮|넘|건네|구매|할|하겠|해)|않|없어|없습|없다|없는|싫|말게|말래|말까|상의|상담|고민|생각해\s*보|생각\s*좀|나중에|물어|여쭤|문의|회신|부탁|감사|확인|왜|이상|사기|수상|신고|경찰|모르/;

/** 사기범이 인출 · 전달 · 코인을 요구한 바로 다음 답변이 그 약속에 동의하는가(T191 J-2 — 위 표). */
function isHandoffPromiseReply(scammerText: string, replyText: string): boolean {
  const demand = scammerText.replace(ATM_WORDS, "");
  return (
    (HANDOFF_DEMAND.test(demand) || HANDOFF_DEMAND_CRYPTO_STEPS.test(demand)) &&
    !HANDOFF_HOLD.test(replyText) &&
    !REFUSAL_IN_ANSWER.test(replyText) &&
    (HANDOFF_PROMISE.test(replyText) || HANDOFF_PROMISE_CRYPTO_STEPS.test(replyText))
  );
}

// ⭐ 판정 검수(2026-10-21, 시나리오 17종 × 대본 56건 — 오판 7건 중 아래 4부류를 리포트 전용 갈래로 닫는다).
// 공유 패턴(`RESISTANCE_PATTERN` · `COMPLIANCE_PATTERN`)은 **바이트 무변경**이다(`handoffPromise.test.ts` 해시 고정 ·
// 되감기 `rewind/judge.ts`와 공유). T191 J-2와 같은 방식 — 리포트 판정에서만 덧댄다.
//
// | # | If(참가자 답변 · 바로 앞 사기범 대사) | Then | 근거 대본 |
// |---|---|---|---|
// | V1 | 저항 어휘가 **되묻기**(`본인 확인이요?` · `경찰청이요?`)나 **부정**(`신고 안 할게요` · `의심 안 해요`)으로만 나온다 | 그 구간을 저항으로 세지 않는다(나머지 저항 어휘가 있으면 여전히 저항) | "본인 확인이요? [주민번호]" · "신고 안 할게요 보낼게요" |
// | V2 | 사기범이 생년월일 · 생일을 물었고 답에 날짜(`N월 N일` — 뒤에 `에 · 까지 · 쯤 · 이후` 등 일정 조사가 오면 제외 · 숫자 6자리)가 있다 | 순응 | "61년 3월 2일이요" |
// | V3 | 사기범이 보안코드 · CVC · 인증번호 · 비밀번호를 물었고 답에 2~6자리 숫자가 단위 없이 있다 | 순응 | "뒷면 번호 382요" |
// | V4 | 답에 `입력했/입력할게/입력하겠/입력 완료`가 있다 | 순응 | "주소 입력했어요" |
// | — | V2 · V3 · V4도 `REFUSAL_IN_ANSWER`(거절 · 의심 · 되묻기)가 있으면 열지 않는다 | — | — |
// ⚠️ 한계(투명 고지): 되감기 규칙 폴백은 공유 패턴만 쓰므로 V1~V4 답변이 되감기에서는 다르게(중립 · 잘 대응함) 나올 수 있다(J-2와 같은 비대칭).
const ECHOED_OR_NEGATED_RESISTANCE =
  /(?:본인\s*확인|경찰[가-힣]{0,2}|신고)\s*(?:이요|요|이라고요|라고요|이라구요|라구요)\s*\?|(?:신고|의심|경찰에\s*연락|경찰에\s*말)\s*(?:은|는|도)?\s*(?:안\s*(?:할|하|해|합)|하지\s*않|않|못\s*(?:할|하|해))/g;
const BIRTH_DATE_DEMAND = /생년\s*월일|생일|태어나/;
const DATE_IN_ANSWER =
  /\d{1,2}\s*월\s*\d{1,2}\s*일(?!\s*(?:에|까지|부터|쯤|날|정도|이후|전|후|마다))|(?<!\d)\d{6}(?!\d)/;
const SECRET_CODE_DEMAND = /보안\s*코드|CVC|cvc|뒷면[^.?!]{0,8}(?:번호|숫자|자리)|인증\s*번호|비밀\s*번호/;
const SHORT_CODE_IN_ANSWER = /(?<!\d)\d{2,6}(?!\d|\s*(?:원|만|천|년|월|일|시|분|호|번지|살|개|명|층|로|에))/;
const ENTERED_IN_ANSWER = /입력\s*(?:했|할게|하겠|완료)/;

// ⭐ 사용자 결정 2026-10-21 ① **말보다 행동** — 의심 · 거절 어휘가 있어도 실제로 정보를 넘겼으면 속음이다.
// | # | If(참가자 답변) | Then |
// |---|---|---|
// | H1 | 마스킹 토큰 `[주민번호]` · `[계좌]` · `[이메일]`이 있다 — 단 뒤가 `로/에 + 전화 · 확인 · 연락`(대표번호로 확인)이거나
// |    | `맞 · 뭐 · 무슨`, `?`(사기범이 준 번호를 되묻기)면 제외 | 저항 어휘와 무관하게 속음 |
// | H2 | `REFUSAL_IN_ANSWER`(왜 물어 · 사기 · 이상 등)가 없고 생년월일(D5 · V2) 또는 잔액 고지(D5)가 있다 | 저항 어휘와 무관하게 속음 |
// | — | 보안코드 · 인증번호(V3)는 H에 넣지 않는다 — "1588 맞죠? 확인해 볼게요"처럼 확인하려는 번호와 구별되지 않는다 | — |
// ⛔ 가짜 정보 표지(아래 RS1)가 있으면 H보다 앞서 속음이 아니다(결정 ②).
const HARD_DISCLOSURE_TOKEN =
  /\[(?:주민번호|계좌|이메일)\](?!\s*(?:로|으로|에|번으로)\s*(?:다시\s*)?(?:전화|확인|연락|걸)|\s*(?:이|가|은|는)?\s*(?:맞|뭐|무슨|어디|누구)|\s*(?:이요|요)?\s*\?)/;

// ⭐ §113.2(사용자 결정 2026-10-23) — H3: 참가자가 **사진을 보냈고**, 그 전에 사기범이 신분증 · 사진을 요구했다(이 대사까지의 사기범 대사 중
// 하나라도 `PHOTO_DEMAND`) → 저항 어휘와 무관하게 속음(실제 제공 — H1 · H2와 같은 등급). 요구 없이 보낸 사진은 판정하지 않는다(종전 규칙만).
// 속은 순간의 수법 라벨은 **요구한 대사**에서 고른다(사진 턴 바로 앞 대사가 재촉뿐이어도 "신원정보 직접 요구"류가 남게).
function isPhotoAfterDemand(reply: AnalysisMessage, photoDemandSeen: boolean): boolean {
  return reply.photo === true && photoDemandSeen;
}

// ⭐ §131(1)(메인 세션 라이브 확인 2026-10-24 — 자녀 사칭 카톡 고급 · 사진 순간 카드에 수법 라벨 줄이 없었다) — H3 사진 순간의 라벨 표.
// 요구 대사를 모델이 바꿔 말하면 문구 키 · 요구 어형 표가 모두 비어 숨김 폴백(`"약화된 사기 수법"` — 화면 A1)이 됐다. 사진을 **실제로 보냈다**는
// 사건은 판정이 이미 확정했으므로(H3), 그 사건에서 라벨을 정한다.
// | 순서 | If | 라벨 |
// |---|---|---|
// | 1 | 요구 대사 문구 키 일치 | 그 수법(종전) |
// | 2 | 요구 어형 표(5 · 5b행 포함) 일치 | 그 라벨(종전 + 5b) |
// | 3 | 위 둘 다 없음 ∧ 세션 목록에 **사진을 요구하는 수법**(저작 문면이 `PHOTO_DEMAND`)이 있다 | 요구 대사와 같은 대상(신분증 · 상품권)을 말하는 수법 우선, 없으면 첫 수법 |
// | 4 | 3도 없음 ∧ 세션 목록에 개인정보 요구 범주 라벨이 있다 | 그 라벨(`신원 · 신분` 든 라벨 우선) |
// | 5 | 그 밖 | 종전 폴백 |
// - 3행이 범주보다 먼저인 이유: 손주 사칭은 상품권 뒷면 번호 **사진**(송금 대체)이고 자녀 사칭은 신분증 사진(개인정보)이다 — 사진이라고 한 범주로 묶을 수 없다.
// ⛔ 세션 목록 안의 저작 라벨만(새 라벨 0) · 판정(속음 · 순간 수 · turnIndex) 무변경 · 사진 턴 밖 순간 무변경.
const PHOTO_SUBJECTS = [/신분증/, /상품권/];
function resolvePhotoProvidedTactic(demandText: string, weakenedTactics: readonly string[]): string | undefined {
  const demands = weakenedTactics.filter((tactic) => !NON_DEMAND_LABEL.test(extractTacticLabel(tactic)));
  const photoTactics = demands.filter((tactic) => PHOTO_DEMAND.test(tactic));
  const sameSubject = photoTactics.find((tactic) => PHOTO_SUBJECTS.some((subject) => subject.test(tactic) && subject.test(demandText)));
  const photoTactic = sameSubject ?? photoTactics[0];
  if (photoTactic) return extractTacticLabel(photoTactic);
  const infoLabels = demands.map(extractTacticLabel).filter((label) => resolveTacticCategory(label) === "personal_info_demand");
  return infoLabels.find((label) => /신원|신분/.test(label)) ?? infoLabels[0];
}

// ⭐ §128(2)(2026-10-24 메인 세션 라이브 실측 — 자녀 사칭 카톡 고급 · 통화 겹침 중 카톡 *"방금 50만원 보냈어"* 가 속은 순간에서 빠졌다).
// 원인: 순응 패턴은 약속형(보낼게 · 보내드릴게 · 송금 · 이체)만 보고 **이행 보고**(보냈어)는 코인 단계(§98 X4 — 인출 · 코인 요구 문맥)에서만
// 잡았다. 메신저 송금 요구 뒤 "보냈어"는 문맥이 송금 요구라 X4가 열리지 않았다. H4(리포트 전용 · 공유 패턴 무변경):
// | # | If | Then |
// |---|---|---|
// | H4 | 이 대사까지의 사기범 대사 중 하나라도 송금 요구(`isTransferDemand` — 돈 · 계좌 문맥 + 보내 · 이체 · 송금 요구 어형) ∧ 참가자 답에 이행 보고
// |    | (`TRANSFER_DONE_REPORT` — 보냈 · 송금했 · 이체했 · 입금했 · 부쳤 + 어미, 앞에 안 · 못 없음) ∧ `REFUSAL_IN_ANSWER` 없음 | 속음 · 라벨은 요구한 대사에서 |
// - 바로 앞 대사가 아니어도 되는 이유: 통화 중 카톡은 통화 쪽 요구(다른 채널)에 대한 이행 보고라 turnIndex 순 바로 앞 대사가 요구가 아닐 수 있다(H3과 같은 방식).
const TRANSFER_DONE_REPORT = /(?<!(?:안|못)\s?)(?:보냈|송금했|이체했|입금했|부쳤)(?:어|습|다|는데|고|지)/;

function isTransferDemand(scammerText: string): boolean {
  return scammerText.split(/[.?!\n]+/).some((s) => MONEY_CONTEXT.test(s) && TRANSFER_REQUEST.test(s));
}

function isTransferDoneAfterDemand(reply: AnalysisMessage, transferDemandSeen: boolean): boolean {
  return transferDemandSeen && TRANSFER_DONE_REPORT.test(reply.textMasked) && !REFUSAL_IN_ANSWER.test(reply.textMasked);
}

function isHardDisclosure(scammerText: string, replyText: string): boolean {
  if (HARD_DISCLOSURE_TOKEN.test(replyText)) return true;
  if (REFUSAL_IN_ANSWER.test(replyText)) return false;
  return (
    BIRTH_DATE.test(replyText) ||
    BALANCE_DISCLOSURE.test(replyText) ||
    (BIRTH_DATE_DEMAND.test(scammerText) && DATE_IN_ANSWER.test(replyText))
  );
}

// ⭐ 사용자 결정 2026-10-21 ② — **속음은 아니지만 위험 신호**. 속은 순간으로 잡힌 줄에는 달지 않는다(줄 하나 = 표기 하나 · 위에서 첫 일치).
// | # | If(참가자 답변 · 바로 앞 사기범 대사) | kind |
// |---|---|---|
// | RS1 | 답에 가짜 표지(가짜로 · 가짜 번호/정보/이름 · 거짓으로 · 아무거나 · 아무 번호 · 지어서 · 엉터리) | `fake_info`(⭐ 이 줄은 순응 어휘가 있어도 속음이 아니다) |
// | RS2 | 저항 어휘가 없고, 비밀 유지 약속(아무/누구한테도 … 말 · 얘기 안 · 비밀로 할게 · 비밀 지킬게 · 가족 · 은행 … 말 안 할게) | `secrecy_promise` |
// | RS3 | 저항 어휘 · 거절이 없고, 사기범이 은행 · 거래를 언급했으며 답에 은행명(○○은행 · 농협 · 우체국 · 새마을금고 · 신협 · 수협 · ○○뱅크) | `bank_disclosed` |
const FAKE_INFO_MARKER = /가짜로|가짜\s*(?:번호|정보|이름|계좌)|거짓(?:말)?로|아무거나|아무\s*번호|지어서|지어낸|엉터리/;
const SECRECY_PROMISE =
  /(?:아무|누구)\s*(?:한테|에게)?\s*도[^.?!]{0,8}?(?:말|얘기|이야기|알리)[^.?!]{0,3}?(?:안|않|하지\s*않)|비밀로\s*(?:할게|하겠|해\s*드릴|둘게|두겠)|비밀\s*(?:지킬게|지키겠|유지할게|유지하겠)|(?:가족|은행|남편|아내|아들|딸|자녀)[^.?!]{0,8}?(?:말|얘기|알리)[^.?!]{0,3}?안\s*(?:할|하겠|해)/;
const BANK_CONTEXT = /은행|거래/;
const BANK_NAME = /[가-힣]{1,6}은행|농협|우체국|새마을\s*금고|신협|수협|[가-힣]{1,4}\s*뱅크/;

// ⭐ 사용자 결정 2026-10-21(§101.2 후속 — *"위험 신호로"*) — 인증번호를 요구받고 **문자 속 정답과 다른 번호**를 불러 준 줄은 속음이 아니라
// 가짜 정보와 같은 위험 신호(`fake_info` — 문구 · 경로 재사용)다. 정답은 그 시나리오 카탈로그의 인증번호(`listOtpItems` — 호출부가 넘긴다).
// | # | If | Then |
// |---|---|---|
// | W0 | 정답 목록이 비었다(인증번호 문자가 없는 시나리오 · 옛 호출부) | 대조 안 함 — 종전 판정 그대로 |
// | W1 | 바로 앞 사기범 대사가 인증번호를 묻지 않았다(`OTP_ASKED` — `roleplay/otpCheck.ts`의 물음 · 되물음 어형과 같은 표) | 대조 안 함 |
// | W2 | 답에서 뽑은 숫자열(`extractSpokenCodes` — 리포트 (D3) · (D4)와 같은 규칙) 중 정답과 자릿수가 같은 것이 없다 | 대조 안 함(전화 · 금액 등) |
// | W3 | 같은 자릿수 후보 중 하나라도 정답과 같다 | 대조 결과 "정답" — 종전처럼 속음 |
// | W4 | 같은 자릿수 후보가 있고 모두 정답과 다르다 | **오답** — 숫자 응답만으로는 속음이 아니다(H1 · H2 실제 제공은 그대로 속음) · 위험 신호 `fake_info` |
const OTP_ASKED =
  /인증\s*(?:번호|코드)|번호가[^.?!]{0,24}(?:안\s*맞|맞지\s*않|일치하지\s*않|틀|다르|다릅)|문자[^.?!]{0,20}다시[^.?!]{0,20}불러/;

function isWrongOtpReply(scammerText: string, replyText: string, otpCodes: readonly string[]): boolean {
  if (otpCodes.length === 0 || !OTP_ASKED.test(scammerText)) return false;
  const lengths = new Set(otpCodes.map((code) => code.length));
  const candidates = extractSpokenCodes(replyText).filter((code) => lengths.has(code.length));
  return candidates.length > 0 && !candidates.some((code) => otpCodes.includes(code));
}

function resolveRiskSignalKind(scammerText: string, replyText: string, otpCodes: readonly string[] = []): RiskSignalKind | undefined {
  if (FAKE_INFO_MARKER.test(replyText)) return "fake_info";
  if (isWrongOtpReply(scammerText, replyText, otpCodes)) return "fake_info";
  if (isResistanceForReport(replyText)) return undefined;
  if (SECRECY_PROMISE.test(replyText)) return "secrecy_promise";
  if (!REFUSAL_IN_ANSWER.test(replyText) && BANK_CONTEXT.test(scammerText) && BANK_NAME.test(replyText)) {
    return "bank_disclosed";
  }
  return undefined;
}

function isResistanceForReport(replyText: string): boolean {
  return RESISTANCE_PATTERN.test(replyText.replace(ECHOED_OR_NEGATED_RESISTANCE, " "));
}

function isContextualCompliance(scammerText: string, replyText: string): boolean {
  if (REFUSAL_IN_ANSWER.test(replyText)) return false;
  if (BIRTH_DATE_DEMAND.test(scammerText) && DATE_IN_ANSWER.test(replyText)) return true;
  if (SECRET_CODE_DEMAND.test(scammerText) && SHORT_CODE_IN_ANSWER.test(replyText)) return true;
  return ENTERED_IN_ANSWER.test(replyText);
}

/**
 * 사기범 발화 텍스트에 어떤 weakenedTactics의 저작 문구(flavor 인용구)가 남아 있는지 추정하기 위한
 * 수법별 키 묶음. 비교는 대사를 만드는 쪽(MockLlmClient)과 같은 `extractTacticFlavor` 산출을 기준으로 한다.
 *
 * | 규칙 | 내용 |
 * |---|---|
 * | 문구 단위 | flavor를 `,`·`.`·`?`·`!`·`…`로 문구 단위로 나누고, 띄어쓰기·문장부호를 지운 뒤 문구마다 **앞 5자**(문구가 더 짧으면 전체, 3자 미만 문구는 버림)를 키로 쓴다 |
 * | 대꾸 제외 | 5자 미만 **한 단어** 문구가 종결어미로 끝나면("아니에요"·"잠깐만요"·"진짜야") 어느 대화에나 나오는 대꾸라 버린다. 명사("수사관")·두 단어("지금 즉시")는 남긴다 |
 * | 시나리오 안 구별 | 같은 시나리오의 **다른 수법** 문구가 같은 말로 시작하면 갈라지는 지점까지 키를 늘린다. 다른 수법 문구와 **같거나 그 앞부분**인 문구는 어느 수법인지 가릴 수 없어 키로 쓰지 않는다 |
 *
 * ⚠️ 왜 바꿨나(2026-10-17): 종전 규칙은 인용구를 이어 붙인 문자열의 **앞 8자**가 대사에 그대로 있어야
 * 했다(예: 기관 사칭 "권위 암시"는 `수사관, 금융감` 여덟 글자). 실 LLM 대사는 인용구를 문장 단위로
 * 섞어 쓰고 띄어쓰기도 바꾸므로 거의 항상 "시도된 수법 0가지"가 됐다. Mock 대사는 flavor 전체를
 * 싣기 때문에 문구 키가 종전 키가 잡던 것을 그대로 잡는다(종전 키는 시나리오 안 구별이 안 돼 버렸다).
 * ⚠️ 한계(투명 고지): 문구를 **바꿔 말하면** 여전히 못 찾는다 — 그 경우는 "모르는 것"이지 "없는 것"이
 * 아니다(표시 문면은 AC-083 (b) 소관). 정상 대사를 수법으로 잘못 잡지 않도록 범주 키워드 사전은
 * 넣지 않았다(회귀 테스트가 중립 대사 × 전 시나리오 0건을 고정한다).
 * ⚠️ 예외(PR-A3): 요구 3종 한정 보정은 아래 `resolveDemandFallbackTactic` 판정표뿐이다 — 문구 키가 빈 경우만, 이미 속은 순간의
 * **라벨에만**, 세션 목록 안 라벨만 쓴다(같은 중립 대사 × 전 시나리오에서 그 표도 0건 — `demandFallbackLabel.test.ts`).
 */
type TacticMatcher = { tactic: string; phraseKeys: string[] };

const PHRASE_KEY_LENGTH = 5;
const PHRASE_MIN_LENGTH = 3;

/** 비교 전용 정규화 — 띄어쓰기·문장부호(전사·LLM 표기 차이)를 지운다. 판정·표시에는 쓰지 않는다. */
function normalizeForTacticMatch(text: string): string {
  return text.toLowerCase().replace(/[\s.,!?~…·'"“”‘’()[\]{}<>_/:;-]/g, "");
}

/** 5자 미만 한 단어 + 종결어미 = 어느 대화에나 나오는 대꾸("아니에요", "잠깐만요", "진짜야"). */
function isGenericInterjection(rawPhrase: string, normalized: string): boolean {
  return (
    normalized.length < PHRASE_KEY_LENGTH &&
    !/\s/.test(rawPhrase.trim()) &&
    /[요야다네까지죠어아]$/.test(normalized)
  );
}

function splitFlavorPhrases(tactic: string): string[] {
  return extractTacticFlavor(tactic)
    .replace(STRUCTURED_MARKER_PATTERN, "")
    .split(/[,.?!…]/)
    .flatMap((rawPhrase) => {
      const normalized = normalizeForTacticMatch(rawPhrase);
      if (normalized.length < PHRASE_MIN_LENGTH) return [];
      return isGenericInterjection(rawPhrase, normalized) ? [] : [normalized];
    });
}

function buildTacticMatchers(weakenedTactics: readonly string[]): TacticMatcher[] {
  const phrasesByTactic = weakenedTactics.map(splitFlavorPhrases);
  return weakenedTactics.map((tactic, index) => {
    const otherPhrases = phrasesByTactic.filter((_, other) => other !== index).flat();
    const phraseKeys = phrasesByTactic[index].flatMap((phrase) => {
      if (otherPhrases.some((other) => other.startsWith(phrase))) return [];
      let length = Math.min(PHRASE_KEY_LENGTH, phrase.length);
      while (otherPhrases.some((other) => other.startsWith(phrase.slice(0, length)))) length += 1;
      return [phrase.slice(0, length)];
    });
    return { tactic, phraseKeys };
  });
}

/** 발화에서 찾은 수법을 **weakenedTactics 순서대로** 모두 돌려준다(없으면 빈 배열). */
function findMatchedTactics(scammerText: string, matchers: readonly TacticMatcher[]): string[] {
  const normalized = normalizeForTacticMatch(scammerText);
  return matchers
    .filter((matcher) => matcher.phraseKeys.some((key) => normalized.includes(key)))
    .map((matcher) => matcher.tactic);
}

/**
 * ⭐ PR-A3(2026-10-20, 감사 B 매트릭스 1일차 #3 · 2일차 #4) — **속은 순간 라벨 보정 표.** 문구 키 추정(위
 * `findMatchedTactics`)은 실 LLM이 인용구를 바꿔 말하면 비어, 속은 순간 라벨이 폴백 `"약화된 사기 수법"`으로
 * 쏠렸다(실측: 폴백 1일차 47/58 · 2일차 25/53 · Live 11/20). 문구 키가 **비었을 때만**, 바로 앞 사기범 대사가 아래
 * **요구 어형**을 담으면 그 세션 `weakenedTactics` 안의 같은 범주 라벨로 부른다.
 *
 * | 순서 | 요구 어형(같은 문장 안) | 범주 | 같은 범주 라벨이 여럿이면 |
 * |---|---|---|---|
 * | 1 | 앱·어플·링크·프로그램 + 설치/깔아 + 시키는 어미 | link_or_install | 목록 첫 라벨 |
 * | 2 | 링크·여기 + 눌러/클릭/접속/들어가 + 시키는 어미 | link_or_install | 목록 첫 라벨 |
 * | 3 | 예금·자산·잔액·잔고 + 말씀/알려/불러 + 시키는 어미 | personal_info_demand | `자산`·`은행`이 든 라벨 우선 |
 * | 4 | 카드번호·유효기간·CVC·보안코드 + 말씀/알려/불러/적어/입력 + 시키는 어미 | personal_info_demand | `카드`가 든 라벨 우선 |
 * | 5 | 성함·이름·생년월일·주민번호·비밀번호·비번·인증번호·신분증·공인인증서·계좌번호 + **정보 제공 동사 필수**(말씀해/알려/불러/적어/찍어/찍어서 보내/입력해/전송해/확인해(§127)/"정보를·번호를") + 시키는 어미 | personal_info_demand | 목록 첫 라벨 |
 * | 5b | §131(1) — 신분증 + 보내/올려/첨부해 + 시키는 어미("신분증 사진 한 장만 보내줘") | personal_info_demand | 목록 첫 라벨 |
 * | (5 주) | 리뷰 Major 1 — 동사가 옵션이면 "이 계좌번호로 입금해 주세요"·"제 이름으로 보내 주세요"를 6행(송금)보다 먼저 가로챘다. 단독 "보내"는 6행 몫이다 | — | — |
 * | 6 | 돈 맥락(금액 "N원" · 계좌 · 은행 · 금액 · 돈 · 계좌번호꼴) + 보내/입금해/이체해/송금해/빌려/옮겨/넣어/결제해 + 시키는 어미(또는 "보낼 수 있") | payment_demand | 목록 첫 라벨 |
 * | 7 | 금액 "N원" 또는 계좌번호꼴 + 부탁(할게·해·드려·드릴게·드립니다·하면·좀) | payment_demand | 목록 첫 라벨 |
 * | 8 | 대사 전체가 `HANDOFF_DEMAND`(인출 · 전달 · 보관 · 코인 요구 어형 — T191 J-2 그대로 재사용) | payment_demand | 목록 첫 라벨 |
 * | — | 위 어느 행도 아님 · 맞은 행의 범주 라벨이 세션 목록에 없음 | — | 종전 폴백 `"약화된 사기 수법"` 그대로 |
 *
 * - **시키는 어미** = `주세요·주십시오·주시겠·주시면·주셔야·주실 수·주시고·주면·주라·줘(줘서 제외)·줄 수·줄래·달라`
 *   (+ 6행만 `두셔야·두세요·두십시오·둬·놓으셔야`). ⛔ `주셔서·주신·준`(감사 · 확인 어형)은 열지 않는다 — "입금해 주신
 *   금액 확인했습니다" 같은 **확인 대사**가 요구로 잡히지 않게.
 * - 행은 위에서부터 보고, **맞았고 같은 범주 라벨이 세션 목록에 있는** 첫 행을 쓴다(맞았지만 라벨이 없으면 다음 행).
 * - 후보 라벨에서 `부인 시 …`(부인 대응 수법) · `… 암시`(요구가 아니라 분위기)는 뺀다.
 * ⛔ 범주는 **요구 3종**(링크·설치 / 개인정보 / 송금·인출)만이다 — 다급함 · 권위 · 정서처럼 어휘만으로는 가를 수 없는 범주는
 * 표에 넣지 않았다(종전 "범주 키워드 사전은 넣지 않는다" 원칙의 이유 — 중립 대사 오탐 — 를 지키기 위한 범위 제한).
 * ⛔ 판정(속았는가 · 순간 개수 · turnIndex)은 한 글자도 바뀌지 않는다 — 이미 속은 순간으로 정해진 짝의 **라벨만** 고친다.
 * ⛔ 라벨은 **세션 목록 안의 저작 라벨**만 쓴다(새 라벨 발명 0). 고른 라벨은 AC-083 (a)(속은 순간이 부른 수법 = 수법 목록 안)를
 * 지키도록 `tacticsUsed`에도 올린다.
 */
const SHORT_REQUEST_ENDING =
  "(?:주(?:세요|십시오|시겠|시면|셔야|실\\s*수|시고|면|라)|줘(?!서)|줄\\s*(?:수|래)|달라)";
const INSTALL_REQUEST = new RegExp(
  `(?:앱|어플|링크|프로그램)[^.?!\\n]*?(?:설치|깔아)\\s*(?:좀\\s*)?(?:해\\s*)?(?:${SHORT_REQUEST_ENDING}|하셔야|하세요|하십시오|도와\\s*(?:주|줘))`,
);
const LINK_OPEN_REQUEST = new RegExp(
  `(?:링크|여기)[^.?!\\n]{0,20}?(?:눌러|클릭해|접속해|들어가)\\s*(?:${SHORT_REQUEST_ENDING}|보세요|보십시오|하셔야)`,
);
const ASSET_INFO_REQUEST = new RegExp(
  `(?:예금|자산|잔액|잔고)[^.?!\\n]{0,25}?(?:말씀해|알려|불러)\\s*${SHORT_REQUEST_ENDING}`,
);
const CARD_INFO_REQUEST = new RegExp(
  `(?:카드\\s*번호|유효\\s*기간|CVC|cvc|보안\\s*코드)[^.?!\\n]{0,25}?(?:말씀해|알려|불러|적어|입력해)\\s*${SHORT_REQUEST_ENDING}`,
);
// §127(메인 세션 라이브 확인 2026-10-24 — 기관 사칭 고급 · 이름 · 생년월일 · 주민번호 뒷자리를 말한 순간의 라벨이 비었다) — 본인 확인 요구의 흔한 어형
// "… 확인해 주시겠습니까" · "… 확인 부탁드립니다" · 명사 "뒷자리"를 더한다. 신원 명사가 같은 문장에 있어야 하는 조건은 그대로다(중립 "확인해 주세요" 오탐 0).
const IDENTITY_INFO_REQUEST = new RegExp(
  `(?:성함|이름|생년월일|주민(?:등록)?\\s*번호|뒷\\s*자리|비밀\\s*번호|비번|인증\\s*번호|신분증|공인\\s*인증서?|계좌\\s*번호)[^.?!\\n]{0,25}?(?:(?:말씀해|알려|불러|적어|찍어서\\s*보내|찍어|입력해|전송해|확인해|(?:정보|번호)(?:를|을))\\s*${SHORT_REQUEST_ENDING}|(?:말씀|확인)\\s*부탁\\s*(?:드립니다|드려요|드릴게요|합니다))`,
);
// §131(1)(메인 세션 라이브 확인 2026-10-24 — 자녀 사칭 카톡 고급 · 신분증 사진을 보낸 순간의 수법 라벨이 비었다) — 5행은 "찍어서 보내"만 받아
// "신분증 사진 한 장만 보내줘"처럼 **보내기만 요구하는** 어형이 빠졌다. 명사를 신분증으로 좁혀 단독 "보내"를 받는다(돈 맥락 "보내"는 6행 몫 그대로).
const ID_PHOTO_SEND_REQUEST = new RegExp(
  `신분증[^.?!\\n]{0,25}?(?:보내|올려|첨부해)\\s*${SHORT_REQUEST_ENDING}`,
);
const MONEY_CONTEXT = /\d[\d,]*\s*(?:만|천|백)?\s*원|계좌|은행|금액|돈|\d{2,6}-\d{2,6}-\d{2,}/;
const TRANSFER_REQUEST = new RegExp(
  `(?:보내|입금해|이체해|송금해|빌려|옮겨|넣어|결제해)\\s*(?:${SHORT_REQUEST_ENDING}|두셔야|두세요|두십시오|둬|놓으셔야)|보낼\\s*수\\s*있`,
);
const AMOUNT_OR_ACCOUNT = /\d[\d,]*\s*(?:만|천|백)?\s*원|\d{2,6}-\d{2,6}-\d{2,}/;
const FAVOR_REQUEST = /부탁\s*(?:할게|해|드려|드릴게|드립니다|하면|좀)/;

type DemandRow = {
  category: TacticCategory;
  matches: (sentences: readonly string[], whole: string) => boolean;
  prefer?: RegExp;
};

const anySentence = (pattern: RegExp) => (sentences: readonly string[]) => sentences.some((s) => pattern.test(s));

const DEMAND_FALLBACK_ROWS: readonly DemandRow[] = [
  { category: "link_or_install", matches: anySentence(INSTALL_REQUEST) },
  { category: "link_or_install", matches: anySentence(LINK_OPEN_REQUEST) },
  { category: "personal_info_demand", matches: anySentence(ASSET_INFO_REQUEST), prefer: /자산|은행/ },
  { category: "personal_info_demand", matches: anySentence(CARD_INFO_REQUEST), prefer: /카드/ },
  { category: "personal_info_demand", matches: anySentence(IDENTITY_INFO_REQUEST) },
  { category: "personal_info_demand", matches: anySentence(ID_PHOTO_SEND_REQUEST) },
  {
    category: "payment_demand",
    matches: (sentences) => sentences.some((s) => MONEY_CONTEXT.test(s) && TRANSFER_REQUEST.test(s)),
  },
  {
    category: "payment_demand",
    matches: (sentences) => sentences.some((s) => AMOUNT_OR_ACCOUNT.test(s) && FAVOR_REQUEST.test(s)),
  },
  { category: "payment_demand", matches: (_sentences, whole) => HANDOFF_DEMAND.test(whole.replace(ATM_WORDS, "")) },
];

/** 보정 후보에서 빼는 라벨 — 부인 대응 수법 · 분위기 암시(요구가 아니다). */
const NON_DEMAND_LABEL = /부인\s*시|암시/;

/**
 * 문구 키가 빈 사기범 대사의 **요구 어형**으로 세션 목록 안의 라벨을 고른다(위 표). 없으면 `undefined`(= 종전 폴백).
 * export 이유: 표 행 단위 단위 테스트(`__tests__/demandFallbackLabel.test.ts`).
 */
export function resolveDemandFallbackTactic(
  scammerText: string,
  weakenedTactics: readonly string[],
): string | undefined {
  const sentences = scammerText.split(/[.?!\n]+/).filter((s) => s.trim().length > 0);
  const labels = weakenedTactics.map(extractTacticLabel).filter((label) => !NON_DEMAND_LABEL.test(label));
  for (const row of DEMAND_FALLBACK_ROWS) {
    if (!row.matches(sentences, scammerText)) continue;
    const candidates = labels.filter((label) => resolveTacticCategory(label) === row.category);
    if (candidates.length === 0) continue;
    const preferred = row.prefer ? candidates.find((label) => row.prefer!.test(label)) : undefined;
    return preferred ?? candidates[0];
  }
  return undefined;
}

export function analyzeConversation(
  messages: AnalysisMessage[],
  sessionCreatedAtMs: number,
  weakenedTactics: string[],
  /** 사용자 결정 2026-10-21 — 이 세션 시나리오의 인증번호 정답(카탈로그). 부재 · 빈 배열 = 대조 안 함(종전 판정 — 위 W0). */
  otpCodes: readonly string[] = [],
): ConversationAnalysis {
  // ⭐ §55 D3 — **낭독되지 않은 문서는 분석에 넣지 않는다.** 넣으면 ⓐ 말한 적 없는 대사가
  // `tacticsUsed`("시도된 수법")에 오르고 ⓑ 바로 뒤 참가자 발화와 **짝지어져** 없는 "속은 순간"을
  // 만든다(아래 루프의 `sorted[i + 1]` 짝짓기). 표시뿐 아니라 **판정도** 여기서 정정된다.
  // ⛔ 이 필터는 앵커·문서 수 계산에 전파하지 않는다(G350) — `generateReportCore`의
  // `mockScreenMessages` 뷰는 **필터 없는 원본**을 그대로 쓴다.
  const sorted = [...messages]
    .filter((m) => !m.notSpoken)
    .sort((a, b) => a.turnIndex - b.turnIndex);
  const deceivedMoments: DeceivedMomentResult[] = [];
  const tacticLabelsUsed = new Set<string>();
  const tacticMatchers = buildTacticMatchers(weakenedTactics);
  const riskSignals: RiskSignal[] = [];
  // §113.2 H3 — 지금까지 사진 · 신분증을 요구한 가장 최근 사기범 대사(없으면 undefined).
  let photoDemand: AnalysisMessage | undefined;
  // §128(2) H4 — 지금까지 송금을 요구한 가장 최근 사기범 대사(없으면 undefined).
  let transferDemand: AnalysisMessage | undefined;

  for (let i = 0; i < sorted.length; i += 1) {
    const msg = sorted[i];
    if (msg.role !== "scammer") continue;
    if (PHOTO_DEMAND.test(msg.textMasked)) photoDemand = msg;
    if (isTransferDemand(msg.textMasked)) transferDemand = msg;

    // 한 대사에 수법이 여럿이면 모두 "시도된 수법"에 올린다(2026-10-17). 속은 순간의 라벨은 종전처럼
    // 목록 순서상 **첫** 수법이다 — 라벨 규칙을 바꾸면 아카이브 묶기 키(T74)가 함께 흔들린다.
    const matchedTactics = findMatchedTactics(msg.textMasked, tacticMatchers);
    for (const matched of matchedTactics) {
      tacticLabelsUsed.add(extractTacticLabel(matched));
    }
    // §128(2) T-1 — 문구 키가 빈 대사도 요구 어형 표(`resolveDemandFallbackTactic` — 세션 목록 안 라벨만)로 "시도된 수법"에 올린다.
    // 종전에는 속은 순간으로 판정된 짝에서만 보정해, 거절한 요구(추가 송금 · 비밀번호 등)가 목록에서 빠졌다. 속은 순간 판정 · 라벨은 무변경.
    if (matchedTactics.length === 0) {
      const demandLabel = resolveDemandFallbackTactic(msg.textMasked, weakenedTactics);
      if (demandLabel) tacticLabelsUsed.add(demandLabel);
    }
    const matchedTactic = matchedTactics[0];

    // 판정 검수(2026-10-21) — 사기범 대사 뒤 참가자 줄이 **연달아** 올 수 있다(실시간 통화에서 사기범 전사가 빈
    // `turnComplete` · 끊긴 조각). 종전엔 첫 줄만 봐서 "잠깐만요" → "048231이요"의 둘째 줄이 판정되지 않았다.
    // 다음 사기범 대사 전까지의 참가자 줄을 차례로 보고 **처음 응한 줄 하나**만 순간으로 잡는다(대사 1개당 순간 최대 1개 — 종전 불변식).
    // 교대로 오가는 대화에서는 첫 줄만 보게 되므로 종전 판정과 같다.
    // 사용자 결정 2026-10-21 — ① 실제 제공(H1 · H2)은 저항 어휘보다 앞선다 ② 가짜 정보 표지가 있으면 속음이 아니라 위험 신호다.
    let userReply: AnalysisMessage | undefined;
    for (let j = i + 1; j < sorted.length && sorted[j].role === "user"; j += 1) {
      const reply = sorted[j];
      const fake = FAKE_INFO_MARKER.test(reply.textMasked);
      const resisted = isResistanceForReport(reply.textMasked);
      // 사용자 결정 2026-10-21 — 인증번호 오답(위 W4)은 숫자 응답에서 오는 순응 판정을 끈다(실제 제공 H1 · H2는 그대로).
      const wrongOtp = isWrongOtpReply(msg.textMasked, reply.textMasked, otpCodes);
      const complied =
        COMPLIANCE_PATTERN.test(reply.textMasked) ||
        isHandoffPromiseReply(msg.textMasked, reply.textMasked) ||
        isContextualCompliance(msg.textMasked, reply.textMasked);
      if (isPhotoAfterDemand(reply, photoDemand !== undefined)) {
        userReply = reply;
        break;
      }
      if (isTransferDoneAfterDemand(reply, transferDemand !== undefined)) {
        userReply = reply;
        break;
      }
      if (!fake && (isHardDisclosure(msg.textMasked, reply.textMasked) || (!resisted && complied && !wrongOtp))) {
        userReply = reply;
        break;
      }
    }
    for (let j = i + 1; j < sorted.length && sorted[j].role === "user"; j += 1) {
      const reply = sorted[j];
      if (reply === userReply) continue;
      const kind = resolveRiskSignalKind(msg.textMasked, reply.textMasked, otpCodes);
      if (kind) riskSignals.push({ turnIndex: reply.turnIndex, timeLabel: elapsedLabel(reply, sessionCreatedAtMs), kind });
    }
    if (!userReply) continue;

    // PR-A3 — 문구 키가 비면 요구 어형 표(`resolveDemandFallbackTactic`)로 세션 목록 안의 라벨을 고른다. 고른 라벨은
    // AC-083 (a)를 지키려고 수법 목록에도 올린다(라벨이 정해지는 것은 이미 속은 순간으로 판정된 짝뿐이다).
    // §113.2 H3 — 사진 턴이면 라벨은 요구한 대사에서 고른다.
    // §128(2) H4 — 이행 보고면 라벨은 송금을 요구한 대사에서 고른다(바로 앞 대사가 요구가 아닐 수 있다).
    const labelSource =
      userReply.photo === true && photoDemand
        ? photoDemand
        : transferDemand && msg !== transferDemand && isTransferDoneAfterDemand(userReply, true) && !isTransferDemand(msg.textMasked)
          ? transferDemand
          : msg;
    const labelTactic = labelSource === msg ? matchedTactic : findMatchedTactics(labelSource.textMasked, tacticMatchers)[0];
    const fallbackTactic = labelTactic
      ? undefined
      : (resolveDemandFallbackTactic(labelSource.textMasked, weakenedTactics) ??
        (userReply.photo === true && photoDemand ? resolvePhotoProvidedTactic(photoDemand.textMasked, weakenedTactics) : undefined));
    if (fallbackTactic) tacticLabelsUsed.add(fallbackTactic);
    const tactic = labelTactic ? extractTacticLabel(labelTactic) : (fallbackTactic ?? "약화된 사기 수법");
    // AC-026 예시("15초 시점에 속았습니다")를 그대로 따르기 위해 turnIndex가 아니라 실제 경과
    // 시간(초)을 라벨로 쓴다 — MessageDoc.createdAt이 이미 존재하므로 정확한 초 단위 계산이
    // 가능하다(구현 판단, Mock 단계라 정밀 음성 타이밍 데이터는 없지만 메시지 write 시각은 실측값).
    deceivedMoments.push({
      turnIndex: userReply.turnIndex,
      timeLabel: elapsedLabel(userReply, sessionCreatedAtMs),
      tactic,
      correctAction: pickCorrectAction(tactic, userReply.channel ?? "voice"),
      tacticCategory: resolveTacticCategory(tactic),
    });
  }

  return {
    wasDeceived: deceivedMoments.length > 0,
    deceivedMoments,
    tacticsUsed: Array.from(tacticLabelsUsed),
    riskSignals,
  };
}

/** "N초 시점" — 속은 순간 · 위험 신호가 같은 시간축을 쓴다(AC-026). */
function elapsedLabel(message: AnalysisMessage, sessionCreatedAtMs: number): string {
  const elapsedSec = Math.max(0, Math.round((message.createdAtMs - sessionCreatedAtMs) / 1000));
  return `${elapsedSec}초 시점`;
}

/** 수법 라벨 키워드로 올바른 대처법을 고른다(AC-026 "그 순간 취했어야 할 올바른 대처"). 특정
 * 시나리오의 정확한 라벨 문자열에 하드코딩하지 않고 키워드 부분 일치로 판정해, 향후 다른 시나리오
 * (T6 "기관사칭" 등)가 추가돼도 이 모듈을 고치지 않고 재사용 가능하게 한다.
 *
 * `channel`(2026-10-17): 메신저 세션에는 통화 전용 행동("전화를 끊고")을 권하지 않는다. 기본값
 * "voice"의 문구는 이 변경 전과 **한 글자도 다르지 않다**(회귀 테스트가 동결 사본과 비교한다). 두
 * 채널에 모두 맞는 문구(확인 전화·영상통화로 직접 확인)는 채널과 무관하게 그대로다. */
export function pickCorrectAction(tacticLabel: string, channel: AdviceChannel = "voice"): string {
  const messenger = channel === "messenger";
  if (/확인|전화/.test(tacticLabel)) {
    return "상대가 확인 전화를 막으려 해도 반드시 알고 있는 번호로 직접 전화해 사실을 확인하세요.";
  }
  if (/송금|계좌/.test(tacticLabel)) {
    return messenger
      ? "계좌번호나 송금을 요구받으면 절대 응하지 말고, 대화를 멈춘 뒤 112(경찰)나 가족에게 직접 확인하세요."
      : "계좌번호나 송금을 요구받으면 절대 응하지 말고, 전화를 끊은 뒤 112(경찰)나 가족에게 직접 확인하세요.";
  }
  if (/다급|긴급|시간/.test(tacticLabel)) {
    return messenger
      ? "아무리 다급해 보여도 그 자리에서 결정하지 말고, 일단 대화를 멈추고 잠시 시간을 두어 사실관계를 확인하세요."
      : "아무리 다급해 보여도 그 자리에서 결정하지 말고, 일단 전화를 끊고 잠시 시간을 두어 사실관계를 확인하세요.";
  }
  if (/가족|죄책감|애정/.test(tacticLabel)) {
    return "감정이 흔들리더라도 실제 그 사람이 맞는지부터 다른 방법(직접 전화·영상통화)으로 확인하세요.";
  }
  if (/권위|기관|경찰|공공/.test(tacticLabel)) {
    return messenger
      ? "메시지로 신원(경찰·기관 등)을 주장해도 그 자리에서 믿지 말고, 공식 대표번호로 직접 걸어 확인하세요."
      : "전화로 신원(경찰·기관 등)을 주장해도 그 자리에서 믿지 말고, 공식 대표번호로 직접 걸어 확인하세요.";
  }
  return messenger
    ? "대화를 멈추고 알고 있는 번호로 직접 연락해 사실을 확인하세요."
    : "전화를 끊고 알고 있는 번호로 직접 다시 연락해 사실을 확인하세요.";
}

/** 예방 조언(AC-008 "예방 조언 1개 이상"). 감지된 수법별 대처법 + 마무리 조언 1개를 합친다.
 * "면역됨"류 과신 표현은 쓰지 않는다(PRD Risks, UX.md Accessibility) — 속았든 안 속았든 "개선
 * 영역/계속 유지해야 할 습관" 프레임을 쓴다. `channel`은 `pickCorrectAction`과 같은 규칙이다. */
export function buildPreventionAdvice(
  tacticsUsed: string[],
  wasDeceived: boolean,
  channel: AdviceChannel = "voice",
): string[] {
  const perTacticAdvice = tacticsUsed.map((tactic) => pickCorrectAction(tactic, channel));
  const advice = Array.from(new Set(perTacticAdvice));

  advice.push(
    wasDeceived
      ? "오늘 놓쳤던 순간을 기억해 두면 다음엔 더 빨리 알아챌 수 있습니다. 이건 한 번에 사라지는 게 아니라 계속 연습해야 하는 개선 영역입니다."
      : channel === "messenger"
        ? "이번엔 상대의 요구에 응하지 않았습니다. 다만 사기 수법은 계속 진화하므로, 오늘처럼 대화를 멈추고 직접 확인하는 습관을 계속 유지하는 것이 중요합니다."
        : "이번엔 상대의 요구에 응하지 않았습니다. 다만 사기 수법은 계속 진화하므로, 오늘처럼 전화를 끊고 직접 확인하는 습관을 계속 유지하는 것이 중요합니다.",
  );

  return advice;
}
