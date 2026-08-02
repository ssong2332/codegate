---
name: codegate-s47-verify-offer-participant-intent
description: §47/W4 확인 오퍼 개시를 참가자 탭으로 이전 — 순수함수 조합으로 G263 보존, node 테스트 러너의 @/ 별칭 미해석 함정, JSX 주석이 codeOnly()를 못 걷어내는 재확인, set-state-in-effect IIFE 관례, G271은 코드 변경 없이 보고로 닫힌 사례
metadata:
  type: project
---

`fix/s47-verify-offer-participant-intent`(base `f32331c`, §45 ⓑ 이미 병합됨 `650ce65`). 305 root / 639 functions, 0 fail(functions는 base와 동일 — 무접촉).

## ⭐ 가장 값나가는 것

**1. 기존 게이트 함수를 고치지 말고 위에 조합하라(G263류 제약의 일반형).**
`shouldOfferVerify`(턴 게이트)를 한 글자도 안 건드리고, `shouldAnnounceVerifyOffer({series, gateReached, intentExpressed})`
라는 새 순수 함수로 그 **결과**와 계열·참가자 의사를 조합했다. 계열 A 예외(G264)도 이 새 함수
**내부 1곳**에만 뒀다(page.tsx에는 `verifySeries === "A"` 분기를 새로 만들지 않았다 — 소스 스캔
테스트로 그것 자체를 역검증했다). **Why:** 기존 함수를 고치면 그 함수의 기존 회귀 테스트 전부가
"내가 건드렸다"는 의심을 받고, 조합형 새 함수는 기존 테스트 0건을 깨지 않고 새 계약만 추가한다.
**How to apply:** "게이트 값 무변경" 류 제약이 있는 태스크에서 AND/OR 조건을 추가해야 하면, 원 함수를
감싸는 **별도 조합 함수**를 만들고 원 함수는 인자로만 넘겨라.

**2. `node --experimental-strip-types --test`는 `@/` 경로 별칭을 못 푼다 — src/lib이 src/content를
import하면 테스트가 조용히 깨진다.** 이 저장소 test 스크립트(`package.json`)는 tsconfig-paths나
로더 없이 순수 Node ESM 해석만 쓴다. `src/lib/verifyintercept/verifyIntercept.ts`(테스트 러너가
`./verifyIntercept.ts` 상대경로로 직접 로드)에서 `@/content/scenarios/...`를 import하면 그 순간
전체 테스트 파일이 모듈 해석 실패로 죽는다. **해결**: 상수를 **미러링**했다(`BANK_SECURITY_VERIFY_
SCAM_SCENARIO_ID = "bank-security-verify-scam"`를 로컬 재선언 + 주석으로 원본 위치 명시) — 이 저장소가
`functions/`↔`src/` 사이에 이미 쓰는 "필드 미러링" 관례와 같은 판단.
**How to apply:** `src/lib/*.test.ts`가 직접 로드하는 소스 파일에 새 import를 추가하기 전에, 그 대상이
**상대 경로로 해석 가능한지**(`.ts` 확장자 명시 + `@/` 미사용) 먼저 확인하라. `@/` import는 Next.js
빌드에서만 동작하고 이 프로젝트의 유닛 테스트 러너에서는 죽는다.

**3. `codeOnly()`는 `{/* JSX 주석 */}`을 못 걷어낸다 — 소스 스캔 테스트를 쓸 때 내 설명 주석이
금지어/기대 문자열을 우연히 포함하면 게이트가 오작동한다(양방향).** `verifyCallContinuity.test.ts`의
`codeOnly()`는 `//`·`*`·`/*`로 시작하는 **줄**만 거른다 — JSX 블록 주석(`{/* ... */}`)은 코드로 남는다
(파일 자신도 그렇게 주석해 뒀다: "이 JSX 주석은 codeOnly()가 걷어내지 못하므로 스캔 대상에 남는다").
실제로 새 코드의 설명 주석에 옛 라벨 문자열("연결해 달라고 하기")을 그대로 인용했다가, 그 문자열의
**부재**를 확인하려던 게이트가 내 주석 때문에 거짓으로 "있음"이 될 뻔했다 — 인용을 빼고 패러프레이즈로
바꿔 해결. **How to apply:** 소스 스캔 테스트가 있는 파일을 고칠 때는 삭제/금지 대상 문자열을 JSX
블록 주석 안에 **그대로 인용하지 말 것**(간접 서술로 바꿔라). [[codegate-t86-harmlessness-guards]]·
[[codegate-t125-verify-scope]]의 "관측 불가 지점" 계열과 자매 함정.

**4. `react-hooks/set-state-in-effect`는 이 저장소에서 **인라인 async IIFE로 감싸기**가 표준 회피
관례다(10곳 이상 선례 — `session/play/page.tsx:615`·`:628`·`:949`, `clone/wait/page.tsx` 등).**
effect 본문에서 직접 `setState()`를 부르면(동기 setState 여러 개 연쇄) 이 규칙이 걸린다. 새 자동 전환
effect(계열 B)에서 `handleOpenVerifyOverlay()`(내부에서 setState 3개)를 effect 최상위에서 직접 부르자
`lint`가 즉시 걸렸다 — `(async () => { handleOpenVerifyOverlay(); await handlePlaceVerifyCall(); })();`
로 감싸서 해결(await은 실질적 의미 없이 그냥 관례를 만족시키는 형태). **How to apply:** 새 effect에서
setState를 호출하는 헬퍼를 부를 때는 **먼저 lint를 돌려 보고**, 걸리면 이 IIFE 관례를 그대로 따라라
(이 저장소에서 새 패턴을 발명하지 마라 — 이미 정착된 관례가 있다).

## ⭐ G271(경합 전수 대조)은 코드를 안 고치고 "보고"로 닫힌 사례

계열 B의 오퍼 개시가 참가자 탭 시점으로 옮겨지면서, **"문자 due 경계와 확인 게이트가 6종 전수에서
서로 다른 값이라 경합이 0건이다"**라는 §38.13 (4) b의 정적 보장이 더는 성립하지 않는다(탭 시점은
참가자가 정하므로 예측 불가). 하지만 **처리 메커니즘(G31 `enqueueInstruction`/`PRIORITY_RANK`)은
턴-불문·이유-불문으로 이미 일반적**이라(문자 우선 + 확인 지시는 유실 없이 다음 턴으로 보류), 실제
경합이 나더라도 안전하게 처리된다 — 기존 G31 테스트가 이미 그 케이스를 커버한다(트리거 사유와
무관하게 "같은 턴에 verify가 due면"만 본다). ⇒ **코드/테스트 변경 0건 — 최종 보고에 "정적 보장은
깨졌지만 처리는 여전히 안전하다"를 명시하는 것으로 G271을 닫았다.**
**Why:** 게이트/제약이 "재확인하라"고 요구한다고 해서 항상 코드가 바뀌어야 하는 건 아니다 — 기존
메커니즘이 이미 그 케이스의 상위집합을 커버한다면, 그 사실을 **근거와 함께 명시적으로 보고**하는 것이
올바른 산출물이다.

## 자잘한 판단

- **`handleOpenVerifyOverlay`의 시그니처를 `(trigger) => ...`에서 `() => ...`로 줄였다** — 상시 컨트롤이
  이제 JSX에 `ref={verifyTriggerRef}`로 직접 걸리므로 클릭 시점 캡처가 불필요해졌다. 단 **함수 이름은
  그대로 유지**했다 — `verifyCallContinuity.test.ts`의 G26(오버레이 동시 열림 금지) 테스트가
  `page.indexOf("const handleOpenVerifyOverlay")` 같은 **이름 문자열**로 슬라이스를 잡기 때문에,
  이름을 바꾸면 그 테스트가 `slice(-1, X)`로 빈 문자열을 만들어 조용히 깨진다(JS `slice` 음수 인덱스
  함정). **함수를 리팩터할 때 이름이 다른 테스트의 인덱스 앵커인지 먼저 grep으로 확인하라.**
- **자동 전환(계열 B) 실패 시 재시도를 만들지 않았다** — C3("두 번째 컨트롤 없음")가 재시도 버튼도
  금지하므로, 실패하면 그 세션에서는 그걸로 끝(원 통화 유지, Failure (c) 그대로). `autoReconnectOfferIdRef`
  로 offerId당 1회만 latch — 성공/실패 무관하게 재발화 안 함.
- **오류 시 오버레이를 자동으로 닫지 않기로 했다** — 처음엔 "복귀"라는 표현 때문에 자동 닫기를 고려
  했으나, 그러면 오버레이 안의 `errorMessage` 표시가 죽어 있는 코드가 된다. 기존처럼 오버레이를 열어둔
  채 에러 텍스트를 보여주고, "그만두고 통화로 돌아가기"로 참가자가 닫게 두는 편이 기존 UX와 더
  가깝고 변경 폭도 작다.
- **`autoReconnectOfferIdRef`(offerId 키 latch)가 필요했던 이유**: 자동 전환 성공 시
  `setVerifyOverlayOpen(false)`가 Firestore의 `placedAt` 갱신보다 먼저 로컬에 반영돼, 그 찰나에
  `shouldRevealVerifyOffer`가 여전히 true를 내며 effect가 재실행될 수 있다(고전적인 "state 리셋 →
  effect 재발화" 경쟁). `verifyOverlayOpen`만으로는 못 막고, offerId 기반 ref latch가 필요했다.

## 검증 한계(자기 고지)

- 라이브 재현 0건(architect·ux-design과 동일 — 이 태스크도 셸/에뮬레이터 실행은 P-3/lint/build/test뿐).
- V-1~V-7(UX P-32 (6))은 "사람이 화면을 봐야" 성립하는 기준이라 소스 스캔 테스트로만 근사했다.
- OQ-U40/U41(상시 노출의 위화감 완화 정도·훈련 유효성 영향)은 측정 대상 밖.

관련: [[codegate-s45b-verify-anchor]] · [[codegate-t83-verify-intercept]] · [[feedback-unobservable-behavior-gates]] · [[codegate-t86-harmlessness-guards]]
