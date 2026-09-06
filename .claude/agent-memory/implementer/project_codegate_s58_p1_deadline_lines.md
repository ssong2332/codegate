---
name: project-codegate-s58-p1-deadline-lines
description: T-없음/§58 P1 — 14개 시나리오 프롬프트의 죽은 마감 문구("5~8분/5~8턴 … 밀도 있게") 치환 구현. G379 재생성 상태 반영, 잔여 스테일 주석 2건 미수정.
metadata:
  type: project
---

브랜치 `fix/s58-p1-scenario-deadline-lines`(base `5def713`), 커밋 `95be01d`.

## 무엇을 했나
`docs/Architecture.md` §58(architect 판정)의 P1 처방 — 14개
`functions/src/scenarios/*.prompt.ts`의 `[진행 방식]` 마지막 절 앞부분
("이 대화는 5~8분/5~8턴 내외의 짧은 통화다 — … 밀도 있게 진행한다")을
"정해진 시간/턴 수에 쫓기지 말고 상대의 반응을 보며 다음 단계로 넘어간다"
계열 문구로 치환. 뒷절("네 쪽에서 대화를 마무리하지는 않는다", §50.7 처방)과
`[진행 강제]` 블록(요구 도달 보장, G372)은 한 글자도 안 건드림. 새 반응성
지시 문장도 추가하지 않음(G377 — 이미 있는 `CONVERSATION_STYLE`이 2회째
재발한 원인이라 "더 반응하라" 문장 추가는 기각됨).

## G379 — 계획에 없었지만 적용한 것
planner의 작업 지시문에는 G379(clone 2종 재생성 상태 줄 되돌리기) 언급이
없었지만, `docs/Architecture.md` §58.9 순서②가 "P1 한 커밋"의 필수
구성요소로 명시했고, `familyAccidentDeepvoice.prompt.ts`·
`grandchildImpersonation.prompt.ts` 상단 주석에 T109/T110이 남긴 동일
프로토콜 선례("다음에 이 파일이나 공통 조립부를 고치는 사람은 이 줄을
재생성 대기 중으로 되돌려야 한다")가 실재해서, 그 선례를 따라 두 파일의
"재생성 완료" 마커를 "재생성 대기 중"으로 되돌리고 §58 P1 날짜(2026-09-06)
주석을 추가했다. planner 인계 프롬프트가 침묵한 하위 스텝이라도 architect
설계 문서가 같은 커밋의 필수 요소로 못박았으면 그것은 스코프 밖 추가가
아니라 P1 자체의 일부로 판단.

## 의도적으로 안 고친 것 (스코프 경계 판단)
- `institutionalImpersonation.prompt.ts:25`·`familyAccidentDeepvoice.prompt.ts:52`
  상단 주석 `// [진행 방식]의 5~8분/5~8턴 = DECISIONS #10 데모 타겟과 정합.`
  — 본문 마감 절은 치환됐는데 이 근거 주석은 이제 스테일 상태다. 하지만
  지시문이 "그 마감 문구가 있는 그 줄만" 치환하라고 명시했고 이 주석은
  다른 줄(별개 top-of-file comment)이라 손대지 않음. 리뷰/QA 단계에서
  드러날 수 있는 잔여 불일치로 남겨둠 — 고치려면 별도 승인 필요.
- `publicMeta.ts`의 `estimatedDuration: "약 5~8분"`(14곳) — 이건 세션 소요
  시간 안내 메타데이터이지 모델에게 주는 마감 지시가 아니므로 §58의 대상이
  아니라고 판단, 미접촉.
- `scenarios/__tests__/scenarios.test.ts:692`의 벤치 문자열 — architect가
  "이미 스테일한 무해 샘플"이라고 명시적으로 판정했으므로 미접촉.
- `inCallSms.ts:153` 주석의 "5~8턴 내외" 언급 — 코드 주석일 뿐 프롬프트
  본문이 아니라 미접촉.

## 검증 결과
- grep: 14개 대상 `*.prompt.ts` 파일에서 "5~8분"·"5~8턴"·"밀도 있게"
  전부 사라짐(0건). 잔여 히트 2건은 위 "의도적으로 안 고친 것" 주석뿐.
- `npm --prefix functions test`: **713 pass / 0 fail**(이전 CLAUDE.md
  기록 기준값 616 pass, 2026-07-29 — 그 사이 여러 PR로 자연 증가, 이번
  변경으로 인한 회귀 아님). 이 문구를 고정하는 테스트는 architect 판정대로
  0건이었고 실측도 그대로였다.
- `npm --prefix functions run build`: 통과.

## OQ-A70 상태 메모
`docs/Architecture.md`의 OQ-A70(P1 대체 문면 방향 a/b/c)은 문서상 여전히
User 소유의 "열린 질문"이지만, 이번 작업은 planner가 명시적으로 방향 (b)
채택을 지시해서 그 지시를 따랐다. 문서(§58 본문, OQ-A70 행) 자체는
건드리지 않았으므로 공식적으로 이 OQ를 "닫는" 것은 architect/planner
소관 — 코드 구현과 문서 상태(OQ 여전히 open)가 당분간 불일치할 수 있다.
