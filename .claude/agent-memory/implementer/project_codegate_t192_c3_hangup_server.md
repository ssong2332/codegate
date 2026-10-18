---
name: codegate-t192-c3-hangup-server
description: T192 C3 끊기 서버 배선 — 폴백 판정을 순수 모듈(fallback.ts)로 내린 이유, C3 단독 배포 시 Live end_call이 클라에서 unsupported로 떨어지는 위험, 기존 S5b 도구 테스트를 메신저 범위로 재지정한 판단
metadata:
  type: project
---

T192 C3(2026-10-19, 미커밋 인계 · 1218→1242).

- onCall `sendMessage`는 실행 불가 → 판정 입력 조립 · 변형 선택 · 효과를 `scammerHangup/fallback.ts` 순수 함수로 내리고 핸들러 자리는 소스 스캔(정규식 `\s*`로 CRLF 안전)으로 고정.
- ⚠️ 정본(§79.19 (5) 9)대로 C3에서 TOOL/`end_call`을 켰다. 클라 라우팅은 C5라 **C3만 배포하면 Live `end_call` → 클라 `unsupported`(guidance 없음)**. 폴백은 서버가 끊지만 클라가 `setPhase("ended")`를 즉시 해 마지막 오디오가 잘릴 수 있음(G515 = C5).
  **Why:** PR A(C2~C4)와 PR B(C5) 분리. **How to apply:** C5 전 배포 금지 여부를 보고에 반드시 적는다.
- `end_call`이 음성 세션 전부에 선언되면서 "도구 0 = tools []" 계열 기존 테스트가 거짓이 됨 → G534대로 메신저 범위(`end_call` 거짓)로 옮기고 음성 단언을 추가(약화 아님 — 판단 건으로 보고).
- G530 ⓓ 스캔이 주석까지 보므로 `scammerHangup/**`에서는 옛 필드명을 주석에도 쓰지 않는다(바늘은 `["scammer","Turns"].join("")`).
