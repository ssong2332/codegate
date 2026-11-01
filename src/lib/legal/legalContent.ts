// 법적 고지 초안(개인정보처리방침 · 이용약관 · 문의) — 외부 점검 2026-10-21 "법적 문제" 대응.
//
// ⛔ 초안이다. 법률 자문을 거친 확정 문구가 아니다 — 화면 맨 위에 DRAFT_NOTICE를 반드시 띄운다.
// ⛔ 운영자명 · 연락처 · 시행일은 사용자가 준 값만 쓴다(지어내지 않는다) — 2026-11-01 사용자 제공(OPERATOR_INFO).
// ⛔ 수집 항목 · 보존 기간은 코드의 실제 값이다. 값이 바뀌면 여기도 고친다(근거는 각 항목 주석).
//
// 순수 모듈이다(React · Firebase import 0건) — 루트 테스트 러너가 그대로 읽는다.

/**
 * 법적 고지 링크 노출 스위치 — 사용자 결정 2026-10-21(DECISIONS #205)로 숨겼다가, 2026-11-01 사용자가 운영자 정보를 주어
 * 다시 켰다(외부 점검 "개인정보처리방침이 없어요" 대응). 끄면 고지 화면 3개의 `robots` noindex(LEGAL_ROBOTS)가 함께 걸린다.
 */
export const SHOW_LEGAL_LINKS = true;

/** 링크를 숨긴 동안에는 고지 화면 3개를 검색엔진에서 뺀다 — SHOW_LEGAL_LINKS가 false일 때만 noindex. */
export const LEGAL_ROBOTS = SHOW_LEGAL_LINKS ? undefined : { index: false, follow: false };

/** 운영자 정보 — 2026-11-01 사용자 제공 값 그대로. */
export const OPERATOR_INFO = {
  operator: "박수홍",
  email: "asg21274@gmail.com",
  officer: "박수홍(운영자)",
  effectiveDate: "2026년 11월 1일",
} as const;

/**
 * UX-03(외부 보안 점검 2026-11-01) — 본문 줄 안의 운영자 이메일을 `mailto:` 링크로 그리기 위해 나눈다.
 * 운영자 이메일이 없는 줄은 null(그대로 텍스트). 링크 대상은 OPERATOR_INFO.email 하나뿐이다(지어낸 주소 0).
 */
export function splitOperatorEmail(text: string): { before: string; email: string; href: string; after: string } | null {
  const at = text.indexOf(OPERATOR_INFO.email);
  if (at < 0) return null;
  return {
    before: text.slice(0, at),
    email: OPERATOR_INFO.email,
    href: `mailto:${OPERATOR_INFO.email}`,
    after: text.slice(at + OPERATOR_INFO.email.length),
  };
}

export const DRAFT_NOTICE =
  "이 문서는 초안입니다. 법률 검토 전이며, 검토 뒤 문구가 바뀔 수 있습니다.";

export type LegalSection = {
  heading: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
  /** 법률 검토가 특히 필요한 곳 — 화면에 "검토 필요" 표식을 붙인다. */
  reviewNeeded?: boolean;
};

export type LegalDocument = { title: string; intro: string; sections: readonly LegalSection[] };

// 챌린지(가족에게 보내기) 링크 만료 3일 · 보존 30일 — functions/src/shared/constants.ts
// CHALLENGE_FREE_LINK_EXPIRY_MS · CHALLENGE_DEFAULT_RETENTION_MS. 테스트가 두 값을 대조한다.
export const CHALLENGE_LINK_EXPIRY_DAYS = 3;
export const CHALLENGE_RETENTION_DAYS = 30;

export const PRIVACY_POLICY: LegalDocument = {
  title: "개인정보처리방침",
  intro: `${OPERATOR_INFO.operator}(이하 "운영자")는 금융사기 예방 훈련 서비스(이하 "서비스")를 제공하면서 아래와 같이 개인정보를 처리합니다.`,
  sections: [
    {
      heading: "1. 수집하는 항목",
      items: [
        // src/lib/auth/userProfile.ts — uid · displayName · email · 가입/최근 로그인 시각. 프로필 사진은 저장하지 않는다.
        "Google 로그인 정보: 이름, 이메일 주소, 계정 식별자, 가입·최근 로그인 시각 (프로필 사진은 저장하지 않습니다)",
        // src/app/challenge/join/page.tsx — signInAnonymously
        "가족이 보낸 훈련 링크로 체험할 때: 로그인 없이 만들어지는 임시 식별자(익명 식별자)",
        // src/lib/consent · src/lib/age/verifyAge.ts — 생년월일은 받지 않는다.
        "이용 동의 기록(동의 여부·시각·문구 버전), 만 14세 이상 확인 여부 (생년월일은 받지 않습니다)",
        // sessions/{sid}/messages.textMasked · reports · rewindAttempts.answerMasked
        "훈련 기록: 문자 대화 내용과 통화 음성을 글로 옮긴 기록, 훈련 결과 리포트, 다시 해 보기 답변. 저장할 때 전화번호·계좌번호 같은 일부 식별 정보는 자동으로 가립니다",
        // Storage users/{uid}/sessions/{sid}/voice_input.webm
        "목소리 녹음: 녹음 기능을 쓸 때 올린 녹음 파일",
        // personaCard — 이름 · 출생연도 · 생일(월·일) · 사는 지역 · §93 하는 일 · 자녀 이름·학년·학원(협박형 훈련)
        "'내 정보' 카드: 훈련을 실감 나게 하려고 직접 입력한 이름, 출생연도, 생일(월·일), 사는 지역, 하는 일, 자녀 이름·학년·다니는 학원 종류(훈련에 따라 일부 항목만). 가족에게 훈련을 보낼 때는 받는 분에 대해 같은 항목을 입력할 수 있습니다",
        "가족에게 보내기: 보내는 분이 정한 표시 이름, 훈련 링크 정보(링크 값은 원문이 아닌 변환값으로만 저장합니다)",
      ],
    },
    {
      heading: "2. 이용 목적",
      items: [
        "로그인과 본인 훈련 기록 보관",
        "AI가 사기범 역할을 맡는 모의 통화·문자 훈련 진행",
        "훈련 결과 리포트와 대처 조언 제공",
        "가족에게 훈련 링크 보내기와 결과 확인",
        "서비스 악용 방지와 오류 확인",
      ],
    },
    {
      heading: "3. 보유 기간과 파기",
      items: [
        // functions/src/guardrails/purge.ts — 세션 종료 시 해당 세션 Storage 경로 삭제
        "목소리 녹음 파일: 해당 훈련이 끝나면 바로 삭제합니다",
        `가족에게 보내기: 훈련 링크는 ${CHALLENGE_LINK_EXPIRY_DAYS}일 뒤 만료됩니다. 보낸 지 ${CHALLENGE_RETENTION_DAYS}일이 지나면 연결된 목소리 정보와 받는 분 정보 카드를 삭제합니다(하루 한 번 정리). 받는 분이 동의하면 그 시점에 보낸 쪽 기록의 받는 분 정보 카드를 지우되, 받는 분의 훈련 기록에는 사본이 남습니다`,
        // docs/Database.md — 세션 · 메시지 · 리포트 삭제 코드 없음
        "계정 정보, 훈련 기록, 리포트: 현재는 자동 삭제 기한을 두지 않고 보관합니다. 삭제를 원하시면 아래 문의처로 요청해 주세요",
        "파기할 때는 복구할 수 없는 방법으로 전자 기록을 삭제합니다",
      ],
      reviewNeeded: true,
    },
    {
      heading: "4. 처리 위탁과 국외 이전",
      paragraphs: [
        "서비스는 아래 외부 서비스를 이용합니다. 이 서비스들은 국외(주로 미국)에서 정보를 처리할 수 있습니다. 이전 국가·일시·방법 등 법정 고지 항목은 확정 후 보완합니다.",
      ],
      items: [
        // functions region 미지정 = us-central1
        "Google LLC (Firebase): 로그인, 데이터 저장, 파일 저장, 서버 기능 실행 — 서버 기능은 미국 리전에서 실행됩니다",
        "Google LLC (Gemini API): AI 대화 생성, 실시간 통화 음성 처리, 리포트 작성 — 통화 중 음성과 대화 내용, '내 정보' 카드가 전달됩니다",
        "Groq, Inc.: Gemini가 응답하지 않을 때 AI 대화 예비 처리",
        "ElevenLabs: 운영자가 설정한 경우 일부 실시간 통화 음성 처리",
      ],
      reviewNeeded: true,
    },
    {
      heading: "5. 이용자의 권리",
      paragraphs: [
        "이용자는 언제든 자신의 개인정보 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다. 현재 앱 안에는 탈퇴·기록 삭제 버튼이 없으므로 아래 문의처로 요청해 주시면 처리합니다.",
      ],
    },
    {
      heading: "6. 만 14세 미만",
      paragraphs: ["서비스는 만 14세 이상만 이용할 수 있습니다. 처음 이용할 때 만 14세 이상인지 확인합니다."],
    },
    {
      heading: "7. 자동 수집 장치",
      paragraphs: [
        "광고·방문 분석 도구를 쓰지 않습니다. 로그인 상태를 유지하기 위해 브라우저 저장소를 사용합니다. 서비스 제공 과정에서 Google(Firebase)이 접속 기록(IP 주소 등)을 처리할 수 있습니다.",
      ],
      reviewNeeded: true,
    },
    {
      heading: "8. 개인정보 보호책임자",
      items: [`책임자: ${OPERATOR_INFO.officer}`, `연락처: ${OPERATOR_INFO.email}`],
    },
    {
      heading: "9. 시행일",
      paragraphs: [`이 방침은 ${OPERATOR_INFO.effectiveDate}부터 적용합니다.`],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  title: "이용약관",
  intro: `이 약관은 ${OPERATOR_INFO.operator}(이하 "운영자")가 제공하는 금융사기 예방 훈련 서비스(이하 "서비스")의 이용 조건을 정합니다.`,
  sections: [
    {
      heading: "1. 서비스의 성격",
      items: [
        "서비스는 교육용 모의 훈련입니다. AI가 사기범 역할을 맡아 앱 화면 안에서만 전화와 문자를 재현합니다",
        "진짜 전화·문자가 걸려 오지 않으며, 실제 돈이나 금융 거래는 오가지 않습니다",
        "훈련에 나오는 기관명·화면은 교육을 위한 재현이며 해당 기관과 관계가 없습니다",
      ],
    },
    {
      heading: "2. 이용 자격과 계정",
      items: [
        "만 14세 이상만 이용할 수 있습니다",
        "본인 훈련은 Google 계정으로 로그인해 이용합니다. 가족이 보낸 링크는 로그인 없이 체험할 수 있습니다",
      ],
    },
    {
      heading: "3. 금지 행위",
      items: [
        "서비스 내용이나 AI 대화를 실제 사기·사칭에 이용하는 행위",
        "받는 분의 동의 없이, 또는 괴롭힐 목적으로 훈련 링크를 보내는 행위",
        "다른 사람의 정보를 허락 없이 '내 정보' 카드에 입력하는 행위",
        "서비스를 비정상적으로 호출하거나 보안 장치를 우회하는 행위",
      ],
    },
    {
      heading: "4. AI 생성 내용의 한계",
      paragraphs: [
        "훈련 대화와 리포트는 AI가 만든 내용이라 틀리거나 부정확할 수 있습니다. 실제 금융 판단의 근거로 쓰지 마시고, 실제 피해가 의심되면 경찰(112)이나 금융감독원(1332)에 바로 연락하세요.",
      ],
    },
    {
      heading: "5. 서비스 변경과 중단",
      paragraphs: ["운영자는 서비스 내용을 바꾸거나 중단할 수 있으며, 중요한 변경은 서비스 화면으로 알립니다."],
      reviewNeeded: true,
    },
    {
      heading: "6. 책임의 제한",
      paragraphs: [
        "운영자는 관련 법령이 허용하는 범위에서, 무료로 제공하는 교육용 서비스의 이용으로 생긴 손해에 대해 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.",
      ],
      reviewNeeded: true,
    },
    {
      heading: "7. 문의와 시행일",
      items: [`문의: ${OPERATOR_INFO.email}`, `시행일: ${OPERATOR_INFO.effectiveDate}`],
    },
  ],
};

export const CONTACT_INFO: LegalDocument = {
  title: "문의",
  intro: "서비스 이용, 개인정보 삭제 요청, 오류 신고는 아래로 연락해 주세요.",
  sections: [
    {
      heading: "운영자 연락처",
      items: [`운영자: ${OPERATOR_INFO.operator}`, `이메일: ${OPERATOR_INFO.email}`],
    },
    {
      heading: "실제 사기 피해가 의심될 때",
      paragraphs: ["이 서비스는 훈련용입니다. 실제 피해가 의심되면 아래로 바로 연락하세요."],
      items: ["경찰: 112", "금융감독원: 1332"],
    },
  ],
};
