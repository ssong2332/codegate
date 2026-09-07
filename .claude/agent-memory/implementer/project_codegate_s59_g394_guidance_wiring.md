---
name: project-codegate-s59-g394-guidance-wiring
description: §59.6 갱신 2(G394) — verify claim 실패 조기 응답에 guidance 필드 배선. 순수 함수 buildAlreadyAnnouncedToolResponse 신설과, 그로 인해 필요해진 기존 하드코딩 테스트 2건의 부수 수정.
metadata:
  type: project
---

브랜치 `feat/s59-tool-backstop`(`5f89e12` 위에 새 커밋 `9aa1b67`, push 완료)에서
reviewer가 REJECTED한 "verify 클레임 실패 조기 응답에 guidance 없음"을 architect
확정 설계(Architecture.md §59.6 갱신 2 · G394)대로 반영했다.
[[project_codegate_s59_critical_verify_announce_race]]의 후속.

**배선 요지** — `functions/src/realtime/liveTools.ts`의 `buildLiveToolNames()`가
`offerVerificationDesk`를 채우는 **같은 스프레드/조건(계열A+advanced)** 안에서
`verifyAlreadyAnnouncedInstruction: VERIFY_DECLINE_ALREADY`도 함께 채운다(별도
`if` 신설 금지 — 부착 조건이 두 벌이 되면 §59.9 R1 패리티가 깨진다는 게 architect
경고였다). 클라 쪽 `src/lib/realtime/liveToolResponse.ts`에 순수 함수
`buildAlreadyAnnouncedToolResponse(call, liveTools)`를 신설해 `GeminiVoiceSession.tsx:399-403`의
객체 리터럴 `{status:"already_announced"}`(guidance 없음)를 한 줄 함수 호출로
교체 — "guidance가 실리는가"를 소스 문자열 검사가 아니라 단위 단언으로 걸 수
있게 했다는 게 architect의 핵심 의도.

**`failureInstruction` 재사용 금지 이유(architect가 명시적으로 기각한 후보 C)** —
그 문면은 "지금은 문자를 보낼 수 없다"는 문자(SMS) 경로 전용 문구라 verify
클레임 실패 상태에서는 **거짓**이 된다. 새 필드(`verifyAlreadyAnnouncedInstruction`)를
따로 두고, 값은 서버 `VERIFY_DECLINE_ALREADY` 상수의 **import 재사용**(리터럴
복사 금지, G386)으로 채웠다.

**부수 수정 2건(스코프 내 필수, 로직 무변경) — 신규 필드/치환이 기존
하드코딩 테스트를 깬 사례.** ①`functions/src/realtime/__tests__/geminiProvider.test.ts`의
"credentials.liveTools에 이름이 실린다" 테스트가 `assert.deepEqual`로 liveTools
객체 전체를 하드코딩하고 있어서, 새 옵셔널 필드 추가만으로 즉시 깨졌다(값
자체는 정상, 테스트가 구식). ②`src/lib/realtime/toolWindowWiring.test.ts`의
소스스캔 게이트가 `sessionCode.indexOf("return {", claimAt)`로 "claim 실패
분기의 return이 try보다 먼저"를 확인하고 있었는데, 리터럴 반환을 함수 호출로
바꾸자 그 문자열이 더 이상 매치되지 않아(다음 "return {"가 try 블록 뒤의 성공
분기로 밀려) 거짓 실패가 났다 — 검사 대상 문자열을
`"return buildAlreadyAnnouncedToolResponse(call, liveTools);"`로 갱신해
같은 의도(claim 실패 시 서버 미호출)를 그대로 유지했다. **두 수정 모두 "do not
touch" 목록(SMS 분기·클레임 가드 자체·play/page.tsx)에 해당하지 않는 테스트
파일이며, 사전 승인된 소스 편집(필드 추가·리터럴→함수 치환)의 직접적 결과라
필수 수정으로 판단**했고 커밋 메시지에 "부수 수정"으로 명시했다.

**테스트 결과**: functions 751→752(+1, 부착 조건 패리티 테스트 1건) pass/0
fail. root 415→417(+2, buildAlreadyAnnouncedToolResponse 단위 테스트 2건)
pass/0 fail. `npm --prefix functions run build`·`npm run build` 둘 다 통과.
대상 파일 `npx eslint` 무경고.

관련: [[project_codegate_s59_critical_verify_announce_race]] ·
[[project_codegate_s59_verify_decline_canon]](같은 "정본 문구 import 재사용,
리터럴 복사 금지" 관례) · [[project_codegate_s59_commit_c_review_fixes]](이
파일 `resolveToolCallKind`/`collectToolResponses` 설계의 선례).
