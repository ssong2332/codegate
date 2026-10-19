---
name: project-codegate-t192-c6r-transfer-reach
description: T192 C6-R(R4) transferReachable 4행 조건 — 소스 스캔 함정 2건(부분 문자열 · 타입 리터럴 `}):`), 역검증 프로브가 tsc에 먼저 잡히는 형태, LF 파일 앵커
metadata:
  type: project
---

T192 C6-R(2026-10-20): `isVerifyTransferReachable`(functions/src/scammerHangup/transferReach.ts) — 폴백 ∧ 계열 B ∧ 오퍼 문서 absent만 false. decide 4행에 `&& i.transferReachable`, 입력 12키.

**Why:** 폴백 계열 B는 클라에서 오퍼가 열릴 길이 0(G393)이라 4행이 영구 차단 → 사기범이 끊을 수 없었다(OQ-A152 (가)).

**How to apply (함정):**
- "decide.ts가 transferReach를 import 안 한다"를 `includes("transferReach")`로 쓰면 키 이름 `transferReachable`에 걸린다 → `from "./transferReach"` 정규식으로.
- 함수 본문을 `indexOf("\n}")`로 자르면 여러 줄 입력 타입 리터럴의 `}): boolean {`에서 먼저 끊긴다 → `"): boolean {"` 뒤부터 찾는다.
- 역검증 프로브 `input.path !== "zzz"`는 TS2367로 빌드가 먼저 실패해 테스트 층에 못 닿는다(출력 0줄) → `Boolean(input) || …` 같은 타입 안전 상시-true.
- roleplay/index.ts 등 일부 파일은 LF다(`cat -A`로 확인) — CRLF 앵커 가정 금지. 프로브 스크립트는 앵커 검사 **뒤에** .bak을 쓸 것.
- G597 클라 전제 트립와이어: src/lib/verifyintercept/transferReachPremise.test.ts(play/page.tsx 읽기만).
Related: [[project-codegate-t192-c5-call-ending]]
