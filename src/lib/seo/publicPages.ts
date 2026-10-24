// §133(DECISIONS #249) — 공개 페이지 검색 정보(제목 · 설명) · robots.txt · sitemap 경로의 단일 출처.
//
// ⛔ 앱 화면(로그인 뒤 훈련 · 리포트 · 기록)은 여기서 다루지 않는다 — 제목은 루트 레이아웃 기본값 그대로다.
// ⛔ 비로그인으로 열리는 경로는 `RouteGuard`의 PUBLIC_PATHS다. 경로를 늘리면 그쪽과 이 파일을 함께 고친다
//    (`publicPages.test.ts`가 앱 라우트 전체를 공개 · 차단 둘 중 하나로 분류했는지 대조한다).
//
// 순수 모듈이다(React · Firebase import 0건) — 루트 테스트 러너가 그대로 읽는다.

/** 라이브 도메인 — `src/app/layout.tsx`의 SITE_URL과 같아야 한다(테스트가 대조). */
export const SITE_URL = "https://voicefishing-ff47f.web.app";

export const SITE_NAME = "금융사기 예방 훈련";

export type PageMeta = { title: string; description: string };

/**
 * 공개 페이지별 제목 · 설명. "/"는 루트 레이아웃(`layout.tsx`)의 기본값이 곧 첫 화면 값이라 여기 두지 않는다
 * (Next의 "/" 세그먼트에는 루트 레이아웃과 페이지만 있고, 페이지는 클라이언트 컴포넌트라 metadata를 내보낼 수 없다).
 */
export const PUBLIC_PAGE_META = {
  "/login": {
    title: `로그인 — ${SITE_NAME}`,
    description: "Google 계정으로 로그인하면 AI 사기범의 전화 · 문자 훈련을 시작하고 결과 리포트를 모아 볼 수 있습니다.",
  },
  "/challenge/join": {
    title: `가족이 보낸 사기 예방 훈련 — ${SITE_NAME}`,
    description: "가족이 보낸 훈련 링크입니다. 로그인 없이 앱 화면 안에서 사기 전화 · 문자를 받아 보고 대처법을 확인합니다.",
  },
  "/faq": {
    title: `자주 묻는 질문 — ${SITE_NAME}`,
    description: "진짜 전화가 오는지, 돈이 나가는지, 녹음과 사진은 어디로 가는지, 가족에게 어떻게 보내는지 답합니다.",
  },
  "/privacy": {
    title: `개인정보처리방침 — ${SITE_NAME}`,
    description: "금융사기 예방 훈련 서비스가 처리하는 개인정보 항목, 보유 기간, 위탁처를 안내합니다.",
  },
  "/terms": {
    title: `이용약관 — ${SITE_NAME}`,
    description: "금융사기 예방 훈련 서비스의 성격, 이용 자격, 금지 행위를 안내합니다.",
  },
  "/contact": {
    title: `문의 — ${SITE_NAME}`,
    description: "서비스 이용, 개인정보 삭제 요청, 오류 신고 연락처와 실제 피해가 의심될 때 연락할 곳을 안내합니다.",
  },
} as const satisfies Record<string, PageMeta>;

/** 404 화면 탭 제목. */
export const NOT_FOUND_TITLE = `페이지를 찾을 수 없습니다 — ${SITE_NAME}`;

/** sitemap에 싣는 경로. 법적 고지는 noindex(LEGAL_ROBOTS)가 풀릴 때 함께 싣는다 — `sitemap.ts`. 가족 링크(/challenge/join)는 토큰이 있어야 뜻이 있어 싣지 않는다. */
export const SITEMAP_PATHS = ["/", "/faq"] as const;

/**
 * robots.txt Disallow — 로그인 뒤 앱 화면(경로 앞부분 일치). 공개 경로(PUBLIC_PATHS)는 여기 넣지 않는다.
 * ⚠️ /challenge/join은 막지 않는다 — 카카오톡 등 미리보기 수집기가 robots.txt를 따르면 가족 링크 미리보기가 사라질 수 있다.
 */
export const DISALLOW_PREFIXES = [
  "/session",
  "/report",
  "/scenarios",
  "/history",
  "/grade",
  "/onboarding",
  "/clone",
  "/challenge/create",
  "/challenge/results",
] as const;

/** 앱 라우트(page.tsx가 있는 경로) 전체 — 없는 주소를 404로 보이게 하는 판정(`isKnownAppPath`)에 쓴다. 테스트가 파일 목록과 대조한다. */
export const APP_ROUTE_PATHS = [
  "/",
  "/login",
  "/grade",
  "/history",
  "/challenge/create",
  "/challenge/join",
  "/challenge/results",
  "/clone/wait",
  "/contact",
  "/faq",
  "/onboarding/age-gate",
  "/onboarding/consent",
  "/onboarding/record",
  "/privacy",
  "/report",
  "/report/archive",
  "/report/replay",
  "/report/rewind",
  "/scenarios",
  "/scenarios/difficulty",
  "/scenarios/experience-select",
  "/scenarios/messenger",
  "/scenarios/messenger/voice-select",
  "/scenarios/voice",
  "/scenarios/voice/clone",
  "/scenarios/voice/generic",
  "/session/chat",
  "/session/end",
  "/session/messenger",
  "/session/play",
  "/terms",
] as const;

/** 있는 앱 라우트인가 — 아니면 404 화면이 떠야 하므로 RouteGuard가 로그인으로 보내지 않는다. 끝 빗금은 무시한다. */
export function isKnownAppPath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (APP_ROUTE_PATHS as readonly string[]).includes(normalized);
}
