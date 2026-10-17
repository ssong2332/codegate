---
name: stale-line-cites-map-by-symbol
description: 코드 변경 후 문서 정합 패스 — 스테일 줄 인용 수십 건은 원문을 고치지 말고 심볼 대응표 1개로; 공유 상수 확장은 소비처 판정까지 전파되는지 따라간다
metadata:
  type: feedback
---

규칙 변경(예: T188 analyzeConversation) 뒤 Architecture.md 정합 요청이 오면: 지목된 위치만 인라인 "(날짜 덧붙임 — 위 원문 보존)"을 달고, 나머지 줄 인용(T188 때 40건)은 원문 무편집 + 새 절의 "인용 → 현행 심볼·줄" 대응표로 갈음한다.

**Why:** 각 줄 인용은 그 절의 base 시점 근거라 고치면 이력이 깨지고, 40곳 개별 편집은 범위 폭증. 사용자 지시도 "지우지 말고 갱신 고지/정정 형태, 위치는 심볼로"였다.

**How to apply:**
- export 공유 상수(G7류)가 넓어졌으면 소비처(되감기 judge 등)의 판정 이동 방향을 표로 적는다(unclear→risky만, good 이동 0 등).
- 낡은 근거 문장이라도 결론이 새 규칙에서 여전히 참인지 재계산한다(§42.3 g: 키 `여기서주소`로 여전히 필연 매치).
- DECISIONS 행 추가 전 UpdateRequests open 행이 다음 번호를 이미 지목했는지 확인 — 충돌하면 필요성부터 재판정. [[numbering-is-settled-by-merge-order]]
