// 수법 카테고리 정규화 (T74, Architecture.md §15.4.2, AC-068) — 순수 함수(Firestore 없이 단위
// 테스트 가능, sessionLimits.ts·analyzeConversation.ts와 동일 관례).
//
// **왜 필요한가(§15.4.2 실측):** `DeceivedMoment.tactic`은 시나리오 콘텐츠의 `weakenedTactics`
// 라벨에서 온다(analyzeConversation.ts → extractTacticLabel). 같은 수법이 시나리오마다 다른
// 이름이다 — 긴급성만 해도 "긴급성 조성"(card/courier/institutional)·"다급함 조성"(grandchild/
// family)·"마감 압박"(loan)·"촉박한 결정 압박"(kidnapping)의 4가지다. 정규화 없이 원문 문자열로
// 묶으면 실패 아카이브(UX-030)의 "이 수법에 3번 넘어갔습니다"가 "1번+1번+1번"으로 흩어져 그
// 화면의 존재 이유가 사라진다(§15.6 G14).
//
// **표시 문구는 바꾸지 않는다.** 이 값은 **묶기 키**로만 쓰이고, 카드·그룹 헤더에 보이는 문구는
// 여전히 `tactic` 원문이다(§15.4.2). 하위호환: 이 필드가 없는 기존 리포트는 아카이브가
// `tacticCategory ?? tactic`으로 폴백한다(무백필 원칙).

export const TACTIC_CATEGORIES = [
  "payment_demand",
  "personal_info_demand",
  "link_or_install",
  "verification_block",
  "urgency",
  "intimidation",
  "authority",
  "affection",
  "benefit_lure",
  "other",
] as const;

export type TacticCategory = (typeof TACTIC_CATEGORIES)[number];

// **순서가 load-bearing이다**(§15.4.2) — 라벨 하나에 두 카테고리의 단어가 함께 나오는 경우가
// 있어서(예: "권위·긴급상황 암시"는 권위와 긴급을 함께 갖는다) 위에서 먼저 매치하는 행이 이긴다.
// 행 순서는 Architecture.md §15.4.2의 표(1 payment_demand … 9 benefit_lure)를 그대로 따른다.
// 표가 준 것은 "정규식 취지"이므로, 실제 13개 시나리오 라벨을 전부 흡수하도록 각 행의 패턴을
// 채웠다 — 어떤 라벨이 어느 행으로 가는지는 tacticCategory.test.ts가 라벨 단위로 고정한다.
const CATEGORY_RULES: ReadonlyArray<{ category: TacticCategory; pattern: RegExp }> = [
  {
    // 1) 돈을 옮기라는 요구. "이관"(피해금 이관)·"금액"(금액 조정/낮춰)·"재요구"(분할 재요구)·
    //    "ATM"(ATM 조작 지시)은 실제 라벨을 흡수하려고 추가한 항목이다.
    category: "payment_demand",
    pattern:
      /송금|이체|입금|상환|결제|계좌|상품권|수수료|보증금|통관비|합의금|피해금|이관|금액|재요구|ATM/,
  },
  {
    // 2) 개인정보·인증정보를 불러달라는 요구. 마스킹 이후에도 "넘겨줬다"는 사실이 남는 항목들.
    category: "personal_info_demand",
    pattern:
      /주민(등록)?번호|카드\s*(번호|정보)|비밀번호|인증번호|개인정보|신원정보|본인\s*확인|정보\s*수집/,
  },
  {
    // 3) 링크·앱 조작 유도. "디지털 취약 악용"은 라벨 자체엔 앱이 없지만 내용이
    //    "'앱이 안 돼서 그러는데 대신 좀 해주세요'"(grandchildImpersonation.prompt.ts)라 이 행이다.
    category: "link_or_install",
    pattern: /링크|클릭|설치|앱|URL|디지털\s*취약/,
  },
  {
    // 4) 사용자가 스스로 사실을 확인하지 못하게 막는 수법. ⚠️ "확인"만으로 매치하면 안 된다 —
    //    "속사포 확인질문"(=긴급성)까지 삼킨다. 반드시 차단·저지와 함께 나올 때만 잡는다.
    //    "채널 전환 유도"는 '그럼 내가 지금 전화할게'로 사용자의 독립 확인을 자기 채널로 흡수하는
    //    수법이고, "사정 얼버무리기"는 확인 질문에 답을 흐리는 수법이라 같은 행이다.
    category: "verification_block",
    pattern:
      /확인[^]{0,6}차단|차단[^]{0,6}확인|절차\s*차단|신고\s*차단|끊음\s*저지|비밀\s*유지|고립|얼버무|채널\s*전환/,
  },
  {
    // 5) 시간 압박. "속사포"(질문을 몰아쳐 생각할 틈을 안 줌)·"재촉"도 같은 압박이다.
    category: "urgency",
    pattern: /긴급|다급|마감|촉박|시간\s*압박|속사포|재촉/,
  },
  {
    // 6) 위협·냉담으로 밀어붙이기. "놀람 유발"(충격 조성)·"명의 도용 암시"(불이익 암시)·
    //    "수치심 자극"(평판 훼손 위협)·"말 끊기"/"반박 무시"(대화 차단형 압박)가 여기 모인다.
    category: "intimidation",
    pattern:
      /위협|협박|불이익|경고|명령조|냉담|놀람|수치심|명의\s*도용|말\s*끊기|반박\s*무시|차갑|단절/,
  },
  {
    // 7) 권위 사칭. "제3자 통화 전환 요구"는 '옆에 담당자분 바꿔줄게'로 권위 주체를 늘려 압박하는
    //    수법이라 이 행이다(familyAccidentDeepvoice.prompt.ts).
    category: "authority",
    pattern: /권위|기관|수사|경찰|공공|정당성|제3자\s*통화/,
  },
  {
    // 8) 정서(친밀·죄책감·안심)를 이용해 경계를 낮추는 수법.
    category: "affection",
    pattern: /가족|애정|죄책감|친분|비밀|패닉|안심|경계심|애교/,
  },
  {
    // 9) 이익으로 유혹하기.
    category: "benefit_lure",
    pattern: /이익|혜택|지원금|유혹|공짜/,
  },
];

/** 수법 라벨(`extractTacticLabel` 결과)을 고정 카테고리 10종 중 하나로 정규화한다.
 * 어느 행에도 맞지 않으면 `other` — 신규 시나리오 라벨이 들어오면 드리프트 테스트가 먼저 깨져
 * 규칙표 갱신을 강제한다(§15.4.2 "콘텐츠와 집계가 조용히 어긋나는 것을 구조적으로 막음"). */
export function resolveTacticCategory(tacticLabel: string): TacticCategory {
  const label = tacticLabel.trim();
  if (label.length === 0) return "other";
  const matched = CATEGORY_RULES.find((rule) => rule.pattern.test(label));
  return matched?.category ?? "other";
}
