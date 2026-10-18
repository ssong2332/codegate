---
name: codegate-t192-c2-hangup-slot
description: T192 C2 끊기 규칙 슬롯(NONE/TOOL/SIGNAL) — F11 카운터 검출기가 정본의 "첫째·둘째·이번"을 문다, assembledPrompts 축을 운영 짝으로만 곱한 판단, 템플릿 바이트 동일 증명법
metadata:
  type: project
---

T192 C2(2026-10-19, 미커밋 인계) — `promptAssembly.ts` 끊기 줄을 `{{HANGUP_RULE}}`로, 17벌 끝 문장 교체, G505/G506 테스트 10건(1208→1218).

- F11/G130 `findCounterExpressions`를 정본 TOOL·SIGNAL에 걸면 `첫째`·`둘째`(경우 열거)와 `이번`(한자어 수사+단위 형태 오탐)이 잡힌다. 약화 대신 **정확 일치 허용 목록** + 주입 역검증으로 처리했다.
  **Why:** G505는 "횟수·턴 번호 0"만 요구하고 정본 문면이 서수 열거를 쓴다. **How to apply:** 정본 문면에 카운터 게이트를 걸 때는 실측 출력을 허용 목록으로 고정한다(deepEqual).
- `assembledPrompts()`에 `hangupMode` 축 추가: 운영 짝만(toolDriven true→none·tool, false→none·signal). 판정표에 행 추가(1387벌).
- NONE 무변화 증명: base 소스(`git show`)와 새 소스에서 템플릿 리터럴을 뽑아 슬롯→NONE 치환 결과가 같은지 비교(CRLF는 \n으로 정규화 — 템플릿 리터럴 의미와 같다).
- node `-e`에서 Git Bash `/tmp` 경로는 `C:\tmp`로 풀린다 — 스크래치패드의 `C:/...` 경로를 쓸 것.
