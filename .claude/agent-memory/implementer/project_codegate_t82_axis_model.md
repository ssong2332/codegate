---
name: codegate-t82-axis-model
description: T82 수법 축(A~E) 데이터 모델·커버리지 구현에서 나온 비자명한 판단 — 정본 표가 콘텐츠보다 좁은 3건, 미지정 카테고리 판정, 도메인 순회 강제 장치
metadata:
  type: project
---

T82(2026-07-26)에서 `functions/src/scenarios/axes.ts` + `axisCoverage.ts` + `axisCoverageReport.ts`를
Architecture.md §15.10 확정안대로 구현했다. 코드에서 읽히지 않는 맥락만 남긴다.

**정본 표(PRD v1.6 → §15.10.7)가 콘텐츠보다 좁다 — 실측 3건.** 축 좌표는 시나리오의 *주된* 수법만
적은 것이지 망라가 아니다. `tax-refund-scam`은 weakenedTactics에 이미 "앱 설치 지시"를 갖고 있는데
E열은 E2뿐이라 **E3=0건이 "정말 없다"는 뜻이 아니다**. `courier-customs-scam`은 "확인 절차 차단"이
있는데 D열이 `D0_none`이고, "전화 끊음 저지"(D5 계열)를 가진 시나리오 다수가 D5 태깅이 없다.
**Why:** 좌표를 임의로 고치면 커버리지 산출이 곧바로 거짓이 되고, 콘텐츠 저작은 T83~T85 소관이다.
**How to apply:** T83~T85·T88이 커버리지 공백을 근거로 콘텐츠를 저작할 때 이 3건을 먼저 확인할 것 —
특히 E3는 "새로 만들어야 하는 것"이 아니라 "이미 있는 것을 좌표에 반영할지"의 문제일 수 있다.

**문서가 지정하지 않은 판정 1건.** docs/Tasks.md 드리프트 표는 `절차·서류 정당화`를 "축 D4 계열"이라고만
적고 목적지 `tacticCategory`를 지정하지 않았다. `authority`로 판정했다 — 이미 그 행에 있는 형제 라벨
"권위·정당성 포장"(loanScam)과 같은 학습 묶음("공식처럼 보여서 넘어갔다")이기 때문. 나머지 3건은 표가
목적지를 명시했다.

**강제 장치가 실제로 3겹이었다.** 설계는 2겹(타입 + `deepEqual` 키 게이트)이라고 했는데, 시나리오 행을
빼는 실험에서 `tsc`가 **TS6133(사용하지 않는 ID 상수 import)** 로 먼저 막았다. `SCENARIO_AXES`의 키를
문자열 리터럴이 아니라 `publicMeta`의 `*_SCENARIO_ID` 상수로 쓴 덕이다 — 그 선택을 유지할 것.

**테스트 작성 시 밟은 함정.** "축 열거형에 `other` 폴백이 없다"를 `/other|unknown|etc/i` 정규식으로
검사하면 **`B6_unknown_threatener`가 걸린다.** 접두사 뒤 의미부의 **완전 일치** 블록리스트로 검사해야
하고, `D0_none`은 폴백이 아니라 sentinel이라 "none"을 블록리스트에 넣으면 안 된다.

관련: [[codegate-t52-report-accuracy-fix]](같은 `CATEGORY_RULES`를 건드린다) ·
[[codegate-t9-report-generation]]
