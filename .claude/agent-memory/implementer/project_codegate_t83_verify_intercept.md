---
name: codegate-t83-verify-intercept
description: T83 확인 시도 무력화 — 설계가 규율하지 않은 자리(G31 재연결 우선순위) 판정, 격리 포트도 이미 점유돼 있던 사례, resolveAnchor 1-base↔판정 앵커 0-base 재사용 트릭, 금지어 소스 테스트가 자기 주석에 걸린 함정
metadata:
  type: project
---

T83(확인 시도 무력화, 브랜치 `feat/T83-verify-intercept`, 2026-07-26)에서 다음 회차에 재사용할 판단·함정.

**1. 설계 표에 없는 충돌은 구현자가 판정하고 근거를 남긴다.**
§16.6 G31은 *"문자 announce ↔ 확인 announce"* 충돌만 규율했는데, 실제로는 **재연결 대사 ↔ 문자 announce** 충돌이 하나 더 있었다(둘 다 폴백의 단일 `turnInstruction` 슬롯을 쓴다).
**Why:** 확인 announce는 `announcedAt` 부재가 곧 큐라 미뤄도 살아남지만, 재연결 대사는 `reconnectAnchorScammerTurn`이 이미 서버에 기록돼 **그 턴 하나에만** 자리가 있다(리포트 판정 앵커가 그 대사를 가리킨다). 문자를 미루면 문서는 그대로 도착해 열화에 그치고, 재연결을 미루면 AC-071 재현이 그 세션에서 무너진다.
**How to apply:** 판정표를 순수 함수 한 곳(`functions/src/verifyIntercept/fallbackTurn.ts`)에 넣고 주석에 "왜 이 순위인가"를 표로 남긴 뒤, 완료 보고에 **설계가 규율하지 않은 자리**임을 명시했다. 다음에도 같은 형태로 — 조용히 정하지 말고 표+근거+보고.

**2. "격리 포트"도 이미 점유돼 있을 수 있다(멀티 에이전트 워크트리).**
`firebase.t89.json` 선례대로 9499/5501/8580을 잡았더니 **셋 다 다른 세션이 이미 쓰고 있었다**(기본 9099/5001/8080은 물론). 9799/5801/8880 + hub 4700 / logging 4800으로 옮겨 성공.
**How to apply:** 설정 파일 쓰기 **전에** `netstat -ano | grep LISTENING | grep -E ":(포트|…)"` 로 후보를 먼저 확인하고, `hub`·`logging` 포트까지 명시하라(미지정 시 4400/4500 충돌 경고가 뜬다). 검증이 끝나면 임시 `firebase.tNN.json`은 **커밋하지 않고 삭제**한다(t89 선례도 커밋된 적 없음 — `git log --all --name-only`로 확인).

**3. 같은 리졸버를 1-base/0-base 양쪽에 쓰는 트릭.**
`report/smsTimeline.ts`의 `resolveAnchor(N)`은 "N번째 사기범 메시지"(1-base)를 돌려주는데, 판정 앵커는 `scammers[N]`(0-base, N=문서 수)이 필요했다. **`resolveAnchor(N + 1)`이 정확히 같은 메시지**라서 리졸버를 복제하지 않고 공유했고(ADR-0009 follow-up 2), 미해결(=재연결 대사 없음)이 `judgmentTurnIndex = null`로 자연스럽게 떨어졌다.
**How to apply:** 앵커류를 새로 만들 때 기존 리졸버의 base를 먼저 확인하고 오프셋으로 흡수할 수 있는지 보라 — 복제는 마지막 수단.

**4. 소스 텍스트 금지어 테스트는 주석을 먼저 걷어내야 한다.**
`VerifyCallOverlay.tsx`의 헤더 주석이 *"`tel:` 링크가 존재하지 않는다"*, *"'다른 기기로 걸기'를 두지 않는다"* 라고 **금지 대상을 인용**하고 있어서 내가 쓴 AC-019/D-48 검사가 내 파일에서 실패했다. `codeOnly()`(`//`·`*`·`/*` 시작 줄 제거) 헬퍼로 **렌더/실행되는 부분만** 검사하도록 고쳤다.
**How to apply:** 설계 근거 주석을 지우는 방향(테스트 통과용)으로 풀지 말 것 — 검사 범위를 좁히는 쪽이 맞다. 같은 함정이 카탈로그 콘텐츠 테스트에서도 났다("…라고 말하지 마라"는 **금지 지시**가 구조 설명 금지어에 걸림 → "등장하되 반드시 금지형이어야 한다"로 규칙을 바꿨다).

**5. 범위 밖으로 남긴 것(보고함).** OQ-41의 *"확인 가로채기 전용 시나리오 1종 신설"* 은 §16이 설계하지 않았고 축 태깅(`axes.ts` 13종 `deepEqual` 게이트)·`publicMeta`↔`src/content` 미러가 planner/architect 소관이라 **미착수**로 명시 보고했다. 지시받은 범위(§16 구현)만 했다.

관련: [[codegate-t82-axis-model]](tacticCategory `verification_block` 규칙은 T82가 이미 확장해 뒀다 — T83은 건드리지 않고 확인만), [[feedback-emulator-script-sdk-split]], [[feedback-background-emulator-task-tracking]].
