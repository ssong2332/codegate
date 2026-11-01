// §142(카드사 고급 재구성 · Architecture.md §142.4) — 앱 안 다이얼 화면의 **번호부**(서버 카탈로그가 원천).
// 참가자가 건 번호가 어느 레그로 이어지는지 · 진짜 기관 자동 안내(D3)인지를 이 표 하나로 판정한다.
//
// ⛔ 실제 전화망 0(AC-019) — 이 번호들은 앱 안 화면에서만 쓰인다(`tel:` · 외부 이동 0).
// ⛔ 실제 번호 0 — 국번이 0으로 시작하는 가상 관례(`inCallSms.ts` `SMS_SENDER_NUMBER`와 같은 꼴 · 서로 다른 값).
// ⛔ 이 파일은 `verifyIntercept.ts` 카탈로그(전화번호 필드 0 · G86-a)와 별개다 — T110(호 전환)의 결정은 그 카탈로그에 그대로 남는다.
import { CARD_REBUILD_NAMES } from "./fictionalNames";

export type DialEntry = {
  /** 번호 id(변형 레그 `dialTarget`이 참조). */
  numberId: string;
  /** 화면에 보이는 번호(가상). */
  number: string;
  /** 연락처에 저장된 이름 — 부재 = 연락처에 없는 번호(문자로만 받은 번호). */
  contactLabel?: string;
  /** 진짜 기관 자동 안내(D3) — 이 번호로 걸었는데 사기범 레그로 이어지지 않을 때 화면에 띄우는 문구. 부재 = 안내 없음. */
  genuineNotice?: readonly string[];
};

const CARD = CARD_REBUILD_NAMES.cardCompany;
const SUPERVISOR = CARD_REBUILD_NAMES.supervisor;

/** 배송원이 문자로 보낸 가짜 카드사 대표번호(연락처에 없다). */
export const CARD_FAKE_CALLBACK_NUMBER_ID = "card-fake-callback";
/** 연락처에 저장된 진짜 카드사 고객센터. */
export const CARD_GENUINE_CENTER_NUMBER_ID = "card-genuine-center";
/** 연락처에 저장된 감독기관 공식 대표번호(악성 앱이 있으면 가로채진다). */
export const SUPERVISOR_OFFICIAL_NUMBER_ID = "supervisor-official";

export const DIAL_DIRECTORY: Readonly<Record<string, readonly DialEntry[]>> = {
  "card-company-impersonation": [
    { numberId: CARD_FAKE_CALLBACK_NUMBER_ID, number: "02-0762-5513" },
    {
      numberId: CARD_GENUINE_CENTER_NUMBER_ID,
      number: "02-0715-8800",
      contactLabel: `${CARD} 고객센터`,
      genuineNotice: [
        `${CARD} 고객센터 자동 안내입니다.`,
        "고객님 명의로 새로 발급되거나 배송 중인 카드는 없습니다.",
        "카드 배송 · 반송을 이유로 다른 번호로 전화하게 하거나 앱 설치를 요구하면 사기입니다.",
      ],
    },
    {
      numberId: SUPERVISOR_OFFICIAL_NUMBER_ID,
      number: "02-0700-3324",
      contactLabel: `${SUPERVISOR} 대표번호`,
      genuineNotice: [
        `${SUPERVISOR} 대표번호 자동 안내입니다.`,
        "저희는 전화로 개인에게 이체 · 앱 설치 · 안전계좌를 요구하지 않습니다.",
        "이런 요구를 받으셨다면 통화를 끊고 가족 등 다른 사람의 전화로 함께 확인하세요.",
      ],
    },
  ],
};

export function findDialEntry(scenarioId: string, numberId: string): DialEntry | undefined {
  return (DIAL_DIRECTORY[scenarioId] ?? []).find((entry) => entry.numberId === numberId);
}

/** 숫자만 남긴 비교 키(하이픈 · 공백 무시). */
export function normalizeDialedNumber(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** 참가자가 건 번호 → 번호부 항목(없으면 undefined = "없는 번호"). */
export function lookupDialedNumber(scenarioId: string, dialed: string): DialEntry | undefined {
  const key = normalizeDialedNumber(dialed);
  if (key.length === 0) return undefined;
  return (DIAL_DIRECTORY[scenarioId] ?? []).find((entry) => normalizeDialedNumber(entry.number) === key);
}
