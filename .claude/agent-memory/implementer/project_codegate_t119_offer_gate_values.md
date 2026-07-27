---
name: codegate-t119-offer-gate-values
description: T119 확인창구 오퍼 게이트 값 재조정 — 범위식을 전수 대응표로 바꿀 때의 이중 역검증 형식, T118 Live 하네스를 "턴 계수 실측"으로 확장한 레시피, 새 워크트리 착수 비용 3종의 재발
metadata:
  type: project
---

T119(계열 B 게이트 2/3→4, 계열 A 2 유지)에서 얻은, 코드만 읽어서는 안 나오는 것들.

## 1. ⭐ 범위식 → 전수 대응표 교체는 **이중 역검증**으로 증명하라

`>=x && <=y` 게이트를 `deepEqual` 대응표로 바꿀 때, 역검증을 *"오염 사본이 실패한다"* 1건으로만
내면 **왜 범위식으로 되돌리면 안 되는지가 증명되지 않는다.** 두 단언을 나란히 놓아라:

- ① 오염 사본에서 **대응표는 실패한다**(try/catch로 잡아 `t.diagnostic`에 실패 원문을 남긴다).
- ② **같은 오염을 새 값까지 포괄하는 범위식은 통과시킨다** — 이것이 범위식 폐기의 유일한 실증이다.

**Why:** 이 저장소의 갭 문서(G110 계열)는 *"범위식으로 되돌리지 말 것"* 을 금지로만 적는다.
금지의 **근거를 실행 출력으로** 남겨 두지 않으면 다음 사람이 "테스트가 깨지니 범위를 넓히자"로 간다.

**How to apply:** `deepEqual`은 값 불일치뿐 아니라 **표에 없는 신규 키까지 불일치로 잡는다** —
"신규 항목이 게이트를 조용히 빠져나간다"는 이 저장소의 반복 결함(§22.3 하드코딩 3필드 선례)에
대한 구조적 방어라서, 그 성질을 주석에 명시해 두면 리뷰가 짧아진다.

## 2. ⭐ T118 헤드리스 Live 하네스는 **턴 계수 실측**까지 확장된다

[[codegate-t118-transfer-persistence]]의 레시피 그대로에 더해, `serverContent.turnComplete`를
클라(`GeminiVoiceSession.tsx:426 onScammerTurnComplete`)와 **같은 지점에서** 세면
*"오프닝 인사가 사기범 턴 1로 세어지는가"* 같은 **계수 의미론**을 실측으로 닫을 수 있다.
architect가 코드 근거로 추정만 하고 못 닫은 항목이 이런 형태면 라이브 1회로 확정된다.

핵심: 클라의 `OPENING_TRIGGER_TURN` **원문을 그대로 복사**해 보내야 계수가 실제 앱과 일치한다
(`src/lib/realtime/GeminiVoiceSession.tsx:110`, `turnComplete:true`로 보낸다 — 그래서 오프닝 응답이 턴 1이 된다).

**참가자 대본으로 관찰 구간을 의도적으로 만들 수 있다.** T119에서는 게이트 도달 **전에**
"직접 확인해 보고 싶다"를 넣어, architect가 미검증으로 남긴 "대기 창"에서 모델이 상시 블록 규칙을
지키는지 관찰했다(2/2 회차 모두 *"막지 않는다"* 를 어기고 확인을 저지했다). **고치라는 지시가
아니면 고치지 말고 원문 인용으로 산출물에 남겨라** — T118에서 배운 것과 같다.

## 3. ⚠️ 새 워크트리 착수 비용 3종이 그대로 재발한다 (매번 확인할 것)

| 함정 | 실측(2026-07-28) |
|---|---|
| `node_modules` 부재 | 루트·`functions` **둘 다** 없다. 설치 전 `npm --prefix functions test`는 TS2307 수백 줄로 죽는다(코드 결함 아님) |
| `npm --prefix functions install`이 매니페스트를 고친다 | `functions/package.json` +1줄 · lock +28줄. **커밋 전 `git checkout --`로 되돌려라** — 되돌려도 node_modules는 남아 테스트는 그대로 통과한다 |
| 격리 에뮬레이터 포트 충돌 | 9499가 **이미 다른 에이전트에게 점유**돼 있었다. 임의로 고르지 말고 `netstat -ano \| grep LISTENING`으로 대역을 훑어 빈 포트를 고른 뒤 config를 쓴다 |

Storage 포트가 막히면 에뮬레이터가 **전체를 shutdown**한다(functions만 필요해도 그렇다) — config에
`storage` 블록이 있으면 그 포트도 반드시 비어 있어야 한다.

## 4. `docs/Tasks.md` Status 열에 planner 원문이 섞여 있을 때

T119 행의 Status 열은 planner의 실측 기록(무엇을 측정했고 무엇을 못 했는지)을 담고 있었다.
Status는 implementer 소유지만 **그 기록을 지우면 planner의 산출물이 유실된다.**
⇒ 내 상태를 **앞에 붙이고** 뒤에 `**planner 등재 원문(날짜, 보존)**:` 로 명시해 남겼다.
표 행이라 편집 후 **`awk -F'|' 'NR==N {print NF}'` 로 열 개수(10)가 유지됐는지 반드시 확인**한다.

관련: [[codegate-t118-transfer-persistence]] · [[codegate-t107-field-divergence]] · [[codegate-t83-verify-intercept]] · [[codegate-t95-verify-scenario]]
