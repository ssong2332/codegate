---
name: codegate-s54-d1-d2
description: §54 D1(목업 오디오 무음화)·D2(폴백 자격증명 보관 + Mock 마킹 차단) 구현 — 설계가 검토 안 한 마운트 부작용, 루트 tsc --noEmit의 선재 오류 계층
metadata:
  type: project
---

§54 D1·D2 구현(2026-09-04, base `e70ad4b` → `e26bd07`/`7086c65`). 다음에 이 계열을 만지면 쓸 것.

**⭐ 설계가 "판단 여지 0"이라고 못박아도 부작용 범위는 확인해야 한다.**
§54.9 (4) 2는 *"E1·E2(마이크 거부·미지원)에서도 자격증명을 보관한 뒤 폴백으로 간다"* 를 확정하며
*"부작용 없다"* 의 근거를 **E3에만** 실측해 두고(§54.14 6이 그 숙제를 implementer에 넘겼다) 나머지는
남겼다. 실제로 `session/play/page.tsx`는 **`credentials.provider` 값만 보고** Live 세션 컴포넌트를
마운트하므로, E1·E2에서 실 gemini/elevenlabs 응답을 **그대로** 담으면 *마이크 없이 Live 세션이
마운트된다*. 해소는 서버 자신의 폴백 계약(`provider:"none"` + 빈 자격증명 + `difficultyApplied:true`,
`functions/src/realtime/index.ts`의 발급 실패 분기)을 그대로 흉내 낸 **순수 함수 1개**로 낮춰 보관.
**Why:** 새 판별자·새 상태 필드를 만들지 않고도 마운트를 막을 수 있었고, provider가 이미 "none"인
E3에서는 그 낮춤이 **무효과**라 설계가 지정한 동작과 결과가 같다(테스트가 동등성을 단언).
**How to apply:** 설계가 "이 한 줄은 실측해 확인할 것"이라고 적어 두면 **그 줄의 조건만이 아니라
같은 처방을 받는 다른 입구까지** 재라. 여기서는 E3만 안전하고 E1·E2는 아니었다.

**⭐ 관측 불가 층은 순수 함수 + 소스 게이트 2겹으로 고정한다(이 저장소의 기존 관례와 동형).**
React 훅 러너도, Firestore 콜러블 러너도 없다. 그래서 F1은 `toFallbackCredentials`(순수)+훅 소스 스캔,
F2는 `wasTurnInstructionSpoken`(순수)+`roleplay/index.ts` 소스 스캔으로 나눴고, **양쪽 다 오염본
역검증**을 붙였다(보관 호출 제거 / 마킹을 LLM 호출 앞으로 되돌림 → 같은 검사식이 빨간불).
순수 함수 테스트에서 게이트 **정본**(`shouldOfferVerify`)을 직접 불러 "낮춘 값은 통과 / 오늘의
폐기(=credentials null)는 99턴에서도 false"를 **같은 출력에** 나란히 뒀다.

**⚠️ 루트 `npm run build`가 워크트리에서 못 도는 상황의 대안 증거.**
`.env` 없는 워크트리에서 `next build`는 정적 생성 단계에서 `auth/invalid-api-key`로 죽는다(선재).
타입 증거가 필요하면 `npx tsc --noEmit -p tsconfig.json` 후 **`grep -v "\.test\.ts"`** 로 거른다 —
테스트 파일들은 `.ts` 확장자 import(TS5097)·`fs.globSync`(TS2339)로 **원래 빨갛다**(strip-types 러너로
돌기 때문). 비테스트 파일 오류 0이 실제 신호다.

**수치**: functions 677 → **685**(D1 +2 / D2 +6), root 325 → **332**(+7). 새 루트 테스트는
`package.json` test 스크립트에 **직접 등재**해야 한다(`src/lib/testRegistration.test.ts`가 강제).

관련: [[codegate-t98-thinking-regression]] · [[feedback-unobservable-behavior-gates]] ·
[[codegate-firebase-build-blocker]]
