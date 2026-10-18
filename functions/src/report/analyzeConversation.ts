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
import type { MessengerChannel } from "../shared/types";
import { resolveTacticCategory, type TacticCategory } from "./tacticCategory";
import { CODE_DIGITS_WITH_ENDING, CODE_HANGUL_DIGITS } from "../shared/spokenDigits";

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
};

export type DeceivedMomentResult = {
  turnIndex: number;
  timeLabel: string;
  tactic: string;
  correctAction: string;
  // T74(§15.4.2/AC-068) — 실패 아카이브의 "수법별 묶기" 그룹 키. 판정 로직에는 전혀 관여하지
  // 않는다(wasDeceived·deceivedMoments 산출은 무변경) — 집계용 라벨 정규화일 뿐이다.
  tacticCategory: TacticCategory;
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
const HANDOFF_HOLD =
  /(?:안|못)\s|(?:안|못)(?:맡|찾|드리|드릴|인출|출금|사|살|바꾸|바꿀|보내|보낼|옮|넘|건네|구매|할|하겠|해)|않|없어|없습|없다|없는|싫|말게|말래|말까|상의|상담|고민|생각해\s*보|생각\s*좀|나중에|물어|여쭤|문의|회신|부탁|감사|확인|왜|이상|사기|수상|신고|경찰|모르/;

/** 사기범이 인출 · 전달 · 코인을 요구한 바로 다음 답변이 그 약속에 동의하는가(T191 J-2 — 위 표). */
function isHandoffPromiseReply(scammerText: string, replyText: string): boolean {
  return (
    HANDOFF_DEMAND.test(scammerText.replace(ATM_WORDS, "")) &&
    !HANDOFF_HOLD.test(replyText) &&
    !REFUSAL_IN_ANSWER.test(replyText) &&
    HANDOFF_PROMISE.test(replyText)
  );
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

export function analyzeConversation(
  messages: AnalysisMessage[],
  sessionCreatedAtMs: number,
  weakenedTactics: string[],
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

  for (let i = 0; i < sorted.length; i += 1) {
    const msg = sorted[i];
    if (msg.role !== "scammer") continue;

    // 한 대사에 수법이 여럿이면 모두 "시도된 수법"에 올린다(2026-10-17). 속은 순간의 라벨은 종전처럼
    // 목록 순서상 **첫** 수법이다 — 라벨 규칙을 바꾸면 아카이브 묶기 키(T74)가 함께 흔들린다.
    const matchedTactics = findMatchedTactics(msg.textMasked, tacticMatchers);
    for (const matched of matchedTactics) {
      tacticLabelsUsed.add(extractTacticLabel(matched));
    }
    const matchedTactic = matchedTactics[0];

    const userReply = sorted[i + 1];
    if (!userReply || userReply.role !== "user") continue;

    const resisted = RESISTANCE_PATTERN.test(userReply.textMasked);
    const complied =
      COMPLIANCE_PATTERN.test(userReply.textMasked) ||
      isHandoffPromiseReply(msg.textMasked, userReply.textMasked);
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
      correctAction: pickCorrectAction(tactic, userReply.channel ?? "voice"),
      tacticCategory: resolveTacticCategory(tactic),
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
