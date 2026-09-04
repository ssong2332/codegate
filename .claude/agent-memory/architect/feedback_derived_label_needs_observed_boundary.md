---
name: derived-label-needs-observed-boundary
description: 표시 라벨을 "이 시점 이후"로 파생하기 전에, 그 경계를 실제로 관측한 층이 있는지 확인하라 — 요청 시점 계수는 경계가 아니다
metadata:
  type: feedback
---

"화면 A는 라벨이 바뀌는데 화면 B는 안 바뀐다"는 신고를 받으면, **라벨 문자열이 없는지**와
**경계(어느 항목부터 바뀌는가)를 아는 층이 있는지**를 따로 확인한다. 문자열은 이미 다른 이름으로
실려 있는 경우가 많고(§55: `deskLabel === reconnectedCallerLabel`), 진짜로 없는 것은 경계다.

**Why:** 앵커 값이 *"요청을 보낸 시점의 턴 수 + 1"* 처럼 **요청 시점 계수**면, 그것은 "그 다음에
말이 나올 자리"에 대한 **예측**이지 관측이 아니다. 모델이 한 턴 늦게 따르면 그 예측은 빗나가고,
그 위에서 파생한 라벨은 **하지 않은 사람이 한 말이라고 단언**한다(이 저장소에서 §38.1 "일어나지
않은 전환을 단언" 계열로 이미 세 번 났다). 실제로 라이브 전사에서 전환 카드와 데스크 자기소개
사이에 사기범 대사가 한 건 끼어 있었다.

**How to apply:** ① 파생하려는 경계값의 **생성 지점**을 열어 "관측인가 예측인가"를 먼저 판정한다.
② 예측이면 라벨/값 층을 포기하고, **아는 사실만 말하는 문면 층**으로 내려간다(특정 항목을 지목하지
않는 한 문장). ③ 그래도 라벨을 원하면 **경계를 관측·기록하는 층 신설**을 선행 조건으로 OQ에 건다.
④ 부수 효과 점검: 같은 값을 읽는 두 번째 소스를 만들면 이전 패스가 닫은 UI 결함이 되살아난다.
관련: [[feedback_unsolvable_constraints_mean_wrong_layer]] · [[feedback_prompt_layer_two_strikes]] ·
[[feedback_indistinguishable_states_pick_the_signal]] · [[feedback_order_report_check_anchor_first]]
