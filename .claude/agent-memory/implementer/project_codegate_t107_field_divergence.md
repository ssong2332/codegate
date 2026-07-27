---
name: codegate-t107-field-divergence
description: T107 필드 단위 수렴 검출 — 새 워크트리 npm install이 functions/package.json을 몰래 고치는 함정, t.diagnostic으로 "증거를 출력에 남기는" 기법, 제외 규칙이 오늘은 공회전이라는 사실을 테스트에 못박은 판단
metadata:
  type: project
---

T107(AC-079 — 랜딩 필드별 쌍별 수렴 금지)에서 얻은, 코드만 읽어서는 안 나오는 것들.

## 1. ⚠️ 새 워크트리에서 `npm --prefix functions install` 이 `functions/package.json`을 고친다
node_modules가 없는 워크트리에서 그대로 돌렸더니 `dependencies`에
`"fraud-vaccine-web": "file:.."` 한 줄과 lock의 `".."` 블록 28줄이 **추가됐다**.
`functions/src` 어디도 이 패키지를 import하지 않는다(grep 0건) — 순수 npm 부작용이다.

**Why:** 이 저장소는 "요청받지 않은 수정 금지"가 최상위 규칙이라, 커밋 직전에
`git status`를 안 봤으면 무관한 매니페스트 변경 2건이 태스크 커밋에 섞여 들어갔다.

**How to apply:** 새 워크트리에서 install을 돌렸으면 **커밋 전에 반드시
`git status --short`로 package.json/package-lock.json을 확인하고 `git checkout --` 로 되돌려라.**
되돌려도 node_modules는 남으므로 테스트는 그대로 통과한다(실측: 되돌린 뒤 465 pass 유지).

## 2. 완료 증거가 "실행 출력"일 때 — `t.diagnostic()`을 쓴다
node:test는 통과 시 단언 메시지를 안 찍는다. 그래서 *"오염 샘플에서 기존 단언은 통과하고
신규 단언만 실패한다"* 같은 **수치 증거**는 통과 테스트만으로는 출력에 안 남는다.
`test("...", (t) => { t.diagnostic(\`...\`) })` 로 찍으면 TAP 출력에 `# ...` 줄로 남아
reviewer·QA가 재현 없이 판정할 수 있다. 이 저장소 기존 테스트는 이 기법을 안 쓰고 있었다 —
**증거가 완료 조건인 태스크에서만** 쓰고, 일반 단언을 로그로 대체하지는 마라.

## 3. "오염은 테스트 코드 안에서만" 관례의 구체형
실제 카탈로그(`MOCK_SCREENS`)를 고쳤다 되돌리는 대신, `items.map(item => ({...item, <4필드만 범용>}))`
로 **헤드라인·CTA는 실제 값 그대로 둔 사본**을 만든다. 이게 *"두 단언 사이가 비어 있다"* 를
증명하는 유일한 형태다(헤드라인을 건드리면 기존 단언이 잡아 버려 증명이 성립하지 않는다).
근거 관례: `src/lib/incallsms/callContinuity.test.ts:161-162`.

## 4. 제외 규칙이 **오늘은 아무 쌍도 제외하지 않는다**는 사실을 단언으로 못박았다
`app-install`이 `subsidy-install` 1종뿐이라 "양쪽 다 부재" 쌍은 현재 **0쌍**이다.
즉 AC-079 (b) 제외 규칙은 현행 카탈로그에서 **공회전**한다. 이를 숨기지 않고
`assert.deepEqual(realStats.map(s => s.excluded), [0,0,0,0])` 로 적어 두면,
app-install이 2종째 들어오는 순간 이 값이 변해 다음 사람이 규칙의 존재를 알게 된다.
규칙 자체의 동작 증명은 **app-install 픽스처 2개**로 따로 보였다(규칙 끄면 오탐 2건).

**Why:** 이 저장소는 "좁힌 조건의 공회전 방지"를 T104에서 이미 G-E로 게이트화했다 —
같은 함정을 신규 게이트가 반복하지 않게 하는 것이 관례다.
