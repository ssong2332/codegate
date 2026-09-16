---
name: project_codegate_s64_d1_d2_verify_wording
description: §64 D-1/D-2 정본 문면 교체(순수 구현) — 이행 약속 금지 + 양방향 거절 문구, G403/G404 신설
metadata:
  type: project
---

§64(architect가 문면 확정, `docs/DECISIONS.md` #103)의 D-1/D-2를 순수 구현한 사례. PR #240
(`fix/64-D1-D2-verify-decline-wording`), 763 pass / 0 fail.

**작업 성격 — "순수 구현"이 실제로 무엇을 뜻했나**: architect가 §64.3/§64.5에 정본 코드블록(수정
전/후 diff)을 이미 써 뒀고, implementer는 그걸 바이트 그대로 복사만 했다. 판단 여지는 0이었지만
그럼에도 §64.7이 지목한 "필수 동반 수정"(테스트 하드코딩 3곳)과 "신규 게이트 2건"(G403·G404)은
architect가 **명세만 주고 구현은 안 했다** — 이 경계(문면 저작 vs 게이트 구현)가 이 프로젝트의
반복 패턴이다(G386: 모델 대면 한국어 원문은 architect 소유, 그걸 지키는 코드/테스트는 implementer
소유).

**D-1**: `functions/src/roleplay/promptAssembly.ts:266` `VERIFY_OFFER_LINE_TOOL_DRIVEN` — 이행
약속형 예시("…그전에는 '…연결해 드리겠습니다'처럼 받아 두고 기다린다")를 비약속형 금지문 + 중립
대체 대사("…확인해 보시는 게 맞습니다'처럼 …받아 두고 하던 이야기를 그대로 이어간다")로 교체.
**D-2**: `functions/src/scenarios/verifyIntercept.ts:217-218` `VERIFY_DECLINE_TOO_EARLY` — 단방향
금지("연결해 드리겠다고 말하지 말고", 아직 안 말한 상태만 가정)를 양방향("아직 하지 않았다면 하지
말고, 이미 그런 취지로 말했다면 그 말을 뒤집지도 더 확실히 약속하지도 말고")으로 교체 — 도구 호출이
발화 **후**에 거절되는 구조적 경로(`index.ts:249`)에서 "이미 한 말을 지금 하지 말라"는 실행 불가능
지시가 되는 자기모순(§62.1 L-1)을 닫는다.

**정본 위치 포인터 갱신도 구현 범위였다**: `verifyIntercept.ts:206-209` 주석이 두 상수의 "정본은
여기 있다"를 가리키는데, D-2 교체로 TOO_EARLY만 새 절(§64.5/#103)로 옮겨가고 ALREADY는 그대로
(§59.6/#97)라 **포인터를 상수별로 분리**해야 했다. 지시문이 "주석에 포인터가 있으면 갱신하라"고
조건부로만 말했지만, 실제로 있었고 안 갱신하면 "정본이 어디 있는지"가 거짓말이 되는 상황이었다.

**G403 설계(신규)**: 카탈로그 6종(`Object.keys(VERIFY_INTERCEPT)`, A 1종 + B 5종) × advanced ×
`toolDrivenTiming:true`+`offerToolDeclared:true` 조립에서 이행 약속 리터럴 3종 0건 — **양방향**(같은
6종 DEFAULT 조립에는 옛 문구가 그대로 있어야 "DEFAULT까지 같이 지웠다"가 잡힘) + **역검증**(옛
TOOL_DRIVEN 문자열을 사본에 끼워 넣어 게이트가 실제로 반응하는지 확인 — 안 하면 "죽은 게이트"인지
모른 채 넘어간다, [[feedback_false_reassurance_over_precision]] 계열 습관).

**G404 설계(신규, 기존 테스트 확장)**: 바이트 일치(`assert.equal`)만으로는 "조건절 하나를 지워도
통과"를 못 잡는 것처럼 보이지만, 실제로는 **바이트 일치 자체가 이미 그걸 막는다** — §64.8이 명시한
대로 성분 2건(`아직 하지 않았다면 하지 말고` / `이미 그런 취지로 말했다면`) 단언은 실패 메시지에
"왜 두 갈래인가"를 싣기 위한 것이지, 바이트 일치보다 더 강한 검증이 아니다. 이 구분(중복이 아니라
가독성/디버깅 목적의 추가 단언)을 이해 못 하면 "왜 이미 통과하는 걸 또 검사하나"로 헷갈릴 수 있다.

**검증**: `npm --prefix functions run build` 통과, `npm --prefix functions test` 763/763 통과
(§64.4가 지목한 기존 게이트 8건 — A1 ⓐ·T125 전수·G85 잔류 요구·R3·§61 등 — grep으로 개별 재확인),
`npm --prefix functions run lint` 통과.

**절대 하지 않은 것**: `docs/**` 무편집(§64가 이미 병합돼 있었다 — `docs/API.md:431`이 옛 TOO_EARLY
원문을 인용해 이제 거짓이 되지만 §64.7이 범위 밖으로 명시해서 안 건드림). `docs/Tasks.md` 대응 행이
없어 커밋 `Refs:`는 `(미등재 — planner 인계, §64/#103)`로 적음([[project_codegate_s59_verify_decline_canon]]과
같은 패턴).

관련: [[project_codegate_s59_verify_decline_canon]] (VERIFY_DECLINE 계열 정본 확정 선례) ·
[[project_codegate_s59_g394_guidance_wiring]] (모듈 상수를 리터럴로 하드코딩 테스트하던 관행이
함수화될 때 깨진 선례 — 이번엔 리터럴 상수라 그 문제 없음) · [[feedback_false_reassurance_over_precision]].
