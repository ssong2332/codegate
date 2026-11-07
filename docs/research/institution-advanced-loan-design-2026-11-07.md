# 기관 사칭 고급(`fv-c5fj`) — 적은 금액 통과 · 대출 안내 중 끊김 · 앱 안 대출 체험 설계 (2026-11-07)

## 금지 · 범위 (최상단)
- **1단계 산출물 = 이 문서뿐이다.** 코드 수정 · 테스트 실행 · 실 키 프로브 · 운영 Firestore 읽기/쓰기 · `.env` 열람은 0건이다.
- 구현(2단계)은 메인 세션이 "구현 시작"이라고 한 뒤, 지금 돌고 있는 4개 세션(서버 · 전화 앱 · 문자 · 이체 화면) PR이 main에 병합된 다음 **최신 main에서** 시작한다. 이 문서의 파일:줄은 main `10634035` 기준이다.
- 지킬 것: 실제 기관 · 금융회사명 0(가상명만, 예외 한빛지방검찰청) · `fv-akj5` · `fv-6s5p` · 은퇴 `fv-pgqt` 바이트 무변경 · 세션 화면에 '모의' · '훈련용' 0(G437) · 실제 대출 · 실제 앱 · 실제 돈 0 · 금액 값은 콜백 · 네트워크 · 저장소로 나가지 않는다(G138 — 비교 결과 하나만).
- 표기: **확인** = 파일:줄 · 출처 원문이 있다. **추정** = 추론이며 확인 방법을 붙였다. **미확인** = 출처를 찾지 못했다.

## 0. 결론 요약
| # | 문제 | 원인(확인 여부) | 처방 | PR |
|---|---|---|---|---|
| 1 | 적은 금액을 보내도 넘어간다 | ① 요구액 원천이 없다 — 안전계좌 문자에 금액 줄 0 · 단계 문면에도 금액 0 (**확인**) ② `fv-c5fj`는 후속 단계 변형이라 4-c 판정 D-1에서 빠져 "적게 보냄(D-4a)"이 끊기를 막지 못한다 (**확인**) ③ 통화 전사의 한글 수사("삼백만 원")를 금액 파서가 못 읽는다 (**확인** — 파서 정규식이 숫자만 본다) | 요구액 = 통화에서 사기범이 마지막으로 말한 금액(한글 수사 포함) → 없으면 문자 금액. 단계 · 수법 · 문자에 같은 구체 금액(980만 원). 후속 단계 변형도 D-4a · 화면 제출 전 goal 끊기 금지 | **PR-A** (작음 · 먼저) |
| 2 | 대출 안내 중 끊는다 | ① 마무리 지시 `GOAL_WRAP_UP_INSTRUCTION`("할 일은 모두 마쳤다 … `end_call`")이 **안전계좌 문자 도착 + 3발화**에 주입된다 — 이체 제출 여부 · 대출 단계 진행과 무관 (**확인** 코드 경로 · 해당 세션에서 실제로 났는지는 **추정** — 확인 방법 §2.3) ② 대출 단계가 앱 밖 행동("금융회사에서 대출을 받아")이라 앱 안에서 할 일이 없다 (**확인** 문면) | PR-A에서 ①의 기준을 "문자 도착"에서 "이체 화면 제출"로 옮긴다(응급). PR-B에서 대출을 앱 안 체험으로 바꾸고 `fv-c5fj`를 3통화 흐름으로 재구성한다 | PR-A · **PR-B** (큼) |

권장안 한 줄: **PR-A(금액 비교 · 끊기 응급)를 먼저 내고, PR-B는 카드사 다통화 런타임(`startCallLeg` · 레그)을 재사용해 "검사 → 금융회사 대출 확인 상담원(진짜) → 검사 재통화" 3통화로 만든다.** 확인 가로채기 방식은 목소리가 사기범과 같아 "다른 사람이 전화했다"는 현실을 재현하지 못한다(§5).

## 1. 문제 1 — 적은 금액 통과: 코드 경로
| 단계 | 사실 | 근거 |
|---|---|---|
| 1 | 안전계좌 문자 본문에 "금액:" 줄이 없다 | `functions/src/scenarios/inCallSms.ts:244` |
| 2 | 문서 `transferAmount`는 본문 금액 줄에서만 만든다 → 없음 | `functions/src/inCallSms/buildDoc.ts:39` · `:60` |
| 3 | 통화 중 문자 경로의 미리 채움은 `bankName` · `holder` · `amount`뿐, `requestedAmount` 없음 | `src/lib/incallsms/inCallSms.ts:51-60` · `src/components/InCallSmsOverlay.tsx:360` |
| 4 | 비교 표 C1(요구액 모름) → 비교 결과 `undefined` | `src/lib/bankapp/bankApp.ts:140-141` · 호출 `src/components/MessengerFakeLanding.tsx:1003-1011` |
| 5 | 서버는 비교 결과가 `less`일 때만 "모자란다" 지시(L1) | `functions/src/inCallSms/confirmResult.ts:97-101` · `functions/src/inCallSms/index.ts:392-399` |
| 6 | 사기범 단계 · 수법에 금액이 없다 — "그 화면에서 금액을 직접 넣어" · "금액만 넣고 이체" | `flowVariants.ts:373-374` · `:377-378` (F4 `amountPlaceholder.test.ts` A2 대상에도 기관 사칭이 없다 `:31-37`) |
| 7 | 설령 `less`가 와도 `fv-c5fj`는 4-c에서 빠진다(D-1 후속 단계 변형) → 적게 보낸 뒤 goal 끊기가 열린다 | `functions/src/scammerHangup/goalAction.ts:169` · D-4a는 `:176` |
| 8 | 메신저 경로의 "가장 최근 사기범 금액" 함수가 있다(`latestDemandAmount` · `lastAmountIn`) — 그러나 숫자(`\d`)가 있어야 읽는다 | `bankApp.ts:149-172` |
| 9 | Live 출력 전사에는 한글 수사 금액이 실제로 나온다: *"삼백만 원"* · *"구만 구천 원"* · *"5백만 원"* · *"3천만 원"* | `docs/research/p2-live-probe-2026-11-01.md:32` (실 키 실측 전사) |

### 1.1 요구액 판정표 (PR-A · 통화 중 문자 이체 화면 공통)
| # | If | Then (요구액) |
|---|---|---|
| R1 | 화면을 여는 순간까지의 사기범 대사(Firestore `messages` + 아직 올리지 않은 Live 전사) 중 금액이 있다 | **가장 최근** 금액 — 숫자 · 한글 수사 · 섞임("5백만", "구만 구천") 모두 |
| R2 | R1 없음 ∧ 문자 문서 `transferAmount` 있음 | 문자 금액(종전 `amount`) |
| R3 | 둘 다 없음 | 없음 — 비교 결과를 보내지 않는다(C1 그대로) |
- 금액 값은 클라 메모리 안에서만 쓰인다(G138). 서버로는 종전처럼 `less` · `equal` · `more` 하나.
- ⚠️ 한계(**추정**): 사기범이 "980만 원 먼저 옮기시고 나머지 4천만 원은 …"처럼 한 대사에 두 금액을 말하면 마지막 금액을 고른다. 단계 문면이 금액을 하나로 고정해(§1.2) 빈도를 낮춘다. 확인 방법: PR-A 실 키 프로브 전사에서 화면 열기 직전 사기범 대사의 금액 수를 센다.
- 한글 수사 파서: `일~구` · `십/백/천` · `만/억` 조합과 숫자 섞임(예: "9백8십만 원" = 9,800,000)을 읽는다. 서버 `functions/src/roleplay/linkMarker.ts` `demandAmountFrom`과 같은 규칙으로 맞추고 드리프트 테스트를 둔다(메신저도 같은 이득).

### 1.2 금액을 말 · 문자 · 화면에서 하나로 (F4 방식)
| 위치 | 지금 | 바꿈 | 근거 |
|---|---|---|---|
| 이체 단계 문면 | 금액 0 | "참가자가 말한 예금 중 우선 **980만 원**을 옮기게 한다(1회 이체 한도 안)" | 카드사 R1 검사 레그가 이미 같은 값 `flowVariants.ts:857` · 1회 한도 1,000만 원 `in-service-experience-plan` §12.1 #2 |
| 수법 인용구 | "금액만 넣고" | "…980만 원만 넣고 이체 누르시면 됩니다" | F4 A1 · A2 |
| 문자 본문 | 금액 줄 0 | `금액: 9,800,000원` 줄 | 문자 금액 = R2 원천 |
- ⚠️ 문자 항목 `institution-safe-account`는 초급 `fv-5cn4` · 중급 `fv-hktx` · 은퇴 `fv-pgqt`도 쓴다(`flowVariants.ts:942` · `:961` · `:383`). 은퇴 변형 무변경 규칙 때문에 **기존 항목은 고치지 않고** 고급 전용 새 항목(예: `institution-asset-safe-account`, 같은 계좌 · 금액 줄 추가)을 만든다. 랜딩은 `safe-account-transfer` 재사용이 원칙이고, 랜딩 id 유일 규칙(`mockScreens.test.ts` T129)에 걸리면 같은 문구의 새 id를 `BANK_TRANSFER_LANDINGS`에 더한다(구현 때 테스트로 판정).
- 참가자가 980만 원보다 적은 잔액을 말한 경우: 사기범이 "그 잔액 전부"처럼 다른 금액을 말하면 R1이 그 금액을 요구액으로 쓴다(문자 금액보다 말이 우선). **추정** — 실측으로 빈도 확인.

### 1.3 끊기 판정 (PR-A 응급 · PR-B에서 레그 판정으로 대체)
| # | 바꿀 판정 | 지금 | PR-A |
|---|---|---|---|
| H1 | 4-c D-1 | 후속 단계 변형 = 대상 아님(`goalAction.ts:169`) | 후속 단계 변형도 **D-4a(적게 보냄) · D-5(결정 화면 미제출)** 를 본다. `give_up`은 막지 않는다(종전 원칙) |
| H2 | C-5 기준점 | 필수 문자 **도착** 뒤 발화 ≥ 3(`goalAction.ts:69-77`) | 결정 화면 **제출**(`landingSubmitted` ∧ 비교 ≠ `less`) 뒤 발화 ≥ 3 |
| H3 | 마무리 지시 `planGoalWrapUp` | 같은 C-5로 `wrap_up`(`inCallSms/index.ts:224-238`) | H2 기준을 따른다 → 이체 전 · 적게 보낸 상태 · 대출 설명 중에는 "할 일 모두 마쳤다" 지시가 나가지 않는다 |
- 은퇴 `fv-pgqt`도 같은 함수를 지나지만 배정되지 않으므로 바이트 변화가 아니다(판정 함수 변경). 바이트 고정 테스트 대상은 조립 프롬프트다 — 구현 때 `fullAuditDelta` 로 재증명한다.

## 2. 문제 2 — 대출 안내 중 끊김
### 2.1 코드 경로 (확인)
| 단계 | 사실 | 근거 |
|---|---|---|
| 1 | `fv-c5fj` = 후속 단계 변형(`goalFollowUpUserTurns: 3`) | `flowVariants.ts:399` · `:1001` |
| 2 | 남은 필수 문자 0(안전계좌 문자 도착 뒤) → `planGoalWrapUp` → C-5 참이면 `wrap_up` | `functions/src/inCallSms/index.ts:224-238` · `goalAction.ts:88-94` |
| 3 | C-5 = 안전계좌 문자 **도착** 발화 + 3(다음 발화 기준 −1) — 제출 여부 무관 | `goalAction.ts:69-77` · `:93` |
| 4 | 주입되는 지시: "이번 통화에서 할 일은 모두 마쳤다 … 새 요구도 꺼내지 마라 … `end_call` 도구를 불러 통화를 끝내라" | `functions/src/scammerHangup/guidance.ts:30-31` |
| 5 | 대출 단계 문면 자체도 "거절 · 망설이면 … 마무리"로 끝나고, 행동은 앱 밖("금융회사에서 대출을 받아") | `flowVariants.ts:435` |
- 시간 순서(**추정**): 문자 도착(u) → 참가자 링크 열기 · 이체(u+1~2) → 사기범이 대출 이유 설명 시작(u+2) → u+3 응답에 마무리 지시가 붙는다 → 대출 설명 도중 `end_call`. §115 주석의 관측 "대출 요구는 도착 뒤 0~1발화"(`flowVariants.ts:395-397`)는 **참가자가 링크를 바로 누르지 않는 경우**를 셈에 넣지 않았다.

### 2.2 PR-A만으로 되는 것 · 안 되는 것
| 항목 | PR-A 뒤 |
|---|---|
| 이체 전 · 적게 보낸 상태의 마무리 지시 · goal 끊기 | 막힘 |
| 이체 뒤 대출 설명 도중 끊기 | 3발화 여유가 이체 제출 시점부터라 줄어듦(**추정**) — 근본 해결 아님 |
| 대출이 앱 밖 행동 | 그대로 → PR-B |

### 2.3 운영 확인 방법 (메인 몫 — 이 세션은 운영 로그를 읽지 않았다)
`firebase functions:log --only deliverInCallSms`에서 신고 세션의 `"[§115] 할 일 완료 — 마무리 지시"` 줄과 시각을 보고, 같은 세션 `scammerHangup` 승인(reason)과 비교한다. 줄이 있으면 2.1이 원인으로 **확인**, 없으면 모델 자체 마무리(단계 문면 5행)로 본다.

## 3. PR-B — 앱 안 대출 체험 흐름표
현실 근거 표기: S = `in-service-experience-plan` §2.2 X1 행의 출처. 금감원 소비자경보 2024-35호(2024-12-10, "부정사기 대출 연루 → 정상 대출임을 입증해야 한다며 대출금 요구" · "국가기관은 대출을 권유하지 않는다") · 2025-1호(2025-02-13, 가족 · 금융회사에 알리지 말라) — `flowVariants.ts:385-387` · `:429-432` 주석.

| # | 통화 · 화면 | 등장 | 내용 | 서버 판정 | 리포트 "속은 순간" | 현실 대조 |
|---|---|---|---|---|---|---|
| F1 | 통화 1 (수신) | 검사(가상 · 남) | 머리 4단계 그대로(범죄 연루 · 안심 · 자산 규모 · 인증번호) | 종전 문자 게이트 | (인증번호 불러 줌 — 종전) | **확인** C10 · C11 · S16 |
| F2 | 통화 1 · 문자 → 이체 화면 | 검사 | 안전계좌 문자(금액 980만 원) → 링크 이체 화면. 적게 보내면 L1 지시로 "모자란다 · 마저" | 4-c D-4a · D-5(레그 판정 §6) | `safe-account-transfer` 종전 문면 | **확인** 기관형 안전계좌 경보 · 금액 고정은 **다름(의도)** — 실제는 잔액 전부 요구가 흔함(**추정**) |
| F3 | 통화 1 | 검사 | 대출 이유: `LOAN_PROOF_REASON`(정상 대출로 명의 도용 입증 · 보관 뒤 상환) | — | — | **확인** 2024-35호 |
| F4 | 통화 1 · 문자 → `loan-apply` | 검사 → 가상 금융회사 문자 | "OO캐피탈 비대면 대출로 신청하시면 됩니다, 안내 문자 보내 드리겠습니다" → `[가온캐피탈] 비대면 대출 신청 안내` 링크 문자. 사기범이 "용도는 생활비로 고르세요" 코칭 | 새 문자 `institution-loan-guide`(link · 필수 · 레그 0) | `loan-apply` 제출 = "명의 도용 입증을 빌미로 한 대출 신청 유도" | 대출 신청 유도 **확인**(2024-35호 — 실제는 대출중개업체 경유). 신청 링크를 문자로 받는 형태는 **추정** — 확인 방법: 금감원 경보 원문 · 피해 사례 보도에서 "안내 문자" 표현 검색 |
| F5 | `loan-apply` 화면 | 참가자 혼자 | ① 본인 확인(생체 인증 모션 — 이체 세션 공용 컴포넌트) ② 한도 조회(가상 한도 · 금리 표시) ③ 대출 금액(한도 안 · 금액 칸) ④ **대출 용도 선택**(생활비 · 사업자금 · 주택 · 대환 · 기타) ⑤ 약정 확인(상품설명서 요지 · 청약철회권 14일 안내 · 동의 체크) ⑥ 전자서명(섞는 키패드 — 이체 세션 공용 · 입력값 0 전송) → "대출 신청" | 단계 기록 = 고정 값 이벤트(§7.2) · 제출 = `landing_submitted` | ⑥까지 = F4 행. 중간 이탈 = 단계별 `progressMoments`(§101 방식) | 비대면 대출 앱 단계 순서 · 문진 문항은 **추정**(은행 · 캐피탈마다 다름) — 확인 방법: 가상 대신 실제 앱 2곳 캡처 대조(사용자 실기). 청약철회 14일 · 신용 4,000만 원 이하 대상은 **확인**(금융위 · 카드사 안내 — 출처 §10) |
| F6 | 통화 1 끝 | 검사 | "신청하면 금융회사에서 확인 전화가 갑니다 — 용도는 생활비, 누가 권했냐 · 통화 중이냐 물으면 아니라고 하세요. 확인 끝나면 제가 다시 연락드립니다" → `end_call` | 레그 0 끊기 = `loan-apply` 제출 뒤에만 goal(§6 L-a) | — | 창구 둘러대기 코칭 **확인**(노컷 2017 · C03 · 기존 단계 문면). 대출 확인 전화용 코칭은 **미확인** → D10 '중' |
| F7 | 통화 2 (수신 · 새 번호) | **가온캐피탈 대출 실행 확인 상담원**(사기범 아님 · 여) | 본인 신청 확인 → 용도 → "혹시 누가 대출을 권하거나, 지금 누구와 통화하며 진행하시나요?" → "수사기관 · 금융감독원에서 연락받으셨나요?" → 상환 계획. 둘러대면 "확인됐습니다, 오늘 중 실행됩니다". 사실대로 말하면 "수사기관 · 금감원은 대출을 요구하지 않습니다 — 보이스피싱이 의심돼 실행을 보류합니다, 112 · 1332로 확인하세요" | 상담원 결과 도구 → `loanReview: approved \| held`(§7.3). 부재 = `held` | `approved` = "확인 전화 뒤 대출이 실행됐다"(확인된 사실만 — D10). `held` = 막은 순간 | 확인 전화 **절차 자체는 미확인**(D10 '중'). 관련 확인 사실: 여전사 · 대부업자 대출 본인확인 의무화 시행령(등록 전화 · 대면 · 비대면 실명확인 중 하나 — 2025-11 의결 · 공포 6개월 뒤 시행, SBS Biz · 경향 2025-11-04). "국가기관은 대출을 권유하지 않는다"는 **확인**(2024-35호) |
| F8a | 통화 2 끝 → 문자 (`approved`) | 가온캐피탈 | `[가온캐피탈] 대출 실행 완료` 문자 → 링크 = `loan-disburse` 화면(실행 내역: 금액 · 입금 계좌 = 내 계좌 · 상환일 · 청약철회 14일 안내) | 서버가 결정적으로 보냄(모델 도구 아님) · 필수 아님(결정 화면 아님) | — | 대출 실행 문자 · 앱 내역은 **추정**(일반 관행) |
| F9 | 통화 3 (수신 · 통화 1과 같은 번호 · 같은 목소리) | 검사 | `approved`: "대출금 확인됐습니다 — 입증이 끝날 때까지 보관 계좌로 옮기셔야 합니다" → **대출금 보관 계좌 문자** → 이체 화면. `held`: "그 직원은 공범일 수 있다 · 수사 방해"로 한 번 압박(R11) → 다시 신청 요구 1회 → 거절이면 `give_up` | `approved` 분기만 새 문자 `institution-loan-safe-account`(transfer · 필수 · 레그 2) · 4-c(마지막 레그) | 대출금 이체 제출 = "대출금 보관을 빌미로 한 대출금 이체 유도" | 대출금 편취 **확인**(2024-35호). "공범의 방해" 프레이밍 **확인**(`prosecution-crypto-tactics` §2 — 창구 맥락) |
| F10 | 통화 3 끝 | 검사 | 이체 뒤 추가 요구 1회(적금 해지 등 — 화면 없는 요구는 말로만 꺼내고 약속에서 끝냄 · D4) → 비밀 당부 → `end_call` goal | 4-c 해제 뒤 goal 허용 | — | 추가 요구 **확인**(P0 실측 원문 · R11) |

### 3.1 대출금 이체의 요구액
| # | If | Then |
|---|---|---|
| Q1 | 통화 3 사기범 대사에 금액 있음 | 가장 최근 금액(§1.1 R1) |
| Q2 | 없음 ∧ 같은 탭에서 `loan-apply`를 제출했다 | 그 화면에서 고른 대출 금액(클라 메모리 표 — `bankApp.ts` `sentTotals`와 같은 방식 · 탭을 닫으면 사라짐 · 네트워크 0) |
| Q3 | 둘 다 없음 | 비교 없음(C1) |
- 받는 계좌는 안전계좌와 **다른 계좌**(새 문자)로 둔다 — 같은 계좌면 `sentTotals` 합계에 첫 이체가 섞여 비교가 틀린다(`bankApp.ts:137-142`).
- 가상 한도: 세션마다 결정적(예: 800만 ~ 2,000만 원 · 10만 원 단위). 1회 이체 한도 1,000만 원을 넘으면 참가자는 나눠 보내야 한다 — 같은 계좌 합계 비교가 이미 이를 지원한다(**확인** `bankApp.ts:118`). 범위 값은 **판단값**.

## 4. 교육 포인트 (리포트 `reportLessons` — 세션 밖이라 실제 대응 안내 가능)
1. 검찰 · 경찰 · 금융감독원은 대출을 받으라고 하지 않습니다. "명의 도용을 입증하려면 대출을 받아 보라"는 말은 사기입니다(금감원 소비자경보 2024-35호).
2. 금융회사 확인 전화 · 창구 질문은 나를 지키는 절차입니다. 누가 시킨 대로 "생활비"라고 둘러대라는 말 자체가 사기 신호입니다 — 확인 전화에는 사실대로 말하세요.
3. 대출금을 다른 계좌로 옮기라는 요구는 100% 사기입니다.
4. 이미 대출을 받았다면 112 · 금융회사에 지급정지를 요청하고, 14일 안이면 대출계약 청약철회를 신청할 수 있습니다(신용대출 4,000만 원 이하 — 금융소비자보호법 제46조 · 금융위 안내). ⚠️ 4의 조건 문구는 구현 전 금융위 원문으로 한 번 더 확인한다.

## 5. 상담원 전화 구현 방식 비교
| 기준 | (a) 다통화 런타임 재사용(`startCallLeg` · 레그) | (b) 확인 가로채기 계열(`deliverVerifyOffer` · 화자 전환) |
|---|---|---|
| 목소리 | 레그마다 새 Live 연결 · 목소리 자리 분리(`legVoiceSlot` `functions/src/callLegs/legPlan.ts:140`). 상담원 = 다른 목소리, 검사 재통화 = 같은 `speakerId` → 같은 목소리 | 같은 Live 세션 · 같은 목소리(**추정** — Live 세션 중 목소리 교체 수단 없음, `verifyIntercept.ts` 헤더 "화자만 교체") |
| 화면 | 통화 종료 → 새 수신 화면 · 새 번호 · 받기(실제 전화와 같음) | 같은 통화 안에서 라벨만 바뀜(호 전환) |
| 프롬프트 | 레그별 `personaPrompt` · 단계 · 수법만 실림 → 상담원에게 사기 수법 문맥 0(정당한 제3자 역에 맞음) | 사기범 프롬프트 위에 상태 단언 1줄 — 사기 수법 블록이 그대로 남아 상담원이 "사기범처럼" 말할 위험(**추정**) |
| 앞 통화 기억 | `buildPriorLegContext`(참가자 말 전부) — 상담원은 몰라야 할 것까지 앎 → 상담원 레그는 인계 블록을 **싣지 않는** 옵션 필요 | 같은 세션이라 전부 앎 |
| 이미 쓰는 곳 | 카드사 고급 R1 · R2(4통화) — 실기 신고로 다듬는 중 | 확인 무력화 6종(시나리오당 1건) |
| 새로 필요한 것 | 나감 방식 `incoming`(상대가 건다) · 다음 레그 열림 조건(화면 제출) · 레그 단위 화면 보류 · 상담원 결과 도구 | 다건 · 목적별 오퍼 · 상담원 결과 신호 · 목소리 문제는 못 풂 |
| 위험 | 카드사 4개 세션이 같은 파일(`callLegs/*` · `page.tsx` · `CallLegScreens.tsx`)을 고치는 중 → 병합 뒤 시작 | `fv-c5fj`는 이미 D3 확인 가로채기를 쓴다 — 두 번째 전환이 겹치면 상태 단언이 충돌(**추정**) |
| **판정** | **권장** — 사실성 최우선 기준(다른 사람 · 다른 번호 · 다른 목소리)에 맞고 기반이 이미 있다 | 비권장 — 2026-10-31 D2 결정 당시엔 레그 런타임이 없었다. 이제 (a)가 있으므로 D2를 (a)로 바꾸는 것을 메인에 제안한다 |

## 6. 끊기 판정 변경안 (PR-B — 목표 = 대출 흐름까지 끝남)
`fv-c5fj`는 `multiCall: true`가 되고 `goalFollowUpUserTurns`를 지운다(C-5 대상에서 빠짐 · 은퇴 `fv-pgqt`는 그대로 C-5).

| # | 레그 | If | Then |
|---|---|---|---|
| L-a | 0 검사(마지막 아님 · 나감 `incoming`) | `goal` ∧ 이 레그에 선언된 화면 문자 중 **어느 하나라도** `landingAmountComparison === "less"` | 거절(4-c D-4a를 레그 범위로) |
| L-b | 0 | `goal` ∧ 이 레그의 마지막 필수 화면(`loan-apply`) 미제출 | 거절 — 단, 참가자가 대출을 거절한 경우를 위해 `give_up`은 통과(종전 원칙) |
| L-c | 0 | `give_up` | 승인 → **다음 레그를 열지 않는다**(세션 끝 · 리포트) |
| L-d | 0 | `goal` ∧ L-a · L-b 통과 | 승인 → 화면이 통화 종료 뒤 짧은 대기 → 통화 2 수신 |
| L-e | 1 상담원 | 레그 시작 뒤 발화 ≥ `minUserTurns` ∧ 결과 도구를 불렀다 | 승인(이유 무관). 결과 도구 없이 끊으면 `held`로 기록 |
| L-f | 2 검사(마지막) | `approved` | 종전 4-c(결정 화면 = 대출금 보관 계좌 이체 · D-4a 포함) |
| L-g | 2 | `held` | 결정 화면 없음(D-3) → 하한(5행)만. 단계 문면이 압박 1회 뒤 `give_up` |
- 레그 단위 보류는 **변형 레그의 선택 필드**로 켠다(예: `FlowVariantLeg.holdUntilScreens: true`). 카드사 레그는 필드가 없으니 종전(`legHangupAdjustments` — 마지막 아닌 레그는 4-c를 보지 않음, `legPlan.ts:126`) 그대로다.
- 다음 레그 열림 조건: 나감 `incoming`은 `startCallLeg({action:"callback"})`로 연다. `planLegStart` 5행을 `callback ∧ (exit dial ∨ exit incoming)`로 넓히고(`legPlan.ts:93`), 레그 0에는 열림 조건(예: `opensWhenScreenSubmitted: "loan-apply"`)을 둬 미충족이면 `not_ready` → 화면은 세션 종료.
- 통화 3의 문자 선언은 `loanReview` 값에 따라 켠다(예: `FlowVariantSms.whenLoanReview: "approved"`) — `held`면 그 문자는 선언에서 빠져 결정 화면 · 백스톱 대상이 아니다.

## 7. 서버 · 화면 세부
### 7.1 변형 구조 (`fv-c5fj` 재구성 초안)
| 레그 | callerLabel | entry · exit | speakerId · 성별 | 문자(레그) | 단계 요지 |
|---|---|---|---|---|---|
| 0 | 검사 | incoming · incoming | prosecutor · 남 | 인증번호(identity) → 안전계좌 980만 원(transfer) → 대출 신청 안내(link · `loan-apply`) | F1 ~ F6 |
| 1 | 가온캐피탈 대출센터(가상 · 번호부 새 항목) | incoming · incoming | loan-officer · 여 | 없음(실행 완료 문자는 서버가 레그 끝에 결정적으로 보냄) | F7 |
| 2 | 검사(레그 0과 같은 번호) | incoming · — | prosecutor · 남 | `approved`만: 대출금 보관 계좌(transfer · 이체 화면) | F9 · F10 |
- 기존 `legs`(검사 · 금융감독원 직원)는 `RELAY_RUNTIME_AVAILABLE = false`라 지금 한 화자다(`flowVariants.ts:196` · `:993-996`). 금감원 직원 인물은 통화 3을 "금감원 직원이 대출금 보관을 맡는다"로 바꾸는 선택지가 있다(2024-35호는 기관 사칭 일당이 역할을 나눈다 — **추정**). 기본안은 검사 재통화(인물 수를 늘리지 않음) — 메인 결정 D-L4.
- 상담원 레그 프롬프트: 사기 수법 · 진행 강제 블록을 싣지 않는 "정당한 제3자" 페르소나. 앞 통화 인계 블록은 **싣지 않는다**(상담원은 검사 통화를 모른다). 이 두 가지는 레그 필드(예: `role: "genuine"`)로 켠다.
- 은행 · 캐피탈 이름은 §81 · §83 가상명 체계(`fictionalBank.ts`)로 세션마다 고른다. 위 "가온캐피탈"은 예시다.

### 7.2 화면 (K1)
| 화면 | 종류 | 재사용 | 기록 |
|---|---|---|---|
| `loan-apply` | 새 다단계 신청 화면(`credential-form` 계열 · 새 kind 0 목표) | 이체 세션 공용 컴포넌트 — 생체 인증 모션(①) · 섞는 키패드(⑥) · 금액 입력 · 1회 한도 메시지 체계(`amountInput.ts`) · 다단계 흐름(`STEP_FLOW_COPY` §101) | 단계 = 고정 값 이벤트 3개(본인 확인 · 한도 조회 · 약정 동의) · 제출 = `landing_submitted`. **금액 · 용도 값은 보내지 않는다**(G138) |
| `loan-disburse` | 읽기 전용 실행 내역 + "확인" | 이체 완료 영수증 레이아웃 | `opened`만(결정 화면 아님 · 필수 아님) |
| 대출금 보관 계좌 이체 | `BANK_TRANSFER_LANDINGS`에 새 id(예: `loan-safe-transfer`) | 종전 이체 화면(출금 계좌 선택 · 생체 인증 · 영수증 — 이체 세션 결과물) | `landing_submitted` + 비교 결과 |
- 용도 선택값을 상담원이 알게 할지(G138 예외 여부): **권장 = 보내지 않음.** 상담원이 "어떤 용도로 신청하셨어요?"라고 열린 질문을 하면 현실과도 같고 예외가 필요 없다 — 메인 결정 D-L2.
- 화면 문구에 '모의' · '훈련용' 0(G437). 청약철회 · 보이스피싱 주의 안내 줄은 실제 앱에도 있는 문구 유형이라 넣는다(**추정** — 확인 방법: 실제 앱 캡처).

### 7.3 상담원 결과 신호
| 선택지 | 내용 | 판정 |
|---|---|---|
| (i) 레그 전용 도구 `report_loan_review { outcome: "approved" \| "held" }` | 레그마다 새 Live 연결이라 레그별 도구 선언이 가능(**추정** — 구현 때 `createRealtimeCall`의 도구 조립이 레그를 아는지 확인). 폴백은 `[[SIGNAL:LOAN_REVIEW:approved|held]]` | **권장** — 결과가 구조화 값이라 서버 판정 · 리포트가 결정적 |
| (ii) `end_call` reason 재해석(goal = 실행 · give_up = 보류) | 새 도구 0 | 비권장 — 같은 enum이 레그마다 뜻이 달라져 끊기 판정표 · 리포트가 헷갈린다 |
| (iii) 서버가 전사 문구로 판정 | — | 비권장 — 둘러대기 · 사실 진술을 문구로 가르기 어렵다 |
- 부재(도구 미호출) = `held`. 이유: 사실대로 말한 참가자에게 대출이 실행되는 결과가 더 해롭다(정직이 소용없다는 오학습).

## 8. 바뀌는 파일 (예상 · 최신 main에서 다시 확인)
| 영역 | PR-A | PR-B |
|---|---|---|
| 서버 변형 | `functions/src/scenarios/flowVariants.ts`(이체 단계 · 수법 금액, 고급 전용 문자 id) | 같은 파일(`fv-c5fj` multiCall 3레그 · 대출 단계 교체 · `goalFollowUpUserTurns` 제거 · `reportLessons`) |
| 문자 · 화면 카탈로그 | `functions/src/scenarios/inCallSms.ts`(새 안전계좌 문자 + 금액 줄) · `mockScreens.ts`(필요 시 랜딩 id) | `inCallSms.ts`(대출 안내 · 실행 완료 · 대출금 보관 계좌) · `mockScreens.ts`(`loan-apply` · `loan-disburse` · `loan-safe-transfer` · `BANK_TRANSFER_LANDINGS`) · `dialDirectory.ts`(대출센터 번호) |
| 끊기 | `functions/src/scammerHangup/goalAction.ts`(H1 · H2) | 같은 파일 + `callLegs/legPlan.ts`(나감 `incoming` · 열림 조건 · 레그 보류) · `scammerHangup/decide.ts` 레그 입력 |
| 레그 런타임 | — | `callLegs/index.ts` · `legHandoff.ts`(상담원 인계 블록 제외) · `realtime/*`(레그 도구 · 페르소나) · `roleplay/index.ts`(폴백 신호) · 새 상담원 결과 기록 경로 |
| 리포트 | — | `report/generateReportCore.ts` · `smsTimeline.ts`(새 화면 승격 · `loanReview` 행) |
| 클라 금액 | `src/lib/bankapp/bankApp.ts`(한글 수사 · 요구액 판정표) · `src/lib/incallsms/inCallSms.ts`(`requestedAmount`) · `src/components/InCallSmsOverlay.tsx` · `src/app/session/play/page.tsx`(사기범 대사 전달) | `src/lib/loan/*`(새 — 대출 금액 메모리 표) |
| 클라 화면 | — | `MessengerFakeLanding.tsx`(대출 화면) · `src/lib/callLegs/legTransition.ts` · `page.tsx` · `CallLegScreens.tsx`(나감 `incoming`) |
| 문서 | 이 문서 · `CLAUDE.md` 검증 명령 기록 | `docs/Architecture.md` 해당 절 · `in-service-experience-plan` §5 P4 상태 |

## 9. 새 테스트 목록
| 파일(예정) | 단언 | PR |
|---|---|---|
| root `src/lib/bankapp/amountHangul.test.ts` | "삼백만 원" = 3,000,000 · "구만 구천 원" = 99,000 · "5백만 원" · "9백8십만 원" · "3천만 원" · 숫자형 종전 값 무변화 · 서버 `demandAmountFrom`와 같은 표 대조 | A |
| root `src/lib/incallsms/requestedAmount.test.ts` | 판정표 R1 ~ R3 · 오버레이 → 이체 화면에 `requestedAmount` 전달 배선 · 금액 값이 콜백 인자에 없음(G138 스캔) | A |
| functions `scammerHangup/__tests__/followUpDecisionScreen.test.ts` | H1(후속 단계 변형 + `less` = 대기) · H2 · H3(제출 전 `wrap_up` 0) · 다른 변형 결과 무변화 | A |
| functions `amountPlaceholder.test.ts` A6 | `fv-c5fj` 이체 단계 · 수법 금액 980만 원 = 새 문자 `금액: 9,800,000원` | A |
| functions `callLegs/__tests__/institutionLoanLegs.test.ts` | 3레그 구조 · entry/exit · 문자 레그 배치 · 상담원 레그에 수법 · 진행 강제 0 · 인계 블록 0 · 목소리 자리(검사 0 = 2 · 상담원 다름) | B |
| functions `legPlan` 판정표 단언 | 나감 `incoming` + callback · 열림 조건 미충족 = `not_ready` · 카드사 R1 · R2 결과 무변화 | B |
| functions `goalAction` 레그 보류 | L-a ~ L-g | B |
| functions 상담원 결과 | 도구 · 폴백 신호 기록 · 부재 = `held` · `approved`일 때만 실행 완료 문자 · 통화 3 문자 선언 | B |
| functions `outOfServiceActions.test.ts` | X1 기관 고급 행 제거(앱 밖 대출 문면 0) · 장부 갱신 | B |
| functions 리포트 | `loan-apply` · `loan-safe-transfer` 승격 · `loanReview` 행 문면 = 확인된 사실만 · `reportLessons` 4개 | B |
| functions 바이트 고정 | `fv-akj5` · `fv-6s5p` · `fv-pgqt` 조립 결과 무변화(`fullAuditDelta`) | A · B |
| root 대출 화면 | 단계 순서 · G437(모의 · 훈련용 0) · 금액 · 용도 값 네트워크 0 · 대출 금액 → 대출금 이체 요구액(Q2) · 1회 한도 | B |
| root `legTransition` | 나감 `incoming` 화면 전이(종료 → 대기 → 수신 · 번호 = 대출센터) | B |
| 에뮬레이터 스모크 `scripts/emulator-institution-loan-smoke.mjs`(새) | 레그 0 제출 전 goal 거절 · `less` 거절 · 제출 뒤 callback 열림 · 상담원 결과 `approved`/`held` 분기 · 실행 완료 문자 · 레그 2 4-c · 리포트 행 | B |
- 기준값: functions **2134** · root **1281 pass / 1 skip**(`CLAUDE.md` 최신 기록 2026-11-07. 지시문의 "root 1282"는 1281 + skip 1로 읽었다 — 메인 확인 필요). 병합 뒤 main에서 다시 잰 값을 기준으로 쓴다.

## 10. 실 키 확인 프로브 계획 (실행 안 함 · 과금 = 메인이 사용자 승인)
| 묶음 | 경로 | 대본 | 세션 | 보는 것 |
|---|---|---|---|---|
| PR-A ① | `full-audit-probe.mjs` 단일 통화 `fv-c5fj` | 순응 | 2 | 사기범이 980만 원을 말하는 비율 · 말한 금액 수(화면 열기 직전) · 한글 수사 형태 · 이체 전 마무리 지시 0 |
| PR-A ② | 같음 | "적게 보냈어요" 말 대본 | 1 | 끊기 거절 · 반복 · ⚠️ 프로브가 화면 제출(`less`)을 흉내 내지 못하면 에뮬레이터로 대신(구현 때 확인) |
| PR-B ③ | `ch: "multicall"`(카드사 R1 · R2에 쓴 경로) | 순응 · 상담원에게 둘러댐 | 2 | 레그 0 → 1 → 2 완주 · 상담원 `approved` · 대출금 이체 요구 · 상담원 대사에 사기 수법 0 |
| PR-B ④ | 같음 | 순응 · 상담원에게 사실대로 | 2 | `held` · 보이스피싱 안내 · 통화 3 압박 1회 뒤 `give_up` |
| PR-B ⑤ | 같음 | 대출 거절 | 1 | 레그 0 `give_up` · 다음 레그 0 · 대출 단계에서 끊기지 않고 설득 1회 |
| **합계** | | | **8** (A 3 · B 5) | `GEMINI_API_KEY2` · 429면 `STOP-429` |

## 11. 메인 결정이 필요한 것
| # | 결정 | 선택지 | 권고 |
|---|---|---|---|
| D-L1 | 상담원 전화 구현 | (a) 레그 런타임 · (b) 확인 가로채기 | **(a)** — 2026-10-31 D2 (a)를 이 루트에서 뒤집는 셈이라 사용자 확인 권장 |
| D-L2 | 대출 용도 선택값을 서버(상담원)에 알릴지 | 알림(G138 예외 · enum 1개) · 알리지 않음(상담원이 묻는다) | **알리지 않음** |
| D-L3 | 상담원 결과 신호 | (i) 레그 전용 도구 · (ii) `end_call` 재해석 | **(i)** |
| D-L4 | 통화 3 인물 | 검사 재통화 · 금감원 직원 | **검사 재통화** |
| D-L5 | PR 순서 | A 먼저 단독 · A+B 한 번에 | **A 먼저** — 신고 1은 A로 끝나고 파일 겹침이 작다(카드사 세션 병합 전에도 착수 가능한지는 `flowVariants.ts` · `inCallSms.ts` 충돌로 메인 판단) |
| D-L6 | 안전계좌 금액 | 고정 980만 원(말 우선) · 참가자 잔액 전부 | **고정 980만 원(말 우선)** |
| D-L7 | 다른 대출 루트(검찰 `fv-a6lq` · 카드 배송 `fv-e5mv` · 대출 `fv-r4hc`) | 이번 범위 밖(후속 P4) · 함께 | **범위 밖** — 같은 장치를 쓰므로 PR-B 뒤 후속 |

## 출처
- 금감원 소비자경보 2024-35호 · 2025-1호 — 코드 주석 인용(`flowVariants.ts:385-387` · `:429-432`), 재인용 [삼성화재 소비자 자료](https://samsungfire.com/download/consumer/ca_d80.pdf)
- [SBS Biz — 여전사 · 대부업자 대출 본인 확인 조치 의무화](https://biz.sbs.co.kr/amp/article/20000269945) · [경향신문 2025-11-04](https://www.khan.co.kr/article/202511041657011/) — 검색 요약 기준(원문 미열람)
- 대출계약 청약철회권(14일 · 신용 4,000만 원 이하): [KB국민카드 대출철회권 안내](https://m.kbcard.com/FNC/DVIEW/MFDMCXHIAFLC0068) · [금융위원회](https://fsc.go.kr/no010101/72323) · [볼보파이낸셜 안내문](https://www.volvofinancialservices.com/content/dam/volvo-financial-services/markets/korea/compliance/%EB%8C%80%EC%B6%9C%EA%B3%84%EC%95%BD%EC%B2%A0%ED%9A%8C%EA%B6%8C%EC%95%88%EB%82%B4210325.pdf) — 검색 요약 기준(원문 미열람)
- 대출 실행 전 금융회사의 보이스피싱 확인 전화 절차: 이번 검색에서도 **찾지 못했다**(D10 '중' 유지)
- Live 전사 금액 표기: `docs/research/p2-live-probe-2026-11-01.md:32`

## 12. PR-A 구현 (2026-11-07 · 메인 "구현 시작" · 사용자 결정 D-L1 ~ D-L7 권장안 · 범위 추가 = Edge 시험 판 10 택배 통관 고급)
| # | 바꾼 것 | 파일 |
|---|---|---|
| A1 | 한글 수사 금액 판독(판정표 H1 ~ H3) — 클라 · 서버 같은 원문(드리프트 테스트) | `src/lib/bankapp/bankApp.ts` · `functions/src/roleplay/linkMarker.ts` |
| A2 | 통화 중 문자 이체 화면 요구액 = 통화에서 사기범이 마지막으로 말한 금액(올린 대사 + 아직 올리지 않은 실시간 전사) → 없으면 문자 금액(R1 ~ R3). 링크 화면 · 은행 앱 '송금' 두 길 · 열 때마다 다시 잼 | `src/components/InCallSmsOverlay.tsx` · `src/app/session/play/page.tsx` |
| A3 | 기관 고급 `fv-c5fj` — 고급 전용 문자 `institution-asset-safe-account`(금액 줄 980만 원 · 같은 계좌 · 같은 이체 화면) · 단계 · 수법 인용구 980만 원. 초급 · 중급 · 은퇴 `fv-pgqt` 문자 · 상수 무변경 | `functions/src/scenarios/inCallSms.ts` · `flowVariants.ts` |
| A4 | 택배 통관 고급 `fv-y3ks` — `courier-safe-account` 금액 줄 760만 원(이 문자는 `fv-y3ks`만 씀) · 단계 · 수법 760만 원 | 같은 두 파일 |
| A5 | 끊기 4-c 결정 화면 판정의 D-1(후속 단계 변형 = 대상 아님)을 좁힘 — 결정 화면이 **이체 화면**인 후속 단계 변형(`fv-c5fj`)은 미제출 · 적게 보냄이면 goal 끊기 거절. 설치 화면 뒤 말로 끝나는 `fv-e5mv` · `fv-r4hc`는 종전 그대로(첫 구현은 D-1을 통째로 지워 두 변형까지 4-c 대상이 됐다 — 테스트 장부로 잡아 좁혔다) | `functions/src/scammerHangup/goalAction.ts` |
| A6 | 마무리 지시 — 결정 화면(이체) 미제출 · 적게 보냄이면 `pending`(실시간 `planGoalWrapUp` + `scenarioId` 1줄 · 폴백 `fallbackWrapUp`에 `!decisionScreenPending`) | `goalAction.ts` · `functions/src/inCallSms/index.ts`(인자 1줄만) · `functions/src/roleplay/index.ts` |
- `functions/src/inCallSms/index.ts`는 `planGoalWrapUp` 호출 인자 1줄(`scenarioId`)만 더했다. 부족 금액 맥락 지시(`landingSubmittedInstructionFor`)는 건드리지 않았다(card-rejoin-timer 세션과 겹침 최소).

### 12.1 검증 (2026-11-07)
| 항목 | 결과 | 근거 |
|---|---|---|
| functions 테스트 | **2153 pass / 0 fail** (신규 5) | `npm --prefix functions test` |
| root 테스트 | **1310 pass / 0 fail / 1 skip** (신규 3 · skip = `out/` 없음) | `npm test` |
| lint | functions 통과 · root 오류 0 · 경고 1(변경 밖 `scripts/live-turn-probe.mjs`) | 두 lint 명령 |
| 화면 확인 | **안 함** — 통화 중 이체 화면의 비교는 실시간 통화(실 키) 없이는 사기범 전사가 생기지 않는다. 배선은 소스 단언(`amountCompare.test.ts` [PR-A R])으로만 고정 | — |
| 실 키 프로브 | 안 함(§10 PR-A ① ② 3세션 — 메인 승인 필요) | — |

## 13. PR-B 구현 (2026-11-07 · 메인 "PR-B 앱 안 대출 체험 — #509 커밋 위 새 브랜치 · 새 PR" · 사용자 결정 D-L1 (a) · D-L2 ~ D-L7 권장안)
브랜치 `claude/inst-adv-loan-experience` = PR-A `f5786df2` + 변경. 병합 · 배포 안 함.

| # | 바꾼 것 | 파일 |
|---|---|---|
| B1 | `fv-c5fj` = 3통화(`multiCall`) — 통화 1 검사(안전계좌 980만 원 이체 화면 → 대출 신청 링크 → 확인 전화 코칭 · 끝 = 상대가 걸어 옴 `exit: "incoming"`) · 통화 2 캐피탈 대출 실행 확인 상담원(정당한 제3자 `genuine` · 수법 0) · 통화 3 검사 재통화(대출금 보관 이체 화면) | `functions/src/scenarios/flowVariants.ts` |
| B2 | 레그 런타임 — `incoming` 출구 · 결정 화면 제출 전 다음 통화 대기(`holdUntilScreens` · `screen_pending`) · 번호부 진짜 안내 번호를 걸면 진짜 통화(4-b 행) | `functions/src/callLegs/legPlan.ts` · `request.ts` · `index.ts` |
| B3 | 상담원 전용 프롬프트 · 도구 `report_loan_review`(approved/held) + `end_call` · 콜러블 `recordLoanReview`(세션 정책 S) · 실행이면 서버가 입금 안내 문자(번호부 연결 콜백 문자) | `functions/src/roleplay/genuineLegPrompt.ts` · `realtime/liveTools.ts` · `realtime/geminiProvider.ts` · `callLegs/loanReview.ts` · `inCallSms/smsDelivery.ts` |
| B4 | 문자 4통(통화 1: 인증번호 · 안전계좌 · 대출 안내 / 통화 3: 대출금 보관 계좌 — 확인 결과 = 실행일 때만 `whenLoanReview`) · 화면 2종(`loan-apply` · `loan-safe-transfer`) · 예금주 노은채 → 가온은행 | `functions/src/scenarios/inCallSms.ts` · `mockScreens.ts` · `dialDirectory.ts` · `shared/fictionalBank.ts` · `inCallSms/smsGate.ts` |
| B5 | 끊기 — 화면을 기다리는 레그는 결정 화면 미제출이면 4-c 거절(`screenHoldPending`) · 재통화 맥락 1줄(확인 결과) | `functions/src/scammerHangup/*` · `roleplay/index.ts` · `realtime/index.ts` |
| B6 | 리포트 — 상담원 통화 대사는 사기 대사로 보지 않음 · 확인 결과 실행 = 속은 순간 "확인 전화 얼버무리기 코칭" 1개 · 교육점 4 | `functions/src/report/analyzeConversation.ts` · `generateReportCore.ts` |
| B7 | 화면 — 앱 안 대출 신청(안내 → 생체 인증 → 한도 · 금액 · 용도 → 약정 → 전자서명 → 접수) = `MessengerFakeLanding.tsx` 안 `LoanApplyMockup`(§15.9.1 R1 — 가짜 랜딩 파일 1개) · 탭 메모리 장부(신청 → 입금 → 첫 계좌 출금 가능 금액) · 걸려 오는 통화 12초 · 보관 이체 요구액 = 재통화에서 말한 금액 → 없으면 입금된 대출금 | `src/components/MessengerFakeLanding.tsx` · `InCallSmsOverlay.tsx` · `src/app/session/play/page.tsx` · `src/lib/bankapp/loanFlow.ts` · `withdrawAccounts.ts` · `src/lib/callLegs/legTransition.ts` · `src/lib/realtime/*` · `src/lib/api/*` |

### 13.1 검증 (2026-11-07)
| 항목 | 결과 | 이전/기준값(PR-A) | 근거 |
|---|---|---|---|
| functions 테스트 | **2159 pass / 3 fail** (신규 `loanLegs.test.ts` 9건) — fail 3 = 아래 D-L8 · D-L9(결정 대기) | 2153 / 0 | `npm --prefix functions test` |
| root 테스트 | **1316 pass / 0 fail / 1 skip** (신규 `loanFlow.test.ts` 6건 · skip = `out/` 없음) | 1310 / 0 / 1 | `npm test` |
| lint | functions 통과 · root 오류 0 · 경고 1(변경 밖 `scripts/live-turn-probe.mjs`) | 같음 | 두 lint 명령 |
| 화면 · 실 키 확인 | **안 함** — 3통화 흐름은 실시간 통화(실 키) 없이는 레그가 넘어가지 않는다. 프로브는 메인 승인 뒤 | — | — |

### 13.2 메인 결정이 필요한 것 (테스트 3건이 이것 때문에 실패 중 — 우회하지 않았다)
| # | 무엇 | 선택지 | 권장 |
|---|---|---|---|
| D-L8 | 범위표 AC-096 (b) "고급 문자 0~3" — `fv-c5fj`가 4통을 선언(통화 1 세 통 · 통화 3 한 통) | (a) 인증번호 문자를 뺀다(2026-10-21 사용자 신고로 넣은 것과 충돌) · (b) 다통화 변형은 **통화별**로 0~3을 센다(이 변형 최대 3/통화) | (b) |
| D-L9 | P0 서비스 밖 행동 유도 장부 — 키워드 탐지기가 "앱 안 대출 화면"과 "밖에서 대출 받기"를 못 가른다: 루트 장부 J1_LOAN flowVariants 16→32 · inCallSms 0→9 · mockScreens 1→12 · MessengerFakeLanding 1→10 · J11 8→6 · 공통 표면 `inCallSms/confirmResult.ts` 대출 신청 맥락 지시 1건 | (a) 장부 수치 갱신 + 맥락 지시 상수를 루트 표면 파일로 옮김 · (b) 판정표에 "서비스 안 대출 화면 · 그 화면을 가리키는 문면 = 유도 아님" 행 추가(`docs/research/in-service-experience-plan-2026-10-31.md` §0.1 갱신) | (b) — 사용자 결정 "훈련은 서비스 안에서"와 같은 방향 |

### 13.3 사용자 결정 반영 (2026-11-07 · 메인 전달 — D-L8 *"통화별로 세기 (권장)"* · D-L9 *"앱 안 대출은 예외 (권장)"*)
| 항목 | 결과 | 이전/기준값 | 근거 |
|---|---|---|---|
| D-L8 범위표 | 다통화 변형 문자 = 통화(레그)별 최대값(레그 지정 없는 문자는 모든 통화에 셈) · fv-c5fj 세션 4 · 통화별 3 · 카드사 R1 fv-k3dn 세션 3 · 통화별 1 · fv-r8vb 세션 2 · 통화별 1 · 한 통화 4통 샘플은 걸림 | 세션 합 4 → 위반 | `functions/src/scenarios/__tests__/flowVariants.test.ts` `smsPerCall` · 테스트 진단 출력 `[D-L8]` |
| D-L9 판정표 | J15 "서비스 안 대출 화면 안내 = O4" — 이름으로 등록한 영역만(접두사 0) · 영역 안이어도 창구 · 지점 · 방문 · 다른 앱/금융/은행/캐피탈 · 은행/금융회사에서 대출 받기·신청은 셈 · 은퇴 fv-pgqt 밖 대출 원문은 셈 | 공통 1 · 장부 +36 | `functions/src/roleplay/__tests__/outOfServiceActions.test.ts` `IN_APP_LOAN_SURFACES` · `IN_APP_LOAN_OUTSIDE` |
| 장부 | flowVariants J1 16 → 14 · J11 8 → 6(밖 대출 유도 · 은행 직원 둘러대기 2문장이 빠짐) · 그 밖 행 무변경 | 16 · 8 | 같은 파일 `ROUTE_LEDGER` |
| 문서 | PRD AC-096 갱신 고지 5 · DECISIONS #254 · `in-service-experience-plan-2026-10-31.md` §0.1 행 추가 | — | 세 문서 diff |
| functions 테스트 | **2164 pass / 0 fail** | 2159 / 3 | `npm --prefix functions test` |
| root 테스트 | **1316 pass / 0 fail / 1 skip** | 같음 | `npm test` |
| lint | functions 통과 · root 오류 0 · 경고 1(변경 밖) | 같음 | 두 lint 명령 |
- ⚠️ DECISIONS #254는 이 브랜치 기준 다음 번호다 — 다른 브랜치가 같은 번호를 쓰면 통합 때 번호를 고친다.
