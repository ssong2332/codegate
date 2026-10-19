---
name: pending-decision-resolution
description: DECISIONS의 "User 확정 대기" 행 해소는 그 행 append가 아니라 새 행(append-only 규칙 · #156→#157 선례) · 버전 bump 대신 "같은 버전 후속 N" 고지를 쓸 때의 형식
metadata:
  type: project
---

**DECISIONS.md "User 확정 대기" 행은 고치지 않고 새 행으로 확정한다** — 파일 Rules가 append-only이고 선례가 새 행이다(#156 남은 결정 OQ-A131 → #157 User 결정). 새 행 Decision 첫머리에 *"#N의 대기가 해소됐다"* 와 ADR 열에 `→ #N` 을 둔다. 번호는 이 트리 · 메인 체크아웃 `docs/DECISIONS.md` · `.claude/worktrees/*/docs/DECISIONS.md` 세 곳 최대값 다음(⛔ 예약 아님). 2026-10-20 T192 C6: #187~#189.

**Why:** 원행에 덧붙이면 다른 브랜치의 같은 줄 재번호 치환과 충돌하고, append-only 규칙을 깬다.

**How to apply:** 오케스트레이터가 "같은 행 끝에 덧붙이거나 새 행" 둘 다 허용하면 새 행을 고른다. PRD 버전 bump를 오케스트레이터가 피하라고 하면(다른 워크트리 버전 충돌) 현재 버전 변경 요약 아래 *"⏳ vX 후속 N"* 줄 + AC 셀 끝 *"갱신 고지 k(vX 후속 N)"* 로 쓰고, 헤더 줄(Document Version · Last Updated)은 건드리지 않는다 — 판단으로 보고에 올린다. 외부 감사 항목(예: scenario-review A-1 ⑥)에 *"있으면 참조만"* 지시가 오면 docs 전체 · 메인 · 워크트리를 grep하고, 0건이면 새 행 + 서두에 중복 대조 결과를 적는다. 관련: [[ac-amendment-retroactivity]], [[row-ownership-conflict]]
