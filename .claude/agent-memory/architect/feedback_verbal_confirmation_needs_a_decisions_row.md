---
name: verbal-confirmation-needs-a-decisions-row
description: User의 구두 확정("그거 진행해줘")은 DECISIONS 행으로 물질화해야 하류 문서가 그것을 인용할 수 있다 — 없으면 파생 편집이 REJECTED된다
metadata:
  type: feedback
---

**User가 대화에서 확정한 OQ는 그 즉시 `docs/DECISIONS.md` 행으로 만들어라.** 코드가 이미 병합됐더라도 마찬가지다 — 확정 사실이 문서에 없으면 그 결정을 전제로 한 파생 편집(API.md·Architecture.md 문면)은 근거 없는 단언이 된다.

**Why:** OQ-A68(§57.2 D1, 소유 User)에서 실제로 사고가 났다. User가 §57 판정을 읽고 *"D1 구현 진행해줘"* 라고 지시 → implementer가 구현 + `docs/API.md`에 증분까지 직접 씀 → reviewer REJECTED. 사유는 둘이었는데 **하나는 소유권**(API.md는 architect 전용, `AGENTS.md`)이고 **다른 하나가 이것**이다: *"OQ-A68 확정"* 이라 단언했는데 `DECISIONS.md`에 그 확정 기록이 없었다. 편집은 되돌려졌고 **결정은 유효했는데 결정을 담는 자리만 비어 있었다.**

**How to apply:**
- 확정 기록의 판별식: *"이 지시의 내용이 그 OQ가 묻는 것과 같은가?"* 같으면 OQ 이름을 대지 않은 지시도 실질 확정으로 쓸 수 있다 — 단 **Why 열에 확정 경위(사용자 원문·읽은 문서)를 적어야** 나중에 재평가된다.
- 순서는 **DECISIONS 행 먼저, 파생 문면 나중.** 같은 패스에서 둘 다 쓰더라도 파생 문서가 그 행 번호를 인용하게 한다.
- 코드가 먼저 병합된 경우엔 "새 설계"가 아니라 **사후 확정 기록**임을 행 안에 명시하고, 문면은 소스를 열어 옮긴다(추측 금지).
- 관련: [[decision-merged-is-not-implemented]] · [[numbering-is-settled-by-merge-order]]
