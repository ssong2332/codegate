---
name: no-shell-report-the-git-blocker
description: architect 세션엔 Bash가 없다 — 브랜치/커밋/push 지시를 받으면 편집만 하고 그 사실을 결론 첫 줄에 신고할 것
metadata:
  type: feedback
---

**이 저장소의 architect 실행 환경에는 셸(Bash) 도구가 없다.** `git checkout -b`·`commit`·`push`를 포함한 지시를 받아도 **수행할 수 없다.** 조용히 건너뛰지 말고 **결론 첫 줄에 "브랜치·push 미수행"을 적고**, 산출물이 어느 트리에 미커밋 상태로 있는지 밝혀라.

**Why:** CLAUDE.md 금지사항 1번(근거 없는 성공 보고)과 3번(조용한 우회) 정면 대상이다. 2026-09-06 OQ-A68 패스에서 *"새 브랜치를 만들어 작업하고 push까지"* 라는 지시를 받았으나 Bash가 비활성이라 문서 3건 편집만 가능했다. `docs/Architecture.md`의 여러 절이 *"architect는 셸이 없다"* 를 자기 고지로 반복해 온 것과 같은 사실이다.

**How to apply:**
- 셸 없이도 되는 실측 수단은 셋뿐이다: **파일 열람 · grep · `.git` 직접 판독**(`.git/refs/heads/main`으로 base 확인, `.git/logs/refs/heads/main`으로 이력 일부).
- ⚠️ fast-forward `pull`만 있는 reflog에는 **중간 커밋이 안 보인다** — 인계받은 커밋 해시는 확인 불가이므로 **인용값으로 표기**하고, 판정은 해시가 아니라 **트리의 파일 내용**에 걸어라.
- 테스트 수·라이브 관측값은 전부 인용값이다(`CLAUDE.md` 표 포함). 재측정했다고 쓰지 말 것.
- 관련: [[handoff-base-commit-unverified]] · [[peer-agent-memory-is-evidence]]
