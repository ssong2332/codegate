---
name: codegate-s56-model-swap
description: §56 텍스트 LLM 모델 교체(gemini-3.6-flash → 3.1-flash-lite) + 관측 증분 — 리터럴 상수 트립와이어가 tsc에서 먼저 걸리는 2층 구조, 로그 필드 역검증을 TS6133 없이 조작하는 법, 관측 공백을 닫을 때 "0으로 채우지 않기" 판정
metadata:
  type: project
---

`fix/s56-text-llm-model-swap`(2026-09-05, 커밋 `e769c2b`)에서 얻은 것.

## 1. ⭐ 상수 트립와이어 역검증은 **두 층**을 각각 밟아야 한다
`assert.equal(GEMINI_TEXT_MODEL, "gemini-3.1-flash-lite")`가 있으면 상수 값을 바꾸는 순간
**tsc가 먼저 죽는다** — `TS2339: Property 'includes' does not exist on type 'never'`
(리터럴 타입이 좁혀져 `never`가 되고, 그 뒤 `.includes()` 호출이 컴파일 에러).
⇒ *"런타임 단언이 실제로 잡는가"* 를 증명하려면 **기대값도 같이 바꿔** 타입 게이트를 통과시킨 뒤
`not ok`를 받아야 한다. 한 번만 조작하면 "게이트가 잡았다"의 층을 잘못 보고하게 된다.
[[codegate-t82-axis-model]]·[[codegate-t136-tactics-union]]의 TS6133 1층과 같은 계열.

## 2. 로그 필드 역검증에서 TS6133을 피하는 조작 형태
`elapsedMs` 를 `0`으로 바꾸면 변수 미사용이 되어 `TS6133`으로 컴파일에서 먼저 걸린다.
⇒ **`elapsedMs: elapsedMs * 0`** (또는 `(Date.now() - startedAt) * 0`)처럼 **변수를 쓰면서
값만 죽이는** 형태로 조작해야 테스트 층에 도달한다.

## 3. 관측 공백을 닫을 때의 판정: **없는 값을 0으로 채우지 않는다**
`usageMetadata.thoughtsTokenCount`가 안 오는 경우 0으로 채우면 *"추론 안 함"* 과 *"정보 없음"* 이
구분 불가능해진다 — §56.5가 기각한 *"성공 로그 0건이 정상인지 장애인지 모른다"* 와 **같은 종류의
착시를 하나 더 만드는 것**이다. 조건부 스프레드로 **필드 자체를 생략**하고, 그 규칙을 테스트로
못박았다(`"in" 연산자로 부재를 단언`).

## 4. 이 저장소의 "낡은 주석 정정" 관례
원문을 지우지 않고 **시점을 붙인 갱신 고지**를 아래에 덧붙인다. 그리고 **어느 부분이 여전히 참인지
명시**해야 다음 사람이 통째로 폐기하지 않는다 — 이번엔 `thinkingBudget:0`의 400은 유효하고
`2,959ms` 수치만 죽었다. ⭐ 무효화 고지에 **대체 사실**(`thinkingLevel:"MINIMAL"`은 통한다)을
함께 넣지 않으면 "추론은 못 끈다"는 **새 오해**가 생긴다.

## 5. 워크트리 착수 비용(재확인)
새 워크트리는 `node_modules` 0 ⇒ 루트·functions 각각 `npm install`(⛔ `--prefix install` 금지).
설치 후 `package.json`에 `file:..` 주입 없음을 확인했다. root `npm run build`는 `.env` 부재로
`auth/invalid-api-key` 실패 ⇒ 더미 `NEXT_PUBLIC_FIREBASE_*` `.env`를 만들어 통과 확인 후 삭제.
