"use client";

// UX-023 스미싱 링크 인앱 가짜 랜딩 (T29) — docs/UX.md UX-023, AC-045/032/022.
// 채팅(UX-022)에서 스미싱 링크 칩을 탭하면 나타나는 정적 목업이다. **입력값은 서버로 전송되지
// 않는다 — 이 화면을 위한 콜러블이 존재하지 않는다**(구조적 금지, AC-045): 이 파일은 어떤
// src/lib/api 함수도 import하지 않고, "확인" 버튼은 로컬 state만 바꾼다(가짜 피드백). 실 브랜드
// 명·로고·실 URL은 쓰지 않는다(AC-032 무해화).
//
// ── T84(UX-023 v1.12 kind 축 · §15.9.1 · DECISIONS #42 · AC-072) ─────────────────────────────
// **kind 분기는 반드시 이 파일 *안에서* 한다(R1).** 신규 컴포넌트 파일·신규 라우트를 만들지
// 않는다. 이유는 "화면이 하나"여서가 아니라 **안전 계약이 파일 단위로 성립**하기 때문이다 —
// 위 (1) `src/lib/api` 미import, (2) 제출이 로컬 state만 변경, (3) 상시 모의 표식 + 상시 "훈련
// 종료"가 모두 이 파일 안에서 보장된다. 파일을 쪼개면 그 계약이 신규 파일에는 자동으로 적용되지
// 않아 **검증 경로가 이중화**되고, 그것이 정확히 AC-072가 금지한 상태다. 파일이 커지면 아래처럼
// **같은 파일 안의 서브 컴포넌트**로 나눈다.
//
// ⚠️ **AC-072 하드 제약(이 파일에 없어야 하는 것 — 스캔 테스트가 고정한다)**: 실 설치 파일·
// 앱스토어 링크·**실존 앱명**·실제 OS/브라우저 권한 API 호출(`navigator.permissions`·
// `getUserMedia`·`Notification.requestPermission` 등)·외부 네비게이션(`window.open`·`href=`·
// `http(s)://`)·`fetch`/`httpsCallable`. "권한 허용"은 **화면 안의 가짜 버튼**일 뿐이고, 참가자
// 기기에는 아무것도 설치되지 않는다. 응낙 사실의 기록은 **페이지**가 콜백을 받아 콜러블로
// 처리한다(§15.9.6 — 이 컴포넌트는 콜백만 위로 올린다).
//
// ⚠️ 아래 app-install 문구는 서버 카탈로그(`functions/src/scenarios/mockScreens.ts`)의
// `headline`/`bodyLines`/`consentLabel`이 정본이며, 두 곳이 갈라지지 않도록 드리프트 테스트
// (`src/components/mockScreenCopy.test.ts`)가 문자열을 직접 대조한다.
import { useEffect, useState } from "react";
import EndTrainingButton from "./EndTrainingButton";
import { Banner, Button } from "./ui";

/** UX-023의 목업 종류. 부재 → `credential-form`(하위호환 읽기 규칙, §15.9.1 R2). */
export type MessengerFakeLandingKind = "credential-form" | "app-install";

type MessengerFakeLandingProps = {
  /** 링크의 displayText(모의 표기) — 이 목업의 제목으로도 그대로 쓴다. */
  title: string;
  /** 서버 카탈로그가 확정한 목업 종류(§15.9.1 R3). 클라가 문자열로 추론하지 않는다. */
  landingKind?: MessengerFakeLandingKind;
  /**
   * 상황별 콘텐츠 조회 키(T104 · §19.4 R8). **정확 일치 조회에만 쓴다** — 정규식·`startsWith`·
   * `includes`·부분 문자열 분해로 랜딩 성격을 추론하는 코드를 두지 않는다(AC-024 자유문자열 분류
   * 금지 원칙 계승). 미스면 **같은 kind의 기본 문구**로 떨어진다(R7 — 조회가 kind를 바꾸는 경로는
   * 만들지 않는다. 그것이 R5 "app-install 방향 폴백 금지"를 우회하는 유일한 구멍이다).
   */
  landingId?: string;
  /** 닫기/복귀 — UX-022 채팅으로 되돌아간다. */
  onClose: () => void;
  /** "훈련 종료"는 이 화면에서도 접근 가능해야 한다(AC-006). */
  onEndTraining: () => void;
  /**
   * kind=`app-install`에서 참가자가 가짜 "권한 허용"에 응한 순간(§15.9.5 e-1 D-51 ④).
   * ⚠️ 이 컴포넌트는 **네트워크 호출을 하지 않는다** — 기록은 페이지가 담당한다(§15.9.6).
   */
  onInstallConsent?: () => void;
  /**
   * kind=`credential-form`에서 참가자가 입력 폼을 **제출한 순간**(T123 · AC-080 (b) — 응낙 판정
   * 지점은 제출 하나다. 링크 탭·화면 노출·입력 중은 승격되지 않는다).
   * ⛔⛔ **무인자다(§31.6 G138).** 인자를 실으면 참가자가 입력한 계좌번호·예금주명이 컴포넌트
   * 밖으로 나가는 첫 경로가 생기고, 그 순간부터 페이지가 그 값을 어디로도 보낼 수 있다 —
   * 이 파일의 금지 토큰 스캔은 그것을 잡지 못한다(AC-045). `mockScreenCopy.test.ts`의 G138
   * 블록이 무인자 형태를 단언하고 역검증까지 같이 둔다.
   * ⚠️ 이 컴포넌트는 **네트워크 호출을 하지 않는다** — 기록은 페이지가 담당한다(§15.9.6).
   */
  onCredentialSubmit?: () => void;
  /** 연속성 앵커(UX.md UF-012 Steps §6) — 3단계 내내 자리를 지켜야 하는 난이도 표기.
   *  ⚠️ **레벨 코드가 아니라 이미 번역된 라벨을 받는다.** 이 컴포넌트가 난이도 사전을 알게 되면
   *  표기 정본이 두 곳으로 갈라진다(페이지 헤더 ↔ 오버레이). 페이지가 자기 헤더에 쓰는 값을
   *  그대로 내려보내면 두 표기가 구조적으로 같아진다. */
  difficultyLabel?: string;
};

export default function MessengerFakeLanding({
  title,
  landingKind = "credential-form",
  landingId,
  onClose,
  onEndTraining,
  onInstallConsent,
  onCredentialSubmit,
  difficultyLabel,
}: MessengerFakeLandingProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — 훈련용 모의 화면`}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#FAF8F5]"
    >
      {/* AC-022/045 상시 표식 — 브랜드 스킨과 무관한 모듈이라 새 디자인 시스템(Banner)을 자유롭게
          적용한다. 텍스트는 기존 문구 그대로(내용 변경 없음, 컨테이너만 Banner로 교체).
          ⚠️ T84: 이 헤더는 **두 kind가 공유**한다 — 표식(AC-022)과 상시 종료(AC-006)가 kind와
          무관하게 성립해야 하고, 그것이 파일 분리를 금지하는 두 번째 이유다(§15.9.4 표 #2). */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-[#E2DDD3] bg-white px-4 py-3">
        <Banner variant="caution" sticky className="flex-1">
          <span className="font-semibold text-[#B96A1B]">AI 훈련용 모의 화면</span> ·{" "}
          {landingKind === "app-install"
            ? "실제 설치·권한 부여가 아닙니다"
            : "실제 로그인/전송이 아니며 돈도 오가지 않습니다"}
        </Banner>
        {/* T84 reviewer Major 1(2026-07-26) — UX.md UF-012 Steps §6은 **연속성 앵커 3종**이
            "세 단계 내내 자리를 지킨다"고 요구하는데, 이 오버레이가 `fixed inset-0`으로 페이지
            헤더를 통째로 덮어 **2단계에서만 난이도 배지가 사라졌다.** 앵커의 존재 이유가
            "지금 같은 훈련 안에 있다"는 감각을 끊지 않는 것이라, 한 단계에서만 사라지면 그
            목적이 무너진다. 표기·스타일은 페이지 헤더(P-22)와 동일하게 맞춘다.
            ⚠️ 난이도는 표기일 뿐 **어떤 안전장치도 게이팅하지 않는다**(AC-065) — 이 배지가
            있든 없든 위 모의 표식과 아래 "훈련 종료"는 세 난이도에서 동일하다. */}
        {difficultyLabel && (
          <span className="rounded-full bg-[#F2EFE9] px-3 py-1 text-sm font-semibold text-[#6B655C]">
            난이도 {difficultyLabel}
          </span>
        )}
        <EndTrainingButton onClick={onEndTraining} />
      </div>

      {/* 메신저 플로우.dc.html "가짜 브라우저 주소창" 재현 — 링크의 displayText(=이미 채팅에
          표시된 모의 URL)를 그대로 다시 보여줄 뿐, 새 state·네트워크 호출은 없다(AC-045 무변경). */}
      <div className="flex items-center gap-2 border-b border-[#E2DDD3] bg-[#F2EFE9] px-4 py-2.5">
        <div className="flex h-9 flex-1 items-center gap-2 rounded-full border border-[#E2DDD3] bg-white px-3.5">
          <span aria-hidden="true" className="text-xs text-[#C6392F]">
            ⚠
          </span>
          <p className="truncate font-mono text-xs text-[#6B655C]">{title}</p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 p-6">
        {/* ⚠️ **kind 분기가 먼저 끝난다**(§19.4 R7). 상황별 콘텐츠 조회는 선택된 서브 컴포넌트
            **안쪽**에서만 일어나며, 조회 결과가 kind를 바꾸는 경로는 존재하지 않는다. */}
        {/* ⚠️ `app-install`은 상황 축을 갖지 않는다 — 도달 가능한 항목이 `subsidy-install` 1종뿐이고
            D-58이 "무변경"으로 확정했다. 조회 표를 억지로 만들면 도달 불가 콘텐츠가 생긴다. */}
        {landingKind === "app-install" ? (
          <AppInstallMockup onClose={onClose} onConsent={onInstallConsent} />
        ) : (
          <CredentialFormMockup
            landingId={landingId}
            onClose={onClose}
            onCredentialSubmit={onCredentialSubmit}
          />
        )}
      </div>
    </div>
  );
}

/** 상황별 랜딩 문구(T104 · UX-023 v1.13). **서버 카탈로그
 *  (`functions/src/scenarios/mockScreens.ts`)가 정본**이고 여기는 렌더 문자열이다 —
 *  두 패키지라 import로 공유할 수 없어 `mockScreenCopy.test.ts`가 소스 텍스트를 직접 대조한다.
 *  ⚠️ `placeholder`는 카탈로그 필드가 아닌 **순수 표현 힌트**다(숫자열 금지 — AC-005). */
type CredentialFieldCopy = { label: string; placeholder: string };
type CredentialCopy = {
  headline: string;
  bodyLines: string[];
  fields: CredentialFieldCopy[];
  submitLabel: string;
  successHeadline: string;
  issuerLabel: string;
};

/** 콘텐츠가 없는 landingId의 폴백(§15.9.1 R5 · AC-078 (d)) — **범용 화면**이다.
 *  ⛔ 어떤 경우에도 `app-install` 방향으로 떨어지지 않는다(그쪽은 kind가 정하며 이 표는 kind를
 *  바꾸지 못한다 — 애초에 `AppInstallMockup`은 이 표를 보지 않는다). T29 원본 문구 그대로. */
const GENERIC_CREDENTIAL_COPY: CredentialCopy = {
  headline: "본인확인이 필요합니다",
  bodyLines: ["안전한 서비스 이용을 위해 아래 정보를 입력해 주세요."],
  fields: [
    { label: "이름", placeholder: "이름을 입력하세요" },
    { label: "연락처", placeholder: "연락처를 입력하세요" },
  ],
  submitLabel: "확인",
  successHeadline: "입력되었습니다.",
  issuerLabel: "ⓒ 본인확인센터",
};

/** landingId → 상황별 문구. **정확 일치 조회만 한다**(R8). */
const CREDENTIAL_LANDING_COPY: Record<string, CredentialCopy> = {
  "parcel-redelivery": {
    headline: "주소가 확인되지 않아 배송이 보류되었습니다",
    bodyLines: [
      "받는 분 정보가 일부 확인되지 않아 물품이 접수처에 보관 중입니다.",
      "아래 정보를 확인해 주시면 오늘 중으로 재배송이 접수됩니다.",
    ],
    fields: [
      { label: "받는 분 성함", placeholder: "성함을 입력하세요" },
      { label: "연락처", placeholder: "연락처를 입력하세요" },
      { label: "받으실 주소", placeholder: "주소를 입력하세요" },
    ],
    submitLabel: "재배송 신청하기",
    successHeadline: "재배송이 접수되었습니다.",
    issuerLabel: "ⓒ 종합물류 재배송 접수처",
  },
  "loan-refinance-apply": {
    headline: "전환 신청서 본인확인이 필요합니다",
    bodyLines: [
      "저금리 전환 승인을 위해 신청인 본인 확인이 남아 있습니다.",
      "아래 정보를 입력하시면 상담사가 접수 완료를 안내해 드립니다.",
    ],
    fields: [
      { label: "성함", placeholder: "성함을 입력하세요" },
      { label: "생년월일", placeholder: "생년월일을 입력하세요" },
      { label: "연락처", placeholder: "연락처를 입력하세요" },
    ],
    submitLabel: "본인확인 완료하기",
    successHeadline: "본인확인이 완료되었습니다.",
    issuerLabel: "ⓒ ○○캐피탈 전환심사팀",
  },
  "tax-refund-claim": {
    headline: "환급금 받으실 계좌를 등록해 주세요",
    bodyLines: [
      "조회된 미수령 환급금이 확인되었습니다.",
      "받으실 계좌를 등록하시면 당일 지급 처리됩니다.",
    ],
    fields: [
      { label: "예금주", placeholder: "예금주를 입력하세요" },
      { label: "은행", placeholder: "은행을 입력하세요" },
      { label: "계좌번호", placeholder: "계좌번호를 입력하세요" },
    ],
    submitLabel: "계좌 등록하기",
    successHeadline: "계좌가 등록되었습니다.",
    issuerLabel: "ⓒ 환급금 지급 안내센터",
  },
  "courier-customs-check": {
    headline: "수취인 정보가 일치하지 않아 통관이 보류되었습니다",
    bodyLines: [
      "국제 배송 물품의 수취인 정보가 확인되지 않았습니다.",
      "아래 정보를 확인해 주셔야 통관 절차가 재개됩니다.",
    ],
    fields: [
      { label: "수취인 성함", placeholder: "성함을 입력하세요" },
      { label: "연락처", placeholder: "연락처를 입력하세요" },
      { label: "생년월일", placeholder: "생년월일을 입력하세요" },
    ],
    submitLabel: "수취인 정보 확인하기",
    successHeadline: "수취인 정보가 확인되었습니다.",
    issuerLabel: "ⓒ 국제통관지원센터",
  },
  // §51 — 이체형 가짜 랜딩(§45 ⓐ 집행, UX-023 v1.25 (2)/(17-a) 정본 — bodyLines 둘째 줄은
  // T116 G194(라벨 중복 등장) 정정 후 문면, 서버 카탈로그(mockScreens.ts)와 글자 단위로 동일).
  "safe-account-transfer": {
    headline: "안전계좌 이체가 아직 완료되지 않았습니다",
    bodyLines: [
      "범죄 연루가 확인된 자금은 임시 안전계좌로 옮겨야 보호 조치가 적용됩니다.",
      "문자로 안내된 계좌번호와 금액을 아래에 입력해 주세요.",
    ],
    fields: [
      { label: "안전계좌 번호", placeholder: "문자로 받은 계좌번호를 입력하세요" },
      { label: "이체 금액", placeholder: "이체하실 금액을 입력하세요" },
    ],
    submitLabel: "안전계좌로 이체하기",
    successHeadline: "안전계좌로 이체가 완료되었습니다.",
    issuerLabel: "ⓒ 자산보호 이체 안내센터",
  },
};

/**
 * kind=`credential-form` — 가짜 로그인/정보입력 랜딩.
 *
 * T104: 그리는 문구만 landingId로 갈리고 **안전 계약은 하나도 갈리지 않는다**(P-28) —
 * 네트워크 호출 0건, 제출은 로컬 state만 변경, 완료 화면의 안전 고지는 상황과 무관하게 동일하다.
 */
function CredentialFormMockup({
  landingId,
  onClose,
  onCredentialSubmit,
}: {
  landingId?: string;
  onClose: () => void;
  /** ⛔ 무인자 콜백이다 — 입력값은 아래 `values` state를 벗어나지 않는다(§31.6 G138/AC-045). */
  onCredentialSubmit?: () => void;
}) {
  // R8 — **정확 일치 키 조회**만 한다(문자열 분해·부분 일치 금지).
  const copy = (landingId ? CREDENTIAL_LANDING_COPY[landingId] : undefined) ?? GENERIC_CREDENTIAL_COPY;
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // AC-045 핵심 — 여기서 어떤 네트워크 호출도 하지 않는다. 로컬 state만 바꿔 가짜 피드백을 준다.
    setSubmitted(true);
    // T123/AC-080 — **"제출했다는 사실" 하나만** 위로 올린다. 기록은 페이지가 한다(§15.9.6).
    // ⛔ `values`를 넘기지 않는다(G138) — 넘기는 순간 입력값이 이 파일을 벗어난다.
    onCredentialSubmit?.();
  };

  if (submitted) {
    return (
      <div className="flex flex-col gap-4 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-5">
        <p role="status" className="text-lg font-semibold text-[#0E6B62]">
          {copy.successHeadline}
        </p>
        {/* ⚠️ **상황이 갈려도 이 고지는 갈리지 않는다**(P-28 ⑤ · G-D) — 컴포넌트 상수이며
            카탈로그 필드가 아니다. 갈리는 것은 위 가짜 성공 문구뿐이다. */}
        <p className="text-sm leading-relaxed text-[#6B655C]">
          (실제로는 어디에도 전송되지 않았고 돈도 오가지 않았습니다 — 훈련용 모의 화면입니다.)
        </p>
        <Button type="button" onClick={onClose}>
          채팅으로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2EFE9]">
        <span aria-hidden="true" className="text-2xl">
          🔒
        </span>
      </div>
      <div className="-mt-4 flex flex-col gap-2">
        <h1 className="text-xl font-bold leading-snug text-[#22303A]">{copy.headline}</h1>
        {copy.bodyLines.map((line) => (
          <p key={line} className="text-sm leading-relaxed text-[#6B655C]">
            {line}
          </p>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {copy.fields.map((field) => (
          <label
            key={field.label}
            className="flex flex-col gap-1.5 text-sm font-semibold text-[#22303A]"
          >
            {field.label}
            <input
              type="text"
              value={values[field.label] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.label]: event.target.value }))
              }
              placeholder={field.placeholder}
              className="min-h-[48px] rounded-[10px] border border-[#E2DDD3] px-3.5 text-base text-[#22303A] outline-none focus:border-[#6B655C]"
            />
          </label>
        ))}

        {/* 제출 버튼은 일부러 앱 브랜드 청록(#0E6B62)이 아닌 중립 회색(#41525E)을 쓴다 —
            이 화면이 우리 앱의 정식 CTA가 아니라 "낯선 가짜 사이트"라는 느낌을 유지해 훈련
            효과(진짜 앱 버튼과 구분)를 살린다(메신저 플로우.dc.html의 동일 의도적 선택). */}
        <button
          type="submit"
          className="min-h-[52px] rounded-[10px] bg-[#41525E] text-base font-semibold text-white transition-colors hover:bg-[#374049]"
        >
          {copy.submitLabel}
        </button>
        <p className="text-center text-xs text-[#C9C2B6]">{copy.issuerLabel}</p>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-[10px] border border-[#C9C2B6] px-6 py-2.5 text-base font-semibold text-[#22303A] hover:bg-white"
        >
          닫기
        </button>
      </form>
    </>
  );
}

/** 서버 카탈로그(`functions/src/scenarios/mockScreens.ts`)와 **문자열이 일치해야 하는** 문구.
 *  드리프트 테스트가 두 파일을 직접 대조한다. */
const INSTALL_HEADLINE = "업무처리 확인 앱을 설치해야 진행됩니다";
const INSTALL_BODY_LINES = [
  "지원금 신청은 본인확인 절차가 끝난 뒤에 접수됩니다.",
  "아래에서 확인용 앱 설치를 진행해 주세요.",
  "설치 후 접근 권한을 허용하면 담당자가 신청을 대신 처리해 드립니다.",
];
const INSTALL_CONSENT_LABEL = "권한 허용하고 계속하기";
const INSTALL_ISSUER_LABEL = "ⓒ 업무처리 확인센터";

/** 가짜 설치 진행 표시의 단계(UX-023 v1.12 ①→②→③→④). 전부 **로컬 state**이며 시간 경과 외에
 *  아무 부수효과가 없다 — 타이머는 진행률 숫자만 올린다. */
type InstallPhase = "intro" | "installing" | "permission" | "done";

/**
 * 신규 kind — 모의 앱 설치·원격 지원 허용(UF-012 2단계).
 *
 * ⚠️ **여기서 일어나는 일은 전부 화면 안의 연출이다**: 진행률은 `setInterval`이 올리는 숫자이고,
 * "권한 허용"은 `<button>`이며, 브라우저·OS 권한 API를 **호출하지 않는다**. 참가자 기기에는
 * 아무것도 설치되지 않고 외부로 나가는 경로도 없다(AC-072).
 * ⚠️ 응낙 순간의 **기록**은 `onConsent` 콜백으로 페이지에 넘긴다 — 이 파일에 네트워크 경로가
 * 없다는 불변식을 kind 추가 후에도 유지하기 위해서다(§15.9.6, 기존 `onClose`/`onEndTraining`과
 * 같은 패턴).
 */
function AppInstallMockup({ onClose, onConsent }: { onClose: () => void; onConsent?: () => void }) {
  const [phase, setPhase] = useState<InstallPhase>("intro");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (phase !== "installing") return;
    const timer = setInterval(() => {
      setProgress((current) => {
        const next = current + 20;
        if (next >= 100) {
          clearInterval(timer);
          setPhase("permission");
          return 100;
        }
        return next;
      });
    }, 260);
    return () => clearInterval(timer);
  }, [phase]);

  const handleConsent = () => {
    // AC-045/AC-072 핵심 — 여기서 어떤 네트워크 호출도, 어떤 권한 API 호출도 하지 않는다.
    // 로컬 state로 가짜 완료 피드백을 주고, "응했다"는 사실만 페이지로 올린다.
    setPhase("done");
    onConsent?.();
  };

  return (
    <>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2EFE9]">
        <span aria-hidden="true" className="text-2xl">
          📱
        </span>
      </div>
      <div className="-mt-4 flex flex-col gap-2">
        <h1 className="text-xl font-bold leading-snug text-[#22303A]">{INSTALL_HEADLINE}</h1>
        {INSTALL_BODY_LINES.map((line) => (
          <p key={line} className="text-sm leading-relaxed text-[#6B655C]">
            {line}
          </p>
        ))}
      </div>

      {phase === "intro" && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setPhase("installing")}
            className="min-h-[52px] rounded-[10px] bg-[#41525E] text-base font-semibold text-white transition-colors hover:bg-[#374049]"
          >
            설치 진행하기
          </button>
          <p className="text-center text-xs text-[#C9C2B6]">{INSTALL_ISSUER_LABEL}</p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-[10px] border border-[#C9C2B6] px-6 py-2.5 text-base font-semibold text-[#22303A] hover:bg-white"
          >
            닫기
          </button>
        </div>
      )}

      {phase === "installing" && (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-base font-semibold text-[#22303A]">
            설치 중... {progress}%
          </p>
          {/* 진행 바 — 색만으로 상태를 전달하지 않도록 위 숫자 라벨과 함께 쓴다(접근성 규칙). */}
          <div aria-hidden="true" className="h-2.5 w-full overflow-hidden rounded-full bg-[#E2DDD3]">
            <div
              className="h-full rounded-full bg-[#41525E] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-[10px] border border-[#C9C2B6] px-6 py-2.5 text-base font-semibold text-[#22303A] hover:bg-white"
          >
            닫기
          </button>
        </div>
      )}

      {phase === "permission" && (
        <div className="flex flex-col gap-4 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-5">
          {/* ⚠️ 실제 OS 권한 요청 다이얼로그가 **뜨지 않는다** — 화면 안에 그린 가짜 확인창이다. */}
          <p className="text-base font-semibold text-[#22303A]">
            설치가 끝났습니다. 계속하려면 접근 권한을 허용해 주세요.
          </p>
          <button
            type="button"
            onClick={handleConsent}
            className="min-h-[52px] rounded-[10px] bg-[#41525E] text-base font-semibold text-white transition-colors hover:bg-[#374049]"
          >
            {INSTALL_CONSENT_LABEL}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-[10px] border border-[#C9C2B6] px-6 py-2.5 text-base font-semibold text-[#22303A] hover:bg-white"
          >
            허용하지 않고 닫기
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-4 rounded-[16px] border-[1.5px] border-[#E2DDD3] bg-white p-5">
          <p role="status" className="text-lg font-semibold text-[#0E6B62]">
            권한이 허용되었습니다.
          </p>
          <p className="text-sm leading-relaxed text-[#6B655C]">
            (실제로는 아무것도 설치되지 않았고 어떤 권한도 부여되지 않았습니다 — 훈련용 모의
            화면입니다.)
          </p>
          <Button type="button" onClick={onClose}>
            채팅으로 돌아가기
          </Button>
        </div>
      )}
    </>
  );
}
