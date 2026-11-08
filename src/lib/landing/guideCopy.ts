// ⭐ 2026-11-08 웹 안의 웹 PR-4(안내형 — 시안 A · B · C · H) — 안내 화면에 새로 들어가는 문구. 값만 둔다(그리는 것은 `MessengerFakeLanding.tsx`).
// ⛔ 규칙(PR-2 · PR-3과 같다): 세션 표식 낱말(G437) 0 · 실존 기관 · 회사 · 앱 이름 0 · 8자리 이상 이어진 숫자 0 · 서비스 밖 행동 안내 0.
// ⛔ 이 파일은 잎 모듈이다(import 0) — 렌더 하네스가 상대 경로로 읽는다(§15.9.1 R1).
// 키 = 서버 카탈로그 landingId(정확 일치 조회 — R8). 표에 없는 id = 그 장식을 그리지 않는다(종전 화면 그대로).

/** G1 — 기관 안내 머리(맨 위 짙은 띠 문구 · 기관명 아래 작은 줄 · 단계 칸). 단계 칸은 사건 기록 열람만(본인 확인 → 열람본). */
export type AgencySiteCopy = { band: string; sub: string; steps?: [string, string] };

export const AGENCY_SITE_COPY: Readonly<Record<string, AgencySiteCopy>> = {
  "case-record-view": { band: "사건 기록 열람 서비스", sub: "사건 기록 열람 · 본인 확인", steps: ["1 본인 확인", "2 사건 기록 열람"] },
  "asset-check-site": { band: "사건 자산 검수 서비스", sub: "자산 검수 · 본인 확인" },
  "asset-check-wallet": { band: "사건 자산 검수 서비스", sub: "검수 전용 보관 지갑 전송" },
  "asset-custody-apply": { band: "자산 보관 신청 서비스", sub: "보호 조치 · 보관 신청" },
};

/** G5 — 기관형 이체(D2) 7종 공통 머리 띠 · 작은 줄(이름 · 엠블럼 · 꼬리말 주소만 계열 값으로 다르다 — 시안 D2 메모). */
export const AGENCY_TRANSFER_SITE_COPY: AgencySiteCopy = { band: "보호 조치 이체 안내", sub: "지정 계좌 이체" };

/** G5 — 송금 요청(D1) 페이지 로고 글자(사용자 확정 요소). */
export const SEND_SITE_LOGO = "간편 송금";

/** G2 — 환급 조회 결과 카드(시안 B · 사용자 결정 O3 "금액 = 넣기"). */
export type RefundSiteCopy = { label: string; amount: string; rows: [string, string][]; tag: string };

export const REFUND_SITE_COPY: Readonly<Record<string, RefundSiteCopy>> = {
  "tax-refund-claim": {
    label: "조회된 미수령 환급금",
    amount: "287,400원",
    rows: [
      ["환급 구분", "과오납 환급"],
      ["지급 방식", "계좌 입금"],
    ],
    tag: "당일 지급",
  },
};

/** G3 — 택배 · 통관 운송장 띠 · 보류 배지 · 단계 타임라인(시안 C — 운송장 띠는 사용자 확정 요소 · 숫자는 4자리 묶음 임의 값). */
export type ParcelStep = { label: string; sub: string; state: "done" | "hold" };
export type ParcelSiteCopy = { invoiceLabel: string; invoice: string; status: string; steps: ParcelStep[] };

export const PARCEL_SITE_COPY: Readonly<Record<string, ParcelSiteCopy>> = {
  "parcel-redelivery": {
    invoiceLabel: "운송장 번호",
    invoice: "5207-3318-6042",
    status: "배송 보류",
    steps: [
      { label: "집하 완료", sub: "누리달 집배센터", state: "done" },
      { label: "간선 이동", sub: "누리달 허브", state: "done" },
      { label: "배송 보류", sub: "받는 분 정보 확인 필요", state: "hold" },
    ],
  },
  "courier-customs-check": {
    invoiceLabel: "운송장 번호",
    invoice: "5207-3318-6042",
    status: "통관 보류",
    steps: [
      { label: "해외 출발", sub: "해외 물류센터", state: "done" },
      { label: "국내 도착", sub: "누리달 국제물류센터", state: "done" },
      { label: "통관 보류", sub: "수취인 정보 확인 필요", state: "hold" },
    ],
  },
};

/** G6 — 설치 화면 앱 이름(각 화면 헤드라인에 이미 있는 이름 그대로). */
export const INSTALL_APP_NAMES: Readonly<Record<string, string>> = {
  "subsidy-install": "업무처리 확인 앱",
  "parcel-install": "배송 확인 앱",
  "child-insurance-install": "휴대폰 보험 접수 앱",
  "card-guard-app-install": "피해 차단용 보안 앱",
  "card-remote-support-install": "원격 지원 도우미",
  "loan-check-app-install": "심사용 보안 점검 앱",
  "card-delivery-app-install": "보안 점검 앱",
};

/** G6 — 요청하는 권한 목록(사용자 확정 요소 · 그림일 뿐 — 실제 권한 API 호출 0 · AC-072). */
export const INSTALL_PERMISSION_HEADING = "요청하는 권한";
export const INSTALL_PERMISSIONS: readonly { icon: "message" | "accept-call" | "screen-share"; label: string }[] = [
  { icon: "message", label: "문자 읽기" },
  { icon: "accept-call", label: "전화 걸기 · 받기" },
  { icon: "screen-share", label: "화면 보기" },
];
