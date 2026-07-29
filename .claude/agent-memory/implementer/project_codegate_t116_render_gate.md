---
name: codegate-t116-render-gate
description: T116 렌더 층 게이트 — Node 22.14에서 .tsx를 테스트에 로드하는 B-1 require 확장 훅 레시피(신규 의존성 0), 배럴 해석이 .ts 등록에 달려 있다는 함정, 격리 워크트리에서 층2를 돌리는 법
metadata:
  type: project
---

**T116(`feat/T116-render-layer-gate`, PR #163)에서 확정된 것 — 이 저장소에서 `.tsx`를 테스트 런타임에 로드하는 유일한 무-의존성 경로.**

**Why:** 루트 러너가 `node --experimental-strip-types --test`인데 그 로더는 `.tsx`를 **열지도 않고** 거절한다(`ERR_UNKNOWN_FILE_EXTENSION`). `--experimental-transform-types`도 **결과 동일**(실측). Node 공식 문서가 `.ts`·`.mts`·`.cts`만 지원하고 `.tsx`를 명시 배제하기 때문이다. 그래서 렌더 테스트는 라이브러리 도입 없이는 불가능해 보였고, 실제로 후보 A·A2가 그 이유로 죽었다.

**How to apply:** 렌더/컴포넌트를 테스트에서 실제로 실행해야 할 때 `src/lib/mockscreenrender/renderHarness.ts`를 재사용하거나 같은 형태로 짠다. 비자명한 함정 4건:

1. ⭐ **`.tsx`만 등록하면 `./ui` 배럴이 안 풀린다.** `require.extensions`에 **`.ts`도 함께** 등록해야 한다 — Node의 디렉터리 인덱스 해석(`./ui` → `./ui/index.ts`)이 **등록된 확장자 목록을 순회**하기 때문이다. 이걸 놓치면 "훅은 걸렸는데 모듈을 못 찾는다"로 헤맨다.
2. ⭐ **`react`·`react-dom/server`도 훅과 같은 `createRequire`로 가져와야 한다.** ESM `import`로 가져오면 변환된 컴포넌트가 잡는 CJS 인스턴스와 갈려 렌더가 조용히 깨질 수 있다.
3. **오염 주입은 훅 안쪽 `Map<절대경로, 소스>` 오버라이드로.** 그래야 오염 경로가 정상 경로와 **완전히 같은 수단**을 탄다(디스크 사본 불필요, 실제 파일 편집 불필요). ⛔ 오염마다 `require.cache`를 비우지 않으면 **정상 모듈이 재사용돼 "오염이 안 걸린다"는 거짓 음성**이 난다.
4. 하네스가 앱 번들에 새지 않게 **import 지정자만** 스캔한다(토큰 `includes`는 이 저장소의 긴 설명 주석에 걸려 오탐). 테스트 파일(`*.test.ts`)은 스캔 제외 — 기존 테스트가 `node:fs`·`scanSource`를 정당하게 쓴다.

⭐ **설계 문서가 "못 한다"고 적은 것을 실제로는 할 수 있었던 사례:** `Architecture.md` §39.4 (4) ②는 *"루트 빌드가 `.env` 없는 워크트리에서 실패하므로 격리 워크트리에서는 층 2(`npm run verify:build`)를 돌릴 수 없다"* 고 적었다. **더미 `.env`를 임시로 만들어 빌드하면 돌아간다** — 실제 산출물에서 0건을 확인해 "번들에 안 샌다"를 추정이 아니라 실측으로 냈다. 검증 후 `.env`·`out`·`.next` 삭제. (같은 기법이 [[codegate-t128-auth-invalidation]]에도 있다.)

**Node 버전 이슈 정리(문서 인계로 넘김, 소스 아님):** `module.registerHooks`는 이 저장소 Node **v22.14.0**에 **없다**(`node -p` 실측 `undefined`). §39가 쓴 *"22.15.0+ / 23.5.0+"* 는 **어느 한쪽이 틀린 게 아니라 둘 다 맞다** — Node 문서의 "Added in" 이력이 두 릴리스 라인에 각각 있다. B-1은 `registerHooks`를 안 쓰므로 무관하지만, B-3으로 강등되면 이 값이 게이트다.

관련: [[codegate-t108-ast-source-scan]](같은 `src/lib/sourcescan` 테스트 전용 모듈 제약을 상속) · [[codegate-t101-clean-lib]]
