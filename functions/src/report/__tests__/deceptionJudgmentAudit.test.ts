// ⭐ 판정 검수(2026-10-21) — 보이스피싱 13종 · 메신저 4종 시나리오별 "속았다 / 잘 대응했다" 대본 회귀.
//
// 기준표(대본의 `rule` 열 — 기대값은 이 표대로만 매긴다):
// | # | 참가자 행동 | 기대 | 근거 |
// |---|---|---|---|
// | C1 | 개인정보 제공(주민번호 · 계좌 · 카드번호 · 보안코드 · 인증번호 · 생년월일) | 속음 | AC-061 · analyzeConversation (A)(D3)(D5) |
// | C2 | 송금 · 이체 · 결제 · 인출 · 전달 · 코인 구매 동의 | 속음 | BASE 패턴 · T191 J-2 |
// | C3 | 앱 설치 · 권한 허용 · 정보 입력을 했다/하겠다 | 속음 | BASE (B) · 판정 검수 V4 |
// | C5 | 일반 지시 순응 약속("말씀하신 대로 할게요" · "진행해 주세요") | 속음 | BASE (2)(B) |
// | C7 | 의심 · 거절 · 끊기 · 직접 확인 전화 | 안 속음 | RESISTANCE_PATTERN(저항 우선) |
// | C8 | 되묻기(어느 기관 · 왜 · 누구) | 안 속음 | 순응 어휘 없음 |
// | C9 | 단독 "네 · 알겠습니다" | 안 속음 | BASE 주석(격식 어미 단독 제거) |
// | C11 | 저항 어휘가 **되묻기 · 부정**으로만 나오고 정보 제공 · 동의가 함께 있다 | 속음 | 판정 검수 V1 |
// | C12 | 사기범 대사 뒤 참가자 줄이 연달아 오고 둘째 줄에서 응했다 | 속음 | 판정 검수(연속 줄) |
// | C13 | 의심 · 거절을 말하면서도 실제로 정보를 넘겼다("의심스럽지만 [계좌]") | 속음 | **사용자 결정 2026-10-21 ①** 말보다 행동 |
// | R6 | 비밀 유지 약속 | 안 속음 + 위험 신호 `secrecy_promise` | **사용자 결정 2026-10-21 ②** |
// | R10 | 거래 은행명만 말함 | 안 속음 + 위험 신호 `bank_disclosed` | **사용자 결정 2026-10-21 ②** |
// | R13 | 가짜 정보 제공(숫자를 불러도) | 안 속음 + 위험 신호 `fake_info` | **사용자 결정 2026-10-21 ②** |
//
// ⭐ 역방향 확인: 판정 검수로 고친 대본(`fixed: true`)은 **종전 규칙**(첫 참가자 줄 하나 · 공유 패턴만)으로는 기대와 다르게
// 나옴을 같은 실행에 나란히 보인다. ⚠️ 사기범 대사는 합성 픽스처다(라이브 전사 복사 아님).
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, COMPLIANCE_PATTERN, RESISTANCE_PATTERN } from "../analyzeConversation";
import { maskPII } from "../../guardrails";
import { SCENARIO_PROMPTS } from "../../scenarios";

type Turn = ["scammer" | "user", string];
type Case = { sc: string; id: string; kind: string; expect: boolean; turns: Turn[]; rule: string };
const S = (t: string): Turn => ["scammer", t];
const U = (t: string): Turn => ["user", t];
const c = (sc: string, id: string, kind: string, expect: boolean, turns: Turn[], rule: string): Case => ({
  sc,
  id,
  kind,
  expect,
  turns,
  rule,
});

const INST = "institutional-impersonation";
const LOAN = "loan-refinance-scam";
const TAX = "tax-refund-scam";
const CARD = "card-company-impersonation";
const COURIER = "courier-customs-scam";
const KID = "kidnapping-threat";
const REP = "reputation-blackmail-scam";
const BANK = "bank-security-verify-scam";
const FAM = "family-accident-deepvoice";
const GRAND = "grandchild-impersonation";
const CDEL = "card-delivery-call";
const ASSET = "asset-protection-notice-call";
const PROS = "prosecution-cooperation-call";
const MCHILD = "messenger-child-impersonation-kakao";
const MFRIEND = "messenger-friend-loan-kakao";
const MPARCEL = "messenger-parcel-smishing-sms";
const MSUB = "messenger-subsidy-smishing-sms";

const CASES: Case[] = [
  // ── 기관 사칭
  c(INST, "inst-d1", "속는", true, [S("서울중앙지검 수사관입니다. 고객님 명의 통장이 범죄에 연루됐습니다. 본인 확인을 위해 주민등록번호 불러 주십시오."), U("네 본인 확인이요? 800101-1234567 입니다")], "C1"),
  c(INST, "inst-d2", "속는", true, [S("본인 확인을 위해 생년월일 말씀해 주십시오."), U("61년 3월 2일이요")], "C1"),
  c(INST, "inst-d3", "속는", true, [S("자산 보호를 위해 안전계좌로 옮기셔야 합니다. 협조하시겠습니까?"), U("네 말씀하신 대로 할게요")], "C5"),
  c(INST, "inst-d4", "속는", true, [S("문자로 보내드린 인증번호 여섯 자리 불러 주십시오."), U("공사팔 이삼일이요")], "C1"),
  c(INST, "inst-d5", "속는", true, [S("경찰청 사이버수사대와 공조 중입니다. 계좌번호 불러 주십시오."), U("경찰청이요? 네 알려드릴게요. 110-234-567890")], "C1/C11"),
  c(INST, "inst-g1", "대응", false, [S("서울중앙지검 수사관입니다. 성함과 생년월일 불러 주십시오."), U("검찰이 전화로 그런 걸 묻지 않잖아요. 끊고 대표번호로 확인할게요")], "C7"),
  c(INST, "inst-e1", "경계-되묻기", false, [S("서울중앙지검 수사관입니다. 성함 말씀해 주십시오."), U("어느 검찰청이라고요? 사건번호가 뭐예요?")], "C8"),
  c(INST, "inst-e2", "경계-말만", false, [S("지금 바로 조치하셔야 합니다."), U("네 알겠습니다")], "C9"),
  c(INST, "inst-e3", "경계-비밀유지", false, [S("수사 기밀이니 가족에게도 말씀하시면 안 됩니다."), U("네 아무한테도 말 안 할게요")], "R6"),
  c(INST, "inst-e4", "경계-은행명", false, [S("거래하시는 은행이 어디십니까?"), U("국민은행이요")], "R10"),
  // ── 대출
  c(LOAN, "loan-d1", "속는", true, [S("저금리 대환 승인 나셨습니다. 기존 대출 선상환금 300만원 입금해 주셔야 합니다."), U("네 입금할게요. 어디로 보내면 돼요?")], "C2"),
  c(LOAN, "loan-d2", "속는", true, [S("신청서 작성 도와드릴게요. 진행하시겠어요?"), U("네 진행해 주세요")], "C5"),
  c(LOAN, "loan-g1", "대응", false, [S("오늘 마감이라 지금 수수료 입금하셔야 합니다."), U("대출 받는데 먼저 돈 보내라는 건 사기 아닌가요? 안 할게요")], "C7"),
  c(LOAN, "loan-e1", "경계-되묻기", false, [S("수수료 30만원만 먼저 입금하시면 됩니다."), U("수수료요? 왜 먼저 내야 하죠?")], "C8"),
  // ── 환급금
  c(TAX, "tax-d1", "속는", true, [S("환급금 받으시려면 안내드리는 앱 설치해 주세요."), U("설치했어요. 다음엔 뭐 하면 돼요?")], "C3"),
  c(TAX, "tax-d2", "속는", true, [S("본인 확인을 위해 계좌번호 불러 주세요."), U("1002-123-456789 입니다")], "C1"),
  c(TAX, "tax-g1", "대응", false, [S("환급금 받으시려면 수수료 5만원 먼저 보내셔야 합니다."), U("국세청에 직접 전화해서 확인해 볼게요")], "C7"),
  // ── 카드사
  c(CARD, "card-d1", "속는", true, [S("부정결제 확인을 위해 카드번호 16자리 불러 주세요."), U("1234 5678 9012 3456 이요")], "C1"),
  c(CARD, "card-d2", "속는", true, [S("카드 뒷면 보안코드 세 자리 말씀해 주세요."), U("뒷면 번호 382요")], "C1"),
  c(CARD, "card-g1", "대응", false, [S("카드번호 불러 주세요."), U("카드사 대표번호로 다시 전화해 볼게요")], "C7"),
  // ── 택배·통관
  c(COURIER, "cour-d1", "속는", true, [S("통관비 3만원 결제하셔야 물건이 나갑니다."), U("네 결제할게요")], "C2"),
  c(COURIER, "cour-d2", "속는", true, [S("개인통관고유부호랑 주민번호 앞자리 말씀해 주세요."), U("주민번호 앞자리는 800101이요")], "C1"),
  c(COURIER, "cour-g1", "대응", false, [S("통관비 결제하셔야 합니다."), U("주문한 적 없는데요. 이상하네요 끊을게요")], "C7"),
  // ── 납치 협박
  c(KID, "kid-d1", "속는", true, [S("딸 데리고 있다. 지금 당장 500만원 보내."), U("보낼게요 제발 아이만 건드리지 마세요")], "C2"),
  c(KID, "kid-d2", "속는", true, [S("경찰에 신고하면 끝이야. 돈 보내."), U("신고 안 할게요 보낼게요 계좌 불러주세요")], "C2/C11"),
  c(KID, "kid-g1", "대응", false, [S("딸 데리고 있다. 돈 보내."), U("딸한테 직접 전화해 볼게요")], "C7"),
  // ── 유포 협박
  c(REP, "rep-d1", "속는", true, [S("영상 지인들에게 뿌리기 싫으면 200만원 입금해."), U("입금할게요. 제발 지워주세요")], "C2"),
  c(REP, "rep-g1", "대응", false, [S("영상 뿌린다. 돈 보내."), U("경찰에 신고하겠습니다")], "C7"),
  // ── 확인 유도형 은행(고급)
  c(BANK, "bank-d1", "속는", true, [S("대표번호로 다시 거셔서 확인하셨죠? 보호계좌로 이체해 주십시오."), U("네 확인했으니까 이체할게요")], "C2/C11"),
  c(BANK, "bank-d2", "속는", true, [S("본인 확인 정보 말씀해 주세요."), U("본인 확인이요? 주민번호 800101-1234567이요")], "C1/C11"),
  c(BANK, "bank-g1", "대응", false, [S("보호계좌로 이체해 주십시오."), U("은행 창구에 직접 가서 확인할게요")], "C7"),
  // ── 가족 사고 / 손주
  c(FAM, "fam-d1", "속는", true, [S("엄마 나 사고 났어. 합의금 300만원 보내줘."), U("알았어 지금 보낼게")], "C2"),
  c(FAM, "fam-g1", "대응", false, [S("엄마 나야 사고 났어. 빨리 보내줘."), U("너 목소리가 이상한데 영상통화 해봐")], "C7"),
  c(GRAND, "gr-d1", "속는", true, [S("할머니 나야. 상품권 사서 번호 사진 찍어 보내줘."), U("그래 사서 보내줄게")], "C2"),
  c(GRAND, "gr-g1", "대응", false, [S("할머니 돈 좀 보내줘."), U("네 엄마한테 먼저 물어볼게")], "C7"),
  // ── 카드 배송(고급)
  c(CDEL, "cdel-d1", "속는", true, [S("카드 발급 취소하시려면 보안 점검 앱 설치해 주세요."), U("네 설치할게요")], "C3"),
  c(CDEL, "cdel-g1", "대응", false, [S("카드 신청 안 하셨으면 명의도용입니다. 앱 설치해 주세요."), U("카드사에 직접 확인해 볼게요")], "C7"),
  // ── 금감원 자산 보호(고급)
  c(ASSET, "asset-d1", "속는", true, [S("자산 보호를 위해 예금을 현금으로 인출해 두세요. 직원이 받으러 갑니다."), U("네 현금으로 찾아 둘게요")], "C2"),
  c(ASSET, "asset-d2", "속는", true, [S("현재 예금 잔액이 얼마인지 말씀해 주세요."), U("3천만원 정도 있어요")], "C1"),
  c(ASSET, "asset-known", "실측 재현", true, [S("본인 확인을 위해 생년월일 말씀해 주세요."), U("1961년 3월 2일이에요"), S("수사 협조해 주시면 자산을 보호해 드립니다. 협조하시겠습니까?"), U("말씀하신 대로 할게요"), S("거래 은행과 예금 규모를 말씀해 주세요.")], "C1·C5"),
  c(ASSET, "asset-g1", "대응", false, [S("금감원입니다. 예금 인출해서 직원에게 전달해 주세요."), U("금감원은 돈을 받으러 오지 않아요. 신고할게요")], "C7"),
  // ── 검찰 수사 협조(고급)
  c(PROS, "pros-d1", "속는", true, [S("자산 검증을 위해 코인으로 바꿔서 지정 지갑으로 옮겨 주십시오."), U("코인으로 바꿔서 옮길게요")], "C2"),
  c(PROS, "pros-g1", "대응", false, [S("구속 수사 대상입니다. 코인 구매해 송금해 주십시오."), U("말도 안 되는 소리 하지 마세요. 끊습니다")], "C7"),
  // ── 메신저 4종
  c(MCHILD, "mch-d1", "속는", true, [S("엄마 나 폰 고장나서 친구폰으로 연락해. 급하게 50만원만 보내줄 수 있어?"), U("응 보내줄게 계좌 알려줘")], "C2"),
  c(MCHILD, "mch-d2", "속는", true, [S("엄마 신분증 사진이랑 카드 번호 좀 보내줘"), U("알았어 사진 찍어서 보낼게")], "C1"),
  c(MCHILD, "mch-g1", "대응", false, [S("엄마 나 폰 고장났어 돈 보내줘"), U("전화로 목소리 확인부터 하자 지금 전화할게")], "C7"),
  c(MCHILD, "mch-e1", "경계-되묻기", false, [S("엄마 나야 급해"), U("누구니? 우리 아들 이름 말해봐")], "C8"),
  c(MFRIEND, "mfr-d1", "속는", true, [S("나 급해서 그런데 100만원만 빌려줄 수 있어? 내일 바로 갚을게"), U("그래 빌려줄게 계좌 보내")], "C2"),
  c(MFRIEND, "mfr-g1", "대응", false, [S("100만원만 빌려줘"), U("너 맞아? 전화로 얘기하자")], "C7"),
  c(MPARCEL, "mpa-d1", "속는", true, [S("[택배] 주소 불일치로 배송 보류. 아래 링크에서 주소 수정 바랍니다."), U("주소 입력했어요")], "C3"),
  c(MPARCEL, "mpa-g1", "대응", false, [S("[택배] 주소 불일치. 링크 확인 바랍니다."), U("택배사 앱에서 직접 확인할게요")], "C7"),
  c(MSUB, "msu-d1", "속는", true, [S("지원금 신청하려면 앱 설치하고 권한 허용해 주세요."), U("설치했어요 권한도 허용했어요")], "C3"),
  c(MSUB, "msu-g1", "대응", false, [S("지원금 신청 링크입니다. 앱 설치해 주세요."), U("정부24에서 직접 확인해 볼게요")], "C7"),
  // ── 구조: 연속 참가자 발화(Live에서 사기범 전사가 비어 user가 이어짐)
  c(INST, "struct-consec", "구조-연속발화", true, [S("인증번호 불러 주십시오."), U("잠깐만요"), U("048231이요")], "C12"),
  // ── 가짜 정보
  c(INST, "inst-fake", "경계-가짜정보", false, [S("계좌번호 불러 주십시오."), U("가짜로 아무거나 말할게요 1111-2222-3333")], "R13"),
  // ── 챌린지 2턴 끊음
  c(INST, "chal-2turn", "실측 재현", false, [S("서울중앙지검입니다. 홍길동 씨 되시죠?"), U("네 누구시죠?"), S("고객님 명의 통장이 범죄에 연루됐습니다."), U("네?")], "C8"),
  // ── 사용자 결정 2026-10-21 ① 말보다 행동
  c(INST, "act-doubt-acct", "결정①", true, [S("안전계좌 확인을 위해 계좌번호 불러 주십시오."), U("의심스럽긴 한데 110-234-567890 이요")], "C13"),
  c(BANK, "act-scam-rrn", "결정①", true, [S("본인 확인 위해 주민번호 말씀해 주세요."), U("사기 아니죠? 800101-1234567이에요")], "C13"),
  c(CARD, "act-hangup-acct", "결정①", true, [S("피해금 이관할 계좌 알려 주세요."), U("끊고 싶은데 무서워서요 1002-123-456789요")], "C13"),
  c(ASSET, "act-doubt-balance", "결정①", true, [S("예금 잔액 말씀해 주세요."), U("의심되지만 3천만원 정도 있어요")], "C13"),
  c(INST, "act-doubt-birth", "결정①", true, [S("생년월일 말씀해 주십시오."), U("의심스럽지만 61년 3월 2일이요")], "C13"),
  c(MCHILD, "act-msg-doubt-acct", "결정①", true, [S("엄마 계좌번호 좀 보내줘 확인할게"), U("좀 이상하긴 한데 1002-123-456789")], "C13"),
  c(INST, "act-callback", "결정① 반례", false, [S("계좌번호 불러 주십시오."), U("1588-1234로 다시 전화해 볼게요")], "C7"),
  c(KID, "act-fake-send", "결정② 가짜", false, [S("계좌로 돈 보내."), U("가짜 번호 불러 줄게요 1111-2222-3333 보낼게요")], "R13"),
  c(PROS, "risk-secret2", "결정② 비밀", false, [S("가족에게도 알리시면 수사에 방해됩니다."), U("네 비밀로 할게요")], "R6"),
  c(BANK, "risk-bank2", "결정② 은행", false, [S("어느 은행 거래하세요?"), U("농협이랑 우체국 써요")], "R10"),
];

/** 판정 검수로 고친 대본 — 종전 규칙으로는 기대와 달랐다(역방향 확인 대상). */
const FIXED_IDS = new Set([
  "act-doubt-acct",
  "act-hangup-acct",
  "act-doubt-balance",
  "act-doubt-birth",
  "inst-fake",
  "act-fake-send",
  "inst-d1", "inst-d2", "inst-d5", "card-d2", "kid-d2", "bank-d2", "mpa-d1", "struct-consec"]);
/** 사용자 결정 2026-10-21 ② — 위험 신호 기대(대본 id → kind). 그 밖 대본은 위험 신호 0건. */
const RISK_EXPECT: Record<string, string> = {
  "inst-e3": "secrecy_promise",
  "inst-e4": "bank_disclosed",
  "inst-fake": "fake_info",
  "act-fake-send": "fake_info",
  "risk-secret2": "secrecy_promise",
  "risk-bank2": "bank_disclosed",
};

function run(sc: string, turns: Turn[]) {
  const messages = turns.map(([role, text], i) => ({
    role,
    textMasked: role === "user" ? maskPII(text) : text,
    turnIndex: i,
    createdAtMs: 1000 * (i + 1),
  }));
  return analyzeConversation(messages, 0, SCENARIO_PROMPTS[sc]!.weakenedTactics);
}

/** 종전 규칙 — 사기범 대사 바로 다음 참가자 줄 하나만, 공유 패턴만(T191 J-2 갈래는 이 대본들과 무관). */
function runBeforeAudit(turns: Turn[]): boolean {
  return turns.some(([role], i) => {
    const next = turns[i + 1];
    if (role !== "scammer" || !next || next[0] !== "user") return false;
    const reply = maskPII(next[1]);
    return !RESISTANCE_PATTERN.test(reply) && COMPLIANCE_PATTERN.test(reply);
  });
}

test("[판정 검수] 대본은 시나리오 17종을 모두 덮는다", () => {
  const covered = new Set(CASES.map((x) => x.sc));
  for (const id of Object.keys(SCENARIO_PROMPTS)) assert.ok(covered.has(id), `대본 없는 시나리오: ${id}`);
});

for (const x of CASES) {
  test(`[판정 검수] ${x.sc} · ${x.id}(${x.kind} · ${x.rule})`, () => {
    const r = run(x.sc, x.turns);
    assert.equal(r.wasDeceived, x.expect);
    const want = RISK_EXPECT[x.id];
    assert.deepEqual(
      r.riskSignals.map((signal) => signal.kind),
      want ? [want] : [],
    );
    if (FIXED_IDS.has(x.id)) assert.notEqual(runBeforeAudit(x.turns), x.expect, `역방향 확인 실패: ${x.id}`);
  });
}

test("[판정 검수] 실측 재현 — 생년월일을 말한 줄이 첫 속은 순간이고, 일반 순응 약속도 순간이다", () => {
  const known = CASES.find((x) => x.id === "asset-known")!;
  const r = run(known.sc, known.turns);
  assert.deepEqual(
    r.deceivedMoments.map((m) => m.turnIndex),
    [1, 3],
  );
});

test("[판정 검수] 연속 줄 — 대사 1개당 순간은 최대 1개다", () => {
  const r = run(INST, [S("인증번호 불러 주십시오."), U("048231이요"), U("다시 말하면 048231이요")]);
  assert.equal(r.deceivedMoments.length, 1);
  assert.equal(r.deceivedMoments[0]!.turnIndex, 1);
});

// V1~V4 새 갈래의 오탐 금지 표본 — 전부 속지 않음이어야 한다.
const NEGATIVES: Array<[string, Turn[]]> = [
  ["경찰에 신고는 그대로 한다", [S("신고하시면 불이익이 있습니다. 계좌번호 불러 주세요."), U("경찰에 신고하겠습니다")]],
  ["되묻기만", [S("본인 확인 정보 말씀해 주세요."), U("본인 확인이요? 그걸 왜 전화로 해요?")]],
  ["생년월일 요구 뒤 일정 날짜", [S("생년월일 말씀해 주세요."), U("3월 2일에 은행 가서 직접 확인할게요")]],
  ["생년월일 요구 뒤 거절", [S("생년월일 말씀해 주세요."), U("61년 3월 2일이요? 그걸 왜 물어보세요")]],
  ["생일 문맥 없는 날짜", [S("결제 예정일 안내드립니다."), U("3월 2일이요")]],
  ["보안코드 요구 뒤 대표번호", [S("카드 뒷면 보안코드 말씀해 주세요."), U("1588로 다시 전화해 볼게요")]],
  ["보안코드 요구 뒤 금액", [S("카드 뒷면 보안코드 말씀해 주세요."), U("300만원 결제됐다는 거예요?")]],
  ["인증번호 요구 뒤 시간", [S("인증번호 불러 주십시오."), U("10분 뒤에 다시 연락 주세요")]],
  ["입력 안 함", [S("링크에서 주소 입력해 주세요."), U("입력 안 했어요")]],
  ["입력 후 의심", [S("링크에서 주소 입력해 주세요."), U("입력했는데 이상해요")]],
];
for (const [name, turns] of NEGATIVES) {
  test(`[판정 검수] 오탐 금지 — ${name}`, () => {
    assert.equal(run(INST, turns).wasDeceived, false);
  });
}
