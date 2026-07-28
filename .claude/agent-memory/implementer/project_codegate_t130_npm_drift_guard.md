---
name: codegate-t130-npm-drift-guard
description: T130 npm file: 오염 트립와이어 — 원인은 `npm --prefix` 형태(H1 확정), 훅 블록 순서 함정, postinstall이 --prefix에서 안 도는 사각, 병합 전 훅 테스트 레시피
metadata:
  type: project
---

**T130**(PR #152, base `31c6037`) — `.githooks/pre-commit` 블록 + `postinstall` 트립와이어. 아래는 코드를 읽어도 안 나오는 것만.

## ⭐ 원인은 "간헐"이 아니라 명령 형태였다 (H1 확정 / H2·H3 기각)

`npm --prefix functions install` **3/3 오염**, `cd functions && npm install` **0/3**, 루트 `npm install` **0/3**.
저장소 **바깥** 워크트리에서도 오염 ⇒ 조상 패키지 가설(H2) 기각. 잔존 심볼릭 링크가 있어도 form B는 깨끗 ⇒ H3 기각.

**Why:** 여러 에이전트가 *"항상 나지도 안 나지도 않는다"* 로 기록해 간헐 결함으로 굳어져 있었다. 실제로는 **각자 친 명령이 달랐다.**
**How to apply:** "간헐적"이라는 선행 기록을 만나면 **분모를 만들기 전에 믿지 말 것.** 조건을 하나씩 고정해 3회씩 돌리면 결정적 종속이 드러나는 경우가 있다. `npm --prefix X test`·`run build`는 **오염시키지 않는다** — `install` 형태만이다.

## ⛔ 훅에 블록을 얹을 때 — 앞에 둘지 뒤에 둘지가 기능이다

`.githooks/pre-commit`의 T100 블록 **첫 줄**이 `git symbolic-ref --short -q HEAD || exit 0`(detached HEAD 통과)이다.
⇒ **뒤에 얹은 블록은 detached HEAD에서 한 번도 실행되지 않는다.** 이 저장소는 워크트리를 `git worktree add --detach`로 만드는 일이 잦아 사각이 컸다.

**Why:** 처음에 뒤에 얹었고, 게이트 전건 초록인데 P-4에서 **오염 커밋이 그대로 통과**해 발견했다. 순서만 앞으로 옮겨 해소(T100 내용 무변경).
**How to apply:** 기존 훅에 검사를 추가할 때 **앞선 블록의 조기 `exit 0` 경로를 먼저 grep**하라. 그리고 훅 검증은 **반드시 detached HEAD에서도** 한 번 돌려라 — 브랜치 위에서만 통과 확인하면 이 사각을 못 본다.

## ⭐ postinstall은 `npm --prefix <dir> install` 에서 아예 실행되지 않는다

3/3 회 로그에 `postinstall` 줄이 **0건**(`node_modules` 삭제 후 완전 신규 설치에서도 동일). 루트 `npm install`·`cd functions && npm install`에서는 정상 실행.
⇒ **하필 오염을 만드는 그 명령 형태를 postinstall 장치가 못 잡는다.** 그 경로를 잡는 건 pre-commit뿐.

**How to apply:** `postinstall` 기반 장치를 설계하면 *"어떤 install 형태에서 실제로 도는지"* 를 **로그의 배너 줄로 실측**하라. 도는 것을 전제하지 말 것. 관련: [[unobservable-behavior-gates]].

부작용 1건: `postinstall`을 추가하면 npm이 lockfile `packages[""]`에 **`"hasInstallScript": true`** 를 기록한다. **이 락 갱신을 같이 커밋하지 않으면 이후 모든 `npm install`이 락을 더럽힌다**(없애려던 잡음을 새로 만든다).

## 병합 전에는 워크트리에서 새 훅을 태울 수 없다 — 테스트 레시피

`core.hooksPath`가 **절대 경로 `C:\codegate\.githooks`** 다(상대 아님). 모든 워크트리가 **본체 체크아웃의 훅 파일**을 실행한다 ⇒ 브랜치에만 있는 훅은 병합 전 자동으로 안 걸린다.
- 검증은 **`git -c core.hooksPath=<이 워크트리>/.githooks commit ...`** 로 1회성 오버라이드 (공유 `.git/config`를 건드리지 않는다 — 동시 실행 중인 다른 에이전트를 깨뜨리지 않는 유일한 방법).
- ⚠️ `docs/GitWorkflow.md:42`는 이것을 *"상대 경로라 워크트리마다 따로 해석된다"* 로 적고 있어 **문서와 실제가 다르다**(User 소유라 미수정, 인계).
- ⚠️ 종료코드를 `git commit ... | sed` 로 파이프하면 `$?`가 **sed의 것**이 된다 — 훅 거부를 통과로 오독했다. 로그는 **파일로 리다이렉트**하고 `$?`를 바로 잡아라.

## 자잘한 함정

- Bash 도구에서 홈 경로(`C:\Users\박수홍`)를 `~`/`$HOME`으로 쓰면 **한글이 깨져 파일을 못 찾는다.** `node -e "os.homedir()"` 로 우회했다.
- 워크트리를 스크래치패드(한글 경로) 아래 만들면 `git worktree remove`가 `Filename too long`으로 실패한다(등록은 해제됨). 프로브 워크트리는 **ASCII 경로**(`C:/codegate/.claude/worktrees/t130-p4`)에 만드는 편이 낫다.
- 매니페스트를 되돌려도 `functions/node_modules/fraud-vaccine-web` → 워크트리 루트 **심볼릭 링크는 남는다**(§36.7 (f) 실측 확인).
