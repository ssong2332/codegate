# Definition of Done — 안 당해본 사기는 못 막는다 (AI 금융사기 백신)

Owner: User. Enforced by implementer (self-check) and quality-assurance (gate).
A task's Status may become `done` in docs/Tasks.md only when every item below passes.

## 하카톤 모드 (사용자 확정 2026-07-21, 옵션 B — Day1 하루 완성 스코프 한정)
- **보안 게이트 태스크 — docs/Tasks.md의 T7(사기범 역할극 가드레일)·T10(생성물 즉시 폐기)·T11(PII/인젝션 하드닝)**: 아래 Checklist를 전항목 그대로 적용한다. reviewer `APPROVED`·quality-assurance `GO` 필수.
- **그 외 모든 태스크(T1~T6, T8~T9, T12~T17)**: reviewer/quality-assurance 공식 에이전트 게이트를 생략하고 implementer 자가 점검(self-check)으로 대체한다. 단 자가 점검도 반드시 근거(출력·로그·스크린샷)를 남겨야 하며, "확인함"이라는 말만으로는 `done` 처리하지 않는다 — CLAUDE.md의 "근거 없는 성공 보고 금지" 원칙은 하카톤 모드에서도 그대로 적용된다.
- 이유: Day1 무박 일정(17개 태스크, 3명 개발)에 태스크마다 formal reviewer/QA 에이전트 왕복을 넣으면 검증 오버헤드가 실제 개발 시간을 잠식한다. 대회 배점 20%인 보안은 게이트를 유지해 리스크를 좁혀서 막고, 나머지는 속도를 우선한다.
- 이 완화는 코드게이트 해커톤 Day1~Day2 오전 스코프에 한정된 임시 조치다. 새 태스크가 Tasks.md에 추가되면 보안 게이트 대상 여부를 다시 판단해야 한다.

## Checklist
- [ ] Acceptance Criteria (AC-xxx in docs/PRD.md, referenced by docs/Tasks.md) are met, with evidence (output, screenshot, or log).
- [ ] Code follows docs/CodingRules.md.
- [ ] Code is consistent with docs/Architecture.md (no layer violations).
- [ ] Lint passes — command output attached.
- [ ] Build succeeds — command output attached.
- [ ] Tests exist for the change and pass — actual test run output attached, not claimed.
- [ ] No unrelated files modified (`git diff` contains only task-scoped changes).
- [ ] **T7/T10/T11만**: reviewer Status: `APPROVED` (or user explicitly accepted the risks of a REJECTED item).
- [ ] **T7/T10/T11만**: quality-assurance Release Recommendation: `GO` (or user explicitly accepted the risks of a NO-GO item).
- [ ] **T7/T10/T11 이외 태스크**: 위 두 항목 대신 implementer 자가 점검 통과(근거 첨부)로 대체.
- [ ] Documentation impact reported (docs agent invoked if docs changed).
- [ ] docs/CHANGELOG.md updated for user-visible changes.

## Rules
- "Tests pass" without attached output = not done (see CLAUDE.md prohibitions).
- Skipped items must be listed explicitly with the user's approval noted.
- 하카톤 모드의 자가 점검도 증거 없는 "됐다" 보고는 인정하지 않는다 — 게이트가 빠졌을 뿐 근거 요구 수준은 그대로다.
