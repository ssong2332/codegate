---
name: codegate-s53-bank-transfer-gate
description: §53(§51 커밋 D) bank-security-verify-scam 이체 문자 구현 — afterScammerTurns:3 확정, deliverInCallSms 전환 게이트, API.md 드리프트 판단, 신선 워크트리 npm install 필요
metadata:
  type: project
---

**과업**: `docs/Architecture.md` §53이 재판정한 `bank-protect-account` 통화 중 문자(§51 커밋 D)
구현. base `18932cb`(§53 docs 병합 시점). PR #210(turn=1 시도)이 reviewer 결함 2건으로 반려된 뒤
architect가 §53에서 `afterScammerTurns:3` + `deliverInCallSms` 전환 게이트로 재확정. functions
667→677(+10), root 325→325(카탈로그 수 갱신 1건만, 신규 테스트 0건 — root는 T116 렌더 게이트가
`functions/`의 `mockScreens.ts`를 간접 반영할 뿐이라 새 root 테스트 파일은 불필요했다).

## ⭐ 가장 값나가는 것

**1. §53의 implementer 착수 순서(묶음③ 선행)를 사용자가 이미 명시적으로 우회 승인한 상태였다.**
§53.10은 "커밋 D는 §52 묶음③(무조건 드레인 해소) 뒤에 병합"을 원칙으로 못박았지만, 같은 절
§53.7(3)이 if/then 예외를 남겨 두었다: *"사용자가 D를 먼저 원할 경우, 값 3은 그대로 옳고
R5(연속 강제 발화)가 2연속→3연속으로 악화될 뿐 — 이미 등재된 결함의 정도 변화이지 새 결함이
아니다."* 이번 작업 지시문이 정확히 그 조건("지금 D를 먼저 진행")을 인용하고 있었다 — 즉
architect가 미리 설계해 둔 탈출구를 planner/user가 그대로 밟은 것. **How to apply**: architect
문서가 "A 먼저, B는 나중"이라고 못박아도 같은 절 안에 if/then 예외가 있는지 먼저 찾아라 — 있으면
그 조건이 지금 지시와 일치하는지 확인하고, 일치하면 원칙 위반이 아니라 설계된 분기다.

**2. API.md 드리프트 — architect의 "docs/API.md 0건" 지시가 선례(T118/R-1)와 충돌했다.**
§53.8은 `resolveInCallSmsPlan`을 `resolveVerifyOfferPlan`(T118/R-1)과 "같은 형태"로 만들라고
했는데, 그 선례는 응답 필드를 `announceInstruction?: string`으로 낮추면서 **docs/API.md의
deliverVerifyOffer Response 행도 함께 갱신**했다(architect 자신이 그 절에서 그렇게 했다). 그런데
§53의 G339는 "docs/API.md · docs/Database.md ... 0건"을 명시했다 — 즉 "같은 형태로 구현하라"는
지시와 "문서는 건드리지 마라"는 지시가 내부적으로 어긋난다. **판단**: AGENTS.md가 implementer의
docs/API.md 편집을 원천 금지하므로, 코드는 선례대로(옵셔널 필드 + 클라 가드) 정확히 구현하고
API.md는 손대지 않은 채 최종 보고서에 "architect에게 deliverInCallSms Response 행 갱신을
권고"로 명시했다. **Why**: 타입 안전성/정확성이 문서 텍스트 동기화보다 급이 높고, 문서 갱신은
architect 소유라 implementer가 대신 고치면 소유권 위반이다. **How to apply**: "다른 모듈과 같은
형태로 만들어라"는 지시를 받으면 그 선례가 건드린 파일 전체(코드+문서)를 먼저 확인하고, 이번
지시의 "무변경" 목록과 겹치는 파일이 있으면 코드만 선례를 따르고 문서 갱신은 보고서의 권고
사항으로 넘겨라 — 조용히 문서를 고치지도, 조용히 타입을 required로 남겨 선례에서 이탈하지도
말 것.

**3. 클라 가드 패턴은 항상 grep으로 먼저 찾아라 — `enqueueTurnInstruction(result.announceInstruction, "verify")`
바로 옆줄에 `if (requestCallMode === "realtime" && result.announceInstruction)`가 이미 있었다.**
응답 타입을 옵셔널로 낮추면 `enqueueTurnInstruction(text: string, ...)` 호출부가 컴파일 에러가
나는데, 그 정확한 가드 형태(truthy 체크)가 verify 오퍼 경로에 이미 존재했다. 새 패턴을 발명하지
않고 그대로 복제했다(`src/app/session/play/page.tsx:554` 선례 → `:457` 신규 적용).

**4. 새로 뜬 워크트리는 `functions/node_modules`·루트 `node_modules`가 둘 다 없다 — 빌드 전에
반드시 설치.** `npm --prefix functions run build`가 "Cannot find module 'firebase-functions'"류
에러 수십 줄을 쏟아냈는데, 원인은 코드가 아니라 **미설치**였다. `cd functions && npm install`
(⛔ `npm --prefix functions install` 금지 — T130의 `file:` 오염 경로)로 해결. 루트도 마찬가지로
`npm install`(cwd=루트, `--prefix` 없이) 필요했다. 설치 후 `functions/package.json`·루트
`package.json`에 `file:`이 안 섞였는지 grep으로 확인하는 습관을 유지했다.

**5. `openingLine.ts:80`의 "카탈로그 최소 afterScammerTurns는 2"라는 주석이, 이번 작업 전까지
그 불변식의 **유일한 수호자**(주석일 뿐 게이트가 아님)였다.** §53.8 7이 요구한 하한 트립와이어를
`inCallSms/__tests__/buildDoc.test.ts`에 신설해 그 주석을 기계 검증으로 승격했다 —
"turn=1 → 실시간에서 오프닝 직후(참가자 발화 0건) 도착 / 폴백에서 영구 도달 불가"라는 §53.3의
근거를 실패 메시지에 그대로 인용했다(G159 선례 형식 — 트립와이어 실패 메시지에 처방을 담는다).

## 자잘한 판단
- `resolveInCallSmsPlan`/`buildInCallSmsResponse`를 `functions/src/inCallSms/buildDoc.ts`에
  `verifyIntercept/buildDoc.ts`의 `resolveVerifyOfferPlan`/`buildVerifyOfferResponse`와 완전히
  같은 형태로 신설했다 — 전용 테스트 파일(`inCallSms/__tests__/buildDoc.test.ts`)도 처음 생겼다
  (이전까지 `inCallSms/buildDoc.ts`는 `scenarios/__tests__/inCallSms.test.ts`가 콘텐츠 계약만
  검증했고 조립 판정 전용 테스트가 없었다).
- `fallbackTurn.ts`의 `pickFallbackTurnInstruction` 우선순위 표에 새 행을 끼워 넣을 때 기존
  함수 시그니처·`FallbackTurnState` 타입은 1바이트도 안 건드렸다 — 조건 `smsDue && !verify?.placed`
  하나만 추가(§53.8 4가 요구한 "신규 입력 0건"과 일치).
- `docs/Tasks.md`에 이 작업을 담당하는 행이 없다(§53.12 6이 이미 고지한 갭) — Status 열을
  갱신할 대상이 없어 건드리지 않았다. 커밋 메시지 트레일러는 사용자가 지정한 그대로
  `Refs: (미등재 — planner 인계, §51/§53/OQ-A49)`를 썼다.
- `bankSecurityVerifyScam.prompt.ts:61`("방금 보내드린 확인번호")의 §52.7 F-A 결함은 **이번
  작업 범위 밖**(§53.8 델타 표에 없고 사용자 지시에도 없다)이라 손대지 않았다 — line 62(계좌
  낭독, G316)만 교체했다. 아직 미해결 상태로 남아 있다(§52.7(5)가 "지금 닫는다"로 확정했지만
  실제 코드는 여전히 옛 문구다).

관련: [[codegate-s45b-verify-anchor]](T118/R-1 원 구현) · [[codegate-t118-transfer-persistence]] ·
[[codegate-t130-npm-drift-guard]](install 오염 회피) · [[codegate-t116-render-gate]](root 렌더
게이트 카탈로그 수 갱신)
