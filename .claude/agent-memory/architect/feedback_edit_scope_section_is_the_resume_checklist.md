---
name: edit-scope-section-is-the-resume-checklist
description: 패스가 중단되면 "이 패스의 편집 범위(정본)" 절이 재개 체크리스트다 — 선언된 파일마다 diff 유무를 대조하고 빠진 것만 채운다
metadata:
  type: feedback
---

절 말미에 쓰는 **"이 패스의 편집 범위(⛔ 정본)"** 는 문서 위생이 아니라 **중단 복구 장치**다. 패스가
API 한도·크래시로 끊기면, 그 절이 나열한 파일 목록과 `git diff`(또는 각 파일의 실제 상태)를
1:1 대조해 **빠진 산출물만** 채운다 — 재분석·재작성 금지.

**Why:** T-§61 패스가 §61 전문(Architecture.md)과 API.md 부록 C까지 쓰고 중단됐는데, §61.14가
*"편집 파일 3개뿐 — Architecture.md · API.md · DECISIONS.md(#100 1행)"* 라고 못 박아 둔 덕에
**미완 산출물이 정확히 1개(DECISIONS #100)** 로 특정됐다. 그 절이 없었으면 재개하는 쪽은
이미 쓰인 §61을 다시 쓰거나(중복), 빠진 행을 못 보고 닫았을 것이다.

**How to apply:**
- 편집 범위 절에는 **파일별로 무엇을(신설 절 번호 · 증분 행 수 · DECISIONS 번호)** 까지 적는다.
  *"DECISIONS.md 갱신"* 이 아니라 *"DECISIONS.md **#100 1행 추가**"* 여야 재개가 기계적이다.
- 같은 절의 **번호 실측 블록**(`^## ` 최대 · 게이트 최대 · DECISIONS 최대)이 재개 시
  번호 재확인의 근거가 된다 — 다만 [[feedback_handoff_numbers_may_run_ahead]] 대로
  **착수 시·병합 직전 두 번** 재고, 인계값을 그대로 믿지 않는다.
- 재개 패스는 **이미 쓰인 절을 다시 판정하지 않는다** — 요약해 옮길 뿐이다
  ([[feedback_judgment_may_already_be_a_section.md]]와 같은 방향).
