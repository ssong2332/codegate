---
name: project-codegate-s59-critical-verify-announce-race
description: §59 커밋 D reviewer REJECTED(Critical) 수정 — verify 오퍼 announce 이중 발동 방지(SMS와 달리 서버측 뮤텍스가 없어 클라 사전 클레임 가드를 신설). 레이스를 실제로 재현하는 시뮬레이션 테스트 설계.
metadata:
  type: project
---

브랜치 `feat/s59-tool-backstop`(main 기준, `a2869e7` 위에 새 커밋 `a91950f`)에서 reviewer가
REJECTED한 Critical 1건을 고쳤다. [[project_codegate_s59_commit_d_tool_backstop]]의 후속.

**핵심 문제 — SMS와 verify 오퍼는 "이중 발동 방지"의 근거가 다르다.** SMS는 서버
(`deliverInCallSms`)가 Firestore `.create()`(원자적 존재 검사)로 진짜 뮤텍스를 갖고 있어
`result.status === "delivered"` 체크만으로 충분했다(커밋 D 때 이미 닫힘). verify 오퍼의 announce
단계(`resolveVerifyOfferPlan`, `functions/src/verifyIntercept/buildDoc.ts:90-98`)는 **설계상
`persist:false`** — `placed===false`인 한 몇 번을 불러도 **무조건** `includeInstruction:true`를
돌려준다(멱등하지 않음, §38.4 후보 E의 의도된 결과이지 버그가 아니다). 그래서
`result.status==="announced"` 응답값 검사를 추가해도 소용없다 — 서버가 구분할 상태 자체가 없다.
모델 도구 경로(`GeminiVoiceSession.dispatchToolCall`)와 앱의 백스톱(지연 발동, [[project_codegate_s59_commit_d_tool_backstop]]) 경로가 거의 동시에 도착하면 **둘 다** 서버를 불러 **둘 다**
`announceInstruction`을 받는다.

**해법 — 응답을 보고 판단하지 않고 요청을 보내기 *전에* 막는다.** 신규
`src/lib/realtime/verifyAnnounceGuard.ts`에 `{inFlight:boolean}` 상태를 두고
`claimAnnounceSlot`(check-and-set, JS 단일 스레드라 별도 락 불필요)/`releaseAnnounceSlot`
(finally에서 성공·실패 무관 호출) 두 순수 함수만 노출했다. 부모(`page.tsx`)가 상태를 소유하고,
자식(`GeminiVoiceSession`)에는 `claimVerifyAnnounceSlot`/`releaseVerifyAnnounceSlot` **콜백**으로
내려준다 — 이 저장소에 `RefObject`를 prop으로 직접 넘기는 전례가 없어 기존 handlersRef 콜백
패턴을 그대로 따랐다. **두 신규 prop은 의도적으로 옵셔널이 아니다**(다른 4개 §59.10 콜백과 다른
점) — 옵셔널이면 가드 없이도 컴파일이 통과해 이중 발동 방지가 조용히 빠질 수 있다는 판단.

**클레임 실패 시 응답 — 서버 상태값 재사용, 신규 문자열 0건.** 모델 도구 경로가 클레임에
실패하면(백스톱이 이미 요청 중) 서버를 부르지 않고 `status:"already_announced"`
(`DeliverVerifyOfferStatus`에 이미 있는 값)를 즉시 돌려준다 — G386(한국어는 서버 소유) 위반
없이 "이미 처리 중"이라는 뜻을 정확히 전달한다.

**클레임 위치의 정확성 — "단계를 굳히기 전"이 핵심.** `page.tsx`의 백스톱 게이트는
`shouldFireBackstop`(§59.8) 통과 직후, `verifyOfferPhaseRef.current = "announced"` 대입보다
**먼저** 클레임한다(실패하면 그 자리에서 return, phase도 안 건드림) — [[project_codegate_s59_commit_d_tool_backstop]]가 이미 확립한 "게이트가 단계 전이보다 먼저"(R8) 순서 관례에 새 게이트를
끼워 넣은 것뿐, 순서 자체를 재정의하지 않았다.

**레이스를 실제로 재현하는 테스트 설계(reviewer가 소스스캔만으로는 부족하다고 명시적으로 지적한
부분).** `GeminiVoiceSession.tsx`/`page.tsx`는 마이크·WebSocket 강결합이라 이 저장소 테스트
러너로 직접 못 돌린다([[feedback_unobservable_behavior_gates]]) — 그래서 두 실제 호출부가
따르는 순서(①동기 claim ②실패시 서버 호출 없이 return ③성공시 비동기 서버 호출 ④finally
release)를 그대로 흉내 낸 두 "요청자" 함수로 시뮬레이션했다(`verifyAnnounceGuard.test.ts`).
서버 호출은 `setTimeout` 지연으로 대체해 도구 콜백이 `turnComplete`보다 먼저/나중에 도착하는
실제 타이밍 불확실성(§59.13류 한계)을 양방향(지연 [5,5]와 [1,20]) 다 검증했고, **가드를 우회한
대조군은 실제로 2번 나간다**는 것도 같은 파일에서 확인해 시뮬레이션 자체가 진짜 레이스를
반영한다는 것을 증명했다(대조군 없는 시뮬레이션은 "우연히 항상 통과하는 가짜 테스트"일 위험이
있다 — [[feedback_false_reassurance_over_precision]]과 같은 경계).

**소스스캔 테스트 작성 시 codeOnly()의 함정 — 두 번 걸림.** `toolWindowWiring.test.ts`의
`codeOnly()`는 주석 줄을 **완전히 제거**한다(공백으로 치환이 아니라 배열에서 빼고 나머지를
join). 처음 작성한 두 테스트가 (1) 리터럴 문자열에 실제 코드의 들여쓰기 공백을 안 넣어서,
(2) 코드 사이에 있던 주석 줄이 사라진다는 것을 잊고 정규식에 `\/\/[^\n]*\n` 자리표시자를
넣어서 각각 실패했다 — `npm test` 실행 결과로 즉시 잡혔고, 실제 코드가 아니라 테스트 쪽
가정이 틀렸다는 것을 스택트레이스로 확인 후 정규식/문자열을 codeOnly() 이후의 실제 형태에
맞춰 고쳤다(코드는 무편집).

**Node 테스트 러너 — 상대 import에 `.ts` 확장자 필수(재확인).** `verifyAnnounceGuard.test.ts`가
`./verifyAnnounceGuard`(확장자 없이)로 import해 `ERR_MODULE_NOT_FOUND`가 났다 — 이 저장소의
`node --experimental-strip-types --test` 관례([[project_codegate_s59_commit_c_review_fixes]]가
이미 문서화)를 그대로 재확인, `.ts`를 붙여 해결.

**함께 정정한 스테일 주석** — `GeminiVoiceSession.tsx`의 offer_verification_desk 분기 주석이
"announce는 문서를 쓰지 않는 멱등 단계라 두 경로가 동시에 존재해도 경합이 생기지 않는다"고
적혀 있었는데, 이번 조사로 **틀린 주장**임이 확인돼(persist:false ≠ 멱등) 정정 주석을 남겼다.

**인계 1건(블로킹 아님, reviewer Major #2)** — `verifyAnnounceTurnsRef` 턴 앵커가 모델 콜백
시점에 따라 한 턴 이르게 잡힐 수 있는 문제는 이번에 다루지 않았다. 라이브 검증 전까지 미해결로
커밋 메시지에 명시.

**테스트 결과**: root `npm test` 398→415(+17: 가드 8 + 배선 9) pass/0 fail. functions
`npm --prefix functions test` 751(무변경, functions/** 0줄 접촉). `npm run build`·
`npm --prefix functions run build` 둘 다 통과. `npx eslint`(대상 파일) 무경고.

관련: [[project_codegate_s59_commit_d_tool_backstop]] · [[feedback_unobservable_behavior_gates]] ·
[[feedback_false_reassurance_over_precision]] · [[project_codegate_s59_commit_c_review_fixes]]
(node 상대 import `.ts` 확장자 관례의 선례).
