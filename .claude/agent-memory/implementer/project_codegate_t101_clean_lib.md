---
name: codegate-t101-clean-lib
description: T101 functions/lib 스테일 산출물 차단 — A/B probe 절차의 함정(main 체크아웃 충돌·출력 리다이렉트 차단·타이밍 노이즈)과 clean 기준선 462
metadata:
  type: project
---

`functions/lib`는 `.gitignore` 대상이라 브랜치를 전환해도 남는다 → 이전 브랜치의 `.test.js`가 다음 브랜치 테스트에 섞인다. 수정: `functions/scripts/clean-lib.mjs`(Node `fs.rmSync`)를 `test`·`build` **본문 안**에 인라인(훅 아님).

**Why:** 이 저장소는 테스트 수치를 병합 게이트 근거로 쓰는데, 그 수치가 실제로 2건 오보고됐다(+10). `pretest` 훅은 `--ignore-scripts`로 건너뛰어져 같은 실패를 반복한다.

**How to apply:**
- **main clean 기준선(main `8902363`) = functions 462.** 이보다 큰 수가 나오면 오염을 의심하고 `npm --prefix functions run clean` 후 재측정하라. (수정 후에는 `npm test`가 알아서 clean한다.)
- **A/B probe 절차의 함정 4건**(다음에 비슷한 툴체인 실험을 할 때 그대로 재발한다):
  1. `git switch main`이 **불가능**하다 — main은 `C:\codegate` 기본 워크트리에 체크아웃돼 있다. `git switch --detach <main SHA>`로 대체하라(동등).
  2. 워크트리 격리 가드가 **worktree 밖 경로로의 출력 리다이렉트를 거부**한다. 로그는 워크트리 안 `*.log`(루트 `.gitignore`가 `*.log`를 무시)로 쓰면 git status도 안 더럽힌다. 다만 `cd <worktree>/functions && npm test > "<worktree 절대경로>/x.log"` 형태로 **절대경로 1개**만 써야 통과한다(`../x.log`는 거부됨).
  3. probe 파일은 반드시 **커밋**해야 한다 — untracked면 `git switch`가 들고 넘어가 실험이 무효가 된다. 배치는 `functions/src/scenarios/` **밖**(harmlessnessGate 파일목록 단언에 걸린다).
  4. `npm test` 소요 시간 비교는 **이 머신에서 무의미하다** — 동시 실행 에이전트가 많아 같은 커밋 2회 측정이 22.5s/36.5s로 흔들렸다. clean(rmSync) 비용은 노이즈에 묻힌다.
- 삭제 스크립트의 가드(basename==`lib` && 부모에 `package.json`)는 스크립트를 다른 디렉터리에 복사해 실행하면 exit 1로 실증할 수 있다.

관련: [[codegate-context]]
