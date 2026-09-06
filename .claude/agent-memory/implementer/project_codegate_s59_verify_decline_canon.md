---
name: project-codegate-s59-verify-decline-canon
description: §59.6 갱신 — deliverVerifyOffer 거절 문구 2종을 architect 정본으로 교체(VERIFY_DECLINE_ALREADY만 값 변경). liveTools.failureInstruction 인계는 "코드에 아직 없는 필드"로 확인, 이번 범위 무수정 판단.
metadata:
  type: project
---

브랜치 `feat/s59-tool-timing-wiring`(커밋 `ae4f0e4`, base `97e808c`)에서 [[project_codegate_s59_commit_ab_tool_timing]]이
남긴 콘텐츠 문구 공백(architect 정본 확정 전 draft)을 해소했다.

**정본 vs 초안 비교 결과**: `VERIFY_DECLINE_TOO_EARLY`는 architect가 implementer 초안을 한 글자도
안 고치고 그대로 정본 채택했다. `VERIFY_DECLINE_ALREADY`만 "이미 안내한 확인창구로 연결해 드리겠다고
하거나" 절이 삭제됐다 — 이유는 `already_announced` status가 **두 상태**(①`placedAt` 존재=호 전환
완료 ②`stage:"commit"`)에서 나가는데, ①에서 화자는 이미 확인창구의 다른 담당자라 "그 창구로
연결해 드리겠다"는 재연결 제안이 T118/R-1(전환 후 재권유 금지)과 `transferStateLine`을 정면으로
위반하기 때문. `docs/Architecture.md` §59.6 갱신 블록과 `docs/API.md` 부록 C 두 자리에 동일 원문이
정본으로 등재돼 있었고(사전에 grep으로 두 문서 원문이 바이트 단위로 일치하는지 대조 확인함),
소스는 그 사본이라는 위치 관계가 주석에 명시돼 있다.

**교체 검증 습관**: 정본 문구를 옮길 때는 사용자 지시가 준 "몇 줄"(8줄) 같은 요약치를 믿지 않고
원문 문서에서 실제 줄 수(11줄 comment block)를 직접 세어 그대로 복사했다 — "정확한 원문은 문서에서
직접 확인, 추측 금지"라는 지시가 명시적으로 요청한 부분.

**liveTools.failureInstruction 인계 판정**: architect가 §59.6 갱신 블록 자기 고지 (2)에서 지적한
"`offer_verification_desk` 실패 시에도 문자 경로 문면(`(지금은 문자를 보낼 수 없다…)`)이 나갈 수
있다"는 문제를, 실제로 `functions/src` + `src`를 grep해서 `failureInstruction`이 **오늘 코드에
존재하지 않는 필드**임을 확인했다(§59.10 커밋 C — `liveTools.ts` 신설 자체가 아직 미착수). 즉
현재 코드에 실재하는 결함이 아니라 미래 커밋 C의 설계 인계 사항이므로, 이번 범위에서 코드를
건드리지 않고 architect의 "커밋 C 착수 전 확인 대상" 인계를 그대로 유지하는 것이 맞는 판단이었다.
자체 게이트를 새로 만들지 않은 것도 동일 논리(모듈 상수라 G86-a/b/c 순회 밖이라는 자기 고지를
커밋 메시지에 남기고 신규 게이트는 만들지 않음 — architect가 이미 "후속 §59 패스 소관"으로 못박음).

**고정 테스트**: `functions/src/scenarios/__tests__/verifyIntercept.test.ts`에 문자열 동등 + "삭제된
절이 되살아나지 않았는지" 역검증 1건을 추가(기존 파일에 어떤 SMS_DECLINE_*/VERIFY_DECLINE_* 값도
고정하는 테스트가 전혀 없었다 — 새 관례를 세운 것). base 731 → 732(+1). 빌드·테스트 모두 통과
(`npm --prefix functions run build`, `npm --prefix functions test` — CLAUDE.md 표 명령 그대로 사용).
