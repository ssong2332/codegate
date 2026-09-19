---
name: project_codegate_s66_abuse_hardening
description: §66 결함 5건(sendMessage/createSession 상한, consentChallenge 형제슬롯, D-6 부정필터, updateMessengerSkin enum검증, 자유텍스트 길이상한) 구현 — PR #247
metadata:
  type: project
---

## 무엇을 했나
`docs/Architecture.md` §66(architect 확정)의 커밋 ①~③ + 선례 기반 단순수정 ④~⑤를 한 PR(#247, 브랜치 `fix/S66-abuse-hardening`)에 5개 커밋으로 나눠 구현했다. `docs/Tasks.md`에 담당 행이 없어 전 커밋 `Refs: (미등재 — planner 인계)`로 남겼다.

- ① `SEND_MESSAGE_MAX_LENGTH=1000`(sendMessage 거절, rewind500<이 값<전사2000) + `session/rateLimit.ts`(신규 순수함수, 10분/6회 롤링 윈도우, createSession 게이트는 동의 뒤·`generateOpeningLine` 앞).
- ② `consentChallenge`의 거절·재개 경로가 판정 전에 `generateOpeningLine`을 태우던 형제슬롯 버그 — `decideConsentGate`/`findExperienceSession` 재사용한 사전 게이트(OQ-A81, 신규 필드 0).
- ③ D-6 `emptyPromiseMetric.ts` — 매치 후 주변창(뒤20자·앞6자, 절경계 컷) 부정문맥 배제 계층(`isNegatedPromiseMatch`/`hasSurvivingMatch`) 추가, §65.3 패턴 원문 무변경, `negatedPromiseTurns` 필드 신설(시기 판별자).
- ④ `updateMessengerSkin` — `verifyIntercept/index.ts`의 `readOfferStage`/`readTrigger` 패턴을 그대로 복제해 `readMessengerSkin`/`readSkinSource` enum 검증 추가.
- ⑤ `createChallenge.displayName`(50자)·`reportChallenge.note`(500자, `REWIND_ANSWER_MAX_LENGTH` 선례) 길이 상한.

## 함정 — 자기참조 grep이 소스 주석에 먼저 걸림(재발, 신규 변형)
G410 소스스캔 테스트에서 `indexOf("generateOpeningLine(")`가 실제 호출부(`await generateOpeningLine(`)보다 **먼저 나오는 시크릿 선언 주석**(`session/index.ts:55` "generateOpeningLine()이 getLlmClient()를…")에 걸려 순서 판정이 뒤집혔다. `.` 열기 전 함수명만으로 찾지 말고, 실제 호출 구문(`await xxx(`)까지 좁혀야 한다 — [[feedback_false_reassurance_over_precision]]·T174의 "자기 설명 주석에 걸리는 함정"과 같은 계열이지만 이번엔 코드 순서(ordering) 판정이라는 새 변형이다. 두 테스트 파일(`createSessionRateLimitOrdering.test.ts`·`consentChallengePreGate.test.ts`)에 동일 주의 주석을 남겼다.

## 판단 근거를 남긴 것들
- 커밋 ④·⑤는 값 선택을 implementer가 했다(지시문이 허용) — enum 값은 `shared/types.ts`의 `MessengerSkin`/`MessengerSkinSource` 그대로, 길이값은 50(표시용)/500(rewind 선례와 동형인 자유서술).
- G405~G407(기존 T174 게이트)이 커밋 ③ 이후에도 무회귀임을 별도 회귀 테스트(`#10~#12는 여전히 emptyPromise===true`)로 재확인 — 단순히 "안 건드렸으니 안전하다"고 주장하지 않았다.

## 격리 워크트리
`.claude/worktrees/S66-abuse-hardening`(브랜치 `fix/S66-abuse-hardening`)를 새로 만들어 `cd functions && npm install`(⛔ `--prefix` 금지, T130). 기준선 775 pass/0 fail → 최종 843 pass/0 fail(+68). 커밋·push·PR(#247) 후 `git worktree remove`로 정리, main 워크트리는 시종 미접촉.

## 관련
- [[feedback_unobservable_behavior_gates]] — onCall 핸들러(`sendMessage`/`createSession`/`consentChallenge`/`updateMessengerSkin`/`createChallenge`/`reportChallenge`) 전부 "직접 실행 불가 → 소스스캔+경계값 재현" 이중 증명 패턴 재사용.
- [[project_codegate_t174_empty_promise_metric]] — D-6 원 구현. 이번 §66은 그 위에 부정필터 1층만 얹었다(패턴 원문 무변경).
