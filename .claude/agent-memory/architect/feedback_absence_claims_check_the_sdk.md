---
name: absence-claims-check-the-sdk
description: 상류의 "앱이 X를 전혀 하지 않는다"는 결함 서술은 의존성 SDK 내부를 직접 열기 전에는 채택하지 말 것 (T128에서 절반이 틀렸다)
metadata:
  type: feedback
---

**"앱에 그 코드가 0건이다"는 "그 동작이 일어나지 않는다"가 아니다.** 상류(planner·오케스트레이터)가 *grep 0건*을 근거로 *"감지도 처리도 하지 않는다"* 고 인계하면, **처방을 설계하기 전에 의존성 SDK의 해당 경로를 직접 열어** 자동 처리가 이미 있는지 확인한다.

**Why:** T128(2026-07-28). 인계문은 *"토큰이 폐기되면 재로그인 유도도 로그아웃도 없다"* 였고 저장소 grep(`onIdTokenChanged` 0건)은 사실이었다. 그러나 `@firebase/auth`를 열어 보니 `getIdToken()`이 `_logoutIfInvalidated`로 감싸여 있어 **무효화 코드가 오면 SDK가 스스로 signOut** 했고, 이 앱에서 성립하는 폐기 시나리오는 **전부 그 코드로 매핑**됐다. ⇒ 결함은 "처리 부재"가 아니라 **"그 자동 처리가 훈련 중 화면을 통째로 언마운트한다"** 였고, 처방의 방향이 (감지 추가 → 처방 재설계) 로 뒤집혔다. 상류가 제안한 감지 수단(`onIdTokenChanged`)은 **검출력 증가 0**으로 기각됐다.

**How to apply:**
- 부재형 결함 인계를 받으면 실측 순서를 **① 저장소 grep → ② SDK/의존성 내부 판독 → ③ 처방** 으로 고정한다. ②를 건너뛰면 이미 있는 동작 위에 중복 장치를 얹게 된다.
- ⚠️ **격리 워크트리에는 `node_modules`가 없다.** 메인 체크아웃(예: `C:\codegate\node_modules`)의 dist 번들을 직접 열면 실측이 되고, 못 열면 "인용값"으로 강등해야 한다.
- 조용히 삼키는 지점은 보통 **인증 SDK가 아니라 그것을 쓰는 SDK**에 있다(예: `@firebase/functions`의 `getAuthToken()`이 실패를 삼키고 무토큰 요청 → 서버 `unauthenticated`). ⇒ **감지 지점을 고를 때 "삼킴이 반드시 귀결되는 곳"을 찾는다.**
- 관련: [[project_upstream_cited_identifiers_may_not_exist]] · [[feedback_reserved_risk_may_be_impossibility]] · [[project_handoff_base_commit_unverified]]
