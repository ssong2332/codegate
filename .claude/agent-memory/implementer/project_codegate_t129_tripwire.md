---
name: codegate-t129-tripwire
description: T129 G159 트립와이어 — 크로스 패키지(functions/lib .js + 루트 src .ts) 순수 함수 프로브 레시피, 픽스처 보존 지시와 "신규 파일 0건"의 충돌, 실패 메시지 원문 확보법
metadata:
  type: project
---

T129에서 `functions/src/scenarios/__tests__/mockScreens.test.ts`에 트립와이어 1건(+역검증)만 얹었다. base main `9658684` → PR #149. 소스 0줄.

**⭐ 크로스 패키지 순수 함수 프로브 레시피(재사용 가치 최고)**
`functions/`와 루트 `src/lib`는 서로의 테스트 러너에서 못 읽는다(functions 테스트는 컴파일된 `lib/**/*.js`, 루트는 `node --experimental-strip-types`). **두 층을 한 번에 부르려면 스크래치패드에 `.ts` 프로브를 두고 `node --experimental-strip-types`로 실행하되, import를 절대 `file:///C:/...` URL로 적는다** — 한쪽은 컴파일 산출물 `functions/lib/report/*.js`, 다른 쪽은 원본 `src/lib/**/*.ts`. 상대경로는 워크트리 깊이 때문에 깨진다. `functions/lib`는 `npm --prefix functions test`가 방금 빌드해 둔 것을 쓰면 된다(⛔ `npx tsc` 금지).
**Why:** T129 P-3(결함 재현)은 `applyMockScreens`(functions) + `resolveMockScreenBranch`(루트) 동시 호출이 필수였는데, 저장소 안에는 그 둘을 같이 부를 수 있는 자리가 없다.
**How to apply:** 서버 파생 → 표시 층 판정으로 이어지는 결함을 재현할 때. 타입은 strip-types가 지우므로 픽스처 객체에 캐스팅 없이 최소 필드만 채워도 실행된다.

**⭐ 실패 메시지 원문을 보고에 넣는 법**: 트립와이어 입력을 **일시적으로 오염**시켜(`[...reachableLandingKeys(), "x::extra"]`) 전체 테스트를 돌리고 `not ok` 블록의 `error:` 줄을 캡처한 뒤 되돌린다. 역검증 테스트만으로는 "메시지가 실제로 어떻게 보이는가"를 증명하지 못한다.

**⚠️ 설계 지시 내부 충돌(미해결, PR에 고지)**: §35.11이 *"P-3 픽스처를 삭제하지 말 것"* 을 지시하면서 §35.7은 *"신규 파일 0건 · 테스트 파일 1개"* 를 지시한다. 크로스 패키지 픽스처는 새 파일 없이는 저장소에 남길 수 없다 ⇒ 임의 판단하지 않고 프로브 출력을 증거로 남기고 반려 대신 **고지**했다. 같은 형태의 충돌은 [[codegate-t110-warm-transfer]]에서도 나왔다.

**워크트리 착수 비용(재확인)**: 새 워크트리는 `node_modules` 0건이라 루트·functions 양쪽 `npm install`이 필요하고, `npm --prefix functions install`이 `functions/package.json`에 `"fraud-vaccine-web": "file:.."` 를 **또** 넣는다(T130). 설치 직후 `git checkout -- functions/package.json functions/package-lock.json`.

관련: [[codegate-d61-report-lie]] (같은 매칭 키), [[codegate-t101-clean-lib]] (스테일 lib).
