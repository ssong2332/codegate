---
name: codegate-t110-warm-transfer
description: T110 호 전환 구현 — 지시가 요구한 A1이 금지된 파일에 있던 범위 충돌, 합집합 게이트(G85) 설계, codeOnly()가 JSX 주석을 못 걷는 함정
metadata:
  type: project
---

T110(통화→통화를 호 전환으로) 구현에서 얻은 것. 브랜치 `fix/T110-warm-transfer`, 커밋 `d334113`.

**1. 착수 지시 자체가 모순일 수 있다 — 실측해서 보고하고 멈춰라.**
지시는 "§22.1 층 A 4행 전부 구현"과 "`promptAssembly.ts`는 T109가 잡고 있으니 절대 건드리지 마라"를
동시에 요구했는데, **A1이 바로 그 파일 안에 있었다**(`promptAssembly.ts:85-88` `VERIFY_INTERCEPT_RULE`).
**Why:** 문서 우선순위로 풀리는 종류의 충돌이 아니다(같은 메시지 안의 내부 모순).
**How to apply:** ① 나머지 전부를 먼저 구현한다(어떤 결론이 나와도 재작업 0). ② 충돌 부분만
미반영으로 남기고 Status를 `review`가 아니라 `in-progress`로 둔다. ③ 판단 재료를 실측해 보고한다 —
여기서는 `git diff main...fix/T109-... -- <file>`로 **T109의 훅이 :53-83이고 A1은 :85-88이라
머지 충돌조차 없다**는 것까지 재 봤다. 승인이 오면 4줄 추가로 끝난다.

**2. "각각은 멀쩡한데 공존해서" 생긴 결함은 합집합 게이트로만 잡힌다.**
개별 필드 검사(G83 announce / G84 reconnect)는 오염이 **상시 블록**에 있으면 통과한다. 그래서
G85는 `[상시 블록, announce, reconnect]`를 join해서 본다. **역검증 테스트가 같은 출력 안에서
"개별 검사는 ok, 합집합만 fail"을 보여 주는 형태**로 짰다(`verifyIntercept.test.ts` G85 ⭐역검증).
**Why:** 이 저장소는 죽은 정규식으로 T86에서 데였고, 역검증 없는 게이트는 완료로 인정되지 않는다.
**How to apply:** 모듈 지역 상수라 import가 안 되면 **조립 산출물에서 잘라 쓴다**
(`buildSystemPrompt` 출력에서 `[확인 안내 …]` 블록 추출) — 소스 리터럴보다 오히려 정확하고,
금지된 파일을 읽기만 하므로 범위도 지킨다.

**3. `codeOnly()`(주석 제거 헬퍼)는 `//`·`*`만 걷어내고 JSX 주석 `{/* … */}`은 못 걷는다.**
그래서 JSX 주석에 금지 단어("번호")를 쓰면 자기 게이트에 자기가 걸린다(T83 계열에서 반복되는 함정).
**How to apply:** 근거 서술은 **파일 서두 `//` 주석**에 몰고, JSX 주석에는 금지 단어를 쓰지 않는다.
헬퍼를 고쳐 JSX 주석까지 걷어내고 싶어질 텐데, 그건 공유 헬퍼라 다른 테스트의 검출력을 건드린다 —
범위 밖이다.

**4. 필드를 지우면 컴파일이 대신 잡아 주는 자리가 있다.**
`harmlessnessGate.test.ts`의 `Record<keyof VerifyInterceptItem, FieldPolicy>` 맵은 필드를 지우면
초과 프로퍼티로 컴파일이 깨진다 = "필드는 사라졌는데 정책 표만 남는" 드리프트가 타입으로 차단된다.
같은 파일의 **표면 수 단언**(`항목 수 × 5`)도 함께 깨지니 숫자를 줄이고 **왜 약화가 아닌지**를
주석에 남길 것(대체 게이트 이름을 적는 것이 이 저장소 관례다).

**5. 새 워크트리는 `node_modules`도 `.env`도 없다.** 루트/`functions` 각각 `npm install`,
`.env`는 `C:\codegate\.env`(gitignored)를 복사해야 `npm run build`가 통과한다. 안 그러면
`auth/invalid-api-key`로 죽는데 이건 내 변경 탓이 아니다. 참고: [[codegate-firebase-build-blocker]]

**6. 보고 금지 문장이 설계에 명시돼 있었다.** §22.8 (1)이 *"이제 화자가 겹치지 않는다"* 보고를
금지한다 — 서버가 보증하는 것은 문자열 집합까지이고 실제 발화는 라이브 확인 소관이다.
관련: [[codegate-t83-verify-intercept]] · [[codegate-t95-verify-scenario]] · [[codegate-t101-clean-lib]]
