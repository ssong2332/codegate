---
name: codegate-pixel-measurement-cdp
description: 이 저장소의 "픽셀 측정 수단 0건"(OQ-U34)을 의존성 0으로 뚫는 법 — Node 22 전역 WebSocket + Chrome CDP. next dev는 헤드리스에서 하이드레이트되지 않으니 정적 프로덕션 빌드를 써라.
metadata:
  type: project
---

**여백·레이아웃 픽셀은 `npm run build`(정적 export) 결과물 `out/`을 로컬 정적 서버로 띄우고 헤드리스 Chrome을 CDP로 몰아서 잰다. `npm run dev`로는 못 잰다.**

**Why:**
- `docs/UX.md` OQ-U34가 *"이 저장소에는 픽셀을 기계로 잴 수단이 없다"* 로 열려 있다(jsdom·Playwright **0건**, `renderToStaticMarkup`은 레이아웃 미계산). 그래서 여백 태스크는 "측정 불가"로 멈추기 쉬운데 **실제로는 의존성 0으로 잴 수 있다** — Node 22.14에 전역 `WebSocket`이 있어 CDP 클라이언트를 몇십 줄로 직접 쓴다. Chrome은 `C:\Program Files\Google\Chrome\Application\chrome.exe`에 있다.
- ⛔ **`next dev`(Next 16 / Turbopack)는 헤드리스 Chrome에서 앱 루트가 하이드레이트되지 않는다** — 2026-07-29 실측: 청크 26개 전부 200, 예외 0건, `nextjs-portal`(dev 오버레이)만 렌더되고 `document.querySelector('main')`은 **끝까지 null**. 내 워크트리 서버(:3111)와 **다른 에이전트의 기존 서버(:3000) 양쪽에서 동일 재현** ⇒ 트리 문제가 아니다. 정적 프로덕션 빌드는 같은 브라우저에서 정상 렌더된다.

**How to apply:**
1. 워크트리에 `.env`·`.env.production`을 메인 체크아웃에서 **복사**한다(둘 다 gitignore됨 — `git check-ignore -v`로 확인하고 쓰라). 없으면 `npm run build`가 정적 생성 단계에서 `auth/invalid-api-key`로 죽는다.
2. `out/`을 `node:http` 정적 서버로 띄우고 `Emulation.setDeviceMetricsOverride` → `Page.navigate` → `Runtime.evaluate`(`getBoundingClientRect`)로 잰다. **네비게이션 후 뷰포트를 한 번 더 설정**해야 값이 안정된다.
3. ⭐ **프로덕션 빌드로 재는 것이 배포본과 같은 조건이라는 점이 중요하다** — `src/app/(auth)/login/page.tsx`의 개발 전용 빠른 로그인 블록은 `NODE_ENV !== "production"` 게이팅이라 dev에서만 렌더돼 **하단 높이를 바꾼다**. 반대로 `NODE_ENV` 의존 마크업은 실측상 그 한 곳뿐이라 다른 화면은 dev/prod 차이가 없다.
4. **인증·구독이 필요한 화면**(예: `/clone/wait`)은 프로덕션 빌드에서 RouteGuard에 막힌다. 에뮬레이터를 붙이려 하지 말고 **PROBE 패치 2줄**(RouteGuard `PUBLIC_PATHS`에 경로 추가 + 초기 state를 목표 상태로 고정)을 **before/after 양쪽에 동일하게** 적용해 조건을 맞춘 뒤, 끝나면 되돌리고 **sha256으로 원상복구를 증명**한다.
5. **역검증은 상한 클래스 하나만 지운 빌드**로 한다 — 값이 "변경 전"과 **소수점까지 일치**하면 그 클래스가 유일한 원인이고 구조 변경 자체는 무해함이 동시에 증명된다.

관련: [[codegate-emulator-freshness]] · [[codegate-t116-render-gate]] · [[codegate-t125-persuade-once]]
