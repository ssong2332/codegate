---
name: feedback-data-ahead-of-runtime-flag
description: 미구현 기능의 데이터(legs ≥ 2 등)가 이미 카탈로그에 있으면, 그 데이터로 만든 판정 입력은 런타임 플래그가 꺼진 동안 "부재"여야 한다
metadata:
  type: feedback
---

판정 입력을 카탈로그 데이터에서 파생할 때, 그 데이터를 쓰는 런타임이 아직 꺼져 있으면(예: `RELAY_RUNTIME_AVAILABLE = false`인데 `flowVariants.ts`에 legs ≥ 2 변형 3종이 이미 있음) 입력은 플래그 게이트 뒤에서 `undefined`여야 한다. 데이터만 보고 `legCount = legs.length`로 두면 오늘 한 화자가 전체를 진행하는 세션이 "중간 leg"로 판정돼 기능(끊기)이 조용히 0이 된다.

**Why:** T192 × S7(2026-10-19) — "S7 미구현이니 릴레이 없음이 기본"이라는 인계만 믿었다면 S5가 먼저 실어 둔 legs 데이터를 놓쳤다. 플래그 상수 grep으로 발견.

**How to apply:** 미구현 기능과의 계약 행을 추가할 때 ① 그 기능의 데이터가 이미 병합됐는지 grep ② 해석은 플래그를 아는 단일 함수 하나에 두고 ③ "플래그 꺼짐 + 데이터 있음" 칸을 게이트로 단언한다. 입력 키는 옵셔널(`?:`)이 아니라 `T | undefined` 필수 키로 — 호출부 누락을 컴파일이 잡는다. 관련: [[feedback-exception-belongs-to-conditional-layer]] · [[feedback-hard-gate-executability]]
