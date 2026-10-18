---
name: codegate-t192-c5-call-ending
description: T192 C5 공통 종료 함수 — React compiler lint "accessed before declared"(effect가 뒤에 정의된 함수 호출), UX 표시 vs 아키텍처 E5/E6 순서 충돌 처리, node -e 인라인 정규식 백슬래시 소실 함정
metadata:
  type: project
---

T192 C5(2026-10-19, 미커밋 인계 · functions 1260/0 · 루트 704→730).

- `play/page.tsx`에서 effect가 **아래에 정의된** 비메모 함수(`endCall`)를 부르면 react-hooks(컴파일러) lint가 error("Cannot access variable before it is declared"). ref 우회 대신 **정의 블록을 그 effect 위로 옮겨** 해결.
  **How to apply:** 공통 함수는 그 함수를 부르는 첫 effect보다 위에 둔다. 의존성 경고는 같은 파일 관례대로 `eslint-disable-next-line react-hooks/exhaustive-deps`.
- UX(끊김 표시는 기록 완료를 기다리지 않음)와 §79.9(E5 flush → E6 표시) 순서 충돌 → 표시는 E4 직후, 이동만 max(2500ms, flush). 판단 건으로 보고.
- Git Bash `node -e '...'` 안의 JS 템플릿 리터럴에서 `\\(` 같은 정규식 백슬래시가 사라지거나 `'`가 셸을 깨뜨린다 → 편집 스크립트는 **Write로 .cjs 파일**을 만들어 실행.
- 기존 소스 스캔 테스트(한도 effect의 오버레이 닫기 · `collectToolResponses(calls, dispatchToolCall)` · `modelToolUserTurns` 식)는 공통 함수 이동으로 깨진다 — 단언 대상만 옮기고 규칙은 유지.
