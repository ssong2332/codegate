# Git Workflow — {{project-name}}

Owner: User. implementer follows; reviewer checks compliance.

## Prohibitions
- No direct commits to `main`.
- No force-push to shared branches.
- No `--no-verify` / hook skipping.
- No commit without a passing local test run.

## Hook Enforcement (T100)

위 "No direct commits to `main`"은 **6건 이상 위반됐다**(T15·T82·T83·T84·T85·T86 + 2026-07-26 세션 2건). 원인은 규칙의 부재가 아니라 **강제의 부재**였다 — 실측 결과 `.git/hooks/`는 14개 전부 `.sample`이고 `core.hooksPath`도 미설정이라, 이 문서의 금지는 한 번도 기계적으로 강제된 적이 없다.

### 설치 (clone당 1회, 필수)

```
git config core.hooksPath .githooks
```

`.git/` 아래는 버전 관리가 안 돼 새 clone에 전파되지 않으므로 훅을 `.githooks/`에 두고 `core.hooksPath`로 가리킨다. **이 설정은 clone마다 한 번 직접 해야 한다** — 저장소를 새로 받으면 훅이 자동으로 켜지지 않는다.

`core.hooksPath`는 `.git/config`에 저장되고 **모든 워크트리가 이 설정을 공유**한다(실측: 별도 워크트리에서 설정하니 공유 저장소에도 즉시 반영됨). 워크트리마다 다시 설정할 필요는 없다.

### 훅 목록

| 훅 | 거부 대상 |
|---|---|
| `.githooks/pre-commit` | `main`·`master`에서의 커밋 |
| `.githooks/pre-push` | `main`·`master`로의 직접 push, 해당 브랜치 삭제 |

### ⚠️ 한계 — 실측으로 확인한 것

| 실험 | 결과 |
|---|---|
| 정상 브랜치에서 커밋 | **통과** (exit 0) |
| `main`에서 커밋 | **거부** (exit 1) |
| `main`에서 `git commit --no-verify` | **통과해 버린다** (exit 0) |
| `.githooks/`가 없는 브랜치에서 `main` 커밋 | **거부되지 않는다** |

1. **`--no-verify`로 우회된다.** 로컬 훅은 실수 방지용이지 강제 수단이 아니다. 우회 불가능한 강제는 **GitHub 브랜치 보호 규칙(서버측)** 뿐이다 — 도입 시 이 절에 추가할 것.
2. **`core.hooksPath`가 상대 경로라 워크트리마다 따로 해석된다.** 체크아웃된 브랜치에 `.githooks/`가 없으면 훅이 존재하지 않아 강제되지 않는다. T100 병합 이후 main 기반 브랜치에서는 문제가 없지만, **병합 이전에 분기한 오래된 브랜치는 여전히 무방비다.**
3. 훅은 `detached HEAD`(rebase·bisect 중)를 통과시킨다 — 그 상태의 커밋은 어떤 브랜치에도 직접 얹히지 않기 때문이다.

## Worktree Hygiene (T100)

에이전트를 격리 워크트리로 띄우면 워크트리가 계속 쌓인다(2026-07-26 세션 기준 **24개**). `git worktree prune`은 **디렉터리가 사라진 항목만** 잡으므로 이들에는 아무 효과가 없다.

- **정리 시점**: 그 워크트리의 산출물이 **커밋·push된 뒤**에만 제거한다. 에이전트가 커밋 없이 편집만 하고 끝나는 경우가 실제로 있었다(planner는 셸 도구가 없어 편집만 하고 종료한다) — 성급히 지우면 산출물이 유실된다.
- **제거**: `git worktree remove <path>` (실행 중인 프로세스가 파일을 잡고 있으면 `Permission denied`가 난다 — 그 경우 프로세스 종료 후 재시도하거나 다음 세션에 정리한다).
- **확인**: `git worktree list`

## Local `main` Staleness (T100)

로컬 `refs/heads/main`은 PR을 웹에서 병합해도 **자동으로 갱신되지 않는다.** 2026-07-26 실측에서 로컬 `main`이 `origin/main`보다 2커밋 뒤처져 있었고, 이 상태로 `main`에서 분기하면 **낡은 base를 잡는다**.

`main`이 어디에도 체크아웃돼 있지 않을 때 갱신:

```
git fetch origin main:main
```

## Branches
| Type | Pattern | Example |
|---|---|---|
| Feature | `feat/{{task-id}}-{{slug}}` | feat/T3-login-form |
| Fix | `fix/{{task-id}}-{{slug}}` | fix/T7-null-token |
| Docs | `docs/{{slug}}` | docs/update-api |

## Commit Messages

> **갱신 고지 (2026-07-29, T144 — User 판정 ⓒ).** 종전 규정은 `{{type}}: {{summary ≤ 50 chars}}` + `Refs:` 필수였다.
> **367 커밋 전수 실측 결과 문서와 관행이 갈려 있었다:** 제목 50자 이하 **3/367 = 0%** · `Refs:` 트레일러 **193/367 = 53%** · 실제 형태는 `docs(T106):` 처럼 **scope 괄호**를 쓰는데 종전 문서엔 그 규정이 **없었다**.
> ⇒ **50자 상한은 폐기**(한국어 제목에서 성립하지 않는다 — 현행 평균 100자) · **`Refs:` 는 필수로 복원** · **scope 괄호를 규정에 명시**.
> ⛔ **과거 커밋을 소급 정정하지 않는다.** 이 규정은 **2026-07-29 이후 커밋**에만 적용된다.

```
{{type}}({{scope}}): {{summary — 한 줄, 상한 없음}}

{{body — what and why, not how}}

Refs: {{task ID}}
```

| 요소 | 규칙 |
|---|---|
| `{{type}}` | `feat` / `fix` / `refactor` / `docs` / `test` / `chore` |
| `({{scope}})` | **선택.** 태스크 ID(`T133`) · 절 번호(`§38`) · AC 번호 중 하나. 여러 개면 `~`로 범위(`T138~T144`) |
| `{{summary}}` | **한 줄. 글자 수 상한 없다.** ⛔ 다만 *"무엇을 했는가"* 가 제목만으로 서야 한다 |
| `Refs:` | ⭐ **필수.** 대응하는 `docs/Tasks.md` ID를 적는다 |

### ⭐ `Refs:` 가 필수인 이유 (T144 판정 근거)

**PR #166**(§38, 사용자 신고 결함)이 **설계 → 구현 → reviewer → QA → 병합**까지 전 과정을 통과했는데 `docs/Tasks.md`에 **추적 행이 아예 없었다.** 뒤늦게 T138~T144로 등재해야 했다(**PR #167**).
⇒ **커밋에서 태스크로 되짚을 수단이 없어서 생긴 부채**이며, 그것이 정확히 `Refs:` 가 하는 일이다.

⚠️ **대응 태스크 행이 아직 없으면** `Refs: (미등재 — planner 인계)` 로 적고 **그 사실을 PR 본문에 남긴다.** ⛔ 없는 태스크 ID를 지어내지 마라.

## Merge Rules
- One task (docs/Tasks.md ID) = one branch = one PR.
- PR merges only after docs/DefinitionOfDone.md checklist passes.
- Squash-merge {{or merge-commit — pick one}}.
