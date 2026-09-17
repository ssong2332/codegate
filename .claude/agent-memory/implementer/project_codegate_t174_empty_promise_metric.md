---
name: project_codegate_t174_empty_promise_metric
description: T174 §65 D-6 "빈 약속" 사후 지표 구현 — 자기지시 grep 함정 재발, 호출부 스텁 테스트로 관측 불가 지점 우회, 순수 구현에서도 게이트는 implementer 몫
metadata:
  type: project
---

## 무엇을 했나
architect가 §65.9(Architecture.md)에서 이미 확정한 D-6 "빈 약속" 사후 지표를 순수 구현했다(PR #243, 브랜치 `feat/T174-empty-promise-metric`).
- 신규 `functions/src/report/emptyPromiseMetric.ts` — 순수 함수 `computeEmptyPromiseMetric()`(C1~C4 4조건, §65.2 정본 정규식 바이트 그대로).
- 수정 `functions/src/report/generateReportCore.ts` — `await reportRef.set(reportDoc)` **바로 뒤**에 `updateDefenseGrade`와 동형인 비차단 try/catch 1블록 + import 2줄. `:1-303` 무변경.
- 신규 테스트 `emptyPromiseMetric.test.ts` — G405(양방향 역검증)·G406(적용범위+무로그)·G407(스캔제외+순수성) 12개.

## 함정 1 — 금지어 grep이 자기 설명 주석에 걸림(선례 재발)
G407 "이 모듈이 firebase-admin/-functions를 import하지 않는다"를 `assert.doesNotMatch(src, /firebase-admin|firebase-functions/)`로 짰더니, 소스 파일 **최상단 주석**(`⛔ 순수 함수다 — firebase-admin·firebase-functions import 금지`)이 그 자체로 걸려 실패했다. [[feedback_false_reassurance_over_precision]]류 함정과 같은 계열이지만 이번엔 "거짓 OK"가 아니라 "참인데 자기 언급에 걸린 거짓 NG"였다.
**수정 2단**: ① 테스트 정규식을 `import ... from "firebase-..."` 실제 import 구문만 잡도록 `/from\s+["']firebase-(admin|functions)/`로 좁힘. ② 소스 파일 주석 자체에서도 "firebase" 리터럴 단어를 빼고 "서버 SDK·런타임 패키지(Admin/Functions)"로 바꿔 썼다 — 이유: 태스크 인계가 완료 증거로 **"emptyPromiseMetric.ts에 `firebase` 문자열 0건을 grep 출력으로"**를 명시했는데, import 없음 증명과 grep 0히트 증명은 다른 기준이라 둘 다 만족시켜야 했다.
→ **교훈**: 순수성 증명 요구가 "특정 리터럴 문자열 0건"으로 구체화돼 있으면, 소스 파일의 **설명 주석**에서도 그 리터럴을 피해야 한다 — "import만 없으면 된다"는 더 느슨한 기준으로 대체 판단하지 말 것.

## 함정 2 — "호출부 단언"을 관측 불가 지점에 걸지 않기
G406은 "`applicable===false`면 `logger.info`가 불리지 않는다"를 요구했는데, 실제 호출부(`generateReportCore.ts`)는 Firestore 세션 문서·서브컬렉션을 여러 개 read해야 실행되는 무거운 함수라 유닛 계층에서 직접 실행할 수 없다(이 디렉터리의 기존 판단 — `deliverVerifyOfferGateOrdering.test.ts` 등 여러 곳이 이미 이 이유로 "소스 스캔"을 쓴다). [[feedback_unobservable_behavior_gates]] 원칙대로 두 겹으로 닫았다:
① **순수 함수 레벨**: 호출부의 `if (emptyPromise.applicable) { log(...) }` 게이트를 스텁 로거로 그대로 재현해 호출 횟수를 단언(런타임 증거).
② **소스 스캔**: `generateReportCore.ts`를 `readFileSync`해 `if (emptyPromise.applicable) {\n  logger.info("[§65.5] ...")` 패턴이 실재하는지 정규식으로 고정(구조적 증거, `verifyIntercept/__tests__/deliverVerifyOfferLogInvariant.test.ts`와 같은 이 저장소 관례).
어느 한쪽만으로는 "런타임에 실제로 그 게이트를 쓰는지"와 "그 게이트가 소스에 실재하는지"를 둘 다 증명하지 못한다.

## 순수 구현에서도 implementer가 게이트를 설계해야 하는 부분
지시문은 "설계는 끝났다, 순수 구현이다"라고 했지만 §65.9/§65.10은 **함수 시그니처·계산 규칙·게이트 3개의 이름과 취지**만 고정했지 **테스트 코드 자체**는 architect가 작성하지 않았다(§65.9 끝: "신규 ③ ... §65.10의 G405~G407" — 이름만 지정). 즉 "무엇을 검증할지"는 고정됐지만 "어떻게 검증할지"(호출부를 못 건드리는 상황에서 어떤 대체 증거를 쓸지)는 여전히 implementer 판단이다. [[project_codegate_s64_d1_d2_verify_wording.md]]와 같은 계열의 패턴 — 재발.

## 격리 워크트리
`.claude/worktrees/T174-empty-promise-metric`을 새로 만들어 `cd functions && npm install`(⛔ `--prefix` 금지 — T130 규칙)로 설치, 기준선(763 pass/0 fail) 먼저 재측정 후 구현·재측정(775/0). 커밋·push 후 `git worktree remove`로 정리. main 워크트리는 시종 미접촉.

## 관련
- [[feedback_unobservable_behavior_gates]] — 관측 불가 지점에 동작 걸지 말 것(같은 교훈의 반복 적용).
- [[project_codegate_s64_d1_d2_verify_wording.md]] — "순수 구현"이어도 게이트 설계는 implementer 몫.
