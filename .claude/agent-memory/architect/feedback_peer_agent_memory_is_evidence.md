---
name: peer-agent-memory-is-evidence
description: 셸이 없어 재현할 수 없는 증상은 `.claude/agent-memory/*/`의 타 에이전트 1인칭 기록을 전수 grep해 1차 증거로 쓴다 — 단 인용값으로 표기하고 재현은 프로브로 인계
metadata:
  type: feedback
---

**셸(Bash)이 없어 증상을 재현할 수 없을 때, `.claude/agent-memory/{implementer,planner,...}/` 를
전수 grep해 그 증상을 **실제로 겪은 에이전트의 1인칭 기록**을 1차 증거로 삼아라.**

**Why:** T130에서 planner도 오케스트레이터도 원인을 규명하지 못했고 architect에도 셸이 없었다.
그런데 implementer 메모리에 **같은 증상 관측이 6건**(T107·T112·T119·T123·T125·T129) 남아 있었고,
그중 두 줄이 결정적이었다 — ⓐ *"루트는 `file:`, functions는 `file:..`"*(⇒ 불변식 확정) ·
ⓑ *"항상 나지도, 안 나지도 않는다"*(⇒ **간헐성** 확정, 상류 완료 명세를 뒤집는 근거).
**둘 다 코드에도 git 로그에도 없는 정보**였고, 이것 없이는 방식 선정이 불가능했다.

**How to apply:**
1. 증상 문자열(식별자·에러 원문·명령 형태)로 `.claude/agent-memory/` 를 **전수 grep**한다.
   태스크 ID로 찾지 마라 — 함정은 대개 태스크와 **무관한 절**에 부수적으로 적혀 있다.
2. 기록이 여럿이면 **일치하는 것보다 *갈리는* 것을 찾아라.** *"이번엔 안 났다"* 한 줄이
   간헐성을 증명하고, 그것이 완료 판정 기준을 바꾼다.
3. ⛔ **반드시 "인용값(재현 0건)"으로 표기**하고 파일:줄을 붙여라. 내가 실행한 것처럼 쓰면
   `CLAUDE.md` Prohibitions 위반이다.
4. 인용으로 세운 전제는 **프로브로 실행자에게 인계**한다 — 기록은 근거지 검증이 아니다.

관련: [[intermittent-defect-picks-detection]](이 기록에서 나온 방식 선정) ·
[[upstream-cited-identifiers-may-not-exist]](반대 방향 — 인용은 실재 확인 후 설계)
