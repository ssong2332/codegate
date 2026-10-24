# §133 사이트 기본 요소 점검 (2026-10-24)

## 금지 · 범위
- 점검만 했다. 코드·설정 변경 0건(이 문서 1개만 추가).
- `.env` 열람 0건 · 비밀 값 출력 0건 · 병합·배포·푸시 0건.
- 대상: 소스 = main `6d6ffa2`(`src/app/**` · `src/components/**` · `src/lib/legal/**` · `public/` · `next.config.ts` · `firebase.json`) · 라이브 = https://voicefishing-ff47f.web.app (2026-10-24 curl · 브라우저 실측).

## 판정표 (점검 시작 전에 확정)
| 조건 | 판정 |
|---|---|
| 소스와 라이브 양쪽에서 요건이 확인된다 | **있음** |
| 요소는 있으나 요건 일부가 빠졌다(일부 페이지만 · 자리표시 · 링크 숨김 · 영문 기본값 등) | **일부** |
| 소스·라이브 어디에도 없고, 서비스 성격상 쓰일 자리가 있다 | **없음** |
| 서비스 구조상 그 요소가 쓰일 자리가 없다(예: 대상 폼 자체가 없음 · 한 화면에 다 들어감) — 이유를 근거로 적는다 | **해당 없음** |

필요도: **높음**(법적 의무 또는 공유·유입에 바로 영향) · **중간**(품질·전환에 영향) · **낮음**(있으면 좋음).

## 점검 결과
| # | 항목 | 판정 | 근거 (파일:줄 · URL · 실측) | 필요도 | 권장 조치 (한 줄) |
|---|---|---|---|---|---|
| 1 | 구글 애널리틱스 | **없음** | 소스 `gtag`·`googletagmanager`·`getAnalytics`·`firebase/analytics`·`measurementId` grep 0건 · 라이브 `/`에서 `typeof window.gtag` = `undefined`, `window.dataLayer` = `undefined` · `firebase.json:16` CSP(Report-Only)에 googletagmanager 도메인 없음 | 중간 | GA4(또는 Firebase Analytics)를 넣되, CSP 허용 도메인 추가 + 개인정보처리방침에 수집 항목 기재를 같은 변경에 묶는다 |
| 2 | 첫 화면 행동 유도 | **있음** | `src/app/page.tsx:96-103` `CtaPanel href="/login"` "훈련 시작하기" · `page.tsx:94` 주석 "412×780에서 법적 고지 줄까지 한 화면"(§103 실측). ⚠️ 이번 비로그인 실측은 실패(아래 '실측 한계') · ⚠️ 정적 HTML 본문에는 CTA가 없다(`/` HTML에서 "훈련 시작하기" 0회 — 인증 판정 전 `return null`, `page.tsx:58`) | 중간 | 유지. 다만 JS 없이 읽는 크롤러·미리보기용으로 소개 문단을 정적 HTML에 남기는 방안을 검토 |
| 3 | 모바일 고정 CTA 버튼 | **해당 없음** | 첫 화면이 한 화면에 들어가도록 설계됨(`page.tsx:94` §103 "넘침 9 → 0") — 스크롤할 내용이 없어 고정 버튼 자리가 없다. CTA는 흐름 배치(`src/components/ui/CtaPanel.tsx:43` — `fixed`/`sticky` 없음). ⚠️ 이번 412×915 라이브 재확인은 못 함(추정 — 확인 방법: 비로그인 창에서 412×915로 `/` 열고 `document.documentElement.scrollHeight` ≤ 915) | 낮음 | 4·5번(사례·FAQ)을 첫 화면 아래에 붙여 스크롤이 생기면 그때 고정 CTA를 추가 |
| 4 | 실제 활용 사례 소개 | **없음** | `page.tsx` 본문 = 소개 문단 + 3단계 목록(`LANDING_STEPS`, `page.tsx:12`)뿐 · 후기·사례 섹션 없음 | 중간 | 훈련 장면 예시(가상 기관명 · 가상 대사)와 "어디서 속을 뻔했는지" 리포트 예시 1~2개를 첫 화면 아래에 둔다(실존 기관명 금지) |
| 5 | 자주 묻는 질문 5가지 | **없음** | 소스 `faq`·`자주 묻는` grep 0건(`src/**/*.ts(x)`) · 공개 라우트 목록에 FAQ 페이지 없음 | 중간 | "진짜 전화가 오나요 · 돈이 나가나요 · 녹음·사진은 어디로 가나요(사진은 서버로 안 보냄) · 가족에게 어떻게 보내나요 · 무료인가요" 5문항을 첫 화면 아래나 `/faq`로 |
| 6 | 문의 답변 시간 안내 | **없음** | `src/lib/legal/legalContent.ts:183-196` `CONTACT_INFO` = 운영자·이메일 자리표시(`[문의 이메일]`, `:21`) + 112·1332뿐, 답변 시간 문구 없음 · 라이브 `/contact` 200이지만 `noindex, nofollow` · 링크 숨김(`SHOW_LEGAL_LINKS = false`, `:14`) | 중간 | 운영자 연락처 확정 때 "영업일 기준 N일 안에 답변" 한 줄을 함께 넣는다 |
| 7 | 문의 완료 감사 페이지 | **해당 없음** | 문의 폼이 없다 — `/contact`는 연락처 안내 문서(`src/app/contact/page.tsx:8-10` `LegalDocumentView`)이고 제출 동작이 없다 | 낮음 | 문의 폼을 만들 때만 필요. 지금은 이메일 안내로 충분 |
| 8 | SNS 공유 썸네일 (OG · 트위터) | **있음** | `src/app/layout.tsx:19-36` · 라이브 `/`에 `og:title`·`og:description`·`og:image`(`/og-image.png`, 1200×630, alt 있음)·`og:type`·`og:locale` + `twitter:card=summary_large_image` · `/og-image.png` 실측 200 `image/png` 49,376B | — | 유지. 가족에게 보내는 챌린지 링크(`/challenge/join`)도 같은 공통 미리보기라, 원하면 전용 문구로 분리 |
| 9 | 페이지마다 다른 제목 | **일부** | 라이브 `<title>`: `/`·`/login`·`/scenarios`·`/report` 모두 "안 당해본 사기는 못 막는다 — AI 금융사기 백신"(동일) · `/contact`·`/privacy`·`/terms`만 개별(`src/app/{contact,privacy,terms}/page.tsx:6`) · `metadata` 내보내는 파일 4개뿐(layout + 고지 3) | 중간 | 공개 페이지(`/`·`/login`·`/challenge/join`)부터 개별 제목. 로그인 뒤 화면은 탭 구분용으로만 |
| 10 | 검색 결과 설명 (meta description) | **일부** | 라이브 모든 페이지 description이 같은 문장("AI 사기범의 전화와 문자를 앱 …", `layout.tsx:15-16`) · 개별 description 0개 | 중간 | 9번과 함께 공개 페이지만 개별 설명 |
| 11 | 내부 페이지 연결 링크 | **일부** | 첫 화면 링크는 `/login` 1개(`page.tsx:98`) · 고지 링크 3개는 `SHOW_LEGAL_LINKS = false`로 렌더 0(`src/components/LegalLinks.tsx:14`) · 앱 안 화면 이동은 있음 | 중간 | 고지 확정 후 링크 노출 + FAQ·사례 페이지가 생기면 첫 화면에서 연결 |
| 12 | 현재 위치 경로 (breadcrumb) | **일부** | 시나리오 고르는 흐름에만 선택 경로 표시가 있음(`src/app/scenarios/voice/ScenarioListView.tsx:67`, `:138` "지금까지의 선택 경로") · 공개 페이지·`BreadcrumbList` 구조화 데이터 없음 | 낮음 | 공개 페이지가 1단계라 지금은 추가 불필요. 페이지가 늘면 검토 |
| 13 | 맞춤 404 페이지 | **없음** | `src/app/not-found.*` 없음 · 라이브 `/no-such-page-xyz` → 404, 화면 문구 "404 / This page could not be found."(Next 기본 영문), 링크 0개, 탭 제목 "404: This page could not be found." · 404 HTML의 canonical이 `https://voicefishing-ff47f.web.app/_not-found` | 높음 | 한국어 404 + "처음으로" 버튼. 어르신 사용자가 잘못된 링크로 들어오면 갈 곳이 없다 |
| 14 | 이미지 대체 텍스트 (alt) | **있음** | 소스 `<img>` 3곳 모두 alt 있음: `MessengerChatRoom.tsx:151` "보낸 사진" · `SpoofImage.tsx:65` `alt={alt}` · `ThemeDebugPanel.tsx:160` `alt=""`(장식 · 디버그용) · `next/image` 사용 0 · OG 이미지 alt 있음(`layout.tsx:17`) | — | 유지. SVG 아이콘 24곳은 별도 a11y 점검 대상(이번 범위 밖) |
| 15 | robots.txt (+ sitemap) | **없음** | `src/app/robots.*`·`sitemap.*`·`public/robots.txt` 없음 · 라이브 `/robots.txt` → 404 `text/html` · `/sitemap.xml` → 404 `text/html` | 높음 | `src/app/robots.ts` + `sitemap.ts`(정적 export 지원). 공개 페이지만 허용, `/session`·`/report` 등 앱 화면은 Disallow |
| 16 | 구조화된 데이터 (JSON-LD) | **없음** | 소스 `ld+json`·`schema.org` grep 0건 · 라이브 `/`·`/login` HTML 0건 | 낮음 | `/`에 `WebApplication`(또는 `Organization`) JSON-LD 1개. 운영자 정보 확정 후 |
| 17 | 개인정보 처리방침 | **일부** | 페이지는 있음: 라이브 `/privacy` 200(`src/app/privacy/page.tsx`) · 수집 항목·위탁처 기재(`legalContent.ts:52`, `:58`, `:96-98`). 그러나 ① 초안 · 자리표시(`[운영자명]`·`[문의 이메일]`·`[개인정보 보호책임자 성명·직책]`·`[시행일]`, `:19-24`) ② 링크 숨김(`:14`, DECISIONS #205) ③ `noindex, nofollow`(`:17`, 라이브 확인) | 높음 | Google 로그인 정보·통화 음성을 처리하므로 운영자 정보를 채워 확정하고 링크를 노출(법률 검토는 별도 — 법적 판단 아님) |

### 합계
| 판정 | 개수 | 항목 |
|---|---|---|
| 있음 | 3 | 2 · 8 · 14 |
| 일부 | 5 | 9 · 10 · 11 · 12 · 17 |
| 없음 | 7 | 1 · 4 · 5 · 6 · 13 · 15 · 16 |
| 해당 없음 | 2 | 3 · 7 |

## 부수 발견 (17개 항목 밖)
| 발견 | 근거 | 영향 |
|---|---|---|
| 첫 화면 정적 HTML 본문이 비어 있다 | 라이브 `/` HTML `<body>` = `<div hidden>` + 스크립트 · "훈련 시작하기" 0회 · 원인: `page.tsx:58` `if (loading \|\| user) return null`(인증 판정 전) | JS를 실행하지 않는 크롤러·미리보기는 소개 문구를 못 읽는다(구글봇은 JS를 실행하지만 인증 판정까지 기다리는지는 미확인 — 확인 방법: Search Console URL 검사) |
| 404 응답의 canonical이 `/_not-found` | 라이브 `/no-such-page-xyz` HTML | 13번 수정 때 함께 정리 |

## 실측 한계
| 항목 | 내용 |
|---|---|
| 비로그인 첫 화면 412×915 | 앱 브라우저 창은 로그인돼 있어 `/` → `/scenarios`로 넘어감(로그아웃은 하지 않음). 별도 프로필 헤드리스 Chrome(`--virtual-time-budget=8000`, `--timeout=12000`) 2회 모두 빈 화면(2,963B PNG) → 같은 방법 3회째는 하지 않았다. 2·3번 판정은 소스와 §103 주석 근거 |
| 404 화면 | 로그인된 창 412×915로 확인(화면 문구·링크 0개) |

## 우선순위 상위 5개 제안
| 순위 | 항목 | 이유 | 규모(추정) |
|---|---|---|---|
| 1 | 17 개인정보 처리방침 확정·노출 | 로그인·음성 처리 서비스라 공개 의무 성격 · 1번(GA) 도입의 선행 조건 · 운영자 정보는 사용자 결정 필요(DECISIONS #205) | 문구 확정 + 스위치 1개(`SHOW_LEGAL_LINKS`) — 6번 답변 시간도 같이 |
| 2 | 15 robots.txt + sitemap | 지금 404 · 앱 화면 크롤링 차단도 함께 됨 | 파일 2개 |
| 3 | 13 한국어 맞춤 404 | 잘못된 링크로 온 어르신 사용자가 갈 곳이 없음(영문 · 링크 0) | 파일 1개 |
| 4 | 9·10 공개 페이지 개별 제목·설명 (+ 첫 화면 정적 본문) | 검색·공유 시 모든 페이지가 같은 제목 | `/`·`/login`·`/challenge/join` |
| 5 | 1 분석 도구 (GA4) | 전환(첫 화면 → 로그인 → 훈련 완료) 측정 수단이 0 · 1순위 처리 뒤 CSP·방침과 함께 | 스크립트 + CSP + 방침 문구 |

다음 후보: 5 FAQ · 4 사용 사례(첫 화면 아래 섹션 — 생기면 3번 고정 CTA도 다시 판정).
