---
name: project-codegate-p34-pc-mobile-width
description: T-P34 PC/모바일 반응형 폭 계약(8화면) — stash 기반 before/after 증거법, verticalSlackCap 게이트 스코프 확인, 프리뷰 도구 부재
metadata:
  type: project
---

## 배경
docs/UX.md P-34(D-71, 사용자 지시 "pc 최적화, 모바일 최적화")가 확정한 반응형 폭 계약을
8화면(UX-008 리포트·UX-030 아카이브·UX-017 시나리오 노출·UX-024 메신저 시나리오·UX-029
난이도·UX-028 되감기·UX-012 히스토리·UX-020 챌린지 결과)에 적용했다. commit `c0d8bc2`
(worktree `agent-a0c8aaeeb0b7ba1fe`).

## 구현 규칙(재사용 가능한 패턴)
- W-A(문서형): `max-w-xl` **뒤에** `lg:max-w-3xl`만 추가(치환 금지 — 기존 동결 토큰 게이트가
  `values.split(/\s+/).includes("max-w-xl")` 형태로 존재만 검사하는 패턴이 흔하다).
- W-B(목록형): `lg:max-w-3xl xl:max-w-5xl` + 목록 `<ul>`에 `lg:grid lg:grid-cols-2` 추가.
  ⭐ **기존 `flex flex-col gap-N`의 `gap-N`을 그대로 두면** grid 전환 후 행·열 양쪽 간격이
  되어 **신규 `gap` 클래스 0건**으로 끝난다 — `lg:gap-*`를 새로 쓸 필요가 전혀 없다.
- 세로축 유틸(`pt/pb/py/mt/mb/my/h/min-h/max-h/gap/space-y`)에 브레이크포인트 프리픽스를
  붙이는 게 세로 여백 상한 게이트([[project_codegate_...]] 계열의 `VERTICAL_UTILITY` 정규식
  패턴)에 걸린다 — 가로 축(`max-w`·컬럼)만 건드리면 안전하다.

## ⭐ 발견 — 세로 여백 게이트(`verticalSlackCap.test.ts`)는 스코프가 좁다
이 저장소의 P-30 세로 여백 상한 게이트는 **딱 2개 파일**(`login/page.tsx`·`clone/wait/page.tsx`)
만 검사한다(`TARGETS` 배열 하드코딩). 다른 8개 파일을 편집해도 이 게이트가 실행되지 않는다 —
"기존 게이트가 통과했다"는 이 파일들에 한해서만 증거가 된다. 새 화면을 만질 때는 먼저 게이트
소스를 열어 **TARGETS/스코프 배열**을 확인하는 것이 안전하다(막연히 "게이트가 있으니 커버된다"
고 가정하지 말 것).

## Before/After 증거 방법 — `git stash -u` 재사용
CLAUDE.md에 기록된 "이전/기준값" 표 요건을 채우려고 `git stash -u`로 편집을 임시로 되돌리고
`npm test`를 돌려 baseline(325 pass/0 fail)을 얻은 뒤 `git stash pop`으로 복원하고 다시
`npm test`(325 pass/0 fail, 동일)를 돌렸다. 같은 체크아웃에서 테스트를 **연속 1회씩만** 돌렸으므로
동시 실행 오염([[feedback_...]] 류 T101 경고)에 해당하지 않는다. 이 방법은 "직전 커밋과 비교"가
안 되는 워크트리(fetch 안 된 base 등)에서 진짜 diff-only 전/후 비교가 필요할 때 재사용 가능하다.

## 프리뷰 도구 부재 + CDP 실측 시도했지만 RouteGuard에 막힘
이 세션 tool 목록에는 `preview_start`/브라우저 렌더링 도구가 없었다(PostToolUse 훅이 안내는
했지만 실제 tool이 노출되지 않음). 대신 [[codegate-pixel-measurement-cdp]]가 기록한
CDP 기법을 재사용해 실측을 **시도했다**: 메인 체크아웃(`C:\codegate\.env`·`.env.production`,
둘 다 gitignore)을 워크트리로 복사 → `npm run build`(정적 export 성공) → 스크래치패드에
1회성 CDP 스크립트를 작성해 `/report`·`/report/archive`·`/scenarios/voice/generic`·
`/scenarios/messenger`·`/scenarios/difficulty`·`/report/rewind`·`/history`·
`/challenge/results` 8경로를 4뷰포트(375×812·768×1024·1024×768·1440×900)로 열었다.
⛔ **결과: 8경로 전부 `location.href`가 `/login`으로 리다이렉트됐다** — `RouteGuard.tsx:27`
의 `PUBLIC_PATHS`에 없어서, 인증 세션이 없는 헤드리스 컨텍스트에서는 화면 자체(내가 수정한
`<main>`)가 렌더되지 않고 로그인 화면만 보인다. UX-003 전용 probe([[codegate-pixel...]] 의
`PROBE_EDITS`)처럼 `PUBLIC_PATHS`를 임시로 넓히는 것만으로는 부족하다 — 이 8화면은 전부
Firestore 구독 결과(`user` 필요)로 success 상태를 만들기 때문에, 인증 세션 없이는
로딩 스피너 상태(내가 손대지 않은 별도 `<main>`)에 갇힌다. 화면마다 다른 데이터 셰이프를
가진 8개의 커스텀 probe(또는 에뮬레이터+실제 로그인)를 새로 만드는 것은 이번 패스 요청
범위(레이아웃 클래스 추가)를 크게 넘는 작업이라 **여기서 멈췄다** — 시도한 스크립트·명령은
아래 재현 절차로 남기고, 최종 근거는 **클래스 대조 + 정적 빌드 TS 컴파일 성공**으로 보고했다.
ux-design 자신도 "브라우저를 본 적 없다"고 자기 고지한 패턴과 동일 — 이 프로젝트의
반응형/레이아웃 패스는 구조적으로 **사람의 로그인된 브라우저 확인**이 최종 게이트다
(OQ-U34, 이 저장소에 jsdom-layout·Playwright 0건).

**재현 절차(다음 패스가 실제로 인증된 상태를 만들 수 있다면 그대로 쓸 수 있다):**
1. `cp C:\codegate\.env .` · `cp C:\codegate\.env.production .` (워크트리 루트, 둘 다 gitignore 확인 후)
2. `npm run build` → `out/` 정적 export 생성 확인
3. `node:http`로 `out/`를 서빙 + Chrome CDP로 `Emulation.setDeviceMetricsOverride` → `Page.navigate`
   → `Runtime.evaluate`로 `document.querySelector('main').getBoundingClientRect()` 측정
   (기존 `scripts/measure-vertical-slack.mjs`와 같은 골격, 다만 이번엔 새 SCREENS 정의가 필요)
4. **8경로 전부 인증이 필요하다** — RouteGuard PUBLIC_PATHS 임시 추가만으로는 안 되고, 각 화면의
   데이터 로딩 effect가 기대하는 상태까지 probe로 고정하거나 실제 Firebase Auth 에뮬레이터 로그인이 필요.
5. 끝나면 `.env`·`.env.production`을 반드시 지우고(`git status`로 미추적 확인), `out/`도 삭제.

## 손대지 않은 것(경계)
- `src/app/session/play/page.tsx`(UX-014 통화 셸) — 오케스트레이터가 병행 패스 충돌로 명시 제외.
- `src/app/session/messenger/page.tsx:333`(UX-022 메신저 셸) — P-34 문서가 이미 발견한 드리프트
  (컨테이너 폭 제한 완전 부재로 데스크톱 전폭). 같은 이유(병행 패스 충돌 위험)로 **손대지 않고
  발견 사실만 보고**했다. 교정 방향은 넓히기가 아니라 좁히기(`lg:mx-auto lg:w-full
  lg:max-w-[430px]`)라고 UX.md가 이미 값까지 정해뒀다 — 다음 패스가 그대로 쓰면 된다.
- `src/app/report/replay/page.tsx`(UX-018 리플레이) — 말풍선 스레드라 컨테이너 확장 시 말풍선
  글줄도 같이 늘어나 "레이아웃만" 범위를 넘는다는 UX.md의 명시적 제외 판단(OQ-U44)을 그대로 따름.
