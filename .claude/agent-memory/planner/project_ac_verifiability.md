---
name: planner-ac-verifiability
description: 이 저장소에서 AC와 태스크 완료 증거를 쓰는 형식 — 판정 불가 문장 금지, 역방향 확인·before/after 수치 필수
metadata:
  type: project
---

**AC는 reviewer·QA가 기계적으로 판정할 수 있는 형태로 쪼개서 쓴다.** "상황에 맞아야 한다" 같은 문장은 쓰지 않는다. 실제로 쓰는 형태: **① 집합 양방향 `deepEqual`**(카탈로그 ↔ 도달 가능 집합), **② 쌍별 비교로 수렴 금지**, **③ 대조표 N행 제출**, **④ 폴백 방향 제한**, **⑤ 경계 불변 + 스캔 대상 수 before/after**. 판단이 불가피한 조건은 **대조할 표를 산출물로 요구**해 판정 가능하게 만든다.

**태스크에는 "완료 판정 필수 증거"를 반드시 적고, 이 프로젝트 관례대로 실행 출력을 요구한다** — 특히 **역방향 확인**("위반 샘플을 넣으면 실제로 실패한다")과 **before/after 수치**. 테스트 수 측정은 **`functions/lib` 삭제 후**여야 한다(스테일 컴파일 산출물이 수치를 부풀린다 — T101).

**Why:** 사용자 실사용 신고("링크를 눌러도 항상 같은 페이지")가 나왔을 때, 그 결함은 **AC가 없어서 모든 reviewer·QA 게이트를 정상 통과**하고 있었다. 게이트의 잘못이 아니라 요구가 없었던 것이다. `docs/DefinitionOfDone.md`가 완료를 "AC-xxx are met"으로 정의하므로 **AC가 없으면 판정 기준 자체가 없다.** 같은 양식의 갭이 v1.5 OQ-U15에서도 있었다(ux-design이 설계한 기능 4건에 AC 부재).

**How to apply:** ux-design·architect가 "AC가 없다"를 OQ로 넘겨올 때(OQ-U15·OQ-U28 양식), 기능을 발명하는 것이 아니라 **이미 확정된 설계를 검증 가능한 조건으로 옮기는 것**이므로 planner가 AC를 신설한다. 신설 시 (1) 기존 AC 문면은 건드리지 않고 append, (2) MVP Scope 행을 함께 만들되 **우선순위는 기존 if/then 표를 그대로 적용**하고 새 규칙을 만들지 않으며, (3) ux-design이 Related AC를 소급 갱신하고 OQ Status를 flip하도록 Tasks.md에 인계 행을 만든다(planner는 UX.md를 편집하지 않는다).

관련: [[ac-number-reservation]]
