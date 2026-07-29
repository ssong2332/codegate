---
name: codegate-t132-key-failover
description: T132 Gemini 키 순환 — defineSecret은 미설정이어도 프롬프트를 안 띄운다(defineString과 다르다), 새 워크트리 .env 부재가 P-1을 가리는 함정, 호출 횟수 단언이 못 잡는 것을 헤더 비교가 잡은 실측
metadata:
  type: project
---

`feat/T132-key-failover`(2026-07-29, PR #156)에서 얻은, 코드만 읽어서는 안 나오는 것들.

## 1. ⭐ `defineSecret` 미설정 슬롯은 **프롬프트를 띄우지 않는다** — `defineString`과 다르다
`config.ts:20-22`가 *"defineString은 기본값이 빈 문자열이면 배포/기동 시 값을 대화형으로 물어
멈춰 세운다(실측)"* 라고 기록해 둬서 설계가 `defineSecret`도 같을까 봐 프로브(P-1)를 요구했다.
**실측 결과 안 막는다** — 선언만 하고 값이 없어도 빌드 exit 0, 에뮬레이터 `All emulators ready`,
핸들러 5곳 전부 초기화, 프롬프트 0건.

**How to apply:** 시크릿 슬롯을 새로 추가할 때 `process.env` 직접 읽기로 강등할 필요가 없다.
`defineSecret` + 핸들러 `secrets:` 스프레드로 그냥 가면 된다.

## 2. ⚠️⚠️ 새 워크트리에 `functions/.env`가 없으면 **엉뚱한 프롬프트가 P-1을 가린다**
첫 P-1 실행이 `Enter a string value for LLM_PROVIDER:` 에서 멈췄다. 순간 *"새 시크릿이 기동을
막았다 = 강등표 2행"* 으로 오판할 뻔했는데, 그건 **`.env`가 없어서 기존 `defineString` 4개가
물어본 것**이고 내 프로브와 무관했다(메인 트리엔 `.env`가 있어서 안 드러난다).

**처방:** 워크트리에서 에뮬레이터를 띄우기 전에 `cp functions/.env.example functions/.env`.
플레이스홀더(`YOUR_`) 값이라 `readSecret`이 전부 ""로 보고 미설정 취급하므로 **프로브 조건은
그대로 유지된다**. 검증이 끝나면 지운다(gitignored지만 트리를 원상복구).
관련: [[codegate-t108-ast-source-scan]](워크트리 `.env` 부재 build 실패 판별).

## 3. ⭐⭐ "호출 2회" 단언은 "같은 키로 두 번"을 **못 잡는다** — A/B로 실측 확인
설계(§37.6 ①)가 *"ⓐ(fetch 2회)만으로는 부족하니 ⓒ(헤더가 다르다)를 넣어라, 없으면 반려"* 라고
적었다. 그 주장을 A/B 프로브로 검증했다: 순환기가 항상 `slots[0]`을 쓰도록 조작하니
**588 pass / 1 fail** — 실패한 건 ⓒ 하나뿐이고 **`fetch`는 여전히 2회**였다.
즉 ⓐ만 있었으면 **거짓 통과**였다. 설계가 옳았고, 그 옳음을 숫자로 남겼다.

**How to apply:** "재시도했다/전환했다"류를 **호출 횟수**로만 단언하지 마라. *무엇이 달라졌는지*
(헤더·인자·대상)를 함께 비교해야 한다. 값 자체가 비밀이면 **`!==` 결과만** 단언하면 된다.

## 4. 누출 검증 하네스에는 **대조군**을 넣어라 (빈 캡처 거짓 통과)
`assert.equal(serialized.split(SENTINEL).length - 1, 0)` 은 **캡처가 비어 있어도 통과**한다.
그래서 같은 직렬화 문자열에 `assert.ok(serialized.includes("GEMINI_API_KEY"))`(슬롯 *이름*은
반드시 로그에 남는다)를 함께 넣어 "하네스가 페이로드를 실제로 보고 있다"를 못박았다.
관련: [[false-reassurance-over-precision]].

## 5. 설계 문서 **내부** 긴장 2건을 어떻게 풀었나
- §37.4가 *"로그 필드는 5개, 그 밖의 것을 넣지 말 것"* 인데 §37.2 3·6행이 `quotaId` 원문과
  `message` 앞 200자를 **명시적으로 요구**한다 → §37.2("유일한 정본" 선언)를 우선하되,
  §37.4의 금지 취지가 **키 값**임을 근거로 두 필드를 추가하고 PR 본문에 판단 근거를 적었다.
- §37.5 (2)는 `getGeminiApiKeys(): string[]`인데 §37.4 ⓑ는 로그에 **슬롯 이름**을 요구한다
  → `{ slot, key }[]`로 넓혔다(이름 없이는 ⓑ가 불가능).
**두 건 다 임의로 고르지 않고 PR "판단이 필요한 지점"에 적어 reviewer가 뒤집을 수 있게 뒀다.**

## 6. 판정 대상이 "산문"이냐 "직렬화된 구조체"냐를 구분하는 선례가 생겼다
이 저장소는 T98에서 **에러 메시지 문자열 매칭**에 크게 데여 `geminiClient.ts:74`에 금지를
적어 뒀다. T132는 `JSON.parse(error.message)`를 하는데도 그 금지와 충돌하지 않는다 —
T98이 매칭한 건 **모델이 쓴 산문**이고 여기서 읽는 건 **SDK가 `JSON.stringify(errorBody)`로
직렬화한 구조화 문서**(vendor `index.cjs`의 `ApiError` 생성 지점에서 확인)라, 문자열은 전송
형식일 뿐 판정 대상은 **필드**다. 관련: [[codegate-t98-thinking-regression]] §2.
