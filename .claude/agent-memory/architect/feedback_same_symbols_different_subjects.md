---
name: same-symbols-different-subjects
description: 설계 문서의 ⓐⓑⓒ와 나중에 생긴 AC의 ⓐⓑⓒ가 다른 대상을 가리키면 AC 쪽 항목 하나가 조용히 빠진다; AC가 생기면 기호 대응표부터 만든다
metadata:
  type: feedback
---

설계 절의 테스트 계획(예: T-4 ⓐⓑⓒ)이 AC보다 먼저 쓰이고, AC가 같은 기호를 다른 대상에 붙이면(AC ⓐ = 분류 없는 export, 설계 ⓐ = deny 제거) "ⓐⓑⓒ 다 있음"으로 읽혀 **AC의 한 항목이 누락된 채 통과**한다.

**Why:** T176(2026-10-01). §68.9 T-4는 AC-085 (e)보다 먼저 쓰였다. AC ⓐ(분류 없는 export 역검증)가 T-4에 아예 없었는데, 테스트 이름이 "T-4 ⓐ/ⓑ/ⓒ"라서 기호만 보면 3/3으로 보였다. implementer가 뒤늦게 AC ⓐ 테스트를 추가했다.

**How to apply:** AC가 기존 설계 절을 수용 기준으로 삼게 되면 그 절의 열거 기호를 AC 기호와 1:1로 대응시킨 표(AC 기호 / 설계 기호 / 테스트 이름 / 필수 여부)를 쓴다. 정본은 AC로 두고, 보고는 AC 기호로 하라고 명시한다. AC 밖의 추가분은 "지우지 말 것"으로 남긴다. [[norm-beats-example]] [[scope-is-decided-by-gates-not-taxonomy]]
