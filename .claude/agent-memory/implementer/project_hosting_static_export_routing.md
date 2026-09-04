---
name: hosting-static-export-routing
description: 배포본 루트 외 전 경로 404 결함 — firebase.json cleanUrls/trailingSlash와 next output:"export"의 결합, 그리고 hosting 에뮬레이터 A/B 프로브 레시피
metadata:
  type: project
---

`next.config.ts`가 `output: "export"`면 페이지가 `out/<경로>.html`로 떨어지므로 **`firebase.json` hosting에 `cleanUrls: true`가 반드시 있어야 한다.** 없으면 `/scenarios`가 catch-all rewrite(`** → /404.html`)로 떨어져 **루트 외 전 경로가 404 본문**이 된다.

**Why:** 2026-09-04 배포본에서 실제로 발생했다. `cleanUrls`가 없어 10개 경로 전부 `404.html`을 서빙했고, **rewrite가 HTTP 200으로 응답하기 때문에 상태 코드만 보면 정상으로 보여** 오래 살아남았다(오케스트레이터가 OAuth 리다이렉트 로그인 실패로 발견).

**How to apply:**
- ⭐ **`cleanUrls: true` 만으로는 부족하다 — 실측**: `/scenarios`는 고쳐지지만 `/scenarios/`(슬래시)는 **여전히 404**다. `trailingSlash: false`를 같이 넣어야 301로 붙는다. 쿼리스트링은 301을 건너도 보존된다(`/report/?sessionId=x` → `Location: /report?sessionId=x`).
- **catch-all rewrite는 없어도 동작이 같다**(실측): Firebase는 `public` 디렉터리의 `404.html`을 자동으로 404 상태로 서빙한다. 즉 rewrite는 **중복**이며, 오히려 상태를 200으로 바꿔 진단을 방해한다. 결함 수정 범위를 좁히려고 남겨뒀으니 **제거 판단이 다시 올라오면 이 실측을 근거로 쓸 것**.
- **예약 네임스페이스는 rewrite보다 우선한다**(실측: `/__/firebase/init.json`·`init.js`가 catch-all이 있어도 200). 단 **`/__/auth/handler`는 에뮬레이터에 없다** — 실제 Hosting 호스트가 제공하는 것이라 로컬 404는 결함이 아니다.
- 회귀 가드는 `scripts/hosting-export-guard.mjs`(+ `.test.mjs`)로 남겼다.

### ⭐ hosting 라우팅 A/B 프로브 레시피 (브라우저 불필요)
1. 루트에서 `npm run build` → `out/` 생성. **격리 워크트리에는 `.env`가 없어 실패하므로 `C:\codegate\.env`를 복사해 쓰고 끝나면 지운다.**
2. `firebase emulators:start --only hosting --project demo-<아무거나>` (프로젝트 설정 불필요, 포트 5000).
3. 각 경로를 `curl -s -D - -o body`로 받아 **본문 sha256을 `out/404.html`과 대조**한다 — 크기·상태코드보다 확실하다. 고친 뒤에는 **의도한 페이지 파일과 바이트 동일**한지까지 본다.
4. ⛔ **설정을 바꾸면 에뮬레이터를 반드시 재시작**한다(자동 재로드 없음). `netstat -ano | grep ":5000 "`로 PID를 찾아 `taskkill //PID <pid> //F` — [[background-emulator-task-tracking]] 참조.

관련: [[codegate-context]]
