---
name: project-codegate-t190-real-phone-1to4
description: T190-1~4 실폰형 통화 셸(2026-10-18) — 루트 lib 잎 모듈 강제(확장자 없는 상대 import 실패 실측), Navigator 약한 타입 TS2559, python heredoc의 \b→백스페이스 오염, 렌더 게이트 생존 신호 재지정, 루트 build/lint/tsc 미실행 경계.
metadata:
  type: project
---

T190-1~4(§73 — 스킨 감지 v2·토큰·배너·벨·진동·음량 모드·mockHost/linkAddress·통화 셸 재배치)를 한 워크트리에서 구현했다(커밋은 오케스트레이터). 기준 functions 967→972 · 루트 531→574, 둘 다 0 fail.

- ⭐ **루트 테스트 대상 lib 모듈은 값 import 없는 잎(leaf) 모듈이어야 한다.** `node --experimental-strip-types --test`는 확장자 없는 상대 import(`"./a"`)를 못 푼다(scratch 실측: fail). 앱 코드에 `.ts` 확장자 import 선례 0건. ⇒ 설계가 "detectSkin.ts가 deviceSkin.ts v2에 위임"을 지시했지만 v2 규칙표를 `detectSkin.ts`에 두고 `deviceSkin.ts`는 감지 결과를 **인자로** 받게 바꿨다(보고한 편차). 타입 import만은 strip돼서 괜찮다.
  **Why:** 다음 설계도 같은 위임 지시를 낼 수 있다. **How to apply:** 새 lib 모듈 간 런타임 의존이 필요하면 조합을 호출부(페이지)로 올리거나 같은 파일에 둔다.
- ⭐ **`Navigator`를 모든 속성이 옵셔널인 타입에 넘기면 TS2559(약한 타입)** — lib.dom(TS 5.9)에 `userAgentData`가 없다. 파라미터를 `object`로 받고 안에서 캐스트. 루트 tsc를 못 돌리는 환경이라 눈으로 잡았다.
- ⭐ **Bash heredoc 안 python 문자열의 `\b`가 실제 백스페이스(0x08)로 파일에 들어갔다**(mockScreenCopy 정규식 `\bwww`). 백슬래시가 든 코드는 Write/Edit 도구로 쓰고, 편집 뒤 `grep -l $'[\x01-\x08\x0b\x0c\x0e-\x1f]'`로 제어문자 검사.
- 렌더 게이트(T116) 생존 신호가 `title` 센티널이었는데 주소창이 `mockHost`를 그리면서 텍스트에서 사라짐 → `isRenderAlive(text, item)` = "훈련 종료" ∧ 그 항목의 mockHost로 재지정 + 주소창 렌더 식 차단 역검증 추가. mockScreenCopy의 `CREDENTIAL_LANDING_COPY[landingId]` 첫 등장은 kind 분기 **뒤**여야 하고 `function AppInstallMockup` 이후엔 0건이어야 한다 — 새 헬퍼는 두 함수 사이에 둔다.
- 오케스트레이터가 명령을 Verified 4종(functions build/test/lint · 루트 test)으로 제한 → 루트 `npm run build`·eslint·타입체크 **미실행**(워크트리에 `.env`도 없음). TS 구문만 `ts.createSourceFile().parseDiagnostics`로 확인(0건)하고 보고에 고지했다.
- G438 역검증은 `'{phase === "incoming" && ('`의 **첫 등장**을 오염시킨다 — play에 같은 문자열을 프리롤 블록보다 앞에 두면 역검증이 엉뚱한 곳을 친다(이번엔 수신 버튼을 삼항으로 둬서 회피).
