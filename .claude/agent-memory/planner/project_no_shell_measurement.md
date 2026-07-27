---
name: no-shell-measurement
description: planner에 Bash가 없을 때 base 커밋·러너 제약을 파일 실측으로 대체하는 방법과, 그 사실을 문서에 반드시 명시하는 규칙
metadata:
  type: project
---

planner 에이전트에는 셸이 없을 때가 있다(도구 목록에 Bash 부재). `git log`를 요구받아도 실행할 수 없으므로 **파일 실측으로 대체하고, 대체했다는 사실을 문서와 보고 양쪽에 적는다.**

대체 경로(이 저장소에서 실제로 쓴 것):
- **base main 커밋** → main 체크아웃의 `.git/logs/refs/heads/main` **마지막 줄의 두 번째 해시**. (워크트리가 아니라 main 체크아웃 쪽 경로를 읽을 것)
- **직전 최대 T 번호** → `docs/Tasks.md`를 `^\| T1[01][0-9] \|` 로 grep. **워크트리와 main 체크아웃 양쪽**에서 확인(브랜치별로 다를 수 있다).
- **테스트 러너 제약** → 루트 `package.json`의 `scripts.test` 원문과 `devDependencies`. 나열된 테스트 파일 확장자(.ts만인지 .tsx가 있는지)가 러너 능력의 강한 단서다.
- **에뮬레이터가 무엇을 로드하는가** → `functions/package.json`의 `main`·`serve`·`test` 스크립트와 `firebase.json`의 emulators 블록.

**Why:** 셸 없이 "추정"으로 적으면 CLAUDE.md 금지사항(추측을 사실처럼)에 걸리고, 반대로 "확인 불가"로 비워 두면 착수자가 낡은 값을 그대로 쓴다. 파일 실측은 근거를 남기면서 둘 다 피한다.

**How to apply:** 실측한 값에는 **읽은 파일 경로와 줄**을, 실측하지 못한 값에는 **"추정" 표시 + 확인 절차**를 붙인다. 커밋 해시·테스트 수 같은 값은 어차피 곧 낡으므로 문서에는 항상 **"착수 시 재측정"** 을 함께 못박는다. 관련: [[project_baseline_correction]], [[project_ac_verifiability]]
