---
name: codegate-s45b-verify-anchor
description: §45 ⓑ 확인창구 앵커 순서 — 순수함수 게이트의 사각(호출부)을 소스 스캔으로 메운 법, TS6133 2층 역검증, 프로브 자신이 낡은 값을 읽어 "안 고쳐졌다"로 오독한 사례
metadata:
  type: project
---

`fix/s45b-verify-anchor-order` (base `b668576`). F2-b(폴백·구조적)=V1 · F2-a(실시간·간헐)=V2 둘 다 닫음.

## ⭐ 가장 값나가는 것 3가지

**1. 프로브가 *언제* 읽는지가 판정을 뒤집는다.**
P-2 프로브가 `offerAnchorScammerTurn`을 **오퍼 write 직후**에만 읽었다. base에서는 그 문서가
이후 갱신되지 않으므로 write값 == 최종값이라 정확했는데, **V1은 announce 턴에 그 값을 갱신**한다
⇒ 수정 후에도 프로브가 "어긋남"을 출력했다. 제품이 아니라 **프로브가 틀렸다.**
**Why:** "before에서 맞았던 읽기 시점"이 "after에서도 맞다"는 보장이 없다 — 고침이 *새 write 시점*을
만들었으면 프로브도 그 뒤를 읽어야 한다.
**How to apply:** 값을 갱신하는 수정에서는 프로브에 **write 시점 값과 최종 값을 둘 다** 출력시켜라.
하나만 찍으면 거짓 음성(고쳤는데 안 고쳐졌다고 보고)이 난다.

**2. 순수 함수 테스트는 호출부가 사라져도 초록이다 — 소스 스캔 게이트를 같이 넣어라.**
V1의 값 계산(`announcedVerifyAnchor`)과 V2의 판정(`announceTurnsOnInstructionDispatch`)은 유닛으로
잡히지만, **Firestore write 인자**와 **React 턴 콜백 배선**은 유닛으로 관측되지 않는다.
⇒ 각각 소스 스캔 테스트 1건씩 추가: `roleplay/index.ts`의 `verify_announce` 분기 update 인자에
`offerAnchorScammerTurn: announcedVerifyAnchor(scammerDocCount)`가 있는지 / `page.tsx`에 새 기록
지점이 **있고** 옛 기록 지점이 **없는지**(후자가 핵심 — 둘이 공존해도 전자만 보면 초록이다).
[[feedback-unobservable-behavior-gates]] 의 재확인 사례.

**3. TS6133이 역검증 1층이라 게이트 자체를 증명 못 할 수 있다.**
V1 호출부만 지우면 `error TS6133: 'announcedVerifyAnchor' is declared but its value is never read`가
**tsc 단계에서 먼저** 나서 소스 스캔 게이트가 실행조차 안 된다. ⇒ **import까지 함께 지워** TS6133을
우회한 2층 역검증을 추가로 돌려야 "게이트가 TS6133에만 기대지 않는다"가 증명된다.
[[codegate-t136-tactics-union]] · [[codegate-s43-l4-conditioning]] 과 같은 계열.

## 좌표계 함정(이 저장소 전용)
- `offerAnchorScammerTurn`은 **1-기반**(`resolveAnchor`가 `scammers[N-1]`), `reconnectAnchorScammerTurn`은
  **0-기반**(`verifyTimeline.ts`가 `resolveAnchor(N+1)`로 감싼다). **같은 문서의 두 앵커가 기준이 다르다.**
- 실시간 앵커에 +1이 붙는 이유는 `createSession`의 오프닝 사기범 행(turnIndex 0) 때문이며, 폴백에는 그
  행이 이미 세어져 있어 보정이 없다.

## P-1은 접근 불가로 끝났다(정상 경로)
firebase CLI는 로그인돼 있어도 **일반 Firestore 읽기 명령이 없다**(`firestore:delete`/`indexes`만).
`gcloud` 미설치. 세션 식별자도 인계 안 됨 ⇒ §45.8 강등표 #4→#3. **화면 인상으로 실시간/폴백을 추정하지
말 것**(§44: 텍스트 경로 Mock 강등이 화면에서 침묵한다).

## 격리 에뮬레이터 재확인
`firebase.isolated.json`(포트 9599/5501/8580/4900) + `--project demo-s45b`. 함정 2건:
- `functions/.env`가 없으면 **defineString 파라미터에서 대화형 프롬프트로 멈춘다**(`LLM_PROVIDER` 등).
  `defineSecret`은 프롬프트 없음 ⇒ `GEMINI_API_KEY` 미설정이 곧 MockLlmClient 강등(P-2가 원하는 상태).
- 프롬프트에서 죽인 인스턴스가 **포트를 계속 잡고 있다**. `netstat -ano` → `taskkill //PID <n> //F` 2개
  (node 1 + java 1). [[codegate-t115-emulator-freshness]] 대로 lib 재빌드 후엔 **에뮬레이터 재시작 필수**.
- `sendMessage`의 인자는 `text`가 아니라 **`userText`**.
