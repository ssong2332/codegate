// §133(DECISIONS #249 · UX D-162) — 자주 묻는 질문 5문항. 화면은 `src/app/faq/page.tsx`.
//
// ⛔ 답은 실제 동작에 맞춘다. 근거를 각 문항 주석에 적고, `faqContent.test.ts`가 근거 값과 대조한다. 동작이 바뀌면 여기도 고친다.
// ⛔ 실존 기관 · 회사 이름을 쓰지 않는다(처리 업체 이름은 개인정보처리방침의 몫).
//
// 순수 모듈이다(React · Firebase import 0건) — 루트 테스트 러너가 그대로 읽는다.

// 가족 링크 만료 · 보존 일수 — `../legal/legalContent.ts`의 CHALLENGE_LINK_EXPIRY_DAYS · CHALLENGE_RETENTION_DAYS와 같아야 한다
// (값 import는 Next 타입 검사에서 `.ts` 확장자가 막혀 복사해 두고, `siteEssentials.test.ts`가 대조한다).
export const FAQ_LINK_EXPIRY_DAYS = 3;
export const FAQ_RETENTION_DAYS = 30;

export type FaqItem = { question: string; answer: readonly string[] };

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    // 첫 화면 문구 "진짜 전화 · 문자는 오지 않습니다"(src/app/page.tsx) · 이용약관 1항(legalContent.ts) — 실제 발신(PSTN) 코드 없음(AC-019).
    question: "진짜 전화가 오나요?",
    answer: [
      "아니요. 전화와 문자는 이 앱 화면 안에서만 보여 드립니다. 내 휴대전화로 진짜 전화나 문자가 걸려 오지 않습니다.",
      "사기범 역할은 AI가 맡습니다.",
    ],
  },
  {
    // 첫 화면 문구 "연습용 · 실제 돈은 오가지 않습니다" · 이용약관 1항 · 송금 화면은 가상 은행(SpoofImage.tsx "가상 은행 · 실제 존재하지 않음", AC-023).
    question: "돈이 나가나요?",
    answer: [
      "아니요. 연습용이라 실제 돈이나 금융 거래는 오가지 않습니다.",
      "훈련 중에 보이는 은행 화면과 계좌도 모두 가짜로 꾸민 것입니다.",
    ],
  },
  {
    // 사진: MessengerChatRoom.tsx objectURL만 · 서버엔 "사진을 보냈다"는 사실만(§113.2 · photoSendAndFamilyScroll.test.ts) · 훈련 종료 화면에서 정리(sessionPhotos.ts releaseSessionPhotos).
    // 녹음: 개인정보처리방침 3항 — 훈련이 끝나면 삭제(functions/src/guardrails/purge.ts). 가족에게 보낸 목소리 정보는 보낸 지 FAQ_RETENTION_DAYS일 뒤 삭제.
    // 통화 음성 · 기록: 개인정보처리방침 1 · 4항 — 통화 음성은 AI 처리 업체로 전달, 대화는 글로 옮겨 보관(일부 식별 정보 자동 가림).
    question: "녹음과 사진은 어디로 가나요?",
    answer: [
      "대화방에서 보낸 사진은 서버로 보내지 않습니다. 내 휴대전화 화면에만 보여 주고, 훈련이 끝나면 지웁니다.",
      `목소리 녹음 파일은 그 훈련이 끝나면 바로 삭제합니다. 가족에게 훈련을 보낼 때 쓴 목소리 정보는 보낸 지 ${FAQ_RETENTION_DAYS}일이 지나면 삭제합니다.`,
      "통화하는 동안의 목소리는 AI가 대답할 수 있도록 AI 처리 업체로 전달됩니다. 대화 내용은 글로 옮겨 훈련 기록으로 남기고, 전화번호 · 계좌번호 같은 정보는 자동으로 가립니다.",
    ],
  },
  {
    // 체험 선택 "지인에게 보내기"(scenarios/experience-select/page.tsx) · 앱이 대신 보내지 않음(challenge/create/page.tsx D-20) ·
    // 링크 만료 FAQ_LINK_EXPIRY_DAYS일 · 받는 분은 로그인 없이(이용약관 2항 · RouteGuard PUBLIC_PATHS /challenge/join).
    question: "가족에게 어떻게 보내나요?",
    answer: [
      "로그인한 뒤 사기 유형을 고르고 '지인에게 보내기'를 누르세요. 훈련을 고르면 링크가 만들어집니다.",
      "그 링크를 카카오톡이나 문자에 붙여 넣어 직접 보내 주세요. 앱이 대신 보내지는 않습니다.",
      `받는 분은 로그인 없이 링크만 눌러 체험할 수 있습니다. 링크는 ${FAQ_LINK_EXPIRY_DAYS}일 뒤 만료됩니다.`,
    ],
  },
  {
    // 사용자 결정 2026-10-24(메인 경유 · "변경 시 안내형") — 결제 기능 0건 · 이용약관 초안 5항(중요한 변경은 서비스 화면으로 알림).
    question: "무료인가요?",
    answer: ["지금은 이용료를 받지 않습니다. 앞으로 바뀌게 되면 서비스 화면에서 먼저 알려 드립니다."],
  },
];
