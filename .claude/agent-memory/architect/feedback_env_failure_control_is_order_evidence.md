---
name: env-failure-control-is-order-evidence
description: 대조군이 환경 결여로 INTERNAL을 내면 결함이 아니라 "게이트가 그 I/O보다 앞"의 실행 증거다; "비X = invalid-argument" 같은 대조군 기대값은 핸들러별로 표를 만들어라
metadata:
  type: feedback
---

대조군(게이트를 통과하는 호출자)이 환경 결여(예: Firestore 에뮬레이터 없음)로 `INTERNAL`을 내는데 처치군(게이트에 걸리는 호출자)은 같은 환경에서 게이트 코드를 받았다면, 그 자체가 "게이트가 해당 I/O보다 앞에 있다"는 **실행 증거**다. 결함으로 보고하지 말고 순서 증거로 기록한다.

**Why:** T176 EM-4(2026-10-01)에서 QA가 비익명 대조군 `listMyChallenges` → `INTERNAL`을 관찰했다. 이 핸들러는 인자 검증이 없어 게이트 바로 뒤가 Firestore 쿼리였다. 익명은 같은 환경에서 `permission-denied`를 받았으므로 G419("거부가 read보다 앞")를 실행으로 보인 셈이다. 설계 문서에는 "게이트 없으면 invalid-argument"라고 6개를 한꺼번에 적어 두었는데, 실제로 참인 것은 5/6뿐이었다.

**How to apply:** 빈 요청 프로브의 대조군 기대값을 쓸 때는 대상 핸들러마다 "게이트 바로 다음 줄이 무엇인가(인자 검증 / I/O / 무검증 성공)"를 파일:줄로 표로 만든다. 한 문장으로 일괄 서술하지 않는다. [[poison-sample-must-dodge-existing-gates]] [[negative-test-flips-the-method]]
