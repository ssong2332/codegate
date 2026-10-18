---
name: t192-c1-hangup-decision
description: T192 C1 사기범 끊기 판정(decideScammerHangup·requestScammerHangup·endSession 허용목록) — 새 콜러블 추가 시 anonymousGate 정책표 카운트 갱신 필수, 정본이 작업 중 바뀐 사례
metadata:
  type: project
---

T192 C1(2026-10-19): `functions/src/scammerHangup/{decide,guidance,commit,relayContext,index,types}.ts` + `session/endReason.ts`.

- 새 콜러블을 `functions/src/index.ts`에 export하면 `shared/__tests__/anonymousGate.test.ts`의 정책표 · 진입점 수(26→27) · S 클래스 수를 같이 올려야 한다(G421 양방향). docs §68.3 표는 하류 docs 몫.
- onCall 본문을 테스트하려면 트랜잭션 본문을 `HangupTransaction<Ref>` 최소 면 함수로 내리고 가짜 tx로 고정했다. Firestore `Transaction`을 넘길 때 제네릭을 명시해야 한다(`<FirebaseFirestore.DocumentReference>`) — 안 하면 overload 추론이 AggregateQuery로 가서 TS2345.
- 작업 도중 architect가 §79.2/§79.18을 확정해 릴레이 행 조건이 바뀌었다(내 fail-closed 판정 → 정본 `legIndex < legCount-1`, 필수 키 `relay`). **Why:** 사용자 결정 행을 architect가 동시에 쓰는 구조. **How to apply:** 동시 설계 중인 행은 최소 구현 후 정본 도착 시 맞추고 차이를 보고.
- 소스 스캔 테스트에서 머리 주석의 "하지 않는 것" 목록이 금지 토큰 스캔을 때린다 → stripComments 후 스캔(재발 함정).
