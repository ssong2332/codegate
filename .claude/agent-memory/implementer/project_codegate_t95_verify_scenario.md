---
name: codegate-t95-verify-scenario
description: T95 확인 가로채기 전용 시나리오 신설 — 시나리오 1종 추가 시 손대야 하는 게이트 전체 목록과, 축 표가 PRD에 없는 신규 시나리오의 좌표 결정 근거
metadata:
  type: project
---

**시나리오를 1종 추가하면 깨지는 게이트는 "축 표"만이 아니다.** T95에서 실측한 전체 목록(하나라도 빠지면 테스트가 먼저 막힌다 — 설계 의도):

| 파일 | 무엇 | 빠뜨리면 |
|---|---|---|
| `src/content/scenarios/{name}.ts` + `index.ts` | 정본 메타 | UX-017 목록에 안 뜬다(목록은 `voiceMode` 필터로 자동) |
| `functions/src/scenarios/publicMeta.ts` | 미러 + ID 상수 | 미러 드리프트 테스트 |
| `functions/src/scenarios/{name}.prompt.ts` + `index.ts` | 프롬프트 | `SCENARIO_PROMPTS`↔`PUBLIC_SCENARIOS` 1:1 `deepEqual` |
| `axes.ts` | 5축 태깅 | 키 1:1 `deepEqual` 게이트 |
| `axisCoverage.ts` `DECLARED_COVERAGE_GAPS` | 채운 축 값의 행 삭제 | 양방향 `deepEqual`("조용히 채워짐" 검출) |
| `__tests__/axisCoverage.test.ts` | 하드코딩 **13**이 3곳(키 수·`totalScenarios`·AC-077 id 목록) + 0건 집합 | — |
| `__tests__/scenarios.test.ts` `UNCONDITIONAL_DEMAND_BY_SCENARIO` | T91 표 지명 | 키 `deepEqual` |
| `report/__tests__/tacticCategory.test.ts` | 하드코딩 **13** | — |
| (해당 시) `scenarios/verifyIntercept.ts` | D3 메커닉 카탈로그 | 축만 D3고 실제로는 아무 일도 안 일어남 |

**Why:** 이 게이트들은 서로 다른 태스크(T74·T78·T82·T83·T91)가 각자 심어 둔 것이라 한곳에 목록이 없다. 실제로 T95에서 순서대로 하나씩 걸렸다.
**How to apply:** 시나리오 추가·삭제 태스크를 받으면 착수 전에 이 표부터 훑는다. 반대로 "테스트만 고쳐서 통과시키는" 유혹이 생기면 그 게이트가 무엇을 막으려고 있는지 주석을 먼저 읽는다(전부 근거 주석이 달려 있다).

## 신규 시나리오의 축 좌표는 PRD 표에서 못 가져온다
PRD v1.6 "현재 **13종** 축 매핑" 표는 이름 그대로 기존 13종의 정본이고, 그 뒤에 신설되는 시나리오 행은 없다. 좌표는 저작 시점 판단이 되며, PRD 표 갱신은 planner 소관이라 보고에 요청으로 남긴다(implementer가 PRD를 안 고친다). T95는 `axes.ts` 행 주석에 근거(어느 대사·어느 라벨)를 남기는 기존 관례를 그대로 따랐다.

## 콘텐츠 설계에서 실제로 판단이 갈린 자리
- **확인을 권하는 시나리오(D3)에 확인을 막는 수법(D2·D5)을 함께 넣으면 안 된다.** 한 통화 안에서 두 수법이 서로를 부정한다 — `verifyIntercept.ts`가 협박 계열을 카탈로그에서 제외한 것과 같은 판단. 그래서 `exitBlock: ["D3_verification_hijack"]` 단독이고, 그게 누락이 아니라 설계라는 것을 테스트로 못박았다.
- **초급·중급에서는 D3 메커닉이 꺼진다**(고급 전용). 그래서 프롬프트에 "창구 이름·번호를 스스로 지어내지 않는다"를 **난이도 무관하게** 넣어야 한다 — 안 그러면 초급에서 "대사만 나오고 컨트롤이 없는 창"(UF-011 Failure (a))이 생긴다.
- **T91 무조건 요구 지명은 "전제 없는" 것을 골라야 한다.** 같은 시나리오 안에서도 "보호계좌 이체 요구"는 잔액 전제에 묶여 있고 "본인확인 정보 직접 요구"는 안 묶인다. 후자를 지명하고 문구에 "부인해도"를 명시했다.

관련: [[codegate-t83-verify-intercept]], [[codegate-t82-axis-model]], [[codegate-t84-install-chain]]
